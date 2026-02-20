// ============================================================
// database.js — Настройка базы данных SQLite (через sql.js)
// sql.js — это SQLite, скомпилированный в JavaScript/WASM,
// не требует установки C++ компилятора
// ============================================================

const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

// Путь к файлу базы данных
const DB_PATH = path.join(__dirname, 'rucord.db');

// Объект-обёртка, совместимый по API с better-sqlite3
const database = {
  _sqlDb: null,

  // Инициализация базы данных (вызывается один раз при старте сервера)
  async init() {
    const SQL = await initSqlJs();

    // Если файл базы уже существует — загружаем его
    if (fs.existsSync(DB_PATH)) {
      const buffer = fs.readFileSync(DB_PATH);
      this._sqlDb = new SQL.Database(buffer);
    } else {
      this._sqlDb = new SQL.Database();
    }

    // Включаем поддержку внешних ключей
    this._sqlDb.run("PRAGMA foreign_keys = ON");

    // Создаём все таблицы, если они ещё не существуют
    this._sqlDb.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        avatar_url TEXT DEFAULT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS servers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        icon TEXT DEFAULT NULL,
        invite_code TEXT NOT NULL UNIQUE,
        owner_id INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (owner_id) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS channels (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        server_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'text',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS server_members (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        server_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id),
        UNIQUE(server_id, user_id)
      );

      CREATE TABLE IF NOT EXISTS roles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        server_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        color TEXT DEFAULT '#99aab5',
        permissions TEXT NOT NULL DEFAULT '{}',
        position INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS member_roles (
        member_id INTEGER NOT NULL,
        role_id INTEGER NOT NULL,
        PRIMARY KEY (member_id, role_id),
        FOREIGN KEY (member_id) REFERENCES server_members(id) ON DELETE CASCADE,
        FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        channel_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        content TEXT NOT NULL,
        edited INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
    `);

    // DM (личные сообщения)
    this._sqlDb.exec(`
      CREATE TABLE IF NOT EXISTS direct_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        from_user_id INTEGER NOT NULL,
        to_user_id INTEGER NOT NULL,
        content TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (from_user_id) REFERENCES users(id),
        FOREIGN KEY (to_user_id) REFERENCES users(id)
      );
    `);

    // Баны
    this._sqlDb.exec(`
      CREATE TABLE IF NOT EXISTS server_bans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        server_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        banned_by INTEGER NOT NULL,
        reason TEXT DEFAULT '',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (banned_by) REFERENCES users(id),
        UNIQUE(server_id, user_id)
      );
    `);

    // Муты
    this._sqlDb.exec(`
      CREATE TABLE IF NOT EXISTS server_mutes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        server_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        muted_by INTEGER NOT NULL,
        expires_at DATETIME NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (muted_by) REFERENCES users(id),
        UNIQUE(server_id, user_id)
      );
    `);

    // Вложения к сообщениям
    this._sqlDb.exec(`
      CREATE TABLE IF NOT EXISTS message_attachments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message_id INTEGER NOT NULL,
        file_path TEXT NOT NULL,
        original_name TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        file_size INTEGER DEFAULT 0,
        FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
      );
    `);

    // Реакции на сообщения
    this._sqlDb.exec(`
      CREATE TABLE IF NOT EXISTS message_reactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message_id INTEGER NOT NULL,
        emoji TEXT NOT NULL,
        user_id INTEGER NOT NULL,
        FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id),
        UNIQUE(message_id, emoji, user_id)
      );
    `);

    // Папки избранных GIF пользователя (макс. 5 на пользователя)
    this._sqlDb.exec(`
      CREATE TABLE IF NOT EXISTS user_gif_folders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
    `);

    // Избранные GIF пользователя (дубликаты по gif_url отфильтровываются при выдаче и при добавлении)
    this._sqlDb.exec(`
      CREATE TABLE IF NOT EXISTS user_gif_favorites (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        gif_url TEXT NOT NULL,
        gif_title TEXT DEFAULT '',
        folder_id INTEGER DEFAULT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (folder_id) REFERENCES user_gif_folders(id) ON DELETE SET NULL
      );
    `);

    // Миграции
    try { this._sqlDb.exec("ALTER TABLE messages ADD COLUMN edited INTEGER DEFAULT 0"); } catch (e) {}
    try { this._sqlDb.exec("ALTER TABLE user_gif_favorites ADD COLUMN folder_id INTEGER DEFAULT NULL"); } catch (e) {}
    try { this._sqlDb.exec("ALTER TABLE channels ADD COLUMN slowmode INTEGER DEFAULT 0"); } catch (e) {}
    try {
      const rows = this._sqlDb.prepare('SELECT id, user_id, gif_url FROM user_gif_favorites').all();
      const normalize = (url) => {
        if (!url) return '';
        try {
          const u = new URL(url);
          return (u.origin + u.pathname).replace(/\/+$/, '');
        } catch { return String(url).split('?')[0] || ''; }
        };
      const seen = new Set();
      const toDelete = [];
      for (const r of rows) {
        const key = `${r.user_id}:${normalize(r.gif_url)}`;
        if (seen.has(key)) toDelete.push(r.id);
        else seen.add(key);
      }
      for (const id of toDelete) this._sqlDb.prepare('DELETE FROM user_gif_favorites WHERE id = ?').run(id);
    } catch (e) {}

    // Сохраняем на диск
    this._save();

    // Сохраняем при завершении процесса
    process.on('SIGINT', () => { this._save(); process.exit(); });
    process.on('SIGTERM', () => { this._save(); process.exit(); });

    console.log('  ✓ База данных инициализирована');
  },

  // Подготовить SQL-запрос (возвращает объект с методами run/get/all)
  prepare(sql) {
    const self = this;

    return {
      // Выполнить запрос (INSERT, UPDATE, DELETE)
      run(...params) {
        self._sqlDb.run(sql, params.length > 0 ? params : undefined);
        const lastId = self._sqlDb.exec("SELECT last_insert_rowid()");
        const changesResult = self._sqlDb.exec("SELECT changes()");
        self._save();
        return {
          lastInsertRowid: lastId[0]?.values[0]?.[0] || 0,
          changes: changesResult[0]?.values[0]?.[0] || 0
        };
      },

      // Получить одну строку
      get(...params) {
        const stmt = self._sqlDb.prepare(sql);
        try {
          if (params.length > 0) stmt.bind(params);
          if (stmt.step()) {
            return stmt.getAsObject();
          }
          return undefined;
        } finally {
          stmt.free();
        }
      },

      // Получить все строки
      all(...params) {
        const stmt = self._sqlDb.prepare(sql);
        try {
          if (params.length > 0) stmt.bind(params);
          const results = [];
          while (stmt.step()) {
            results.push(stmt.getAsObject());
          }
          return results;
        } finally {
          stmt.free();
        }
      }
    };
  },

  // Выполнить «сырой» SQL (несколько операторов через ;)
  exec(sql) {
    this._sqlDb.exec(sql);
    this._save();
  },

  // Сохранить базу данных в файл
  _save() {
    if (this._sqlDb) {
      try {
        const data = this._sqlDb.export();
        fs.writeFileSync(DB_PATH, Buffer.from(data));
      } catch (e) {
        console.error('Ошибка сохранения БД:', e);
      }
    }
  }
};

module.exports = database;
