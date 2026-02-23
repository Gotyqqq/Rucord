// ============================================================
// socket/chat.js — Реалтайм: сообщения, @упоминания,
// онлайн-статус, @everyone/@here, slowmode, мут, бан, DM
// ============================================================

const jwt = require('jsonwebtoken');
const db = require('../database');
const { JWT_SECRET } = require('../middleware/auth');
const { getUserPermissions, addMasterToServer } = require('../utils/permissions');
const { isMaster } = require('../utils/master');

let ioInstance = null;
let applyVoiceForceForServerMuteRef = null;

const onlineUsers = new Map(); // userId -> { status, lastActivity, socketId }
const slowmodeCooldowns = new Map(); // `${userId}_${channelId}` -> timestamp
const voiceMutedMap = new Map(); // `${channelId}_${userId}` -> boolean (микрофон выключен)
const voiceDeafenedMap = new Map(); // `${channelId}_${userId}` -> boolean (звук в наушниках выключен)

// Определяем, какие сокеты сейчас в комнате (чтобы не слать пинг тем, кто уже в канале)
function getSocketsInRoom(roomName) {
  if (!ioInstance) return new Set();
  const room = ioInstance.sockets.adapter.rooms.get(roomName);
  return room || new Set();
}

function getUserIdsByRoom(roomName) {
  const socketIds = getSocketsInRoom(roomName);
  const userIds = new Set();
  for (const sid of socketIds) {
    const s = ioInstance.sockets.sockets.get(sid);
    if (s && s.user) userIds.add(s.user.id);
  }
  return userIds;
}

function isUserMuted(serverId, userId) {
  const mute = db.prepare('SELECT * FROM server_mutes WHERE server_id = ? AND user_id = ?').get(serverId, userId);
  if (!mute) return false;
  const expiresAt = new Date(mute.expires_at + 'Z');
  if (expiresAt <= new Date()) {
    db.prepare('DELETE FROM server_mutes WHERE id = ?').run(mute.id);
    if (applyVoiceForceForServerMuteRef) applyVoiceForceForServerMuteRef(serverId, userId, false);
    return false;
  }
  return true;
}

function getDisplayName(serverId, userId) {
  const u = db.prepare('SELECT username, display_name FROM users WHERE id = ?').get(userId);
  if (!u) return null;
  const sm = db.prepare('SELECT display_name FROM server_members WHERE server_id = ? AND user_id = ?').get(serverId, userId);
  return (sm && sm.display_name) || u.display_name || u.username;
}

function getDisplayNameGlobal(userId) {
  const u = db.prepare('SELECT username, display_name FROM users WHERE id = ?').get(userId);
  return u ? (u.display_name || u.username) : null;
}

