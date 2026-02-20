// ============================================================
// ChannelList.jsx — Список каналов + шестерёнка настроек канала
// ============================================================

import React, { useState, useRef, useEffect } from 'react';

export default function ChannelList({
  server, channels, selectedChannelId, onSelectChannel,
  onCreateChannel, onDeleteChannel, onOpenSettings,
  onLeaveServer, onShowInvite, canManageChannels,
  isOwner, canOpenSettings, mentionsByChannel = {},
  onOpenChannelSettings,
  isMaster, allServers = [], onSelectServerPreview,
  currentUsername
}) {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
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
      </div>
      {channels.filter(c => c.type === 'voice').map(channel => (
        <div key={channel.id} className="channel-item voice-channel">
          <span className="channel-hash">🔊</span>
          <span className="channel-name">{channel.name}</span>
        </div>
      ))}
    </div>
  );
}
