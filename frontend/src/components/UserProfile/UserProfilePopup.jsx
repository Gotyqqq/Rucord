// ============================================================
// UserProfilePopup.jsx — Попап профиля пользователя
// Показывает инфо + быстрое сообщение / кнопка ЛС
// ============================================================

import React, { useState } from 'react';

export default function UserProfilePopup({
  targetUser, onClose, onOpenDM, onSendQuickDM,
  onlineStatus = 'offline', currentUserId
}) {
  const [quickMsg, setQuickMsg] = useState('');

  if (!targetUser) return null;

  const isMe = targetUser.user_id === currentUserId;

  const getInitial = (name) => name ? name.charAt(0).toUpperCase() : '?';
  const getAvatarColor = (name) => {
    const colors = ['#5865f2', '#57f287', '#fee75c', '#eb459e', '#ed4245', '#3ba55c', '#faa61a', '#e67e22'];
    let hash = 0;
    for (let i = 0; i < (name || '').length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  };

  const statusColor = onlineStatus === 'online' ? '#3ba55c' : onlineStatus === 'idle' ? '#faa61a' : '#72767d';
  const statusText = onlineStatus === 'online' ? 'В сети' : onlineStatus === 'idle' ? 'Неактивен' : 'Не в сети';

  const roles = (targetUser.roles || []).filter(r => r.name !== 'Владелец');

  const handleSendQuick = (e) => {
    e.preventDefault();
    if (quickMsg.trim() && onSendQuickDM) {
      onSendQuickDM(targetUser.user_id, quickMsg.trim());
      setQuickMsg('');
    }
  };

  return (
    <div className="profile-popup-overlay" onClick={onClose}>
      <div className="profile-popup" onClick={(e) => e.stopPropagation()}>
        {/* Banner */}
        <div className="profile-banner" style={{ backgroundColor: getAvatarColor(targetUser.username) }} />

        {/* Avatar */}
        <div className="profile-avatar-wrapper">
          <div className="profile-avatar" style={{ backgroundColor: getAvatarColor(targetUser.username) }}>
            {getInitial(targetUser.username)}
          </div>
          <span className="profile-status-dot" style={{ backgroundColor: statusColor }} />
        </div>

        {/* Info */}
        <div className="profile-body">
          <div className="profile-name-section">
            <h3 className="profile-username">
              {targetUser.username}
              {targetUser.is_owner && <span className="owner-crown-small"> 👑</span>}
            </h3>
            <span className="profile-status-text">{statusText}</span>
          </div>

          <div className="profile-divider" />

          {roles.length > 0 && (
            <div className="profile-roles-section">
              <div className="profile-section-title">Роли</div>
              <div className="profile-roles">
                {roles.map(r => (
                  <span key={r.id} className="profile-role-badge" style={{ borderColor: r.color, color: r.color }}>
                    <span className="profile-role-dot" style={{ backgroundColor: r.color }} />
                    {r.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {targetUser.joined_at && (
            <div className="profile-joined-section">
              <div className="profile-section-title">Участник с</div>
              <div className="profile-joined-date">
                {new Date(targetUser.joined_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}
              </div>
            </div>
          )}

          <div className="profile-divider" />

          {/* Quick message or DM button */}
          {!isMe && (
            <div className="profile-dm-section">
              <form onSubmit={handleSendQuick} className="profile-quick-msg-form">
                <input
                  type="text"
                  value={quickMsg}
                  onChange={(e) => setQuickMsg(e.target.value)}
                  placeholder={`Сообщение @${targetUser.username}`}
                  className="profile-quick-msg-input"
                />
                <button type="submit" className="profile-quick-msg-send" disabled={!quickMsg.trim()}>➤</button>
              </form>
              <button className="profile-open-dm-btn" onClick={() => onOpenDM && onOpenDM(targetUser.user_id, targetUser.username)}>
                Открыть ЛС
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
