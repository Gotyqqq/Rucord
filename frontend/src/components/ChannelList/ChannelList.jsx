// ============================================================
// ChannelList.jsx — Список каналов + шестерёнка настроек канала
// ============================================================

import React, { useState, useRef, useEffect } from 'react';

export default function ChannelList({
  server, channels, selectedChannelId, onSelectChannel,
  onCreateChannel, onCreateVoiceChannel, onDeleteChannel, onOpenSettings,
  onLeaveServer, onShowInvite, canManageChannels,
  isOwner, canOpenSettings, mentionsByChannel = {},
  onOpenChannelSettings,
  onJoinVoiceChannel,
  currentVoiceChannelId,
  voiceRosters = {},
  voiceSpeakingUsers = {},
  isMaster, allServers = [], onSelectServerPreview,
  currentUsername
}) {
  const getInitial = (name) => name ? name.charAt(0).toUpperCase() : '?';
  const getAvatarColor = (name) => {
    const colors = ['#5865f2', '#57f287', '#fee75c', '#eb459e', '#ed4245', '#3ba55c', '#faa61a', '#e67e22'];
    let hash = 0;
    for (let i = 0; i < (name || '').length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  };
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  const [showCreateVoiceForm, setShowCreateVoiceForm] = useState(false);
  const [newVoiceChannelName, setNewVoiceChannelName] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setShowDropdown(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleCreate = (e) => {
    e.preventDefault();
    if (newChannelName.trim()) {
      onCreateChannel(newChannelName.trim());
      setNewChannelName('');
      setShowCreateForm(false);
    }
  };
  const handleCreateVoice = (e) => {
    e.preventDefault();
    if (newVoiceChannelName.trim() && onCreateVoiceChannel) {
      onCreateVoiceChannel(newVoiceChannelName.trim());
      setNewVoiceChannelName('');
      setShowCreateVoiceForm(false);
    }
  };

  if (!server) {
    return (
      <div className="channel-list">
        <div className="channel-list-header"><span>Rucord</span></div>
        <div className="channel-list-empty home-screen">
          {currentUsername && (
            <p className="home-welcome">Привет, <strong>{currentUsername}</strong>!</p>
          )}
          {!currentUsername && <p className="home-welcome">Выберите сервер или создайте новый</p>}

          {isMaster && allServers.length > 0 && (
            <div className="all-servers-block">
              <div className="all-servers-title">Все серверы</div>
              <ul className="all-servers-list">
                {allServers.map(s => (
                  <li key={s.id}>
                    <button type="button" className="all-servers-item" onClick={() => onSelectServerPreview(s.id)}>
                      <span className="all-servers-initial">{s.name ? s.name.charAt(0).toUpperCase() : '?'}</span>
                      <span className="all-servers-name">{s.name}</span>
                      {s.member_count != null && <span className="all-servers-count">{s.member_count}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="home-tip">
            <span className="home-tip-icon">💡</span>
            В чате используйте <kbd>@</kbd> для упоминания участников.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="channel-list">
      <div className="channel-list-header" ref={dropdownRef}>
        <button className="server-header-btn" onClick={() => setShowDropdown(!showDropdown)}>
          <span className="server-name-text">{server.name}</span>
          <span className={`dropdown-arrow ${showDropdown ? 'open' : ''}`}>▾</span>
        </button>
        {showDropdown && (
          <div className="server-dropdown">
            {onShowInvite && (
              <button className="dropdown-item" onClick={() => { onShowInvite(); setShowDropdown(false); }}>
                <span className="dropdown-icon">✉</span> Пригласить людей
              </button>
            )}
            {canOpenSettings && (
              <button className="dropdown-item" onClick={() => { onOpenSettings(); setShowDropdown(false); }}>
                <span className="dropdown-icon">⚙</span> Настройки сервера
              </button>
            )}
            {!isOwner && (
              <>
                <div className="dropdown-separator" />
                <button className="dropdown-item danger" onClick={() => { onLeaveServer(); setShowDropdown(false); }}>
                  <span className="dropdown-icon">🚪</span> Покинуть сервер
                </button>
              </>
            )}
          </div>
        )}
      </div>

      <div className="channel-category">
        <span className="channel-category-name">Текстовые каналы</span>
        {canManageChannels && (
          <button className="channel-add-btn" onClick={() => setShowCreateForm(!showCreateForm)} title="Создать канал">+</button>
        )}
      </div>

      {showCreateForm && (
        <form onSubmit={handleCreate} className="channel-create-form">
          <input type="text" value={newChannelName} onChange={(e) => setNewChannelName(e.target.value)} placeholder="название-канала" autoFocus />
          <div className="channel-create-buttons">
            <button type="submit">Создать</button>
            <button type="button" onClick={() => setShowCreateForm(false)}>Отмена</button>
          </div>
        </form>
      )}

      {channels.filter(c => c.type === 'text').map(channel => {
        const mentions = mentionsByChannel[channel.id] || 0;
        return (
          <div
            key={channel.id}
            className={`channel-item ${selectedChannelId === channel.id ? 'active' : ''}`}
            onClick={() => onSelectChannel(channel.id)}
          >
            <span className="channel-hash">#</span>
            <span className="channel-name">{channel.name}</span>
            {channel.slowmode > 0 && <span className="channel-slowmode-icon" title={`Slowmode: ${channel.slowmode}с`}>🕐</span>}
            {mentions > 0 && <span className="channel-mention-badge">{mentions}</span>}
            {canManageChannels && (
              <button className="channel-settings-btn-icon" onClick={(e) => { e.stopPropagation(); onOpenChannelSettings && onOpenChannelSettings(channel); }} title="Настроить канал">⚙</button>
            )}
            {canManageChannels && (
              <button className="channel-delete-btn" onClick={(e) => { e.stopPropagation(); onDeleteChannel(channel.id); }} title="Удалить канал">×</button>
            )}
          </div>
        );
      })}

      <div className="channel-category" style={{ marginTop: '16px' }}>
        <span className="channel-category-name">Голосовые каналы</span>
        {canManageChannels && onCreateVoiceChannel && (
          <button className="channel-add-btn" onClick={() => setShowCreateVoiceForm(!showCreateVoiceForm)} title="Создать голосовой канал">+</button>
        )}
      </div>
      {showCreateVoiceForm && (
        <form onSubmit={handleCreateVoice} className="channel-create-form">
          <input type="text" value={newVoiceChannelName} onChange={(e) => setNewVoiceChannelName(e.target.value)} placeholder="название-канала" autoFocus />
          <div className="channel-create-buttons">
            <button type="submit">Создать</button>
            <button type="button" onClick={() => setShowCreateVoiceForm(false)}>Отмена</button>
          </div>
        </form>
      )}
      {channels.filter(c => c.type === 'voice').map(channel => {
        const roster = voiceRosters[channel.id] || [];
        const isActive = currentVoiceChannelId === channel.id;
        return (
          <div key={channel.id} className="voice-channel-block">
            <div
              className={`channel-item voice-channel ${isActive ? 'active' : ''}`}
              onClick={() => onJoinVoiceChannel && onJoinVoiceChannel(channel)}
            >
              <span className="channel-hash">🔊</span>
              <span className="channel-name">{channel.name}</span>
              {canManageChannels && (
                <button className="channel-delete-btn" onClick={(e) => { e.stopPropagation(); onDeleteChannel(channel.id); }} title="Удалить канал">×</button>
              )}
            </div>
            {roster.length > 0 && (
              <div className="voice-channel-users">
                {roster.map(p => (
                  <div
                    key={p.userId}
                    className={`voice-channel-user ${voiceSpeakingUsers[p.userId] ? 'voice-channel-user-speaking' : ''}`}
                  >
                    <div
                      className="voice-channel-user-avatar"
                      style={{ backgroundColor: getAvatarColor(p.username) }}
                    >
                      {getInitial(p.username)}
                    </div>
                    <span className="voice-channel-user-name">{p.username}</span>
                    {p.muted && (
                      <span className="voice-channel-user-muted" title="Микрофон выключен">🔇</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
