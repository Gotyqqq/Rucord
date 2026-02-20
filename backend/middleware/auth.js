// ============================================================
// middleware/auth.js — Проверка авторизации (JWT-токен)
// Этот файл защищает маршруты: без токена — доступ запрещён
// ============================================================

const jwt = require('jsonwebtoken');

// Секретный ключ для подписи токенов
const JWT_SECRET = process.env.JWT_SECRET || 'rucord-secret-key-2024';

// Middleware — функция, которая проверяет токен перед обработкой запроса
function authMiddleware(req, res, next) {
  // Токен передаётся в заголовке: Authorization: Bearer <токен>
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Необходима авторизация' });
  }

  const token = authHeader.split(' ')[1];

  try {
    // Проверяем и расшифровываем токен
    const decoded = jwt.verify(token, JWT_SECRET);
    // Сохраняем данные пользователя в объект запроса
    req.user = decoded;
    next(); // Передаём управление следующему обработчику
  } catch (err) {
    return res.status(401).json({ error: 'Недействительный токен' });
  }
}

module.exports = { authMiddleware, JWT_SECRET };
