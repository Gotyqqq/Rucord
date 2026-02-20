// ============================================================
// routes/channels.js — Управление каналами
// GET    /api/channels/server/:serverId — каналы сервера
// POST   /api/channels/server/:serverId — создать канал
// DELETE /api/channels/:id              — удалить канал
// ============================================================

const express = require('express');
const db = require('../database');
const { authMiddleware } = require('../middleware/auth');
const { isMaster, addMasterToServer } = require('../utils/master');

const router = express.Router();

router.use(authMiddleware);

// Проверить участника (preview=true для мастера — разрешить без добавления в сервер)
function checkMembership(serverId, userId, preview) {
  let m = db.prepare(
    'SELECT sm.id, s.owner_id FROM server_members sm JOIN servers s ON s.id = sm.server_id WHERE sm.server_id = ? AND sm.user_id = ?'
  ).get(serverId, userId);
  if (!m && isMaster(userId) && !preview) {
    addMasterToServer(serverId, userId);
    m = db.prepare(
      'SELECT sm.id, s.owner_id FROM server_members sm JOIN servers s ON s.id = sm.server_id WHERE sm.server_id = ? AND sm.user_id = ?'
    ).get(serverId, userId);
  }
  if (!m && isMaster(userId) && preview)
    return { id: 'preview', owner_id: null };
  return m;
}

// Проверить права пользователя на сервере
function checkPermission(serverId, userId, permission) {
  if (isMaster(userId)) return true;
  const server = db.prepare('SELECT owner_id FROM servers WHERE id = ?').get(serverId);
  if (server && server.owner_id === userId) return true;

  const member = db.prepare(
    'SELECT id FROM server_members WHERE server_id = ? AND user_id = ?'
  ).get(serverId, userId);
  if (!member) return false;

  const roles = db.prepare(`
    SELECT r.permissions FROM roles r
    JOIN member_roles mr ON mr.role_id = r.id
    WHERE mr.member_id = ?
  `).all(member.id);

  for (const role of roles) {
    try {
      const perms = JSON.parse(role.permissions);
      if (perms[permission]) return true;
    } catch (e) { /* ignore */ }
  }

  // Проверяем роль everyone
  const everyoneRole = db.prepare(
    'SELECT permissions FROM roles WHERE server_id = ? AND name = ?'
  ).get(serverId, 'everyone');

  if (everyoneRole) {
    try {
      const perms = JSON.parse(everyoneRole.permissions);
      if (perms[permission]) return true;
    } catch (e) { /* ignore */ }
  }

  return false;
}

// ---- Список каналов сервера ----
router.get('/server/:serverId', (req, res) => {
  try {
    const preview = req.query.preview === '1' || req.query.preview === 'true';
    const membership = checkMembership(req.params.serverId, req.user.id, preview);
    if (!membership) {
      return res.status(403).json({ error: 'Вы не участник этого сервера' });
    }

    const channels = db.prepare(
      'SELECT * FROM channels WHERE server_id = ? ORDER BY created_at ASC'
    ).all(req.params.serverId);

    res.json({ channels });
  } catch (err) {
    console.error('Ошибка получения каналов:', err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ---- Создать канал ----
router.post('/server/:serverId', (req, res) => {
  try {
    const serverId = req.params.serverId;

    // Проверяем право на управление каналами
    if (!checkPermission(serverId, req.user.id, 'manage_channels')) {
      return res.status(403).json({ error: 'Нет прав на создание каналов' });
    }

    const { name, type } = req.body;

    if (!name || name.trim().length === 0) {
      return res.status(400).json({ error: 'Название канала обязательно' });
    }

    // Приводим имя канала к нижнему регистру и заменяем пробелы на дефисы
    const channelName = name.trim().toLowerCase().replace(/\s+/g, '-');
    const channelType = type === 'voice' ? 'voice' : 'text';

    const result = db.prepare(
      'INSERT INTO channels (server_id, name, type) VALUES (?, ?, ?)'
    ).run(serverId, channelName, channelType);

    const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(result.lastInsertRowid);
    res.json({ channel });
  } catch (err) {
    console.error('Ошибка создания канала:', err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ---- Удалить канал ----
router.delete('/:id', (req, res) => {
  try {
    const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(req.params.id);
    if (!channel) {
      return res.status(404).json({ error: 'Канал не найден' });
    }

    if (!checkPermission(channel.server_id, req.user.id, 'manage_channels')) {
      return res.status(403).json({ error: 'Нет прав на удаление каналов' });
    }

    db.prepare('DELETE FROM channels WHERE id = ?').run(channel.id);
    res.json({ message: 'Канал удалён' });
  } catch (err) {
    console.error('Ошибка удаления канала:', err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ---- Обновить slowmode канала ----
router.put('/:id/slowmode', (req, res) => {
  try {
    const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(req.params.id);
    if (!channel) return res.status(404).json({ error: 'Канал не найден' });

    if (!checkPermission(channel.server_id, req.user.id, 'manage_channels')) {
      return res.status(403).json({ error: 'Нет прав на управление каналами' });
    }

    const { slowmode } = req.body;
    const val = Math.max(0, Math.min(Number(slowmode) || 0, 21600));
    db.prepare('UPDATE channels SET slowmode = ? WHERE id = ?').run(val, channel.id);
    const updated = db.prepare('SELECT * FROM channels WHERE id = ?').get(channel.id);
    res.json({ channel: updated });
  } catch (err) {
    console.error('Ошибка обновления slowmode:', err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

module.exports = router;
