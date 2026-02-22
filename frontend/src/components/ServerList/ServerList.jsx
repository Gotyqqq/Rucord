// ============================================================
// ServerList.jsx — Боковая панель со списком серверов
// ============================================================

import React, { useState } from 'react';

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
  dmUnread = 0,
  onOpenUserSettings
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
      ><span className="server-icon-char">R</span></div>

      <div className="server-icon-wrapper">
        <div className="server-icon dm-icon" onClick={onOpenDM} title="Личные сообщения"><span className="server-icon-char">💬</span></div>
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
              style={{ backgroundColor: selectedServerId === server.id ? '#5865f2' : getColor(server.name) }}
            >
              <span className="server-icon-char">{getInitial(server.name)}</span>
            </div>
            {mentions > 0 && (
              <span className="mention-badge">{mentions > 99 ? '99+' : mentions}</span>
            )}
          </div>
        );
      })}

      <div className="server-icon add-server" onClick={onCreateServer} title="Создать сервер"><span className="server-icon-char">+</span></div>
      <div className="server-icon join-server" onClick={onJoinServer} title="Присоединиться по коду"><span className="server-icon-char">↗</span></div>

      <div className="server-list-bottom">
        {onOpenUserSettings && (
          <button
            type="button"
            className="logout-btn settings-btn"
            onClick={onOpenUserSettings}
            title="Настройки пользователя"
          >
            <span className="logout-btn-icon">⚙</span>
            <span className="logout-btn-text">Настройки</span>
          </button>
        )}
        <button
          type="button"
          className="logout-btn"
          onClick={() => setShowLogoutConfirm(true)}
          title={`Выйти из аккаунта (${user?.username})`}
        >
          <span className="logout-btn-icon">⏻</span>
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
