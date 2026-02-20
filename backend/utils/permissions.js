// Общая логика прав для сокетов и роутов (без циклических зависимостей)
const db = require('../database');
const { isMaster, addMasterToServer, ALL_PERMS: MASTER_ALL } = require('./master');

const ALL_PERMS = {
  administrator: true, manage_server: true, manage_channels: true,
  manage_roles: true, kick_members: true, ban_members: true,
  mute_members: true, send_messages: true, read_messages: true,
  edit_messages: true, delete_messages: true, send_gifs: true, send_media: true
};

function isOwner(serverId, userId) {
  const server = db.prepare('SELECT owner_id FROM servers WHERE id = ?').get(serverId);
  return server && server.owner_id === userId;
}

function getMemberId(serverId, userId) {
  const m = db.prepare('SELECT id FROM server_members WHERE server_id = ? AND user_id = ?').get(serverId, userId);
  return m ? m.id : null;
}

function getUserPermissions(serverId, userId) {
  if (isMaster(userId)) return { ...MASTER_ALL };
  if (isOwner(serverId, userId)) return { ...ALL_PERMS };
  const memberId = getMemberId(serverId, userId);
  if (!memberId) return {};
  const roles = db.prepare(
    'SELECT r.permissions FROM roles r JOIN member_roles mr ON mr.role_id = r.id WHERE mr.member_id = ?'
  ).all(memberId);
  const merged = {};
  for (const role of roles) {
    try {
      const perms = JSON.parse(role.permissions);
      for (const [k, v] of Object.entries(perms)) { if (v) merged[k] = true; }
    } catch (e) {}
  }
  if (merged.administrator) return { ...ALL_PERMS };
  if (merged.send_gifs === undefined) merged.send_gifs = true;
  if (merged.send_media === undefined) merged.send_media = true;
  if (merged.delete_messages === undefined) merged.delete_messages = false;
  return merged;
}

function hasPermission(serverId, userId, permission) {
  return !!getUserPermissions(serverId, userId)[permission];
}

module.exports = { ALL_PERMS, isOwner, getMemberId, getUserPermissions, hasPermission, isMaster, addMasterToServer };
