// ============================================================
// ChannelList.jsx — Список каналов + шестерёнка настроек канала
// ============================================================

import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Mail, Settings, DoorOpen, Hash, Plus, Mic, MicOff, X } from 'lucide-react';
import { HeadphonesOff } from '../ui/HeadphonesOff';

export default function ChannelList({
  server, channels, selectedChannelId, onSelectChannel,
  onCreateChannel, onCreateVoiceChannel, onDeleteChannel, onOpenSettings,
  onLeaveServer, onShowInvite, canManageChannels, canCreateVoiceChannel,
  isOwner, canOpenSettings, mentionsByChannel = {},
  onOpenChannelSettings,
  onJoinVoiceChannel,
  currentVoiceChannelId,
  voiceRosters = {},
  voiceSpeakingUsers = {},
  members = [],
  onOpenProfile,
  onOpenVoiceContextMenu,
  isMaster, allServers = [], onSelectServerPreview,
  currentUsername, currentDisplayName
}) {
  const displayName = currentDisplayName || currentUsername;
  const getInitial = (name) => name ? name.charAt(0).toUpperCase() : '?';
  const getAvatarUrl = (url) => url ? (url.startsWith('http') ? url : (typeof window !== 'undefined' && window.__API_BASE__ ? window.__API_BASE__ : '') + url) : null;
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
          {displayName && (
            <p className="home-welcome">Привет, <strong>{displayName}</strong>!</p>
          )}
          {!displayName && <p className="home-welcome">Выберите сервер или создайте новый</p>}

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
          <ChevronDown className={`dropdown-arrow ${showDropdown ? 'open' : ''}`} size={18} />
        </button>
        {showDropdown && (
          <div className="server-dropdown">
            {onShowInvite && (
              <button className="dropdown-item" onClick={() => { onShowInvite(); setShowDropdown(false); }}>
                <Mail className="dropdown-icon" size={18} /> Пригласить людей
              </button>
            )}
            {canOpenSettings && (
              <button className="dropdown-item" onClick={() => { onOpenSettings(); setShowDropdown(false); }}>
                <Settings className="dropdown-icon" size={18} /> Настройки сервера
              </button>
            )}
            {!isOwner && (
              <>
                <div className="dropdown-separator" />
                <button className="dropdown-item danger" onClick={() => { onLeaveServer(); setShowDropdown(false); }}>
                  <DoorOpen className="dropdown-icon" size={18} /> Покинуть сервер
                </button>
              </>
            )}
          </div>
        )}
      </div>

      <div className="channel-category">
        <span className="channel-category-name">Текстовые каналы</span>
        {canManageChannels && (
          <button className="channel-add-btn" onClick={() => setShowCreateForm(!showCreateForm)} title="Создать канал"><Plus size={18} /></button>
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
            <Hash className="channel-hash channel-hash-icon" size={18} />
            <span className="channel-name">{channel.name}</span>
            {channel.slowmode > 0 && <span className="channel-slowmode-icon" title={`Slowmode: ${channel.slowmode}с`}>🕐</span>}
            {mentions > 0 && <span className="channel-mention-badge">{mentions}</span>}
            {canManageChannels && (
              <button className="channel-settings-btn-icon" onClick={(e) => { e.stopPropagation(); onOpenChannelSettings && onOpenChannelSettings(channel); }} title="Настроить канал"><Settings size={14} /></button>
            )}
            {canManageChannels && (
              <button className="channel-delete-btn" onClick={(e) => { e.stopPropagation(); onDeleteChannel(channel.id); }} title="Удалить канал"><X size={16} /></button>
            )}
          </div>
        );
      })}

      <div className="channel-category" style={{ marginTop: '16px' }}>
        <span className="channel-category-name">Голосовые каналы</span>
        {(canCreateVoiceChannel ?? canManageChannels) && onCreateVoiceChannel && (
          <button className="channel-add-btn" onClick={() => setShowCreateVoiceForm(!showCreateVoiceForm)} title="Создать голосовой канал"><Plus size={18} /></button>
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
              <Mic className="channel-hash channel-hash-icon channel-voice-icon" size={18} />
              <span className="channel-name">{channel.name}</span>
              {canManageChannels && (
                <button className="channel-delete-btn" onClick={(e) => { e.stopPropagation(); onDeleteChannel(channel.id); }} title="Удалить канал"><X size={16} /></button>
              )}
            </div>
            {roster.length > 0 && (
              <div className="voice-channel-users">
                {roster.map(p => {
                  const member = members.find(m => m.user_id === p.userId);
                  const avatarUrl = getAvatarUrl(member?.avatar_url);
                  const isForceMuted = !!p.force_muted;
                  const isForceDeafened = !!p.force_deafened;
                  return (
                  <div
                    key={p.userId}
                    className={`voice-channel-user ${voiceSpeakingUsers[p.userId] ? 'voice-channel-user-speaking' : ''} voice-channel-user-clickable`}
                    onClick={(e) => { e.stopPropagation(); if (member && onOpenProfile) onOpenProfile(member); }}
                    onContextMenu={(e) => member && onOpenVoiceContextMenu && onOpenVoiceContextMenu(e, member, channel.id)}
                  >
                    <div
                      className="voice-channel-user-avatar"
                      style={avatarUrl ? { backgroundImage: `url(${avatarUrl})`, backgroundColor: 'transparent' } : { backgroundColor: getAvatarColor(p.username) }}
                    >
                      {!avatarUrl && getInitial(p.username)}
                    </div>
                    <span className="voice-channel-user-name">{p.username}</span>
                    {p.muted && (
                      <span className={`voice-channel-user-muted ${isForceMuted ? 'voice-channel-user-force' : ''}`} title={isForceMuted ? 'Микрофон выключен модератором' : 'Микрофон выключен'} aria-hidden>
                        <MicOff className="icon-mic-off" size={14} />
                      </span>
                    )}
                    {p.deafened && (
                      <span className={`voice-channel-user-deafened ${isForceDeafened ? 'voice-channel-user-force' : ''}`} title={isForceDeafened ? 'Звук выключен модератором' : 'Звук выключен'} aria-hidden>
                        <HeadphonesOff className="icon-headphone-off" size={14} />
                      </span>
                    )}
                  </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
