// ============================================================
// ServerList.jsx — Боковая панель со списком серверов
// ============================================================

import React from 'react';

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
      >R</div>

      <div className="server-icon-wrapper">
        <div className="server-icon dm-icon" onClick={onOpenDM} title="Личные сообщения">💬</div>
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
              {getInitial(server.name)}
            </div>
            {mentions > 0 && (
              <span className="mention-badge">{mentions > 99 ? '99+' : mentions}</span>
            )}
          </div>
        );
      })}

      <div className="server-icon add-server" onClick={onCreateServer} title="Создать сервер">+</div>
      <div className="server-icon join-server" onClick={onJoinServer} title="Присоединиться по коду">↗</div>

      <div className="server-list-bottom">
        <div className="server-icon logout-icon" onClick={onLogout} title={`Выйти (${user?.username})`}>⏻</div>
      </div>
    </div>
  );
}
