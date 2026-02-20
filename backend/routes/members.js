// ============================================================
// routes/members.js — Участники, роли, баны, муты
// Полная иерархия: owner > administrator > manage_roles и т.д.
// ============================================================

const express = require('express');
const db = require('../database');
const { authMiddleware } = require('../middleware/auth');
const { notifyServer } = require('../socket/chat');

const router = express.Router();
router.use(authMiddleware);

const { getUserPermissions: getPerms, hasPermission: hasPerm, isOwner: isServerOwner, getMemberId: getMbrId, addMasterToServer } = require('../utils/permissions');
const { isMaster } = require('../utils/master');

// Совместимость: старые роли без send_gifs/send_media по умолчанию разрешают (не задано = true)
function getUserPermissions(serverId, userId) {
  const p = getPerms(serverId, userId);
  if (p.send_gifs === undefined) p.send_gifs = true;
  if (p.send_media === undefined) p.send_media = true;
  return p;
}
function hasPermission(serverId, userId, permission) { return !!getUserPermissions(serverId, userId)[permission]; }
function isOwner(serverId, userId) { return isServerOwner(serverId, userId); }
function getMemberId(serverId, userId) { return getMbrId(serverId, userId); }

// ---- Утилиты иерархии ----

function getUserHighestPosition(serverId, userId) {
  if (isMaster(userId)) return Infinity;
  if (isOwner(serverId, userId)) return Infinity;
  const memberId = getMemberId(serverId, userId);
  if (!memberId) return -1;
  const row = db.prepare(`SELECT MAX(r.position) as max_pos FROM roles r JOIN member_roles mr ON mr.role_id = r.id WHERE mr.member_id = ?`).get(memberId);
  return row?.max_pos || 0;
}

function parseRoles(rows) {
  return rows.map(r => ({ ...r, permissions: JSON.parse(r.permissions) }));
}

// Проверка мута
function isUserMuted(serverId, userId) {
  const mute = db.prepare('SELECT * FROM server_mutes WHERE server_id = ? AND user_id = ?').get(serverId, userId);
  if (!mute) return false;
  const expiresAt = new Date(mute.expires_at + 'Z');
  if (expiresAt <= new Date()) {
    db.prepare('DELETE FROM server_mutes WHERE id = ?').run(mute.id);
    return false;
  }
  return true;
}

