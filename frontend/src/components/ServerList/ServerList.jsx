// ============================================================
// ServerList.jsx — Боковая панель со списком серверов
// ============================================================

import React, { useState } from 'react';
import { Home, MessageCircle, Plus, LogIn, LogOut } from 'lucide-react';

export default function ServerList({
  servers,
  selectedServerId,
  onSelectServer,
  onCreateServer,
  onJoinServer,
  onLogout,
  user,
  mentionsByServer = {},
  onOpenDM,
  dmUnread = 0
}) {
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const getInitial = (name) => name ? name.charAt(0).toUpperCase() : '?';

  const getColor = (name) => {
    const colors = ['#5865f2', '#57f287', '#fee75c', '#eb459e', '#ed4245', '#3ba55c', '#faa61a'];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  };

  return (
    <div className="server-list">
      <div
        className={`server-icon home-icon ${!selectedServerId ? 'active' : ''}`}
        onClick={() => onSelectServer(null)}
        title="Главная"
      ><Home className="server-icon-svg" size={24} strokeWidth={2.5} /></div>

      <div className="server-icon-wrapper">
        <div className="server-icon dm-icon" onClick={onOpenDM} title="Личные сообщения"><MessageCircle className="server-icon-svg" size={22} strokeWidth={2.5} /></div>
        {dmUnread > 0 && <span className="mention-badge">{dmUnread > 99 ? '99+' : dmUnread}</span>}
      </div>

      <div className="server-separator" />

      {servers.map(server => {
        const mentions = mentionsByServer[server.id] || 0;
        return (
          <div key={server.id} className="server-icon-wrapper">
            <div
              className={`server-icon ${selectedServerId === server.id ? 'active' : ''}`}
              onClick={() => onSelectServer(server.id)}
              title={server.name}
              style={{ backgroundColor: selectedServerId === server.id ? 'var(--accent)' : getColor(server.name) }}
            >
              <span className="server-icon-char">{getInitial(server.name)}</span>
            </div>
            {mentions > 0 && (
              <span className="mention-badge">{mentions > 99 ? '99+' : mentions}</span>
            )}
          </div>
        );
      })}

      <div className="server-icon add-server" onClick={onCreateServer} title="Создать сервер"><Plus className="server-icon-svg" size={28} strokeWidth={2.5} /></div>
      <div className="server-icon join-server" onClick={onJoinServer} title="Присоединиться по коду"><LogIn className="server-icon-svg" size={22} strokeWidth={2.5} /></div>

      <div className="server-list-bottom">
        <button
          type="button"
          className="logout-btn"
          onClick={() => setShowLogoutConfirm(true)}
          title={`Выйти из аккаунта (${user?.username})`}
        >
          <LogOut className="logout-btn-icon" size={22} strokeWidth={2.5} />
          <span className="logout-btn-text">Выйти</span>
          {user?.username && <span className="logout-btn-username">{user.username}</span>}
        </button>
      </div>

      {showLogoutConfirm && (
        <div className="logout-confirm-overlay" onClick={() => setShowLogoutConfirm(false)}>
          <div className="logout-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="logout-confirm-title">Выйти из аккаунта?</h3>
            <p className="logout-confirm-text">
              Вы выйдете из аккаунта {user?.username ? `«${user.username}»` : ''} на этом устройстве. Чтобы снова зайти, потребуется войти или зарегистрироваться.
            </p>
            <div className="logout-confirm-actions">
              <button type="button" className="logout-confirm-btn logout-confirm-cancel" onClick={() => setShowLogoutConfirm(false)}>Отмена</button>
              <button type="button" className="logout-confirm-btn logout-confirm-submit" onClick={() => { setShowLogoutConfirm(false); onLogout(); }}>Выйти</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
