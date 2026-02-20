// ============================================================
// App.jsx — Главный компонент Rucord
// ============================================================

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useAuth } from './context/AuthContext';
import { api } from './utils/api';
import { connectSocket, getSocket, disconnectSocket } from './utils/socket';

import LandingPage from './components/Landing/LandingPage';
import LoginPage from './components/Auth/LoginPage';
import RegisterPage from './components/Auth/RegisterPage';
import Logo from './components/Logo/Logo';
import ServerList from './components/ServerList/ServerList';
import ChannelList from './components/ChannelList/ChannelList';
import Chat from './components/Chat/Chat';
import MemberList from './components/MemberList/MemberList';
import CreateServerModal from './components/Modals/CreateServerModal';
import JoinServerModal from './components/Modals/JoinServerModal';
import InviteModal from './components/Modals/InviteModal';
import ServerSettings from './components/Settings/ServerSettings';
import ChannelSettingsModal from './components/Settings/ChannelSettingsModal';
import UserProfilePopup from './components/UserProfile/UserProfilePopup';
import DMPanel from './components/DM/DMPanel';
import UserContextMenu from './components/ContextMenu/UserContextMenu';
import VoicePanel from './components/Voice/VoicePanel';

function loadFromStorage(key) {
  try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : {}; }
  catch { return {}; }
}
function saveToStorage(key, data) {
  try { localStorage.setItem(key, JSON.stringify(data)); } catch {}
}