// ---- GET /server/:serverId — список участников (preview=1 для мастера — без добавления) ----
router.get('/server/:serverId', (req, res) => {
  try {
    const serverId = req.params.serverId;
    const preview = req.query.preview === '1' || req.query.preview === 'true';
    let self = getMemberId(serverId, req.user.id);
    if (!self && isMaster(req.user.id) && !preview) {
      addMasterToServer(serverId, req.user.id);
      self = getMemberId(serverId, req.user.id);
    }
    if (!self && !(isMaster(req.user.id) && preview)) return res.status(403).json({ error: 'Вы не участник этого сервера' });

    const members = db.prepare(`
      SELECT sm.id as member_id, u.id as user_id, u.username, u.avatar_url, sm.joined_at, s.owner_id
      FROM server_members sm JOIN users u ON u.id = sm.user_id JOIN servers s ON s.id = sm.server_id
      WHERE sm.server_id = ? ORDER BY sm.joined_at ASC
    `).all(serverId);

    const getRoles = db.prepare(`
      SELECT r.id, r.name, r.color, r.permissions, r.position
      FROM roles r JOIN member_roles mr ON mr.role_id = r.id WHERE mr.member_id = ? ORDER BY r.position DESC
    `);

    const result = members.map(m => {
      const mute = db.prepare('SELECT expires_at FROM server_mutes WHERE server_id = ? AND user_id = ?').get(serverId, m.user_id);
      let isMuted = false;
      let muteExpiresAt = null;
      if (mute) {
        const exp = new Date(mute.expires_at + 'Z');
        if (exp > new Date()) { isMuted = true; muteExpiresAt = mute.expires_at; }
        else { db.prepare('DELETE FROM server_mutes WHERE server_id = ? AND user_id = ?').run(serverId, m.user_id); }
      }
      return {
        ...m, is_owner: m.user_id === m.owner_id,
        roles: getRoles.all(m.member_id),
        is_muted: isMuted, mute_expires_at: muteExpiresAt
      };
    });

    res.json({ members: result });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Внутренняя ошибка сервера' }); }
});

// ---- GET /server/:serverId/permissions ----
router.get('/server/:serverId/permissions', (req, res) => {
  try {
    const serverId = req.params.serverId;
    const perms = getUserPermissions(serverId, req.user.id);
    const myPos = getUserHighestPosition(serverId, req.user.id);
    res.json({
      permissions: perms,
      highestPosition: myPos === Infinity ? 999 : myPos,
      isOwner: isOwner(serverId, req.user.id)
    });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Внутренняя ошибка сервера' }); }
});

// ---- Поиск участников ----
router.get('/server/:serverId/search', (req, res) => {
  try {
    const serverId = req.params.serverId;
    let self = getMemberId(serverId, req.user.id);
    if (!self && isMaster(req.user.id)) {
      addMasterToServer(serverId, req.user.id);
    } else if (!self) {
      return res.status(403).json({ error: 'Вы не участник этого сервера' });
    }
    const query = req.query.q || '';
    const members = db.prepare(`
      SELECT u.id as user_id, u.username, u.avatar_url
      FROM server_members sm JOIN users u ON u.id = sm.user_id
      WHERE sm.server_id = ? AND u.username LIKE ? LIMIT 20
    `).all(serverId, `%${query}%`);
    res.json({ members });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Внутренняя ошибка сервера' }); }
});

// ---- Кикнуть участника ----
router.delete('/server/:serverId/:userId', (req, res) => {
  try {
    const { serverId, userId } = req.params;
    const targetUserId = parseInt(userId);
    if (isOwner(serverId, targetUserId)) return res.status(400).json({ error: 'Нельзя кикнуть владельца' });
    if (!hasPermission(serverId, req.user.id, 'kick_members')) return res.status(403).json({ error: 'Нет прав' });

    const myPos = getUserHighestPosition(serverId, req.user.id);
    const targetPos = getUserHighestPosition(serverId, targetUserId);
    if (targetPos >= myPos) return res.status(403).json({ error: 'Нельзя кикнуть участника с ролью выше или равной вашей' });

    db.prepare('DELETE FROM server_members WHERE server_id = ? AND user_id = ?').run(serverId, userId);
    notifyServer(Number(serverId), 'members_updated', { serverId: Number(serverId) });
    res.json({ message: 'Участник удалён' });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Внутренняя ошибка сервера' }); }
});

// ======== БАНЫ ========

router.post('/server/:serverId/ban/:userId', (req, res) => {
  try {
    const { serverId, userId } = req.params;
    const targetUserId = parseInt(userId);
    const { reason } = req.body;

    if (isOwner(serverId, targetUserId)) return res.status(400).json({ error: 'Нельзя забанить владельца' });
    if (targetUserId === req.user.id) return res.status(400).json({ error: 'Нельзя забанить себя' });
    if (!hasPermission(serverId, req.user.id, 'ban_members')) return res.status(403).json({ error: 'Нет прав на бан' });

    const myPos = getUserHighestPosition(serverId, req.user.id);
    const targetPos = getUserHighestPosition(serverId, targetUserId);
    if (targetPos >= myPos) return res.status(403).json({ error: 'Нельзя забанить участника с ролью >= вашей' });

    // Удаляем из сервера
    db.prepare('DELETE FROM server_members WHERE server_id = ? AND user_id = ?').run(serverId, targetUserId);

    // Добавляем в баны
    const existing = db.prepare('SELECT id FROM server_bans WHERE server_id = ? AND user_id = ?').get(serverId, targetUserId);
    if (!existing) {
      db.prepare('INSERT INTO server_bans (server_id, user_id, banned_by, reason) VALUES (?, ?, ?, ?)').run(serverId, targetUserId, req.user.id, reason || '');
    }

    notifyServer(Number(serverId), 'members_updated', { serverId: Number(serverId) });
    res.json({ message: 'Участник забанен' });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Внутренняя ошибка сервера' }); }
});

router.delete('/server/:serverId/ban/:userId', (req, res) => {
  try {
    const { serverId, userId } = req.params;
    if (!hasPermission(serverId, req.user.id, 'ban_members')) return res.status(403).json({ error: 'Нет прав' });
    db.prepare('DELETE FROM server_bans WHERE server_id = ? AND user_id = ?').run(serverId, parseInt(userId));
    res.json({ message: 'Бан снят' });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Внутренняя ошибка сервера' }); }
});

router.get('/server/:serverId/bans', (req, res) => {
  try {
    const serverId = req.params.serverId;
    if (!hasPermission(serverId, req.user.id, 'ban_members')) return res.status(403).json({ error: 'Нет прав' });
    const bans = db.prepare(`
      SELECT sb.*, u.username, u.avatar_url, bu.username as banned_by_name
      FROM server_bans sb JOIN users u ON u.id = sb.user_id JOIN users bu ON bu.id = sb.banned_by
      WHERE sb.server_id = ? ORDER BY sb.created_at DESC
    `).all(serverId);
    res.json({ bans });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Внутренняя ошибка сервера' }); }
});

// ======== МУТЫ ========

router.post('/server/:serverId/mute/:userId', (req, res) => {
  try {
    const { serverId, userId } = req.params;
    const targetUserId = parseInt(userId);
    const { duration } = req.body; // duration in seconds

    if (isOwner(serverId, targetUserId)) return res.status(400).json({ error: 'Нельзя замутить владельца' });
    if (targetUserId === req.user.id) return res.status(400).json({ error: 'Нельзя замутить себя' });
    if (!hasPermission(serverId, req.user.id, 'mute_members')) return res.status(403).json({ error: 'Нет прав на мут' });

    const myPos = getUserHighestPosition(serverId, req.user.id);
    const targetPos = getUserHighestPosition(serverId, targetUserId);
    if (targetPos >= myPos) return res.status(403).json({ error: 'Нельзя замутить участника с ролью >= вашей' });

    const durationSec = Math.max(60, Math.min(Number(duration) || 300, 2592000)); // 1min to 30days
    const expiresAt = new Date(Date.now() + durationSec * 1000).toISOString().replace('T', ' ').replace('Z', '');

    // Upsert
    const existing = db.prepare('SELECT id FROM server_mutes WHERE server_id = ? AND user_id = ?').get(serverId, targetUserId);
    if (existing) {
      db.prepare('UPDATE server_mutes SET expires_at = ?, muted_by = ? WHERE id = ?').run(expiresAt, req.user.id, existing.id);
    } else {
      db.prepare('INSERT INTO server_mutes (server_id, user_id, muted_by, expires_at) VALUES (?, ?, ?, ?)').run(serverId, targetUserId, req.user.id, expiresAt);
    }

    notifyServer(Number(serverId), 'members_updated', { serverId: Number(serverId) });
    res.json({ message: 'Участник замучен', expires_at: expiresAt });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Внутренняя ошибка сервера' }); }
});

router.delete('/server/:serverId/mute/:userId', (req, res) => {
  try {
    const { serverId, userId } = req.params;
    if (!hasPermission(serverId, req.user.id, 'mute_members')) return res.status(403).json({ error: 'Нет прав' });
    db.prepare('DELETE FROM server_mutes WHERE server_id = ? AND user_id = ?').run(serverId, parseInt(userId));
    notifyServer(Number(serverId), 'members_updated', { serverId: Number(serverId) });
    res.json({ message: 'Мут снят' });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Внутренняя ошибка сервера' }); }
});

// ======== РОЛИ ========

router.get('/server/:serverId/roles', (req, res) => {
  try {
    const roles = db.prepare('SELECT * FROM roles WHERE server_id = ? ORDER BY position DESC').all(req.params.serverId);
    res.json({ roles: parseRoles(roles) });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Внутренняя ошибка сервера' }); }
});

router.put('/server/:serverId/roles/reorder', (req, res) => {
  try {
    const serverId = req.params.serverId;
    if (!hasPermission(serverId, req.user.id, 'manage_roles')) return res.status(403).json({ error: 'Нет прав' });

    const { roleIds } = req.body;
    if (!Array.isArray(roleIds)) return res.status(400).json({ error: 'roleIds должен быть массивом' });

    const myPos = getUserHighestPosition(serverId, req.user.id);
    for (const roleId of roleIds) {
      const role = db.prepare('SELECT position FROM roles WHERE id = ? AND server_id = ?').get(roleId, serverId);
      if (role && role.position >= myPos && !isOwner(serverId, req.user.id)) {
        return res.status(403).json({ error: 'Нельзя перемещать роль >= вашей' });
      }
    }

    for (let i = 0; i < roleIds.length; i++) {
      const position = roleIds.length - i;
      db.prepare('UPDATE roles SET position = ? WHERE id = ? AND server_id = ? AND name != ?').run(position, roleIds[i], serverId, 'Владелец');
    }

    const roles = db.prepare('SELECT * FROM roles WHERE server_id = ? ORDER BY position DESC').all(serverId);
    res.json({ roles: parseRoles(roles) });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Внутренняя ошибка сервера' }); }
});

router.post('/server/:serverId/roles', (req, res) => {
  try {
    const serverId = req.params.serverId;
    if (!hasPermission(serverId, req.user.id, 'manage_roles')) return res.status(403).json({ error: 'Нет прав' });

    const { name, color, permissions } = req.body;
    if (!name || name.trim().length === 0) return res.status(400).json({ error: 'Название обязательно' });

    const perms = permissions || {
      send_messages: true, read_messages: true, send_gifs: true, send_media: true,
      delete_messages: false, manage_server: false, manage_channels: false, manage_roles: false, kick_members: false,
      ban_members: false, mute_members: false, edit_messages: false, administrator: false
    };

    const myPerms = getUserPermissions(serverId, req.user.id);
    if (perms.administrator && !myPerms.administrator) return res.status(403).json({ error: 'Нельзя выдать Администратор' });

    let position = 1;
    if (isOwner(serverId, req.user.id)) {
      const maxPos = db.prepare('SELECT MAX(position) as max FROM roles WHERE server_id = ? AND position < 100').get(serverId);
      position = (maxPos.max || 0) + 1;
    }

    const result = db.prepare('INSERT INTO roles (server_id, name, color, permissions, position) VALUES (?, ?, ?, ?, ?)').run(serverId, name.trim(), color || '#99aab5', JSON.stringify(perms), position);
    const role = db.prepare('SELECT * FROM roles WHERE id = ?').get(result.lastInsertRowid);
    role.permissions = JSON.parse(role.permissions);
    res.json({ role });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Внутренняя ошибка сервера' }); }
});

router.put('/server/:serverId/roles/:roleId', (req, res) => {
  try {
    const { serverId, roleId } = req.params;
    if (!hasPermission(serverId, req.user.id, 'manage_roles')) return res.status(403).json({ error: 'Нет прав' });

    const role = db.prepare('SELECT * FROM roles WHERE id = ? AND server_id = ?').get(roleId, serverId);
    if (!role) return res.status(404).json({ error: 'Роль не найдена' });

    const myPos = getUserHighestPosition(serverId, req.user.id);
    if (role.position >= myPos && !isOwner(serverId, req.user.id)) return res.status(403).json({ error: 'Нельзя редактировать роль >= вашей' });

    const { name, color, permissions } = req.body;

    if (permissions && !isOwner(serverId, req.user.id)) {
      const myPerms = getUserPermissions(serverId, req.user.id);
      const dangerous = ['administrator', 'manage_roles', 'manage_server', 'manage_channels', 'kick_members', 'ban_members', 'mute_members', 'edit_messages', 'delete_messages'];
      for (const perm of dangerous) {
        if (permissions[perm] && !myPerms[perm]) return res.status(403).json({ error: `Нет права "${perm}" для выдачи` });
      }
    }

    if (name) db.prepare('UPDATE roles SET name = ? WHERE id = ?').run(name.trim(), roleId);
    if (color) db.prepare('UPDATE roles SET color = ? WHERE id = ?').run(color, roleId);
    if (permissions) db.prepare('UPDATE roles SET permissions = ? WHERE id = ?').run(JSON.stringify(permissions), roleId);

    const updated = db.prepare('SELECT * FROM roles WHERE id = ?').get(roleId);
    updated.permissions = JSON.parse(updated.permissions);
    res.json({ role: updated });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Внутренняя ошибка сервера' }); }
});

router.delete('/server/:serverId/roles/:roleId', (req, res) => {
  try {
    const { serverId, roleId } = req.params;
    if (!hasPermission(serverId, req.user.id, 'manage_roles')) return res.status(403).json({ error: 'Нет прав' });

    const role = db.prepare('SELECT * FROM roles WHERE id = ? AND server_id = ?').get(roleId, serverId);
    if (!role) return res.status(404).json({ error: 'Роль не найдена' });
    if (role.name === 'everyone') return res.status(400).json({ error: 'Нельзя удалить everyone' });

    const myPos = getUserHighestPosition(serverId, req.user.id);
    if (role.position >= myPos && !isOwner(serverId, req.user.id)) return res.status(403).json({ error: 'Нельзя удалить роль >= вашей' });

    db.prepare('DELETE FROM roles WHERE id = ?').run(roleId);
    res.json({ message: 'Роль удалена' });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Внутренняя ошибка сервера' }); }
});

router.post('/server/:serverId/roles/:roleId/assign/:userId', (req, res) => {
  try {
    const { serverId, roleId, userId } = req.params;
    if (!hasPermission(serverId, req.user.id, 'manage_roles')) return res.status(403).json({ error: 'Нет прав' });

    const role = db.prepare('SELECT * FROM roles WHERE id = ? AND server_id = ?').get(roleId, serverId);
    if (!role) return res.status(404).json({ error: 'Роль не найдена' });

    const myPos = getUserHighestPosition(serverId, req.user.id);
    if (role.position >= myPos && !isOwner(serverId, req.user.id)) return res.status(403).json({ error: 'Нельзя назначить роль >= вашей' });

    const member = db.prepare('SELECT id FROM server_members WHERE server_id = ? AND user_id = ?').get(serverId, userId);
    if (!member) return res.status(404).json({ error: 'Участник не найден' });

    const existing = db.prepare('SELECT member_id FROM member_roles WHERE member_id = ? AND role_id = ?').get(member.id, roleId);
    if (existing) return res.status(400).json({ error: 'Роль уже назначена' });

    db.prepare('INSERT INTO member_roles (member_id, role_id) VALUES (?, ?)').run(member.id, roleId);
    notifyServer(Number(serverId), 'members_updated', { serverId: Number(serverId) });
    res.json({ message: 'Роль назначена' });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Внутренняя ошибка сервера' }); }
});

router.delete('/server/:serverId/roles/:roleId/assign/:userId', (req, res) => {
  try {
    const { serverId, roleId, userId } = req.params;
    if (!hasPermission(serverId, req.user.id, 'manage_roles')) return res.status(403).json({ error: 'Нет прав' });

    const role = db.prepare('SELECT * FROM roles WHERE id = ? AND server_id = ?').get(roleId, serverId);
    if (!role) return res.status(404).json({ error: 'Роль не найдена' });

    const myPos = getUserHighestPosition(serverId, req.user.id);
    if (role.position >= myPos && !isOwner(serverId, req.user.id)) return res.status(403).json({ error: 'Нельзя снять роль >= вашей' });

    const member = db.prepare('SELECT id FROM server_members WHERE server_id = ? AND user_id = ?').get(serverId, userId);
    if (!member) return res.status(404).json({ error: 'Участник не найден' });

    db.prepare('DELETE FROM member_roles WHERE member_id = ? AND role_id = ?').run(member.id, roleId);
    notifyServer(Number(serverId), 'members_updated', { serverId: Number(serverId) });
    res.json({ message: 'Роль снята' });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Внутренняя ошибка сервера' }); }
});

module.exports = router;
module.exports.isUserMuted = isUserMuted;
