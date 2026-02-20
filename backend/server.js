// ============================================================
// server.js — Главный файл сервера Rucord
// Запуск: node server.js
// ============================================================

require('dotenv').config();

const DEFAULT_JWT_SECRET = 'rucord-secret-key-2024';
const jwtSecret = process.env.JWT_SECRET || DEFAULT_JWT_SECRET;
if (process.env.NODE_ENV === 'production') {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET === DEFAULT_JWT_SECRET) {
    console.error('Безопасность: в production задайте свой JWT_SECRET в .env (длинная случайная строка).');
    process.exit(1);
  }
} else if (jwtSecret === DEFAULT_JWT_SECRET) {
  console.warn('Предупреждение: используется стандартный JWT_SECRET. Для продакшена задайте JWT_SECRET в .env.');
}

const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const { Server } = require('socket.io');
const db = require('./database');

// Импортируем роуты (обработчики запросов)
const authRoutes = require('./routes/auth');
const serverRoutes = require('./routes/servers');
const channelRoutes = require('./routes/channels');
const memberRoutes = require('./routes/members');
const messageRoutes = require('./routes/messages');
const dmRoutes = require('./routes/dm');
const uploadRoutes = require('./routes/upload');
const gifFavoritesRoutes = require('./routes/gifFavorites');
const gifFoldersRoutes = require('./routes/gifFolders');
const gifSearchRoutes = require('./routes/gifSearch');
const embedRoutes = require('./routes/embed');
const setupSocket = require('./socket/chat');

async function main() {
  // Инициализируем базу данных (создаём таблицы)
  await db.init();

  // Создаём Express-приложение
  const app = express();
  const server = http.createServer(app);

  const isProd = process.env.NODE_ENV === 'production';
  const corsAllowed = isProd ? true : (origin, cb) => {
    if (!origin || origin.startsWith('http://localhost:')) cb(null, true);
    else cb(new Error('Not allowed by CORS'));
  };

  const io = new Server(server, {
    cors: { origin: corsAllowed, methods: ['GET', 'POST', 'PUT', 'DELETE'] }
  });

  app.use(cors({ origin: corsAllowed }));
  app.use(express.json());

  // --- Подключаем маршруты API ---
  app.use('/api/auth', authRoutes);
  app.use('/api/servers', serverRoutes);
  app.use('/api/channels', channelRoutes);
  app.use('/api/members', memberRoutes);
  app.use('/api/messages', messageRoutes);
  app.use('/api/dm', dmRoutes);
  app.use('/api/upload', uploadRoutes);
  app.use('/api/gif-favorites', gifFavoritesRoutes);
  app.use('/api/gif-folders', gifFoldersRoutes);
  app.use('/api/gif-search', gifSearchRoutes);
  app.use('/api/embed', embedRoutes);

  // Раздача загруженных файлов (GET /api/uploads/:filename)
  app.use('/api/uploads', express.static(path.join(__dirname, 'uploads')));

  // --- Простая проверка что сервер работает ---
  app.get('/', (req, res) => {
    res.json({ message: 'Rucord API работает!' });
  });

  // --- Настраиваем Socket.IO ---
  setupSocket(io);

  // --- Запускаем сервер ---
  const PORT = process.env.PORT || 3001;
  server.listen(PORT, () => {
    console.log(`\n  ✓ Rucord сервер запущен: http://localhost:${PORT}`);
    console.log(`  ✓ API доступно по адресу: http://localhost:${PORT}/api`);
    console.log(`  ✓ Ожидаю подключений...\n`);
  });
}

main().catch(err => {
  console.error('Ошибка запуска сервера:', err);
  process.exit(1);
});
