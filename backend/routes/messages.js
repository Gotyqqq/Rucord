// ============================================================
// routes/messages.js — История сообщений
// GET  /api/messages/channel/:channelId — получить сообщения канала
// POST /api/messages/channel/:channelId — отправить сообщение (REST)
// ============================================================

const express = require('express');
const db = require('../database');
const { authMiddleware } = require('../middleware/auth');
const { isMaster, addMasterToServer } = require('../utils/master');

const router = express.Router();

router.use(authMiddleware);

function ensureMember(channel, userId, preview) {
  let member = db.prepare('SELECT id FROM server_members WHERE server_id = ? AND user_id = ?').get(channel.server_id, userId);
  if (!member && isMaster(userId) && !preview) {
    addMasterToServer(channel.server_id, userId);
    member = db.prepare('SELECT id FROM server_members WHERE server_id = ? AND user_id = ?').get(channel.server_id, userId);
  }
  if (!member && isMaster(userId) && preview) return { id: 'preview' };
  return member;
}

function enrichMessageWithAttachmentsAndReactions(msg) {
  const attRows = db.prepare('SELECT file_path, original_name, mime_type FROM message_attachments WHERE message_id = ?').all(msg.id);
  msg.attachments = attRows.map(a => ({
    url: a.file_path.startsWith('http') ? a.file_path : '/api/uploads/' + a.file_path,
    original_name: a.original_name,
    mime_type: a.mime_type
  }));
  const reactionRows = db.prepare('SELECT emoji, user_id FROM message_reactions WHERE message_id = ?').all(msg.id);
  const byEmoji = {};
  for (const r of reactionRows) {
    if (!byEmoji[r.emoji]) byEmoji[r.emoji] = { emoji: r.emoji, count: 0, userIds: [] };
    byEmoji[r.emoji].count++;
    byEmoji[r.emoji].userIds.push(r.user_id);
  }
  msg.reactions = Object.values(byEmoji);
  return msg;
}

// ---- Получить сообщения канала (с пагинацией) ----
router.get('/channel/:channelId', (req, res) => {
  try {
    const channelId = req.params.channelId;

    // Находим канал и проверяем доступ
    const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(channelId);
    if (!channel) {
      return res.status(404).json({ error: 'Канал не найден' });
    }

    const preview = req.query.preview === '1' || req.query.preview === 'true';
    const member = ensureMember(channel, req.user.id, preview);
    if (!member) {
      return res.status(403).json({ error: 'Вы не участник этого сервера' });
    }

    // Пагинация: ?limit=50&before=100 (сообщения до id=100)
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const before = req.query.before ? parseInt(req.query.before) : null;

    let messages;
    if (before) {
      messages = db.prepare(`
        SELECT m.*, u.username, u.avatar_url
        FROM messages m
        JOIN users u ON u.id = m.user_id
        WHERE m.channel_id = ? AND m.id < ?
        ORDER BY m.created_at DESC
        LIMIT ?
      `).all(channelId, before, limit);
    } else {
      messages = db.prepare(`
        SELECT m.*, u.username, u.avatar_url
        FROM messages m
        JOIN users u ON u.id = m.user_id
        WHERE m.channel_id = ?
        ORDER BY m.created_at DESC
        LIMIT ?
      `).all(channelId, limit);
    }

    // Возвращаем в хронологическом порядке (старые сверху)
    messages.reverse();

    for (const m of messages) enrichMessageWithAttachmentsAndReactions(m);

    res.json({ messages });
  } catch (err) {
    console.error('Ошибка получения сообщений:', err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ---- Отправить сообщение (REST-вариант, основной через Socket.IO) ----
router.post('/channel/:channelId', (req, res) => {
  try {
    const channelId = req.params.channelId;
    const { content } = req.body;

    if (!content || content.trim().length === 0) {
      return res.status(400).json({ error: 'Сообщение не может быть пустым' });
    }

    const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(channelId);
    if (!channel) {
      return res.status(404).json({ error: 'Канал не найден' });
    }

    const member = ensureMember(channel, req.user.id);
    if (!member) {
      return res.status(403).json({ error: 'Вы не участник этого сервера' });
    }

    const result = db.prepare(
      'INSERT INTO messages (channel_id, user_id, content) VALUES (?, ?, ?)'
    ).run(channelId, req.user.id, content.trim());

    const message = db.prepare(`
      SELECT m.*, u.username, u.avatar_url
      FROM messages m
      JOIN users u ON u.id = m.user_id
      WHERE m.id = ?
    `).get(result.lastInsertRowid);

    res.json({ message });
  } catch (err) {
    console.error('Ошибка отправки сообщения:', err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ---- Редактирование сообщения ----
router.put('/:messageId', (req, res) => {
  try {
    const { messageId } = req.params;
    const { content } = req.body;

    if (!content || content.trim().length === 0) {
      return res.status(400).json({ error: 'Сообщение не может быть пустым' });
    }

    const message = db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId);
    if (!message) {
      return res.status(404).json({ error: 'Сообщение не найдено' });
    }

    const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(message.channel_id);
    if (!channel) {
      return res.status(404).json({ error: 'Канал не найден' });
    }

    // Автор может редактировать свои сообщения
    const isAuthor = message.user_id === req.user.id;

    // Проверяем право edit_messages для чужих сообщений (мастер всегда может)
    let canEditOthers = false;
    if (!isAuthor) {
      if (isMaster(req.user.id)) {
        canEditOthers = true;
      } else {
        const server = db.prepare('SELECT owner_id FROM servers WHERE id = ?').get(channel.server_id);
        if (server && server.owner_id === req.user.id) {
          canEditOthers = true;
        } else {
          const member = db.prepare(
          'SELECT id FROM server_members WHERE server_id = ? AND user_id = ?'
        ).get(channel.server_id, req.user.id);
        if (member) {
          const roles = db.prepare(`
            SELECT r.permissions FROM roles r
            JOIN member_roles mr ON mr.role_id = r.id
            WHERE mr.member_id = ?
          `).all(member.id);
          for (const role of roles) {
            try {
              const perms = JSON.parse(role.permissions);
              if (perms.edit_messages) { canEditOthers = true; break; }
            } catch (e) { /* ignore */ }
          }
        }
        }
      }
    }

    if (!isAuthor && !canEditOthers) {
      return res.status(403).json({ error: 'Нет прав на редактирование этого сообщения' });
    }

    db.prepare('UPDATE messages SET content = ?, edited = 1 WHERE id = ?').run(content.trim(), messageId);

    const updated = db.prepare(`
      SELECT m.*, u.username, u.avatar_url
      FROM messages m
      JOIN users u ON u.id = m.user_id
      WHERE m.id = ?
    `).get(messageId);

    // Помечаем как отредактированное
    updated.edited = true;

    res.json({ message: updated });
  } catch (err) {
    console.error('Ошибка редактирования сообщения:', err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

module.exports = router;
