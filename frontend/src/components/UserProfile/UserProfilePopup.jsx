// ============================================================
// UserProfilePopup.jsx — Попап профиля пользователя
// Отображаемое имя (display_name) сверху, уникальный username снизу
// Редактирование ника только для себя: для сервера или для всех
// ============================================================

import React, { useState } from 'react';
import { Pencil, Hash } from 'lucide-react';
import { api } from '../../utils/api';
import { getAvatarUrl } from '../../utils/avatar';

export default function UserProfilePopup({
  targetUser, serverId, onClose, onOpenDM, onSendQuickDM, onDisplayNameUpdated,
  onlineStatus = 'offline', currentUserId, token
}) {
  const [quickMsg, setQuickMsg] = useState('');
  const [editingNick, setEditingNick] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [editScope, setEditScope] = useState('server'); // 'server' | 'global'
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (!targetUser) return null;

  const isMe = targetUser.user_id === currentUserId;
  const displayName = targetUser.display_name || targetUser.username;
  const showEditNick = isMe && token;

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

  const startEditNick = () => {
    setEditValue(displayName || '');
    setEditScope(serverId ? 'server' : 'global');
    setError('');
    setEditingNick(true);
  };

  const saveDisplayName = async () => {
    setError('');
    setSaving(true);
    try {
      const value = editValue.trim() || null;
      if (editScope === 'global') {
        await api.patch('/api/auth/me', { display_name: value }, token);
      } else if (serverId) {
        await api.patch(`/api/members/server/${serverId}/members/me`, { display_name: value, scope: 'server' }, token);
      }
      onDisplayNameUpdated?.();
      setEditingNick(false);
      targetUser.display_name = value;
    } catch (e) {
      setError(e.message || 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  const setScopeGlobal = async () => {
    setError('');
    setSaving(true);
    try {
      const value = editValue.trim() || null;
      await api.patch('/api/auth/me', { display_name: value }, token);
      onDisplayNameUpdated?.();
      setEditingNick(false);
      targetUser.display_name = value;
    } catch (e) {
      setError(e.message || 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  const setScopeServer = async () => {
    if (!serverId) return;
    setError('');
    setSaving(true);
    try {
      const value = editValue.trim() || null;
      await api.patch(`/api/members/server/${serverId}/members/me`, { display_name: value, scope: 'server' }, token);
      onDisplayNameUpdated?.();
      setEditingNick(false);
      targetUser.display_name = value;
    } catch (e) {
      setError(e.message || 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="profile-popup-overlay" onClick={onClose}>
      <div className="profile-popup" onClick={(e) => e.stopPropagation()}>
        <div className="profile-banner" style={{ backgroundColor: getAvatarColor(targetUser.username) }} />

        <div className="profile-avatar-wrapper">
          <div
            className="profile-avatar"
            style={(getAvatarUrl(targetUser.avatar_url) ? { backgroundImage: `url(${getAvatarUrl(targetUser.avatar_url)})`, backgroundColor: 'transparent' } : { backgroundColor: getAvatarColor(targetUser.username) })}
          >
            {!getAvatarUrl(targetUser.avatar_url) && getInitial(displayName)}
          </div>
          <span className="profile-status-dot" style={{ backgroundColor: statusColor }} />
        </div>

        <div className="profile-body">
          <div className="profile-name-section">
            {!editingNick ? (
              <>
                <div className="profile-display-name-row">
                  <h3 className="profile-display-name">
                    {displayName}
                    {targetUser.is_owner && <span className="owner-crown-small"> 👑</span>}
                  </h3>
                  {showEditNick && (
                    <button type="button" className="profile-edit-nick-btn" onClick={startEditNick} title="Изменить отображаемое имя">
                      <Pencil size={14} />
                    </button>
                  )}
                </div>
                <div className="profile-username-row">
                  <Hash size={12} className="profile-username-hash" />
                  <span className="profile-username-id">{targetUser.username}</span>
                </div>
              </>
            ) : (
              <div className="profile-edit-nick-form">
                <input
                  type="text"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  placeholder="Отображаемое имя"
                  className="profile-edit-nick-input"
                  autoFocus
                />
                {serverId ? (
                  <div className="profile-edit-scope">
                    <label><input type="radio" checked={editScope === 'server'} onChange={() => setEditScope('server')} /> Для этого сервера</label>
                    <label><input type="radio" checked={editScope === 'global'} onChange={() => setEditScope('global')} /> Для всех серверов</label>
                  </div>
                ) : null}
                {error && <div className="profile-edit-error">{error}</div>}
                <div className="profile-edit-actions">
                  <button type="button" className="profile-edit-cancel" onClick={() => { setEditingNick(false); setError(''); }}>Отмена</button>
                  <button type="button" className="profile-edit-save" onClick={editScope === 'global' ? setScopeGlobal : setScopeServer} disabled={saving}>
                    {saving ? 'Сохранение…' : 'Сохранить'}
                  </button>
                </div>
              </div>
            )}
            {!editingNick && <span className="profile-status-text">{statusText}</span>}
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

          {!isMe && (
            <div className="profile-dm-section">
              <form onSubmit={handleSendQuick} className="profile-quick-msg-form">
                <input
                  type="text"
                  value={quickMsg}
                  onChange={(e) => setQuickMsg(e.target.value)}
                  placeholder={`Сообщение @${displayName}`}
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
