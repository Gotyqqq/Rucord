// ============================================================
// UserContextMenu.jsx — ПКМ-меню по пользователю
// Роли, мут, кик, бан — с проверкой прав
// ============================================================

import React, { useState, useEffect, useRef } from 'react';
import { api } from '../../utils/api';
import { useAuth } from '../../context/AuthContext';

export default function UserContextMenu({
  x, y, targetMember, serverId, myPermissions = {}, myHighestPos = 0,
  isOwner = false, currentUserId, onClose, onRefreshMembers, roles = [],
  onOpenProfile,
  voiceChannelId, voiceSocket, canMuteVoiceMembers, canDeafenVoiceMembers, voiceForceMuted, voiceForceDeafened
}) {
  const { token } = useAuth();
  const menuRef = useRef(null);
  const [showRoles, setShowRoles] = useState(false);
  const [showMuteDuration, setShowMuteDuration] = useState(false);
  const [showBanForm, setShowBanForm] = useState(false);
  const [banReason, setBanReason] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const handle = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) onClose();
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [onClose]);

  if (!targetMember) return null;

  const isMe = targetMember.user_id === currentUserId;
  const isTargetOwner = targetMember.is_owner;
  const targetPos = Math.max(...(targetMember.roles || []).map(r => r.position || 0), 0);

  const canManageRoles = isOwner || !!myPermissions.manage_roles;
  const canKick = !isMe && !isTargetOwner && (isOwner || (!!myPermissions.kick_members && myHighestPos > targetPos));
  const canBan = !isMe && !isTargetOwner && (isOwner || (!!myPermissions.ban_members && myHighestPos > targetPos));
  const canMute = !isMe && !isTargetOwner && (isOwner || (!!myPermissions.mute_members && myHighestPos > targetPos));

  const assignableRoles = roles.filter(r =>
    r.name !== 'everyone' && r.name !== 'Владелец' && (isOwner || r.position < myHighestPos)
  );

  const memberRoleIds = new Set((targetMember.roles || []).map(r => r.id));

  const handleAssignRole = async (roleId) => {
    try {
      setError('');
      await api.post(`/api/members/server/${serverId}/roles/${roleId}/assign/${targetMember.user_id}`, {}, token);
      onRefreshMembers();
    } catch (err) { setError(err.message); }
  };

  const handleRemoveRole = async (roleId) => {
    try {
      setError('');
      await api.delete(`/api/members/server/${serverId}/roles/${roleId}/assign/${targetMember.user_id}`, token);
      onRefreshMembers();
    } catch (err) { setError(err.message); }
  };

  const handleKick = async () => {
    if (!window.confirm(`Кикнуть ${targetMember.username}?`)) return;
    try {
      await api.delete(`/api/members/server/${serverId}/${targetMember.user_id}`, token);
      onRefreshMembers(); onClose();
    } catch (err) { setError(err.message); }
  };

  const handleBanSubmit = async () => {
    try {
      await api.post(`/api/members/server/${serverId}/ban/${targetMember.user_id}`, { reason: banReason }, token);
      onRefreshMembers(); onClose();
    } catch (err) { setError(err.message); }
  };

  const handleMute = async (duration) => {
    try {
      await api.post(`/api/members/server/${serverId}/mute/${targetMember.user_id}`, { duration }, token);
      onRefreshMembers(); onClose();
    } catch (err) { setError(err.message); }
  };

  const handleUnmute = async () => {
    try {
      await api.delete(`/api/members/server/${serverId}/mute/${targetMember.user_id}`, token);
      onRefreshMembers(); onClose();
    } catch (err) { setError(err.message); }
  };

  const muteDurations = [
    { label: '1 минута', value: 60 },
    { label: '5 минут', value: 300 },
    { label: '10 минут', value: 600 },
    { label: '1 час', value: 3600 },
    { label: '1 день', value: 86400 },
    { label: '1 неделя', value: 604800 },
  ];

  // Adjust position to stay on screen
  const style = { position: 'fixed', top: y, left: x, zIndex: 300 };
  if (typeof window !== 'undefined') {
    if (x + 220 > window.innerWidth) style.left = x - 220;
    if (y + 400 > window.innerHeight) style.top = Math.max(10, y - 300);
  }

  const toggleVoiceMute = () => {
    if (!voiceSocket || !serverId) return;
    if (voiceChannelId) {
      voiceSocket.emit('voice_force_mute', { channelId: voiceChannelId, targetUserId: targetMember.user_id, muted: !voiceForceMuted });
    } else {
      voiceSocket.emit('voice_force_mute_user', { serverId, targetUserId: targetMember.user_id, muted: !voiceForceMuted });
    }
    onClose();
  };
  const toggleVoiceDeafen = () => {
    if (!voiceSocket || !serverId) return;
    if (voiceChannelId) {
      voiceSocket.emit('voice_force_deafen', { channelId: voiceChannelId, targetUserId: targetMember.user_id, deafened: !voiceForceDeafened });
    } else {
      voiceSocket.emit('voice_force_deafen_user', { serverId, targetUserId: targetMember.user_id, deafened: !voiceForceDeafened });
    }
    onClose();
  };

  return (
    <div className="ctx-menu" ref={menuRef} style={style} onClick={(e) => e.stopPropagation()} onContextMenu={(e) => e.preventDefault()}>
      <div className="ctx-menu-header">
        <span className="ctx-menu-username" style={{ color: (targetMember.roles?.[0]?.color) || '#fff' }}>
          {targetMember.display_name || targetMember.username}
        </span>
        {targetMember.is_owner && <span className="ctx-menu-badge">👑</span>}
        {targetMember.is_muted && <span className="ctx-menu-badge ctx-muted-badge">🔇</span>}
      </div>

      {error && <div className="ctx-menu-error">{error}</div>}

      {onOpenProfile && (
        <button className="ctx-menu-item" onClick={() => { onOpenProfile(targetMember); onClose(); }}>
          <span>Открыть профиль</span>
        </button>
      )}

      {(canMuteVoiceMembers || canDeafenVoiceMembers) && (
        <>
          {onOpenProfile && <div className="ctx-menu-sep" />}
          {canMuteVoiceMembers && (
            <button
              type="button"
              className={`ctx-menu-item ctx-danger ${!voiceSocket ? 'ctx-menu-item-disabled' : ''}`}
              onClick={voiceSocket ? toggleVoiceMute : undefined}
              disabled={!voiceSocket}
              title={!voiceSocket ? 'Нет подключения к голосовому каналу' : (voiceChannelId ? undefined : 'Применится при входе в голосовой канал')}
            >
              <span>{voiceForceMuted ? 'Включить микрофон' : 'Выключить микрофон'}</span>
            </button>
          )}
          {canDeafenVoiceMembers && (
            <button
              type="button"
              className={`ctx-menu-item ctx-danger ${!voiceSocket ? 'ctx-menu-item-disabled' : ''}`}
              onClick={voiceSocket ? toggleVoiceDeafen : undefined}
              disabled={!voiceSocket}
              title={!voiceSocket ? 'Нет подключения к голосовому каналу' : (voiceChannelId ? undefined : 'Применится при входе в голосовой канал')}
            >
              <span>{voiceForceDeafened ? 'Включить звук' : 'Выключить звук'}</span>
            </button>
          )}
          <div className="ctx-menu-sep" />
        </>
      )}

      {/* Roles submenu */}
      {canManageRoles && assignableRoles.length > 0 && (
        <div className="ctx-menu-section">
          <button className="ctx-menu-item" onClick={() => setShowRoles(!showRoles)}>
            <span>🏷 Роли</span>
            <span className="ctx-arrow">{showRoles ? '▲' : '▼'}</span>
          </button>
          {showRoles && (
            <div className="ctx-roles-list">
              {assignableRoles.map(role => {
                const has = memberRoleIds.has(role.id);
                return (
                  <button key={role.id} className={`ctx-role-item ${has ? 'ctx-role-active' : ''}`}
                    onClick={() => has ? handleRemoveRole(role.id) : handleAssignRole(role.id)}
                  >
                    <span className="ctx-role-dot" style={{ backgroundColor: role.color }} />
                    <span>{role.name}</span>
                    {has && <span className="ctx-role-check">✓</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Mute */}
      {canMute && (
        <div className="ctx-menu-section">
          {targetMember.is_muted ? (
            <button className="ctx-menu-item" onClick={handleUnmute}>
              <span>🔊 Снять мут</span>
            </button>
          ) : (
            <>
              <button className="ctx-menu-item" onClick={() => setShowMuteDuration(!showMuteDuration)}>
                <span>🔇 Мут</span>
                <span className="ctx-arrow">{showMuteDuration ? '▲' : '▼'}</span>
              </button>
              {showMuteDuration && (
                <div className="ctx-mute-list">
                  {muteDurations.map(d => (
                    <button key={d.value} className="ctx-mute-item" onClick={() => handleMute(d.value)}>
                      {d.label}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Kick */}
      {canKick && (
        <button className="ctx-menu-item ctx-danger" onClick={handleKick}>
          <span>👢 Кикнуть</span>
        </button>
      )}

      {/* Ban */}
      {canBan && (
        <div className="ctx-menu-section">
          <button className="ctx-menu-item ctx-danger" onClick={() => setShowBanForm(!showBanForm)}>
            <span>🔨 Забанить</span>
            <span className="ctx-arrow">{showBanForm ? '▲' : '▼'}</span>
          </button>
          {showBanForm && (
            <div className="ctx-ban-form">
              <input
                type="text"
                className="ctx-ban-reason-input"
                placeholder="Причина бана (необязательно)"
                value={banReason}
                onChange={(e) => setBanReason(e.target.value)}
                autoFocus
              />
              <button className="ctx-ban-confirm" onClick={handleBanSubmit}>
                Подтвердить бан
              </button>
            </div>
          )}
        </div>
      )}

      {/* Nothing available */}
      {!canManageRoles && !canKick && !canBan && !canMute && !onOpenProfile && !(canMuteVoiceMembers || canDeafenVoiceMembers) && (
        <div className="ctx-menu-empty">Нет доступных действий</div>
      )}
    </div>
  );
}
