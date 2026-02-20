// ============================================================
// routes/servers.js — Управление серверами
// GET    /api/servers          — список серверов пользователя
// POST   /api/servers          — создать сервер
// GET    /api/servers/:id      — информация о сервере
// PUT    /api/servers/:id      — обновить сервер
// DELETE /api/servers/:id      — удалить сервер
// POST   /api/servers/join     — присоединиться по инвайт-коду
// GET    /api/servers/:id/invite — получить инвайт-код
// ============================================================

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../database');
const { authMiddleware } = require('../middleware/auth');
const { notifyServer } = require('../socket/chat');
const { isMaster, addMasterToServer } = require('../utils/master');

const router = express.Router();

// Все маршруты требуют авторизации
router.use(authMiddleware);

// ---- Список серверов (мастер видит все + флаг is_member) ----
router.get('/', (req, res) => {
  try {
    let servers;
    if (isMaster(req.user.id)) {
      const all = db.prepare(`
        SELECT s.*,
          (SELECT COUNT(*) FROM server_members WHERE server_id = s.id) as member_count
        FROM servers s
        ORDER BY s.created_at DESC
      `).all();
      const memberIds = new Set(
        db.prepare('SELECT server_id FROM server_members WHERE user_id = ?').all(req.user.id).map(r => r.server_id)
      );
      servers = all.map(s => ({ ...s, is_member: memberIds.has(s.id) }));
    } else {
      servers = db.prepare(`
        SELECT s.*,
          (SELECT COUNT(*) FROM server_members WHERE server_id = s.id) as member_count
        FROM servers s
        JOIN server_members sm ON sm.server_id = s.id
        WHERE sm.user_id = ?
        ORDER BY s.created_at DESC
      `).all(req.user.id);
      servers.forEach(s => { s.is_member = true; });
    }
    res.json({ servers });
  } catch (err) {
    console.error('Ошибка получения серверов:', err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ---- Создать новый сервер ----
router.post('/', (req, res) => {
  try {
    const { name } = req.body;

    if (!name || name.trim().length === 0) {
      return res.status(400).json({ error: 'Название сервера обязательно' });
    }

    if (name.length > 100) {
      return res.status(400).json({ error: 'Название слишком длинное (макс. 100 символов)' });
    }

    // Генерируем уникальный инвайт-код
    const invite_code = uuidv4().slice(0, 8);

    // Создаём сервер
    const result = db.prepare(
      'INSERT INTO servers (name, invite_code, owner_id) VALUES (?, ?, ?)'
    ).run(name.trim(), invite_code, req.user.id);

    const serverId = result.lastInsertRowid;

    // Добавляем создателя как участника
    db.prepare(
      'INSERT INTO server_members (server_id, user_id) VALUES (?, ?)'
    ).run(serverId, req.user.id);

    // Создаём канал "общий" по умолчанию
    db.prepare(
      'INSERT INTO channels (server_id, name, type) VALUES (?, ?, ?)'
    ).run(serverId, 'общий', 'text');

    // Создаём роль "everyone" (базовая роль для всех)
    const defaultPermissions = JSON.stringify({
      send_messages: true,
      read_messages: true,
      send_gifs: true,
      send_media: true,
      delete_messages: true,
      manage_server: false,
      manage_channels: false,
      manage_roles: false,
      kick_members: false
    });

    db.prepare(
      'INSERT INTO roles (server_id, name, color, permissions, position) VALUES (?, ?, ?, ?, ?)'
    ).run(serverId, 'everyone', '#99aab5', defaultPermissions, 0);

    // Создаём роль "Владелец"
    const ownerPermissions = JSON.stringify({
      send_messages: true,
      read_messages: true,
      send_gifs: true,
      send_media: true,
      delete_messages: true,
      manage_server: true,
      manage_channels: true,
      manage_roles: true,
      kick_members: true
    });

    const ownerRole = db.prepare(
      'INSERT INTO roles (server_id, name, color, permissions, position) VALUES (?, ?, ?, ?, ?)'
    ).run(serverId, 'Владелец', '#e74c3c', ownerPermissions, 100);

    // Назначаем роль «Владелец» создателю
    const member = db.prepare(
      'SELECT id FROM server_members WHERE server_id = ? AND user_id = ?'
    ).get(serverId, req.user.id);

    db.prepare(
      'INSERT INTO member_roles (member_id, role_id) VALUES (?, ?)'
    ).run(member.id, ownerRole.lastInsertRowid);

    // Возвращаем созданный сервер
    const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(serverId);
    res.json({ server });
  } catch (err) {
    console.error('Ошибка создания сервера:', err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ---- Информация о сервере (preview=1 для мастера — не добавлять в участники) ----
router.get('/:id', (req, res) => {
  try {
    const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(req.params.id);
    if (!server) {
      return res.status(404).json({ error: 'Сервер не найден' });
    }

    const preview = req.query.preview === '1' || req.query.preview === 'true';
    let member = db.prepare(
      'SELECT id FROM server_members WHERE server_id = ? AND user_id = ?'
    ).get(server.id, req.user.id);

    if (!member && isMaster(req.user.id) && !preview) {
      addMasterToServer(server.id, req.user.id);
    } else if (!member && !(isMaster(req.user.id) && preview)) {
      return res.status(403).json({ error: 'Вы не являетесь участником этого сервера' });
    }

    res.json({ server });
  } catch (err) {
    console.error('Ошибка:', err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ---- Мастер вступает на сервер (появляется в списке участников и слева) ----
router.post('/:id/join-master', (req, res) => {
  try {
    const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(req.params.id);
    if (!server) return res.status(404).json({ error: 'Сервер не найден' });
    if (!isMaster(req.user.id)) return res.status(403).json({ error: 'Только для мастера' });
    addMasterToServer(server.id, req.user.id);
    notifyServer(server.id, 'members_updated', { serverId: server.id });
    res.json({ server });
  } catch (err) {
    console.error('Ошибка:', err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ---- Обновить сервер (только владелец) ----
router.put('/:id', (req, res) => {
  try {
    const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(req.params.id);
    if (!server) {
      return res.status(404).json({ error: 'Сервер не найден' });
    }

    if (server.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Только владелец может изменять сервер' });
    }

    const { name } = req.body;
    if (name) {
      db.prepare('UPDATE servers SET name = ? WHERE id = ?').run(name.trim(), server.id);
    }

    const updated = db.prepare('SELECT * FROM servers WHERE id = ?').get(server.id);
    res.json({ server: updated });
  } catch (err) {
    console.error('Ошибка обновления сервера:', err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ---- Удалить сервер (только владелец) ----
router.delete('/:id', (req, res) => {
  try {
    const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(req.params.id);
    if (!server) {
      return res.status(404).json({ error: 'Сервер не найден' });
    }

    if (server.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Только владелец может удалить сервер' });
    }

    db.prepare('DELETE FROM servers WHERE id = ?').run(server.id);
    res.json({ message: 'Сервер удалён' });
  } catch (err) {
    console.error('Ошибка удаления сервера:', err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ---- Покинуть сервер ----
router.post('/:id/leave', (req, res) => {
  try {
    const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(req.params.id);
    if (!server) {
      return res.status(404).json({ error: 'Сервер не найден' });
    }

    if (server.owner_id === req.user.id) {
      return res.status(400).json({ error: 'Владелец не может покинуть сервер. Удалите сервер или передайте права.' });
    }

    db.prepare(
      'DELETE FROM server_members WHERE server_id = ? AND user_id = ?'
    ).run(server.id, req.user.id);

    res.json({ message: 'Вы покинули сервер' });
  } catch (err) {
    console.error('Ошибка выхода с сервера:', err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ---- Присоединиться к серверу по инвайт-коду ----
router.post('/join', (req, res) => {
  try {
    const { invite_code } = req.body;

    if (!invite_code) {
      return res.status(400).json({ error: 'Инвайт-код обязателен' });
    }

    const server = db.prepare('SELECT * FROM servers WHERE invite_code = ?').get(invite_code);
    if (!server) {
      return res.status(404).json({ error: 'Сервер с таким кодом не найден' });
    }

    // Проверяем, не состоит ли пользователь уже на сервере
    const existing = db.prepare(
      'SELECT id FROM server_members WHERE server_id = ? AND user_id = ?'
    ).get(server.id, req.user.id);

    if (existing) {
      return res.status(400).json({ error: 'Вы уже состоите на этом сервере' });
    }

    // Проверяем бан
    const ban = db.prepare('SELECT id FROM server_bans WHERE server_id = ? AND user_id = ?').get(server.id, req.user.id);
    if (ban) {
      return res.status(403).json({ error: 'Вы забанены на этом сервере' });
    }

    // Добавляем пользователя
    db.prepare(
      'INSERT INTO server_members (server_id, user_id) VALUES (?, ?)'
    ).run(server.id, req.user.id);

    // Оповещаем всех участников сервера о новом пользователе
    notifyServer(server.id, 'members_updated', { serverId: server.id });

    res.json({ server });
  } catch (err) {
    console.error('Ошибка присоединения:', err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ---- Получить инвайт-код сервера ----
router.get('/:id/invite', (req, res) => {
  try {
    const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(req.params.id);
    if (!server) {
      return res.status(404).json({ error: 'Сервер не найден' });
    }

    let member = db.prepare(
      'SELECT id FROM server_members WHERE server_id = ? AND user_id = ?'
    ).get(server.id, req.user.id);

    if (!member && isMaster(req.user.id)) {
      addMasterToServer(server.id, req.user.id);
    } else if (!member) {
      return res.status(403).json({ error: 'Вы не являетесь участником этого сервера' });
    }

    res.json({ invite_code: server.invite_code });
  } catch (err) {
    console.error('Ошибка:', err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

module.exports = router;
