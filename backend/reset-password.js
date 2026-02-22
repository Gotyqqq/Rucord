#!/usr/bin/env node
// Однократный сброс пароля пользователя по email.
// Запуск на сервере: node reset-password.js EMAIL НОВЫЙ_ПАРОЛЬ
// Пример: node reset-password.js brezhnev003@gmail.com MойНовыйПароль123

const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, 'rucord.db');

async function main() {
  const email = process.argv[2];
  const newPassword = process.argv[3];

  if (!email || !newPassword) {
    console.error('Использование: node reset-password.js EMAIL НОВЫЙ_ПАРОЛЬ');
    process.exit(1);
  }

  if (newPassword.length < 6) {
    console.error('Пароль должен быть не менее 6 символов.');
    process.exit(1);
  }

  if (!fs.existsSync(DB_PATH)) {
    console.error('База данных не найдена:', DB_PATH);
    process.exit(1);
  }

  const SQL = await initSqlJs();
  const buffer = fs.readFileSync(DB_PATH);
  const db = new SQL.Database(buffer);

  const stmt = db.prepare('SELECT id, username FROM users WHERE LOWER(email) = LOWER(?)');
  stmt.bind([email]);
  if (!stmt.step()) {
    console.error('Пользователь с таким email не найден.');
    stmt.free();
    db.close();
    process.exit(1);
  }
  const row = stmt.get();
  stmt.free();
  const id = row[0];
  const username = row[1];

  const password_hash = bcrypt.hashSync(newPassword, 10);
  db.run('UPDATE users SET password_hash = ? WHERE id = ?', [password_hash, id]);
  const data = db.export();
  const output = Buffer.from(data);
  fs.writeFileSync(DB_PATH, output);
  db.close();

  console.log('Пароль успешно обновлён для пользователя:', username, '(' + email + ')');
  console.log('Можно входить на сайте с новым паролем.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
