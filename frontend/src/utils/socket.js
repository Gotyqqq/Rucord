// ============================================================
// utils/socket.js — Подключение к Socket.IO для реалтайм-сообщений
// ============================================================

import { io } from 'socket.io-client';

let socket = null;

// Подключиться к серверу Socket.IO с JWT-токеном
export function connectSocket(token) {
  if (socket) {
    socket.disconnect();
  }

  const url = typeof window !== 'undefined' && window.location.origin ? window.location.origin : 'http://localhost:3001';
  socket = io(url, {
    auth: { token }
  });

  socket.on('connect', () => {
    console.log('Socket.IO: подключено');
  });

  socket.on('connect_error', (err) => {
    console.error('Socket.IO ошибка:', err.message);
  });

  return socket;
}

// Получить текущее подключение
export function getSocket() {
  return socket;
}

// Отключиться
export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
