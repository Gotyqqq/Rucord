// ============================================================
// routes/auth.js — Регистрация и вход пользователей
// POST /api/auth/register — создать аккаунт
// POST /api/auth/login    — войти в аккаунт
// GET  /api/auth/me        — получить данные текущего пользователя
// ============================================================

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../database');
const { JWT_SECRET, authMiddleware } = require('../middleware/auth');

const router = express.Router();

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

    // Проверяем, не занят ли email или имя
    const existing = db.prepare(
      'SELECT id FROM users WHERE email = ? OR username = ?'
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

    // Ищем пользователя по email
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user) {
      return res.status(401).json({ error: 'Неверный email или пароль' });
    }

    // Проверяем пароль
    if (!bcrypt.compareSync(password, user.password_hash)) {
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

module.exports = router;
