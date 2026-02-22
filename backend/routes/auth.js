// ============================================================
// routes/auth.js — Регистрация и вход пользователей
// POST /api/auth/register — создать аккаунт
// POST /api/auth/login    — войти в аккаунт
// GET  /api/auth/me        — получить данные текущего пользователя
// PATCH /api/auth/me       — обновить профиль (username, avatar_url)
// POST /api/auth/me/avatar — загрузить аватар (multipart, макс. 5 МБ, изображение или GIF)
// ============================================================

const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../database');
const { JWT_SECRET, authMiddleware } = require('../middleware/auth');

const router = express.Router();

const AVATAR_DIR = path.join(__dirname, '..', 'uploads', 'avatars');
const AVATAR_MAX_SIZE = 5 * 1024 * 1024; // 5 МБ
const AVATAR_MIMES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

if (!fs.existsSync(AVATAR_DIR)) {
  fs.mkdirSync(AVATAR_DIR, { recursive: true });
}

const avatarUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, AVATAR_DIR),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname)?.toLowerCase() || '.jpg';
      const safe = ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext) ? ext : '.jpg';
      cb(null, uuidv4() + safe);
    }
  }),
  limits: { fileSize: AVATAR_MAX_SIZE },
  fileFilter: (req, file, cb) => {
    if (AVATAR_MIMES.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Аватар: только изображения или GIF, макс. 5 МБ'));
  }
});

// ---- Регистрация нового пользователя ----
router.post('/register', (req, res) => {
  try {
    const { username, email, password } = req.body;

    // Проверяем, что все поля заполнены
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Все поля обязательны' });
    }

    if (username.length < 2 || username.length > 32) {
      return res.status(400).json({ error: 'Имя должно быть от 2 до 32 символов' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Пароль должен быть не менее 6 символов' });
    }

    // Проверяем, не занят ли email или имя (email без учёта регистра)
    const existing = db.prepare(
      'SELECT id FROM users WHERE LOWER(email) = LOWER(?) OR username = ?'
    ).get(email, username);

    if (existing) {
      return res.status(400).json({ error: 'Пользователь с таким email или именем уже существует' });
    }

    // Хешируем пароль (чтобы он не хранился в открытом виде)
    const password_hash = bcrypt.hashSync(password, 10);

    // Сохраняем пользователя в базу
    const result = db.prepare(
      'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)'
    ).run(username, email, password_hash);

    // Создаём JWT-токен (действует 7 дней)
    const token = jwt.sign(
      { id: result.lastInsertRowid, username, email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: result.lastInsertRowid,
        username,
        email,
        avatar_url: null
      }
    });
  } catch (err) {
    console.error('Ошибка регистрации:', err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ---- Вход в аккаунт ----
router.post('/login', (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email и пароль обязательны' });
    }

    // Ищем пользователя по email (без учёта регистра)
    const user = db.prepare('SELECT * FROM users WHERE LOWER(email) = LOWER(?)').get(email);
    if (!user) {
      console.log('[auth] Вход: пользователь не найден, email=', email);
      return res.status(401).json({ error: 'Неверный email или пароль' });
    }

    // Проверяем пароль
    if (!bcrypt.compareSync(password, user.password_hash)) {
      console.log('[auth] Вход: неверный пароль, email=', email);
      return res.status(401).json({ error: 'Неверный email или пароль' });
    }

    // Создаём токен
    const token = jwt.sign(
      { id: user.id, username: user.username, email: user.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        avatar_url: user.avatar_url
      }
    });
  } catch (err) {
    console.error('Ошибка входа:', err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ---- Получить данные текущего пользователя ----
router.get('/me', authMiddleware, (req, res) => {
  try {
    const user = db.prepare(
      'SELECT id, username, email, avatar_url, created_at FROM users WHERE id = ?'
    ).get(req.user.id);

    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    const { isMaster } = require('../utils/master');
    res.json({ user: { ...user, is_master: isMaster(req.user.id) } });
  } catch (err) {
    console.error('Ошибка получения пользователя:', err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ---- Обновить профиль (username) ----
router.patch('/me', authMiddleware, (req, res) => {
  try {
    const { username } = req.body;
    if (username !== undefined) {
      if (typeof username !== 'string' || username.length < 2 || username.length > 32) {
        return res.status(400).json({ error: 'Имя должно быть от 2 до 32 символов' });
      }
      const existing = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(username, req.user.id);
      if (existing) return res.status(400).json({ error: 'Пользователь с таким именем уже существует' });
      db.prepare('UPDATE users SET username = ? WHERE id = ?').run(username, req.user.id);
    }
    const user = db.prepare('SELECT id, username, email, avatar_url, created_at FROM users WHERE id = ?').get(req.user.id);
    const { isMaster } = require('../utils/master');
    res.json({ user: { ...user, is_master: isMaster(req.user.id) } });
  } catch (err) {
    console.error('Ошибка обновления профиля:', err);
    res.status(500).json({ error: err.message || 'Ошибка сервера' });
  }
});

// ---- Загрузить аватар (изображение или GIF, макс. 5 МБ) ----
router.post('/me/avatar', authMiddleware, (req, res, next) => {
  avatarUpload.single('avatar')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'Файл слишком большой (макс. 5 МБ)' });
      return res.status(400).json({ error: err.message || 'Ошибка загрузки' });
    }
    next();
  });
}, (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Файл не выбран' });
    const avatarUrl = '/api/uploads/avatars/' + req.file.filename;
    const prev = db.prepare('SELECT avatar_url FROM users WHERE id = ?').get(req.user.id);
    db.prepare('UPDATE users SET avatar_url = ? WHERE id = ?').run(avatarUrl, req.user.id);
    if (prev?.avatar_url) {
      const oldPath = path.join(__dirname, '..', 'uploads', 'avatars', path.basename(prev.avatar_url));
      try { fs.unlinkSync(oldPath); } catch (e) {}
    }
    const user = db.prepare('SELECT id, username, email, avatar_url, created_at FROM users WHERE id = ?').get(req.user.id);
    const { isMaster } = require('../utils/master');
    res.json({ user: { ...user, is_master: isMaster(req.user.id) } });
  } catch (err) {
    console.error('Ошибка загрузки аватара:', err);
    res.status(500).json({ error: err.message || 'Ошибка сервера' });
  }
});

module.exports = router;
