// ============================================================
// MemberList.jsx — Список участников с онлайн-статусом
// и профиль-попапом при клике
// ============================================================

import React, { useState } from 'react';
import { getAvatarUrl } from '../../utils/avatar';

export default function MemberList({ members, server, onlineStatuses = {}, onOpenProfile, onContextMenu }) {
  if (!server) return null;

  const getInitial = (name) => name ? name.charAt(0).toUpperCase() : '?';
  const getAvatarColor = (name) => {
    const colors = ['#5865f2', '#57f287', '#fee75c', '#eb459e', '#ed4245', '#3ba55c', '#faa61a', '#e67e22'];
    let hash = 0;
    for (let i = 0; i < (name || '').length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  };

  const getTopRole = (member) => {
    const visibleRoles = (member.roles || []).filter(r => r.name !== 'Владелец');
    return visibleRoles.length > 0 ? visibleRoles[0] : null;
  };

  const getStatus = (userId) => onlineStatuses[userId] || 'offline';

  const grouped = {};
  const noRole = [];

  for (const member of members) {
    const topRole = getTopRole(member);
    if (member.is_owner && !topRole) {
      if (!grouped['__owner__']) grouped['__owner__'] = { name: 'Владелец', color: '#e74c3c', members: [], pos: 99999 };
      grouped['__owner__'].members.push(member);
    } else if (topRole) {
      const key = topRole.id;
      if (!grouped[key]) grouped[key] = { name: topRole.name, color: topRole.color, members: [], pos: topRole.position || 0 };
      grouped[key].members.push(member);
    } else {
      noRole.push(member);
    }
  }

  const groups = Object.values(grouped).sort((a, b) => b.pos - a.pos);

  const onlineCount = members.filter(m => getStatus(m.user_id) === 'online' || getStatus(m.user_id) === 'idle').length;

  return (
    <div className="member-list">
      <div className="member-list-header">
        Участники — {members.length}
        <span className="member-online-count"> ({onlineCount} в сети)</span>
      </div>

      {groups.map((group, i) => (
        <div key={i}>
          <div className="member-category" style={{ color: group.color }}>
            {group.name} — {group.members.length}
          </div>
          {group.members.map(member => (
            <MemberItem
              key={member.user_id}
              member={member}
              getInitial={getInitial}
              getAvatarColor={getAvatarColor}
              getTopRole={getTopRole}
              status={getStatus(member.user_id)}
              onOpenProfile={onOpenProfile}
              onContextMenu={onContextMenu}
            />
          ))}
        </div>
      ))}

      {noRole.length > 0 && (
        <>
          <div className="member-category">Участники — {noRole.length}</div>
          {noRole.map(member => (
            <MemberItem
              key={member.user_id}
              member={member}
              getInitial={getInitial}
              getAvatarColor={getAvatarColor}
              getTopRole={getTopRole}
              status={getStatus(member.user_id)}
              onOpenProfile={onOpenProfile}
              onContextMenu={onContextMenu}
            />
          ))}
        </>
      )}
    </div>
  );
}

function MemberItem({ member, getInitial, getAvatarColor, getTopRole, status, onOpenProfile, onContextMenu }) {
  const topRole = getTopRole(member);
  const nameColor = topRole ? topRole.color : '#ffffff';

  const statusColor = status === 'online' ? '#3ba55c' : status === 'idle' ? '#faa61a' : '#72767d';
  const statusTitle = status === 'online' ? 'В сети' : status === 'idle' ? 'Неактивен' : 'Не в сети';

  const handleClick = () => {
    if (onOpenProfile) onOpenProfile(member);
  };

  const displayName = member.display_name || member.username;
  const avatarUrl = getAvatarUrl(member.avatar_url);
  return (
    <div className={`member-item ${status === 'offline' ? 'member-offline' : ''} ${member.is_muted ? 'member-muted' : ''}`}
      onClick={handleClick}
      onContextMenu={(e) => onContextMenu && onContextMenu(e, member)}
    >
      <div className="member-avatar-wrapper">
        <div
          className="member-avatar"
          style={avatarUrl ? { backgroundImage: `url(${avatarUrl})`, backgroundColor: 'transparent' } : { backgroundColor: getAvatarColor(member.username) }}
        >
          {!avatarUrl && getInitial(displayName)}
        </div>
        <span className="member-status-dot" style={{ backgroundColor: statusColor }} title={statusTitle} />
      </div>
      <div className="member-info">
        <span className="member-name" style={{ color: nameColor }}>
          {displayName}
          {member.is_owner && <span className="owner-crown-small" title="Владелец сервера"> 👑</span>}
        </span>
        {topRole && (
          <span className="member-role" style={{ color: topRole.color }}>
            {topRole.name}
          </span>
        )}
      </div>
    </div>
  );
}