export default function App() {
  const { user, token, loading, logout } = useAuth();

  const [authPage, setAuthPage] = useState('landing');
  const [servers, setServers] = useState([]);
  const [selectedServerId, setSelectedServerId] = useState(null);
  const [channels, setChannels] = useState([]);
  const [selectedChannelId, setSelectedChannelId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [members, setMembers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [typingUsers, setTypingUsers] = useState([]);
  const [notifications, setNotifications] = useState([]);

  const [mentionData, setMentionData] = useState(() => loadFromStorage('rucord_mentions'));
  const [myPermissions, setMyPermissions] = useState({});
  const [myHighestPos, setMyHighestPos] = useState(0);
  const [onlineStatuses, setOnlineStatuses] = useState({});
  const [slowmodeWait, setSlowmodeWait] = useState(0);
  const slowmodeTimerRef = useRef(null);

  // DM unread count per conversation { [userId]: count }
  const [dmUnreadMap, setDmUnreadMap] = useState({});

  // Profile popup
  const [profileTarget, setProfileTarget] = useState(null);

  // DM panel
  const [showDM, setShowDM] = useState(false);
  const [dmTargetUserId, setDmTargetUserId] = useState(null);
  const [dmTargetUsername, setDmTargetUsername] = useState('');

  // Context menu
  const [contextMenu, setContextMenu] = useState(null); // { x, y, member }

  // Channel settings
  const [channelSettingsTarget, setChannelSettingsTarget] = useState(null);

  const [showCreateServer, setShowCreateServer] = useState(false);
  const [showJoinServer, setShowJoinServer] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [masterPreviewMode, setMasterPreviewMode] = useState(false);
  const [currentVoiceChannelId, setCurrentVoiceChannelId] = useState(null);
  const [voiceParticipants, setVoiceParticipants] = useState([]);
  const [voiceRosters, setVoiceRosters] = useState({});
  const [voiceSpeakingUsers, setVoiceSpeakingUsers] = useState({});

  const selectedChannelIdRef = useRef(null);
  const selectedServerIdRef = useRef(null);
  const currentVoiceChannelIdRef = useRef(null);

  useEffect(() => { selectedChannelIdRef.current = selectedChannelId; }, [selectedChannelId]);
  useEffect(() => { currentVoiceChannelIdRef.current = currentVoiceChannelId; }, [currentVoiceChannelId]);
  useEffect(() => { selectedServerIdRef.current = selectedServerId; }, [selectedServerId]);
  useEffect(() => { saveToStorage('rucord_mentions', mentionData); }, [mentionData]);

  const mentionsByServer = useMemo(() => {
    const result = {};
    for (const [, data] of Object.entries(mentionData)) {
      if (data.count > 0) result[data.serverId] = (result[data.serverId] || 0) + data.count;
    }
    return result;
  }, [mentionData]);

  const mentionsByChannel = useMemo(() => {
    const result = {};
    for (const [chId, data] of Object.entries(mentionData)) {
      if (data.count > 0) result[chId] = data.count;
    }
    return result;
  }, [mentionData]);

  const currentServer = servers.find(s => s.id === selectedServerId) || null;
  const currentChannel = channels.find(c => c.id === selectedChannelId) || null;
  // В сайдбаре только серверы, где пользователь участник (после выхода сервер пропадает)
  const memberServers = useMemo(() => servers.filter(s => s.is_member === true), [servers]);

  // ---- Загрузка данных ----
  const loadServers = useCallback(async () => {
    if (!token) return;
    try { const data = await api.get('/api/servers', token); setServers(data.servers); }
    catch (err) { console.error(err); }
  }, [token]);

  const loadChannels = useCallback(async (serverId, preview = false) => {
    if (!token || !serverId) return;
    try {
      const q = preview ? '?preview=1' : '';
      const data = await api.get(`/api/channels/server/${serverId}${q}`, token);
      setChannels(data.channels);
      if (data.channels.length > 0) {
        const tc = data.channels.filter(c => c.type === 'text');
        if (tc.length > 0) setSelectedChannelId(tc[0].id);
      }
    } catch (err) { console.error(err); }
  }, [token]);

  const loadMessages = useCallback(async (channelId, preview = false) => {
    if (!token || !channelId) return;
    try {
      const q = preview ? '?preview=1' : '';
      const data = await api.get(`/api/messages/channel/${channelId}${q}`, token);
      setMessages(data.messages);
    } catch (err) { console.error(err); }
  }, [token]);

  const loadMembers = useCallback(async (serverId, preview = false) => {
    if (!token || !serverId) return;
    try {
      const q = preview ? '?preview=1' : '';
      const data = await api.get(`/api/members/server/${serverId}${q}`, token);
      setMembers(data.members);
    } catch (err) { console.error(err); }
  }, [token]);

  const loadRoles = useCallback(async (serverId) => {
    if (!token || !serverId) return;
    try { const data = await api.get(`/api/members/server/${serverId}/roles`, token); setRoles(data.roles); }
    catch (err) { console.error(err); }
  }, [token]);

  const loadMyPermissions = useCallback(async (serverId) => {
    if (!token || !serverId) return;
    try {
      const data = await api.get(`/api/members/server/${serverId}/permissions`, token);
      setMyPermissions(data.permissions || {});
      setMyHighestPos(data.highestPosition || 0);
    } catch (err) { console.error(err); }
  }, [token]);

  // ---- Socket.IO ----
  useEffect(() => {
    if (!token || !user) return;
    const socket = connectSocket(token);

    socket.on('new_message', (message) => {
      if (message.channel_id === selectedChannelIdRef.current) {
        setMessages(prev => prev.some(m => m.id === message.id) ? prev : [...prev, message]);
      }
    });

    socket.on('message_edited', (message) => {
      if (message.channel_id === selectedChannelIdRef.current) {
        setMessages(prev => prev.map(m => m.id === message.id ? { ...m, ...message } : m));
      }
    });

    socket.on('message_deleted', ({ messageId, channelId }) => {
      if (channelId === selectedChannelIdRef.current) {
        setMessages(prev => prev.filter(m => m.id !== messageId));
      }
    });

    socket.on('reaction_updated', ({ messageId, channelId, reactions }) => {
      if (channelId === selectedChannelIdRef.current) {
        setMessages(prev => prev.map(m => m.id === messageId ? { ...m, reactions } : m));
      }
    });

    socket.on('user_typing', ({ channelId, username, userId }) => {
      if (userId === user.id || channelId !== selectedChannelIdRef.current) return;
      setTypingUsers(prev => prev.includes(username) ? prev : [...prev, username]);
      setTimeout(() => setTypingUsers(prev => prev.filter(u => u !== username)), 3000);
    });

    socket.on('mention_notification', (data) => {
      setMentionData(prev => {
        const chKey = String(data.channelId);
        const existing = prev[chKey] || { count: 0, serverId: data.serverId };
        const next = { ...prev, [chKey]: { count: existing.count + 1, serverId: data.serverId } };
        saveToStorage('rucord_mentions', next);
        return next;
      });
      const notif = { id: Date.now(), ...data };
      setNotifications(prev => [...prev, notif]);
      setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== notif.id)), 5000);
    });

    socket.on('dm_notification', ({ fromUserId }) => {
      setDmUnreadMap(prev => ({
        ...prev,
        [fromUserId]: (prev[fromUserId] || 0) + 1
      }));
    });

    socket.on('muted_error', ({ message }) => {
      const notif = { id: Date.now(), serverName: 'Мут', channelName: '', fromUser: '', content: message };
      setNotifications(prev => [...prev, notif]);
      setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== notif.id)), 4000);
    });
    socket.on('permission_error', ({ message }) => {
      const notif = { id: Date.now(), serverName: 'Права', channelName: '', fromUser: '', content: message };
      setNotifications(prev => [...prev, notif]);
      setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== notif.id)), 4000);
    });

    socket.on('members_updated', ({ serverId }) => {
      if (serverId === selectedServerIdRef.current) loadMembers(serverId);
    });

    socket.on('presence_update', ({ userId, status }) => {
      setOnlineStatuses(prev => ({ ...prev, [userId]: status }));
    });

    socket.on('voice_participants', ({ channelId, participants }) => {
      if (channelId === currentVoiceChannelIdRef.current) setVoiceParticipants(participants || []);
    });
    socket.on('voice_participant_joined', ({ channelId, userId, username }) => {
      if (channelId !== currentVoiceChannelIdRef.current) return;
      setVoiceParticipants(prev => {
        if (prev.some(p => p.userId === userId)) return prev;
        return [...prev, { userId, username }];
      });
    });
    socket.on('voice_participant_left', ({ channelId, userId }) => {
      if (channelId !== currentVoiceChannelIdRef.current) return;
      setVoiceParticipants(prev => prev.filter(p => p.userId !== userId));
    });
    socket.on('voice_roster_update', ({ channelId, participants }) => {
      setVoiceRosters(prev => ({ ...prev, [channelId]: participants || [] }));
    });
    socket.on('voice_speaking', ({ userId, speaking }) => {
      setVoiceSpeakingUsers(prev => ({ ...prev, [userId]: speaking }));
    });

    socket.on('slowmode_wait', ({ channelId, remaining }) => {
      if (channelId === selectedChannelIdRef.current) {
        setSlowmodeWait(remaining);
        if (slowmodeTimerRef.current) clearInterval(slowmodeTimerRef.current);
        slowmodeTimerRef.current = setInterval(() => {
          setSlowmodeWait(prev => {
            if (prev <= 1) { clearInterval(slowmodeTimerRef.current); return 0; }
            return prev - 1;
          });
        }, 1000);
      }
    });

    let lastActivity = 0;
    const activityHandler = () => {
      const now = Date.now();
      if (now - lastActivity > 60000) { lastActivity = now; socket.emit('activity'); }
    };
    window.addEventListener('mousemove', activityHandler);
    window.addEventListener('keydown', activityHandler);

    return () => {
      window.removeEventListener('mousemove', activityHandler);
      window.removeEventListener('keydown', activityHandler);
      disconnectSocket();
    };
  }, [token, user]);

  useEffect(() => { if (user && token) loadServers(); }, [user, token, loadServers]);

  useEffect(() => {
    if (selectedServerId) {
      const preview = masterPreviewMode;
      loadChannels(selectedServerId, preview);
      loadMembers(selectedServerId, preview);
      if (!preview) {
        loadRoles(selectedServerId);
        loadMyPermissions(selectedServerId);
      } else {
        setRoles([]); setMyPermissions({}); setMyHighestPos(0);
      }
      const socket = getSocket();
      if (socket && !preview) {
        socket.emit('join_server', selectedServerId);
        socket.emit('get_online_users', selectedServerId, (statuses) => {
          setOnlineStatuses(prev => ({ ...prev, ...statuses }));
        });
        socket.emit('get_voice_rosters', selectedServerId, (rosters) => {
          setVoiceRosters(rosters || {});
        });
      }
    } else {
      setChannels([]); setSelectedChannelId(null); setMessages([]); setMembers([]);
      setRoles([]); setMyPermissions({}); setMyHighestPos(0);
      setMasterPreviewMode(false);
      setVoiceRosters({});
    }
    const s = getSocket();
    if (currentVoiceChannelIdRef.current && s) s.emit('leave_voice_channel', currentVoiceChannelIdRef.current);
    setCurrentVoiceChannelId(null);
    setVoiceParticipants([]);
    setVoiceSpeakingUsers({});
  }, [selectedServerId, masterPreviewMode]);

  useEffect(() => {
    if (selectedChannelId) {
      const socket = getSocket();
      if (socket) {
        if (masterPreviewMode) socket.emit('join_channel', { channelId: selectedChannelId, preview: true });
        else socket.emit('join_channel', selectedChannelId);
      }
      loadMessages(selectedChannelId, masterPreviewMode);
      setTypingUsers([]);
      setSlowmodeWait(0);
      setMentionData(prev => {
        const chKey = String(selectedChannelId);
        if (!prev[chKey]) return prev;
        const next = { ...prev };
        delete next[chKey];
        return next;
      });
    } else { setMessages([]); }
    return () => {
      if (selectedChannelId) {
        const socket = getSocket();
        if (socket) socket.emit('leave_channel', selectedChannelId);
      }
    };
  }, [selectedChannelId, masterPreviewMode]);

  useEffect(() => {
    if (!token || !user) return;
    const interval = setInterval(() => {
      loadServers();
      if (selectedServerIdRef.current) {
        loadMembers(selectedServerIdRef.current);
        const socket = getSocket();
        if (socket) {
          socket.emit('get_online_users', selectedServerIdRef.current, (statuses) => {
            setOnlineStatuses(prev => ({ ...prev, ...statuses }));
          });
        }
      }
    }, 15000);
    return () => clearInterval(interval);
  }, [token, user]);

  // ---- Действия ----
  const handleSendMessage = (content, attachments = []) => {
    const socket = getSocket();
    if (socket && selectedChannelId) socket.emit('send_message', { channelId: selectedChannelId, content: content || '', attachments });
  };
  const handleEditMessage = (messageId, content) => {
    const socket = getSocket();
    if (socket) socket.emit('edit_message', { messageId, content });
  };
  const handleDeleteMessage = (messageId) => {
    const socket = getSocket();
    if (socket) socket.emit('delete_message', { messageId });
  };
  const handleCreateServer = async (name) => {
    const data = await api.post('/api/servers', { name }, token);
    await loadServers(); setSelectedServerId(data.server.id);
  };
  const handleJoinServer = async (code) => {
    const data = await api.post('/api/servers/join', { invite_code: code }, token);
    await loadServers(); setSelectedServerId(data.server.id);
  };
  const handleCreateChannel = async (name) => {
    await api.post(`/api/channels/server/${selectedServerId}`, { name, type: 'text' }, token);
    loadChannels(selectedServerId);
  };
  const handleCreateVoiceChannel = async (name) => {
    await api.post(`/api/channels/server/${selectedServerId}`, { name, type: 'voice' }, token);
    loadChannels(selectedServerId);
  };
  const handleDeleteChannel = async (channelId) => {
    if (!window.confirm('Удалить этот канал?')) return;
    await api.delete(`/api/channels/${channelId}`, token);
    if (selectedChannelId === channelId) setSelectedChannelId(null);
    loadChannels(selectedServerId);
  };
  const handleShowInvite = async () => {
    try {
      const data = await api.get(`/api/servers/${selectedServerId}/invite`, token);
      setInviteCode(data.invite_code); setShowInvite(true);
    } catch (err) { console.error(err); }
  };
  const handleLeaveServer = async () => {
    if (!window.confirm('Вы уверены, что хотите покинуть этот сервер?')) return;
    try {
      await api.post(`/api/servers/${selectedServerId}/leave`, {}, token);
      setSelectedServerId(null); setMasterPreviewMode(false); await loadServers();
    } catch (err) { alert(err.message); }
  };

  const handleJoinVoiceChannel = async (channel) => {
    const socket = getSocket();
    if (!socket) return;
    if (currentVoiceChannelId === channel.id) {
      handleLeaveVoiceChannel();
      return;
    }
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    } catch (err) {
      alert('Нужен доступ к микрофону для голосового канала. Разрешите доступ в настройках браузера.');
      return;
    }
    if (currentVoiceChannelId) {
      socket.emit('leave_voice_channel', currentVoiceChannelId);
    }
    setCurrentVoiceChannelId(channel.id);
    setVoiceParticipants([]);
    socket.emit('join_voice_channel', channel.id);
  };

  const handleLeaveVoiceChannel = () => {
    if (!currentVoiceChannelId) return;
    const socket = getSocket();
    if (socket) socket.emit('leave_voice_channel', currentVoiceChannelId);
    setCurrentVoiceChannelId(null);
    setVoiceParticipants([]);
    setVoiceSpeakingUsers({});
  };

  const handleSelectServerFromSidebar = (serverId) => {
    setMasterPreviewMode(false);
    setSelectedServerId(serverId);
  };

  const handleSelectServerPreview = (serverId) => {
    setMasterPreviewMode(true);
    setSelectedServerId(serverId);
  };

  const handleJoinMaster = async () => {
    if (!selectedServerId) return;
    try {
      await api.post(`/api/servers/${selectedServerId}/join-master`, {}, token);
      await loadServers();
      setMasterPreviewMode(false);
      loadMembers(selectedServerId);
      loadRoles(selectedServerId);
      loadMyPermissions(selectedServerId);
      const socket = getSocket();
      if (socket) {
        socket.emit('join_server', selectedServerId);
        socket.emit('get_online_users', selectedServerId, (statuses) => {
          setOnlineStatuses(prev => ({ ...prev, ...statuses }));
        });
      }
    } catch (err) { console.error(err); }
  };
  const handleNotificationClick = (notif) => {
    if (notif.serverId) {
      setSelectedServerId(notif.serverId);
      setTimeout(() => setSelectedChannelId(notif.channelId), 100);
    }
    setNotifications(prev => prev.filter(n => n.id !== notif.id));
  };
  const handleLogout = () => {
    disconnectSocket();
    setServers([]); setSelectedServerId(null);
    setChannels([]); setSelectedChannelId(null);
    setMessages([]); setMembers([]);
    logout();
  };

  // Context menu
  const handleContextMenu = (e, member) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, member });
  };
  const closeContextMenu = () => setContextMenu(null);

  // Profile
  const handleOpenProfile = (member) => setProfileTarget(member);
  const handleCloseProfile = () => setProfileTarget(null);

  // DM
  const dmUnreadTotal = Object.values(dmUnreadMap).reduce((a, b) => a + b, 0);

  const handleOpenDM = (userId, username) => {
    setProfileTarget(null);
    setDmTargetUserId(userId);
    setDmTargetUsername(username);
    setShowDM(true);
    if (userId) {
      setDmUnreadMap(prev => { const next = { ...prev }; delete next[userId]; return next; });
    }
  };
  const handleSendQuickDM = (userId, content) => {
    const socket = getSocket();
    if (socket) socket.emit('send_dm', { toUserId: userId, content });
  };
  const handleCloseDM = () => { setShowDM(false); setDmTargetUserId(null); setDmTargetUsername(''); };

  // Channel settings
  const handleOpenChannelSettings = (channel) => setChannelSettingsTarget(channel);

  const refreshMembers = () => { if (selectedServerId) { loadMembers(selectedServerId); loadRoles(selectedServerId); } };

  const isOwnerFlag = currentServer?.owner_id === user?.id;
  const canManageChannels = isOwnerFlag || !!myPermissions.manage_channels;
  const canOpenSettings = isOwnerFlag || !!myPermissions.manage_roles || !!myPermissions.manage_server || !!myPermissions.manage_channels || !!myPermissions.kick_members || !!myPermissions.ban_members || !!myPermissions.administrator;

  if (loading) {
    return (
      <div className="loading-screen">
        <Logo size={64} showText className="loading-logo-wrap" />
        <div className="loading-text">Загрузка...</div>
      </div>
    );
  }
  if (!user) {
    if (authPage === 'landing') {
      return (
        <LandingPage
          onOpenApp={() => setAuthPage('login')}
          onRegister={() => setAuthPage('register')}
        />
      );
    }
    if (authPage === 'login') {
      return (
        <LoginPage
          onSwitchToRegister={() => setAuthPage('register')}
          onBackToLanding={() => setAuthPage('landing')}
        />
      );
    }
    return (
      <RegisterPage
        onSwitchToLogin={() => setAuthPage('login')}
        onBackToLanding={() => setAuthPage('landing')}
      />
    );
  }

  return (
    <div className="app" onClick={closeContextMenu}>
      <ServerList
        servers={memberServers} selectedServerId={selectedServerId}
        onSelectServer={handleSelectServerFromSidebar}
        onCreateServer={() => setShowCreateServer(true)}
        onJoinServer={() => setShowJoinServer(true)}
        onLogout={handleLogout} user={user}
        mentionsByServer={mentionsByServer}
        onOpenDM={() => { setDmTargetUserId(null); setDmTargetUsername(''); setShowDM(true); }}
        dmUnread={dmUnreadTotal}
      />
      <ChannelList
        server={currentServer} channels={channels}
        selectedChannelId={selectedChannelId}
        onSelectChannel={setSelectedChannelId}
        onCreateChannel={handleCreateChannel}
        onCreateVoiceChannel={handleCreateVoiceChannel}
        onDeleteChannel={handleDeleteChannel}
        onJoinVoiceChannel={handleJoinVoiceChannel}
        currentVoiceChannelId={currentVoiceChannelId}
        voiceRosters={voiceRosters}
        voiceSpeakingUsers={voiceSpeakingUsers}
        onOpenSettings={() => setShowSettings(true)}
        onLeaveServer={handleLeaveServer}
        onShowInvite={handleShowInvite}
        canManageChannels={canManageChannels}
        isOwner={isOwnerFlag} canOpenSettings={canOpenSettings}
        mentionsByChannel={mentionsByChannel}
        onOpenChannelSettings={handleOpenChannelSettings}
        isMaster={user?.is_master}
        allServers={user?.is_master ? servers : []}
        onSelectServerPreview={handleSelectServerPreview}
        currentUsername={user?.username}
      />
      {masterPreviewMode && currentServer && (
        <div className="master-preview-banner">
          <span>Режим просмотра — вы не в списке участников</span>
          <button type="button" className="master-join-btn" onClick={handleJoinMaster}>Вступить</button>
        </div>
      )}
      <Chat
        channel={currentChannel} messages={messages}
        onSendMessage={handleSendMessage} onEditMessage={handleEditMessage} onDeleteMessage={handleDeleteMessage}
        typingUsers={typingUsers} currentUserId={user.id}
        currentUsername={user.username} members={members} isOwner={isOwnerFlag}
        slowmodeWait={slowmodeWait}
        onOpenProfile={handleOpenProfile}
        onlineStatuses={onlineStatuses}
        onContextMenu={handleContextMenu}
        token={token}
        readOnly={masterPreviewMode}
        onCreateServer={() => setShowCreateServer(true)}
        onJoinServer={() => setShowJoinServer(true)}
      />
      {currentVoiceChannelId && (() => {
        const voiceChannel = channels.find(c => c.id === currentVoiceChannelId);
        if (!voiceChannel) return null;
        return (
          <VoicePanel
            channel={voiceChannel}
            participants={voiceParticipants}
            currentUserId={user?.id}
            currentUsername={user?.username}
            members={members}
            socket={getSocket()}
            onLeave={handleLeaveVoiceChannel}
          />
        );
      })()}
      {currentServer && (
        <MemberList
          members={members} server={currentServer}
          onlineStatuses={onlineStatuses}
          onOpenProfile={handleOpenProfile}
          onContextMenu={handleContextMenu}
        />
      )}
      {currentServer && (
        <button className="invite-btn" onClick={handleShowInvite} title="Пригласить">Пригласить</button>
      )}

      {notifications.length > 0 && (
        <div className="notification-container">
          {notifications.map(notif => (
            <div key={notif.id} className="notification-toast" onClick={() => handleNotificationClick(notif)}>
              <div className="notification-title">@упоминание на {notif.serverName}</div>
              <div className="notification-body">
                <strong>{notif.fromUser}</strong> {notif.channelName ? `в #${notif.channelName}: ` : ''}{notif.content.slice(0, 80)}
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreateServer && <CreateServerModal onClose={() => setShowCreateServer(false)} onCreate={handleCreateServer} />}
      {showJoinServer && <JoinServerModal onClose={() => setShowJoinServer(false)} onJoin={handleJoinServer} />}
      {showInvite && <InviteModal inviteCode={inviteCode} onClose={() => setShowInvite(false)} />}
      {showSettings && currentServer && (
        <ServerSettings
          server={currentServer}
          onClose={() => { setShowSettings(false); loadMyPermissions(selectedServerId); loadChannels(selectedServerId); loadRoles(selectedServerId); }}
          onServerUpdated={loadServers}
          onServerDeleted={() => { setSelectedServerId(null); loadServers(); }}
          myPermissions={myPermissions} myHighestPos={myHighestPos} isOwner={isOwnerFlag}
        />
      )}

      {/* Channel settings modal */}
      {channelSettingsTarget && (
        <ChannelSettingsModal
          channel={channelSettingsTarget}
          onClose={() => setChannelSettingsTarget(null)}
          onUpdated={() => loadChannels(selectedServerId)}
        />
      )}

      {/* Context menu */}
      {contextMenu && currentServer && (
        <UserContextMenu
          x={contextMenu.x} y={contextMenu.y}
          targetMember={contextMenu.member}
          serverId={currentServer.id}
          myPermissions={myPermissions}
          myHighestPos={myHighestPos}
          isOwner={isOwnerFlag}
          currentUserId={user.id}
          onClose={closeContextMenu}
          onRefreshMembers={refreshMembers}
          roles={roles}
        />
      )}

      {/* Profile popup */}
      {profileTarget && (
        <UserProfilePopup
          targetUser={profileTarget}
          onClose={handleCloseProfile}
          onOpenDM={handleOpenDM}
          onSendQuickDM={handleSendQuickDM}
          onlineStatus={onlineStatuses[profileTarget.user_id] || 'offline'}
          currentUserId={user.id}
        />
      )}

      {/* DM panel */}
      {showDM && (
        <DMPanel
          token={token} currentUserId={user.id}
          targetUserId={dmTargetUserId}
          targetUsername={dmTargetUsername}
          onClose={handleCloseDM}
          onlineStatuses={onlineStatuses}
          dmUnreadMap={dmUnreadMap}
          onClearUnread={(userId) => setDmUnreadMap(prev => { const next = { ...prev }; delete next[userId]; return next; })}
        />
      )}
    </div>
  );
}
