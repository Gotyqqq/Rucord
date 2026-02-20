// ============================================================
// utils/master.js — Мастер-аккаунты (полные права на всех серверах)
// Список ID задаётся в .env: MASTER_USER_IDS=1,2,3
// Только владелец сервера может добавить ID в .env — получить права нельзя через приложение
// ============================================================

const db = require('../database');

const ALL_PERMS = {
  administrator: true, manage_server: true, manage_channels: true,
  manage_roles: true, kick_members: true, ban_members: true,
  mute_members: true, send_messages: true, read_messages: true,
  edit_messages: true, delete_messages: true, send_gifs: true, send_media: true
};

let _masterIds = null;

function getMasterUserIds() {
  if (_masterIds !== null) return _masterIds;
  const raw = process.env.MASTER_USER_IDS || '';
  _masterIds = raw
    .split(',')
    .map(s => parseInt(s.trim(), 10))
    .filter(n => !isNaN(n));
  return _masterIds;
}

function isMaster(userId) {
  if (userId == null) return false;
  const ids = getMasterUserIds();
  return ids.includes(Number(userId));
}

// Добавить мастера на сервер (участник + роль с полными правами)
function addMasterToServer(serverId, userId) {
  const existing = db.prepare('SELECT id FROM server_members WHERE server_id = ? AND user_id = ?').get(serverId, userId);
  if (existing) return;
  db.prepare('INSERT INTO server_members (server_id, user_id) VALUES (?, ?)').run(serverId, userId);
  const member = db.prepare('SELECT id FROM server_members WHERE server_id = ? AND user_id = ?').get(serverId, userId);
  let role = db.prepare('SELECT id FROM roles WHERE server_id = ? AND name = ?').get(serverId, 'Мастер');
  if (!role) {
    db.prepare(
      'INSERT INTO roles (server_id, name, color, permissions, position) VALUES (?, ?, ?, ?, ?)'
    ).run(serverId, 'Мастер', '#9b59b6', JSON.stringify(ALL_PERMS), 99);
    role = db.prepare('SELECT id FROM roles WHERE server_id = ? AND name = ?').get(serverId, 'Мастер');
  }
  if (role) {
    db.prepare('INSERT OR IGNORE INTO member_roles (member_id, role_id) VALUES (?, ?)').run(member.id, role.id);
  }
}

module.exports = { isMaster, getMasterUserIds, addMasterToServer, ALL_PERMS };
