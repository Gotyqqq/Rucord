// ============================================================
// routes/dm.js — Личные сообщения (Direct Messages)
// GET  /api/dm/conversations       — список бесед
// GET  /api/dm/:userId              — история с пользователем
// POST /api/dm/:userId              — отправить сообщение
// ============================================================

const express = require('express');
const db = require('../database');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

// Список бесед (уникальные собеседники)
router.get('/conversations', (req, res) => {
  try {
    const userId = req.user.id;
    const rows = db.prepare(`
      SELECT
        CASE WHEN from_user_id = ? THEN to_user_id ELSE from_user_id END as partner_id,
        MAX(id) as last_msg_id,
        MAX(created_at) as last_at
      FROM direct_messages
      WHERE from_user_id = ? OR to_user_id = ?
      GROUP BY partner_id
      ORDER BY last_at DESC
    `).all(userId, userId, userId);

    const conversations = [];
    for (const row of rows) {
      const partner = db.prepare('SELECT id, username, avatar_url FROM users WHERE id = ?').get(row.partner_id);
      const lastMsg = db.prepare('SELECT * FROM direct_messages WHERE id = ?').get(row.last_msg_id);
      if (partner) {
        conversations.push({
          partner,
          lastMessage: lastMsg,
          lastAt: row.last_at
        });
      }
    }
    res.json({ conversations });
  } catch (err) {
    console.error('Ошибка получения бесед:', err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// История сообщений с конкретным пользователем
router.get('/:userId', (req, res) => {
  try {
    const me = req.user.id;
    const them = Number(req.params.userId);
    const messages = db.prepare(`
      SELECT dm.*, u.username as from_username, u.avatar_url as from_avatar
      FROM direct_messages dm
      JOIN users u ON u.id = dm.from_user_id
      WHERE (dm.from_user_id = ? AND dm.to_user_id = ?) OR (dm.from_user_id = ? AND dm.to_user_id = ?)
      ORDER BY dm.created_at ASC
    `).all(me, them, them, me);
    res.json({ messages });
  } catch (err) {
    console.error('Ошибка получения сообщений:', err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// Отправить DM
router.post('/:userId', (req, res) => {
  try {
    const me = req.user.id;
    const them = Number(req.params.userId);
    const { content } = req.body;
    if (!content || content.trim().length === 0) return res.status(400).json({ error: 'Пустое сообщение' });

    const toUser = db.prepare('SELECT id, username FROM users WHERE id = ?').get(them);
    if (!toUser) return res.status(404).json({ error: 'Пользователь не найден' });

    const result = db.prepare('INSERT INTO direct_messages (from_user_id, to_user_id, content) VALUES (?, ?, ?)').run(me, them, content.trim());
    const dm = db.prepare(`
      SELECT dm.*, u.username as from_username, u.avatar_url as from_avatar
      FROM direct_messages dm JOIN users u ON u.id = dm.from_user_id
      WHERE dm.id = ?
    `).get(result.lastInsertRowid);

    res.json({ message: dm });
  } catch (err) {
    console.error('Ошибка отправки DM:', err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

module.exports = router;