function setupSocket(io) {
  ioInstance = io;

  // Idle checker every 30s
  setInterval(() => {
    const now = Date.now();
    for (const [userId, data] of onlineUsers.entries()) {
      if (data.status === 'online' && now - data.lastActivity > 10 * 60 * 1000) {
        data.status = 'idle';
        broadcastPresence(userId, 'idle');
      }
    }
  }, 30000);

  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('Необходима авторизация'));
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      socket.user = decoded;
      next();
    } catch (err) {
      return next(new Error('Недействительный токен'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`✓ Подключился: ${socket.user.username} (id: ${socket.user.id})`);

    onlineUsers.set(socket.user.id, { status: 'online', lastActivity: Date.now(), socketId: socket.id });
    socket.join(`user_${socket.user.id}`);

    const userServers = db.prepare('SELECT server_id FROM server_members WHERE user_id = ?').all(socket.user.id);
    for (const s of userServers) socket.join(`server_${s.server_id}`);

    broadcastPresence(socket.user.id, 'online');

    // ---- Activity ----
    socket.on('activity', () => {
      const data = onlineUsers.get(socket.user.id);
      if (data) {
        const wasIdle = data.status === 'idle';
        data.lastActivity = Date.now();
        data.status = 'online';
        if (wasIdle) broadcastPresence(socket.user.id, 'online');
      }
    });

    // ---- Channels (join_channel: channelId или { channelId, preview }) ----
    socket.on('join_channel', (payload) => {
      const channelId = typeof payload === 'object' ? payload.channelId : payload;
      const preview = typeof payload === 'object' && payload.preview === true;
      const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(channelId);
      if (!channel) return;
      let member = db.prepare('SELECT id FROM server_members WHERE server_id = ? AND user_id = ?').get(channel.server_id, socket.user.id);
      if (!member && isMaster(socket.user.id) && !preview) {
        addMasterToServer(channel.server_id, socket.user.id);
        member = db.prepare('SELECT id FROM server_members WHERE server_id = ? AND user_id = ?').get(channel.server_id, socket.user.id);
      }
      if (!member && !(isMaster(socket.user.id) && preview)) return;
      for (const room of socket.rooms) { if (room.startsWith('channel_')) socket.leave(room); }
      socket.join(`channel_${channelId}`);
    });

    socket.on('leave_channel', (channelId) => socket.leave(`channel_${channelId}`));

    socket.on('join_server', (serverId) => {
      const ban = db.prepare('SELECT id FROM server_bans WHERE server_id = ? AND user_id = ?').get(serverId, socket.user.id);
      if (ban && !isMaster(socket.user.id)) { socket.emit('server_banned', { serverId }); return; }
      let member = db.prepare('SELECT id FROM server_members WHERE server_id = ? AND user_id = ?').get(serverId, socket.user.id);
      if (!member && isMaster(socket.user.id)) {
        addMasterToServer(serverId, socket.user.id);
        member = db.prepare('SELECT id FROM server_members WHERE server_id = ? AND user_id = ?').get(serverId, socket.user.id);
      }
      if (member) socket.join(`server_${serverId}`);
    });

    // ---- Online users ----
    socket.on('get_online_users', (serverId, callback) => {
      if (typeof callback !== 'function') return;
      const members = db.prepare('SELECT user_id FROM server_members WHERE server_id = ?').all(serverId);
      const result = {};
      for (const m of members) {
        const data = onlineUsers.get(m.user_id);
        result[m.user_id] = data ? data.status : 'offline';
      }
      callback(result);
    });

    // ---- Send message (slowmode + mute check + @everyone/@here) ----
    socket.on('send_message', (data) => {
      const { channelId, content, attachments: dataAttachments } = data;
      const attachments = dataAttachments || [];
      const hasContent = content && content.trim().length > 0;
      if (!hasContent && attachments.length === 0) return;

      const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(channelId);
      if (!channel) return;
      const member = db.prepare('SELECT id FROM server_members WHERE server_id = ? AND user_id = ?').get(channel.server_id, socket.user.id);
      if (!member) return;

      // Mute check
      if (isUserMuted(channel.server_id, socket.user.id)) {
        socket.emit('muted_error', { message: 'Вы замучены на этом сервере' });
        return;
      }

      const perms = getUserPermissions(channel.server_id, socket.user.id);
      for (const a of attachments) {
        const mime = (a.mimeType || a.mime_type || '').toLowerCase();
        if (mime === 'image/gif' && !perms.send_gifs) {
          socket.emit('permission_error', { message: 'Нет права отправлять гифки' });
          return;
        }
        if ((mime.startsWith('audio/') || mime.startsWith('video/')) && !perms.send_media) {
          socket.emit('permission_error', { message: 'Нет права отправлять аудио и видео' });
          return;
        }
      }

      // Slowmode
      const slowmode = channel.slowmode || 0;
      if (slowmode > 0) {
        const server = db.prepare('SELECT owner_id FROM servers WHERE id = ?').get(channel.server_id);
        const isServerOwner = server && server.owner_id === socket.user.id;
        if (!isServerOwner) {
          const key = `${socket.user.id}_${channelId}`;
          const lastSent = slowmodeCooldowns.get(key) || 0;
          const now = Date.now();
          if (now - lastSent < slowmode * 1000) {
            const remaining = Math.ceil((slowmode * 1000 - (now - lastSent)) / 1000);
            socket.emit('slowmode_wait', { channelId, remaining });
            return;
          }
          slowmodeCooldowns.set(key, now);
        }
      }

      const result = db.prepare('INSERT INTO messages (channel_id, user_id, content) VALUES (?, ?, ?)').run(channelId, socket.user.id, (content || '').trim());
      const msgId = result.lastInsertRowid;

      for (const a of attachments) {
        const url = a.url || '';
        const file_path = url.startsWith('http') ? url : (url.replace(/^\/api\/uploads\//, '') || a.file_path || '');
        const original_name = a.filename || a.original_name || 'file';
        const mime_type = a.mimeType || a.mime_type || 'application/octet-stream';
        if (file_path) {
          db.prepare('INSERT INTO message_attachments (message_id, file_path, original_name, mime_type) VALUES (?, ?, ?, ?)').run(msgId, file_path, original_name, mime_type);
        }
      }

      const message = db.prepare(`
        SELECT m.*, u.username, u.avatar_url,
          COALESCE(sm.display_name, u.display_name, u.username) as display_username
        FROM messages m
        JOIN users u ON u.id = m.user_id
        JOIN channels ch ON ch.id = m.channel_id
        LEFT JOIN server_members sm ON sm.server_id = ch.server_id AND sm.user_id = m.user_id
        WHERE m.id = ?
      `).get(msgId);
      const attRows = db.prepare('SELECT file_path, original_name, mime_type FROM message_attachments WHERE message_id = ?').all(msgId);
      message.attachments = attRows.map(a => ({
        url: a.file_path.startsWith('http') ? a.file_path : '/api/uploads/' + a.file_path,
        original_name: a.original_name,
        mime_type: a.mime_type
      }));
      message.reactions = [];

      io.to(`channel_${channelId}`).emit('new_message', message);

      // Mentions - don't notify users currently viewing the channel
      const usersInChannel = getUserIdsByRoom(`channel_${channelId}`);
      const serverData = db.prepare('SELECT * FROM servers WHERE id = ?').get(channel.server_id);
      const trimmedContent = (content || '').trim();
      const fromDisplayName = message.display_username || socket.user.username;

      const sendMention = (targetUserId) => {
        if (targetUserId === socket.user.id) return;
        if (usersInChannel.has(targetUserId)) return; // already in channel, no ping
        io.to(`user_${targetUserId}`).emit('mention_notification', {
          serverId: channel.server_id,
          serverName: serverData ? serverData.name : '',
          channelId, channelName: channel.name,
          fromUser: fromDisplayName,
          content: trimmedContent
        });
      };

      if (trimmedContent.includes('@everyone')) {
        const allMembers = db.prepare('SELECT user_id FROM server_members WHERE server_id = ?').all(channel.server_id);
        for (const m of allMembers) sendMention(m.user_id);
      } else if (trimmedContent.includes('@here')) {
        const allMembers = db.prepare('SELECT user_id FROM server_members WHERE server_id = ?').all(channel.server_id);
        for (const m of allMembers) {
          if (onlineUsers.has(m.user_id)) sendMention(m.user_id);
        }
      } else {
        const mentions = (content || '').match(/@(\S+)/g);
        if (mentions) {
          const mentionedNames = mentions.map(m => m.slice(1).toLowerCase());
          for (const name of mentionedNames) {
            const mentionedUser = db.prepare(
              `SELECT u.id FROM users u JOIN server_members sm ON sm.user_id = u.id WHERE sm.server_id = ?
               AND (LOWER(u.username) = ? OR LOWER(COALESCE(sm.display_name, u.display_name, u.username)) = ?)`
            ).get(channel.server_id, name, name);
            if (mentionedUser) sendMention(mentionedUser.id);
          }
        }
      }
    });

    // ---- Edit message ----
    socket.on('edit_message', (data) => {
      const { messageId, content } = data;
      if (!content || content.trim().length === 0) return;
      const message = db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId);
      if (!message) return;
      const isAuthor = message.user_id === socket.user.id;
      if (!isAuthor) {
        if (isMaster(socket.user.id)) { /* мастер может редактировать любое */ }
        else {
          const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(message.channel_id);
          if (!channel) return;
          const server = db.prepare('SELECT owner_id FROM servers WHERE id = ?').get(channel.server_id);
          if (!server || server.owner_id !== socket.user.id) {
            const mbr = db.prepare('SELECT id FROM server_members WHERE server_id = ? AND user_id = ?').get(channel.server_id, socket.user.id);
            if (!mbr) return;
            let hasPerm = false;
            const roles = db.prepare(`SELECT r.permissions FROM roles r JOIN member_roles mr ON mr.role_id = r.id WHERE mr.member_id = ?`).all(mbr.id);
            for (const role of roles) { try { const p = JSON.parse(role.permissions); if (p.edit_messages || p.administrator) { hasPerm = true; break; } } catch (e) {} }
            if (!hasPerm) return;
          }
        }
      }
      db.prepare('UPDATE messages SET content = ?, edited = 1 WHERE id = ?').run(content.trim(), messageId);
      const updated = db.prepare(`
        SELECT m.*, u.username, u.avatar_url,
          COALESCE(sm.display_name, u.display_name, u.username) as display_username
        FROM messages m
        JOIN users u ON u.id = m.user_id
        JOIN channels ch ON ch.id = m.channel_id
        LEFT JOIN server_members sm ON sm.server_id = ch.server_id AND sm.user_id = m.user_id
        WHERE m.id = ?
      `).get(messageId);
      const attRows = db.prepare('SELECT file_path, original_name, mime_type FROM message_attachments WHERE message_id = ?').all(messageId);
      updated.attachments = attRows.map(a => ({ url: a.file_path.startsWith('http') ? a.file_path : '/api/uploads/' + a.file_path, original_name: a.original_name, mime_type: a.mime_type }));
      const reactRows = db.prepare('SELECT emoji, user_id FROM message_reactions WHERE message_id = ?').all(messageId);
      const byEmoji = {};
      for (const r of reactRows) {
        if (!byEmoji[r.emoji]) byEmoji[r.emoji] = { emoji: r.emoji, count: 0, userIds: [] };
        byEmoji[r.emoji].count++;
        byEmoji[r.emoji].userIds.push(r.user_id);
      }
      updated.reactions = Object.values(byEmoji);
      io.to(`channel_${message.channel_id}`).emit('message_edited', updated);
    });

    // ---- Delete message ----
    socket.on('delete_message', (data) => {
      const { messageId } = data;
      if (!messageId) return;
      const message = db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId);
      if (!message) return;
      const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(message.channel_id);
      if (!channel) return;
      const isAuthor = message.user_id === socket.user.id;
      const server = db.prepare('SELECT owner_id FROM servers WHERE id = ?').get(channel.server_id);
      const isServerOwner = server && server.owner_id === socket.user.id;
      if (!isAuthor && !isServerOwner && !isMaster(socket.user.id)) {
        const mbr = db.prepare('SELECT id FROM server_members WHERE server_id = ? AND user_id = ?').get(channel.server_id, socket.user.id);
        if (!mbr) return;
        const perms = getUserPermissions(channel.server_id, socket.user.id);
        if (!perms.delete_messages && !perms.administrator) return;
      }
      db.prepare('DELETE FROM message_reactions WHERE message_id = ?').run(messageId);
      db.prepare('DELETE FROM message_attachments WHERE message_id = ?').run(messageId);
      db.prepare('DELETE FROM messages WHERE id = ?').run(messageId);
      io.to(`channel_${message.channel_id}`).emit('message_deleted', { messageId, channelId: message.channel_id });
    });

    function getReactionsForMessage(messageId) {
      const rows = db.prepare('SELECT emoji, user_id FROM message_reactions WHERE message_id = ?').all(messageId);
      const byEmoji = {};
      for (const r of rows) {
        if (!byEmoji[r.emoji]) byEmoji[r.emoji] = { emoji: r.emoji, count: 0, userIds: [] };
        byEmoji[r.emoji].count++;
        byEmoji[r.emoji].userIds.push(r.user_id);
      }
      return Object.values(byEmoji);
    }

    socket.on('reaction_add', (data) => {
      const { messageId, emoji } = data;
      if (!messageId || !emoji) return;
      const message = db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId);
      if (!message) return;
      const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(message.channel_id);
      if (!channel) return;
      const member = db.prepare('SELECT id FROM server_members WHERE server_id = ? AND user_id = ?').get(channel.server_id, socket.user.id);
      if (!member) return;
      try {
        db.prepare('INSERT INTO message_reactions (message_id, emoji, user_id) VALUES (?, ?, ?)').run(messageId, emoji, socket.user.id);
      } catch (e) {
        if (!e.message || !e.message.includes('UNIQUE')) return;
      }
      const reactions = getReactionsForMessage(messageId);
      io.to(`channel_${message.channel_id}`).emit('reaction_updated', { messageId, channelId: message.channel_id, reactions });
    });

    socket.on('reaction_remove', (data) => {
      const { messageId, emoji } = data;
      if (!messageId || !emoji) return;
      const message = db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId);
      if (!message) return;
      const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(message.channel_id);
      if (!channel) return;
      const member = db.prepare('SELECT id FROM server_members WHERE server_id = ? AND user_id = ?').get(channel.server_id, socket.user.id);
      if (!member) return;
      db.prepare('DELETE FROM message_reactions WHERE message_id = ? AND emoji = ? AND user_id = ?').run(messageId, emoji, socket.user.id);
      const reactions = getReactionsForMessage(messageId);
      io.to(`channel_${message.channel_id}`).emit('reaction_updated', { messageId, channelId: message.channel_id, reactions });
    });

    // ---- DM ----
    socket.on('send_dm', (data) => {
      const { toUserId, content } = data;
      if (!content || content.trim().length === 0) return;
      const toUser = db.prepare('SELECT id, username FROM users WHERE id = ?').get(toUserId);
      if (!toUser) return;

      const result = db.prepare('INSERT INTO direct_messages (from_user_id, to_user_id, content) VALUES (?, ?, ?)').run(socket.user.id, toUserId, content.trim());
      const dm = db.prepare('SELECT * FROM direct_messages WHERE id = ?').get(result.lastInsertRowid);

      const fromDisplay = getDisplayNameGlobal(socket.user.id);
      const toDisplay = getDisplayNameGlobal(toUserId);
      const msg = { ...dm, from_username: fromDisplay, to_username: toDisplay };
      io.to(`user_${socket.user.id}`).emit('new_dm', msg);
      io.to(`user_${toUserId}`).emit('new_dm', msg);

      // DM notification for recipient
      io.to(`user_${toUserId}`).emit('dm_notification', {
        fromUserId: socket.user.id,
        fromUsername: fromDisplay,
        content: content.trim()
      });
    });

    socket.on('typing', (data) => {
      const { channelId } = data;
      const channel = db.prepare('SELECT server_id FROM channels WHERE id = ?').get(channelId);
      const displayName = channel ? getDisplayName(channel.server_id, socket.user.id) : getDisplayNameGlobal(socket.user.id);
      socket.to(`channel_${channelId}`).emit('user_typing', { channelId, username: displayName || socket.user.username, userId: socket.user.id });
    });

    function getVoiceForceState(serverId, userId) {
      const sm = db.prepare('SELECT voice_force_muted, voice_force_deafened FROM server_members WHERE server_id = ? AND user_id = ?').get(serverId, userId);
      return { force_muted: !!(sm && sm.voice_force_muted), force_deafened: !!(sm && sm.voice_force_deafened) };
    }

    function buildVoiceParticipant(serverId, userId, username, muted, deafened) {
      const force = getVoiceForceState(serverId, userId);
      const effectiveMuted = force.force_muted || muted;
      const effectiveDeafened = force.force_deafened || deafened;
      return { userId, username, muted: effectiveMuted, deafened: effectiveDeafened, force_muted: force.force_muted, force_deafened: force.force_deafened };
    }

    function broadcastVoiceRoster(channelId, serverId) {
      const room = ioInstance.sockets.adapter.rooms.get(`voice_${channelId}`);
      const participants = [];
      if (room) {
        for (const sid of room) {
          const s = ioInstance.sockets.sockets.get(sid);
          if (s && s.user) {
            const muted = voiceMutedMap.get(`${channelId}_${s.user.id}`) ?? false;
            const deafened = voiceDeafenedMap.get(`${channelId}_${s.user.id}`) ?? false;
            const username = getDisplayName(serverId, s.user.id) || s.user.username;
            participants.push(buildVoiceParticipant(serverId, s.user.id, username, muted, deafened));
          }
        }
      }
      const payload = { channelId, participants };
      ioInstance.to(`server_${serverId}`).emit('voice_roster_update', payload);
      ioInstance.to(`voice_${channelId}`).emit('voice_roster_update', payload);
    }

    // ---- Голосовые каналы ----
    socket.on('join_voice_channel', (channelId) => {
      const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(channelId);
      if (!channel || channel.type !== 'voice') return;
      let member = db.prepare('SELECT id FROM server_members WHERE server_id = ? AND user_id = ?').get(channel.server_id, socket.user.id);
      if (!member && isMaster(socket.user.id)) {
        addMasterToServer(channel.server_id, socket.user.id);
        member = db.prepare('SELECT id FROM server_members WHERE server_id = ? AND user_id = ?').get(channel.server_id, socket.user.id);
      }
      if (!member) return;
      const perms = getUserPermissions(channel.server_id, socket.user.id);
      if (!perms.speak_in_voice) {
        socket.emit('permission_error', { message: 'Нет права говорить в голосовом канале' });
        return;
      }
      if (isUserMuted(channel.server_id, socket.user.id)) {
        socket.emit('permission_error', { message: 'Вы замьючены и не можете заходить в голосовые каналы' });
        return;
      }
      const roomName = `voice_${channelId}`;
      for (const r of socket.rooms) {
        if (r.startsWith('voice_')) {
          const prevChannelId = r.replace('voice_', '');
          voiceMutedMap.delete(`${prevChannelId}_${socket.user.id}`);
          voiceDeafenedMap.delete(`${prevChannelId}_${socket.user.id}`);
          socket.leave(r);
        }
      }
      const myForce = getVoiceForceState(channel.server_id, socket.user.id);
      voiceMutedMap.set(`${channelId}_${socket.user.id}`, myForce.force_muted);
      voiceDeafenedMap.set(`${channelId}_${socket.user.id}`, myForce.force_deafened);
      socket.join(roomName);
      const room = ioInstance.sockets.adapter.rooms.get(roomName);
      const participants = [];
      if (room) {
        for (const sid of room) {
          const s = ioInstance.sockets.sockets.get(sid);
          if (s && s.user && s.user.id !== socket.user.id) {
            const muted = voiceMutedMap.get(`${channelId}_${s.user.id}`) ?? false;
            const deafened = voiceDeafenedMap.get(`${channelId}_${s.user.id}`) ?? false;
            const username = getDisplayName(channel.server_id, s.user.id) || s.user.username;
            participants.push(buildVoiceParticipant(channel.server_id, s.user.id, username, muted, deafened));
          }
        }
      }
      const myDisplayName = getDisplayName(channel.server_id, socket.user.id) || socket.user.username;
      const myMuted = voiceMutedMap.get(`${channelId}_${socket.user.id}`) ?? false;
      const myDeafened = voiceDeafenedMap.get(`${channelId}_${socket.user.id}`) ?? false;
      socket.emit('voice_participants', { channelId, participants });
      socket.to(roomName).emit('voice_participant_joined', {
        channelId, userId: socket.user.id, username: myDisplayName,
        muted: myMuted, deafened: myDeafened, force_muted: myForce.force_muted, force_deafened: myForce.force_deafened
      });
      broadcastVoiceRoster(channelId, channel.server_id);
    });

    socket.on('voice_muted', ({ channelId, muted }) => {
      const channel = db.prepare('SELECT id, server_id FROM channels WHERE id = ? AND type = ?').get(channelId, 'voice');
      if (!channel) return;
      if (!getUserPermissions(channel.server_id, socket.user.id).speak_in_voice) return;
      const force = getVoiceForceState(channel.server_id, socket.user.id);
      const effectiveMuted = force.force_muted ? true : !!muted;
      voiceMutedMap.set(`${channelId}_${socket.user.id}`, effectiveMuted);
      ioInstance.to(`voice_${channelId}`).emit('voice_muted', { userId: socket.user.id, muted: effectiveMuted, force_muted: force.force_muted });
      broadcastVoiceRoster(channelId, channel.server_id);
    });

    socket.on('voice_deafened', ({ channelId, deafened }) => {
      const channel = db.prepare('SELECT id, server_id FROM channels WHERE id = ? AND type = ?').get(channelId, 'voice');
      if (!channel) return;
      if (!getUserPermissions(channel.server_id, socket.user.id).speak_in_voice) return;
      const force = getVoiceForceState(channel.server_id, socket.user.id);
      const effectiveDeafened = force.force_deafened ? true : !!deafened;
      voiceDeafenedMap.set(`${channelId}_${socket.user.id}`, effectiveDeafened);
      ioInstance.to(`voice_${channelId}`).emit('voice_deafened', { userId: socket.user.id, deafened: effectiveDeafened, force_deafened: force.force_deafened });
      broadcastVoiceRoster(channelId, channel.server_id);
    });

    socket.on('voice_force_mute', ({ channelId, targetUserId, muted }) => {
      const channel = db.prepare('SELECT id, server_id FROM channels WHERE id = ? AND type = ?').get(channelId, 'voice');
      if (!channel) return;
      const perms = getUserPermissions(channel.server_id, socket.user.id);
      if (!perms.mute_members) return;
      const member = db.prepare('SELECT id FROM server_members WHERE server_id = ? AND user_id = ?').get(channel.server_id, targetUserId);
      if (!member) return;
      db.prepare('UPDATE server_members SET voice_force_muted = ? WHERE server_id = ? AND user_id = ?').run(muted ? 1 : 0, channel.server_id, targetUserId);
      if (muted) voiceMutedMap.set(`${channelId}_${targetUserId}`, true);
      else voiceMutedMap.set(`${channelId}_${targetUserId}`, false);
      ioInstance.to(`voice_${channelId}`).emit('voice_force_muted', { userId: targetUserId, muted: !!muted });
      broadcastVoiceRoster(channelId, channel.server_id);
    });

    socket.on('voice_force_deafen', ({ channelId, targetUserId, deafened }) => {
      const channel = db.prepare('SELECT id, server_id FROM channels WHERE id = ? AND type = ?').get(channelId, 'voice');
      if (!channel) return;
      const perms = getUserPermissions(channel.server_id, socket.user.id);
      if (!perms.deafen_members) return;
      const member = db.prepare('SELECT id FROM server_members WHERE server_id = ? AND user_id = ?').get(channel.server_id, targetUserId);
      if (!member) return;
      db.prepare('UPDATE server_members SET voice_force_deafened = ? WHERE server_id = ? AND user_id = ?').run(deafened ? 1 : 0, channel.server_id, targetUserId);
      if (deafened) voiceDeafenedMap.set(`${channelId}_${targetUserId}`, true);
      else voiceDeafenedMap.set(`${channelId}_${targetUserId}`, false);
      ioInstance.to(`voice_${channelId}`).emit('voice_force_deafened', { userId: targetUserId, deafened: !!deafened });
      broadcastVoiceRoster(channelId, channel.server_id);
    });

    // Применить принудительный мут/деф к сокету, если пользователь уже в голосовом канале на этом сервере
    function applyVoiceForceToSocketIfInVoice(serverId, targetUserId, setMuted, setDeafened) {
      const voiceChannels = db.prepare('SELECT id FROM channels WHERE server_id = ? AND type = ?').all(serverId, 'voice');
      for (const ch of voiceChannels) {
        const room = ioInstance.sockets.adapter.rooms.get(`voice_${ch.id}`);
        if (!room) continue;
        for (const sid of room) {
          const s = ioInstance.sockets.sockets.get(sid);
          if (s && s.user && s.user.id === targetUserId) {
            if (setMuted !== undefined) {
              voiceMutedMap.set(`${ch.id}_${targetUserId}`, !!setMuted);
              ioInstance.to(`voice_${ch.id}`).emit('voice_force_muted', { userId: targetUserId, muted: !!setMuted });
            }
            if (setDeafened !== undefined) {
              voiceDeafenedMap.set(`${ch.id}_${targetUserId}`, !!setDeafened);
              ioInstance.to(`voice_${ch.id}`).emit('voice_force_deafened', { userId: targetUserId, deafened: !!setDeafened });
            }
            broadcastVoiceRoster(ch.id, serverId);
            return;
          }
        }
      }
    }

    socket.on('voice_force_mute_user', ({ serverId: sid, targetUserId, muted }) => {
      const serverId = sid;
      if (!serverId || !targetUserId) return;
      const perms = getUserPermissions(serverId, socket.user.id);
      if (!perms.mute_members) return;
      const member = db.prepare('SELECT id FROM server_members WHERE server_id = ? AND user_id = ?').get(serverId, targetUserId);
      if (!member) return;
      db.prepare('UPDATE server_members SET voice_force_muted = ? WHERE server_id = ? AND user_id = ?').run(muted ? 1 : 0, serverId, targetUserId);
      applyVoiceForceToSocketIfInVoice(serverId, targetUserId, muted, undefined);
      ioInstance.to(`server_${serverId}`).emit('voice_force_muted', { userId: targetUserId, muted: !!muted });
    });

    socket.on('voice_force_deafen_user', ({ serverId: sid, targetUserId, deafened }) => {
      const serverId = sid;
      if (!serverId || !targetUserId) return;
      const perms = getUserPermissions(serverId, socket.user.id);
      if (!perms.deafen_members) return;
      const member = db.prepare('SELECT id FROM server_members WHERE server_id = ? AND user_id = ?').get(serverId, targetUserId);
      if (!member) return;
      db.prepare('UPDATE server_members SET voice_force_deafened = ? WHERE server_id = ? AND user_id = ?').run(deafened ? 1 : 0, serverId, targetUserId);
      applyVoiceForceToSocketIfInVoice(serverId, targetUserId, undefined, deafened);
      ioInstance.to(`server_${serverId}`).emit('voice_force_deafened', { userId: targetUserId, deafened: !!deafened });
    });

    socket.on('leave_voice_channel', (channelId) => {
      const channel = db.prepare('SELECT server_id FROM channels WHERE id = ?').get(channelId);
      voiceMutedMap.delete(`${channelId}_${socket.user.id}`);
      voiceDeafenedMap.delete(`${channelId}_${socket.user.id}`);
      socket.leave(`voice_${channelId}`);
      socket.to(`voice_${channelId}`).emit('voice_participant_left', { channelId, userId: socket.user.id });
      if (channel) broadcastVoiceRoster(channelId, channel.server_id);
    });

    socket.on('voice_signal', (data) => {
      const { toUserId, signal } = data;
      if (toUserId == null || toUserId === '' || !signal) return;
      // Validate both users share a voice channel
      let sharedChannelId = null;
      for (const r of socket.rooms) {
        if (r.startsWith('voice_')) {
          const room = ioInstance.sockets.adapter.rooms.get(r);
          if (room) {
            for (const sid of room) {
              const s = ioInstance.sockets.sockets.get(sid);
              if (s && s.user && s.user.id === Number(toUserId)) { sharedChannelId = r.replace('voice_', ''); break; }
            }
          }
          if (sharedChannelId) break;
        }
      }
      if (!sharedChannelId) return;
      const channelId = sharedChannelId;
      const ch = db.prepare('SELECT server_id FROM channels WHERE id = ?').get(channelId);
      const fromDisplay = ch ? getDisplayName(ch.server_id, socket.user.id) : getDisplayNameGlobal(socket.user.id);
      const targetRoom = `user_${Number(toUserId)}`;
      ioInstance.to(targetRoom).emit('voice_signal', {
        fromUserId: socket.user.id,
        fromUsername: fromDisplay || socket.user.username,
        signal
      });
    });

    socket.on('get_voice_rosters', (serverId, callback) => {
      if (typeof callback !== 'function') return;
      const channels = db.prepare('SELECT id FROM channels WHERE server_id = ? AND type = ?').all(serverId, 'voice');
      const rosters = {};
      for (const ch of channels) {
        const room = ioInstance.sockets.adapter.rooms.get(`voice_${ch.id}`);
        rosters[ch.id] = [];
        if (room) {
          for (const sid of room) {
            const s = ioInstance.sockets.sockets.get(sid);
            if (s && s.user) {
              const muted = voiceMutedMap.get(`${ch.id}_${s.user.id}`) ?? false;
              const deafened = voiceDeafenedMap.get(`${ch.id}_${s.user.id}`) ?? false;
              const username = getDisplayName(serverId, s.user.id) || s.user.username;
              rosters[ch.id].push(buildVoiceParticipant(serverId, s.user.id, username, muted, deafened));
            }
          }
        }
      }
      callback(rosters);
    });

    socket.on('voice_speaking', ({ channelId, speaking }) => {
      const channel = db.prepare('SELECT id, server_id FROM channels WHERE id = ? AND type = ?').get(channelId, 'voice');
      if (!channel) return;
      const displayName = getDisplayName(channel.server_id, socket.user.id) || socket.user.username;
      // Рассылаем всей комнате, включая отправителя — чтобы у говорящего тоже появлялся зелёный кружок
      ioInstance.to(`voice_${channelId}`).emit('voice_speaking', {
        userId: socket.user.id,
        username: displayName,
        speaking: !!speaking
      });
    });

    // ---- Релей голоса (альтернатива P2P): чанки аудио через сервер ----
    const VOICE_AUDIO_MAX_CHUNK = 64 * 1024;
    socket.on('voice_audio', ({ channelId, data }) => {
      if (!channelId || !socket.rooms.has(`voice_${channelId}`)) return;
      const muted = voiceMutedMap.get(`${channelId}_${socket.user.id}`);
      if (muted) return;
      const chunk = Buffer.isBuffer(data) ? data : (data && data.buffer ? Buffer.from(data) : null);
      if (!chunk || chunk.length > VOICE_AUDIO_MAX_CHUNK) return;
      socket.to(`voice_${channelId}`).emit('voice_audio', {
        userId: socket.user.id,
        data: chunk
      });
    });

    socket.on('disconnect', () => {
      for (const room of socket.rooms) {
        if (room.startsWith('voice_')) {
          const channelId = room.replace('voice_', '');
          voiceMutedMap.delete(`${channelId}_${socket.user.id}`);
          voiceDeafenedMap.delete(`${channelId}_${socket.user.id}`);
          const ch = db.prepare('SELECT server_id FROM channels WHERE id = ?').get(channelId);
          ioInstance.to(room).emit('voice_participant_left', { channelId, userId: socket.user.id });
          if (ch) broadcastVoiceRoster(channelId, ch.server_id);
        }
      }
      console.log(`✗ Отключился: ${socket.user.username}`);
      onlineUsers.delete(socket.user.id);
      broadcastPresence(socket.user.id, 'offline');
    });
  });

  applyVoiceForceForServerMuteRef = function (serverId, userId, muted) {
    if (!serverId || !userId) return;
    db.prepare('UPDATE server_members SET voice_force_muted = ?, voice_force_deafened = ? WHERE server_id = ? AND user_id = ?').run(muted ? 1 : 0, muted ? 1 : 0, serverId, userId);
    applyVoiceForceToSocketIfInVoice(serverId, userId, muted, muted);
    if (ioInstance) {
      ioInstance.to(`server_${serverId}`).emit('voice_force_muted', { userId, muted: !!muted });
      ioInstance.to(`server_${serverId}`).emit('voice_force_deafened', { userId, deafened: !!muted });
    }
  };
}

function broadcastPresence(userId, status) {
  if (!ioInstance) return;
  const servers = db.prepare('SELECT server_id FROM server_members WHERE user_id = ?').all(userId);
  for (const s of servers) ioInstance.to(`server_${s.server_id}`).emit('presence_update', { userId, status });
}

function getOnlineUsers() { return onlineUsers; }

function notifyServer(serverId, event, data) {
  if (ioInstance) ioInstance.to(`server_${serverId}`).emit(event, { serverId, ...data });
}

module.exports = setupSocket;
module.exports.notifyServer = notifyServer;
module.exports.getOnlineUsers = getOnlineUsers;
module.exports.applyVoiceForceForServerMute = function (serverId, userId, muted) {
  if (applyVoiceForceForServerMuteRef) applyVoiceForceForServerMuteRef(serverId, userId, muted);
};
