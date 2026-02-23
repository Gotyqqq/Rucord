// ============================================================
// ServerSettings.jsx — Настройки сервера
// DnD роли, slowmode, один скролл
// ============================================================

import React, { useState, useEffect, useRef } from 'react';
import { api } from '../../utils/api';
import { useAuth } from '../../context/AuthContext';

export default function ServerSettings({
  server, onClose, onServerUpdated, onServerDeleted,
  myPermissions = {}, myHighestPos = 0, isOwner = false
}) {
  const { token, user } = useAuth();

  const canGeneral = isOwner || !!myPermissions.manage_server;
  const canRoles = isOwner || !!myPermissions.manage_roles;
  const canMembers = isOwner || !!myPermissions.manage_roles || !!myPermissions.kick_members;

  const defaultTab = canGeneral ? 'general' : canRoles ? 'roles' : 'members';
  const [tab, setTab] = useState(defaultTab);
  const [serverName, setServerName] = useState(server.name);
  const [roles, setRoles] = useState([]);
  const [members, setMembers] = useState([]);
  // channels removed - slowmode now in ChannelSettingsModal
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleColor, setNewRoleColor] = useState('#5865f2');
  const [editingRole, setEditingRole] = useState(null);
  const [expandedRole, setExpandedRole] = useState(null);

  const [draggedRoleId, setDraggedRoleId] = useState(null);
  const [dropIndex, setDropIndex] = useState(null);
  const dragRef = useRef(null);

  useEffect(() => { loadRoles(); loadMembers(); }, []);

  const loadRoles = async () => {
    try { const data = await api.get(`/api/members/server/${server.id}/roles`, token); setRoles(data.roles); }
    catch (err) { console.error(err); }
  };
  const loadMembers = async () => {
    try { const data = await api.get(`/api/members/server/${server.id}`, token); setMembers(data.members); }
    catch (err) { console.error(err); }
  };
  const visibleRoles = roles.filter(r => r.name !== 'Владелец');
  const draggableRoles = visibleRoles.filter(r => r.name !== 'everyone');
  const everyoneRole = visibleRoles.find(r => r.name === 'everyone');
  const assignableRoles = roles.filter(r =>
    r.name !== 'everyone' && r.name !== 'Владелец' && (isOwner || r.position < myHighestPos)
  );
  const canEditRole = (role) => isOwner || (role && role.position < myHighestPos);

  // ---- Общие ----
  const handleSaveName = async () => {
    try {
      setError('');
      await api.put(`/api/servers/${server.id}`, { name: serverName }, token);
      setSuccess('Название обновлено!'); onServerUpdated();
      setTimeout(() => setSuccess(''), 2000);
    } catch (err) { setError(err.message); }
  };
  const handleDeleteServer = async () => {
    if (!window.confirm('Удалить сервер? Необратимо!')) return;
    try { await api.delete(`/api/servers/${server.id}`, token); onServerDeleted(); onClose(); }
    catch (err) { setError(err.message); }
  };

  // ---- Роли CRUD ----
  const handleCreateRole = async (e) => {
    e.preventDefault();
    if (!newRoleName.trim()) return;
    try {
      setError('');
      await api.post(`/api/members/server/${server.id}/roles`, {
        name: newRoleName.trim(), color: newRoleColor,
        permissions: { send_messages: true, read_messages: true, manage_server: false, manage_channels: false, manage_roles: false, kick_members: false, ban_members: false, mute_members: false, deafen_members: false, edit_messages: false, delete_messages: false, send_gifs: true, send_media: true, administrator: false, change_display_name: true, speak_in_voice: true, create_voice_channels: false }
      }, token);
      setNewRoleName(''); loadRoles();
    } catch (err) { setError(err.message); }
  };
  const handleDeleteRole = async (roleId) => {
    if (!window.confirm('Удалить эту роль?')) return;
    try { await api.delete(`/api/members/server/${server.id}/roles/${roleId}`, token); loadRoles(); loadMembers(); }
    catch (err) { setError(err.message); }
  };
  const handleTogglePermission = async (role, permission) => {
    try {
      setError('');
      const newPerms = { ...role.permissions, [permission]: !role.permissions[permission] };
      await api.put(`/api/members/server/${server.id}/roles/${role.id}`, { permissions: newPerms }, token);
      loadRoles();
    } catch (err) { setError(err.message); }
  };
  const handleUpdateRoleColor = async (role, color) => {
    try { await api.put(`/api/members/server/${server.id}/roles/${role.id}`, { color }, token); loadRoles(); }
    catch (err) { setError(err.message); }
  };
  const handleUpdateRoleName = async (role, name) => {
    if (!name.trim()) return;
    try { await api.put(`/api/members/server/${server.id}/roles/${role.id}`, { name: name.trim() }, token); setEditingRole(null); loadRoles(); }
    catch (err) { setError(err.message); }
  };

  // ---- DnD с pointer-events fix ----
  const handleDragStart = (e, roleId) => {
    const role = draggableRoles.find(r => r.id === roleId);
    if (!canEditRole(role)) { e.preventDefault(); return; }
    dragRef.current = roleId;
    setDraggedRoleId(roleId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', roleId.toString());
  };

  const handleDropZoneOver = (e, index) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropIndex(index);
  };

  const handleDropZoneDrop = async (e, index) => {
    e.preventDefault();
    const dragging = dragRef.current;
    if (!dragging) { cleanup(); return; }

    const ordered = [...draggableRoles];
    const fromIdx = ordered.findIndex(r => r.id === dragging);
    if (fromIdx === -1) { cleanup(); return; }

    const [moved] = ordered.splice(fromIdx, 1);
    const insertAt = index > fromIdx ? index - 1 : index;
    ordered.splice(insertAt, 0, moved);

    try {
      await api.put(`/api/members/server/${server.id}/roles/reorder`, { roleIds: ordered.map(r => r.id) }, token);
      loadRoles();
    } catch (err) { setError(err.message); }
    cleanup();
  };

  const cleanup = () => { dragRef.current = null; setDraggedRoleId(null); setDropIndex(null); };
  const handleDragEnd = () => cleanup();

  const isDropMeaningful = (index) => {
    if (!draggedRoleId) return false;
    const fromIdx = draggableRoles.findIndex(r => r.id === draggedRoleId);
    return index !== fromIdx && index !== fromIdx + 1;
  };

  // ---- Участники ----
  const handleAssignRole = async (roleId, userId) => {
    try { setError(''); await api.post(`/api/members/server/${server.id}/roles/${roleId}/assign/${userId}`, {}, token); loadMembers(); }
    catch (err) { setError(err.message); }
  };
  const handleRemoveRole = async (roleId, userId) => {
    try { setError(''); await api.delete(`/api/members/server/${server.id}/roles/${roleId}/assign/${userId}`, token); loadMembers(); }
    catch (err) { setError(err.message); }
  };
  const handleKickMember = async (userId) => {
    if (!window.confirm('Удалить участника?')) return;
    try { await api.delete(`/api/members/server/${server.id}/${userId}`, token); loadMembers(); }
    catch (err) { setError(err.message); }
  };
  const canKickMember = (member) => {
    if (member.is_owner || member.user_id === user?.id) return false;
    if (!isOwner && !myPermissions.kick_members) return false;
    const memberMaxPos = Math.max(...(member.roles || []).map(r => r.position || 0), 0);
    return isOwner || myHighestPos > memberMaxPos;
  };

  const permissionLabels = {
    administrator: { label: 'Администратор', desc: 'Полный доступ ко всем настройкам', danger: true },
    manage_server: { label: 'Управлять сервером', desc: 'Изменять название и настройки' },
    manage_channels: { label: 'Управлять каналами', desc: 'Создавать, удалять каналы, настройки slowmode' },
    manage_roles: { label: 'Управлять ролями', desc: 'Создавать/назначать роли ниже своей' },
    kick_members: { label: 'Кикать участников', desc: 'Удалять участников ниже своей роли' },
    ban_members: { label: 'Банить участников', desc: 'Перманентный бан с запретом повторного входа', danger: true },
    mute_members: { label: 'Мутить участников', desc: 'Серверный мут — отключить микрофон участнику' },
    deafen_members: { label: 'Выключать звук участникам', desc: 'Принудительно отключить участнику звук в войсе' },
    edit_messages: { label: 'Редактировать чужие сообщения', desc: '' },
    delete_messages: { label: 'Удалять сообщения', desc: 'Удалять свои и чужие сообщения в каналах', danger: true },
    send_messages: { label: 'Отправлять сообщения', desc: '' },
    read_messages: { label: 'Читать сообщения', desc: '' },
    send_gifs: { label: 'Отправлять гифки', desc: 'Добавлять гифки из поиска и в избранное' },
    send_media: { label: 'Отправлять аудио и видео', desc: 'Прикреплять аудио/видео до 5 МБ' },
    change_display_name: { label: 'Менять отображаемое имя', desc: 'Устанавливать ник для этого сервера' },
    speak_in_voice: { label: 'Говорить в голосовых каналах', desc: 'Заходить в войс, говорить, выключать микрофон/звук' },
    create_voice_channels: { label: 'Создавать голосовые каналы', desc: 'Создавать новые голосовые каналы' },
  };
  const canTogglePermission = (permKey) => isOwner || !!myPermissions[permKey];

  const isDragging = !!draggedRoleId;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Настройки сервера</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="settings-tabs">
          {canGeneral && <button className={`settings-tab ${tab === 'general' ? 'active' : ''}`} onClick={() => setTab('general')}>Общие</button>}
          {canRoles && <button className={`settings-tab ${tab === 'roles' ? 'active' : ''}`} onClick={() => setTab('roles')}>Роли</button>}
          {canMembers && <button className={`settings-tab ${tab === 'members' ? 'active' : ''}`} onClick={() => setTab('members')}>Участники</button>}
          {(isOwner || !!myPermissions.ban_members) && (
            <button className={`settings-tab ${tab === 'bans' ? 'active' : ''}`} onClick={() => setTab('bans')}>Баны</button>
          )}
        </div>

        <div className="settings-content">
          {error && <div className="auth-error">{error}</div>}
          {success && <div className="auth-success">{success}</div>}

          {tab === 'general' && canGeneral && (
            <div className="settings-section">
              <div className="form-group">
                <label>Название сервера</label>
                <input type="text" value={serverName} onChange={(e) => setServerName(e.target.value)} />
              </div>
              <button className="btn-primary" onClick={handleSaveName}>Сохранить</button>
              {isOwner && (
                <div className="settings-danger">
                  <h3>Опасная зона</h3>
                  <p>Удаление сервера необратимо.</p>
                  <button className="btn-danger" onClick={handleDeleteServer}>Удалить сервер</button>
                </div>
              )}
            </div>
          )}

          {tab === 'roles' && canRoles && (
            <div className="settings-section">
              <form onSubmit={handleCreateRole} className="role-create-form">
                <input type="text" value={newRoleName} onChange={(e) => setNewRoleName(e.target.value)} placeholder="Название новой роли" />
                <input type="color" value={newRoleColor} onChange={(e) => setNewRoleColor(e.target.value)} className="color-picker" />
                <button type="submit" className="btn-primary" disabled={!newRoleName.trim()}>Создать</button>
              </form>
              <p className="roles-hint">
                Роли вверху имеют больший приоритет. Перетаскивайте для изменения порядка.
                {!isOwner && <><br /><em>Вы можете управлять только ролями ниже вашей (позиция &lt; {myHighestPos}).</em></>}
              </p>

              <div className="roles-list">
                {draggableRoles.map((role, index) => {
                  const roleDragging = draggedRoleId === role.id;
                  const editable = canEditRole(role);
                  const isExpanded = expandedRole === role.id;

                  return (
                    <React.Fragment key={role.id}>
                      {/* Drop zone BEFORE this role */}
                      <div
                        className={`role-drop-zone ${dropIndex === index && isDropMeaningful(index) ? 'role-drop-zone-active' : ''} ${isDragging ? 'role-drop-zone-visible' : ''}`}
                        onDragOver={(e) => handleDropZoneOver(e, index)}
                        onDragLeave={() => { if (dropIndex === index) setDropIndex(null); }}
                        onDrop={(e) => handleDropZoneDrop(e, index)}
                        style={{ pointerEvents: isDragging ? 'all' : 'none' }}
                      >
                        <div className="role-drop-zone-line" />
                      </div>

                      <div
                        className={`role-card ${roleDragging ? 'role-dragging' : ''} ${!editable ? 'role-locked' : ''}`}
                        draggable={editable}
                        onDragStart={(e) => handleDragStart(e, role.id)}
                        onDragEnd={handleDragEnd}
                      >
                        <div className="role-card-header">
                          <div className="role-card-left">
                            {editable ? (
                              <span className="role-drag-handle" title="Перетащите">⠿</span>
                            ) : (
                              <span className="role-drag-handle role-drag-locked" title="Роль выше вашей">🔒</span>
                            )}
                            <input type="color" value={role.color}
                              onChange={(e) => handleUpdateRoleColor(role, e.target.value)}
                              className="color-picker-small" disabled={!editable}
                            />
                            {editingRole === role.id ? (
                              <input type="text" defaultValue={role.name} className="role-name-edit" autoFocus
                                onBlur={(e) => handleUpdateRoleName(role, e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleUpdateRoleName(role, e.target.value);
                                  if (e.key === 'Escape') setEditingRole(null);
                                }}
                              />
                            ) : (
                              <span className="role-card-name" style={{ color: role.color }}
                                onClick={() => editable && setEditingRole(role.id)}
                                title={editable ? 'Нажмите для редактирования' : ''}
                              >
                                {role.name}
                              </span>
                            )}
                            <span className="role-position-tag">#{role.position}</span>
                          </div>
                          <div className="role-card-right">
                            <button className="role-expand-btn" onClick={() => setExpandedRole(isExpanded ? null : role.id)}>
                              {isExpanded ? '▲' : '▼'}
                            </button>
                            {editable && (
                              <button className="role-delete-btn" onClick={() => handleDeleteRole(role.id)} title="Удалить">✕</button>
                            )}
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="role-card-permissions">
                            {Object.entries(permissionLabels).map(([key, info]) => {
                              const canToggle = editable && canTogglePermission(key);
                              return (
                                <label key={key} className={`permission-toggle ${info.danger ? 'permission-danger' : ''} ${!canToggle ? 'permission-disabled' : ''}`}>
                                  <div className="permission-switch">
                                    <input type="checkbox" checked={role.permissions[key] || false}
                                      onChange={() => canToggle && handleTogglePermission(role, key)} disabled={!canToggle}
                                    />
                                    <span className="permission-slider-track"><span className="permission-slider-thumb" /></span>
                                  </div>
                                  <div className="permission-info">
                                    <span className="permission-label">{info.label}</span>
                                    {info.desc && <span className="permission-desc">{info.desc}</span>}
                                  </div>
                                </label>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </React.Fragment>
                  );
                })}
                {/* Last drop zone */}
                <div
                  className={`role-drop-zone ${dropIndex === draggableRoles.length && isDropMeaningful(draggableRoles.length) ? 'role-drop-zone-active' : ''} ${isDragging ? 'role-drop-zone-visible' : ''}`}
                  onDragOver={(e) => handleDropZoneOver(e, draggableRoles.length)}
                  onDragLeave={() => { if (dropIndex === draggableRoles.length) setDropIndex(null); }}
                  onDrop={(e) => handleDropZoneDrop(e, draggableRoles.length)}
                  style={{ pointerEvents: isDragging ? 'all' : 'none' }}
                >
                  <div className="role-drop-zone-line" />
                </div>

                {everyoneRole && (
                  <div className="role-card role-everyone-card">
                    <div className="role-card-header">
                      <div className="role-card-left">
                        <span className="role-card-name" style={{ color: '#72767d' }}>@everyone</span>
                        <span className="role-hint-text">Базовая роль для всех</span>
                      </div>
                      <div className="role-card-right">
                        <button className="role-expand-btn" onClick={() => setExpandedRole(expandedRole === 'everyone' ? null : 'everyone')}>
                          {expandedRole === 'everyone' ? '▲' : '▼'}
                        </button>
                      </div>
                    </div>
                    {expandedRole === 'everyone' && (
                      <div className="role-card-permissions">
                        {Object.entries(permissionLabels).map(([key, info]) => {
                          const canToggle = isOwner || (canEditRole(everyoneRole) && canTogglePermission(key));
                          return (
                            <label key={key} className={`permission-toggle ${info.danger ? 'permission-danger' : ''} ${!canToggle ? 'permission-disabled' : ''}`}>
                              <div className="permission-switch">
                                <input type="checkbox" checked={everyoneRole.permissions[key] || false}
                                  onChange={() => canToggle && handleTogglePermission(everyoneRole, key)} disabled={!canToggle}
                                />
                                <span className="permission-slider-track"><span className="permission-slider-thumb" /></span>
                              </div>
                              <div className="permission-info">
                                <span className="permission-label">{info.label}</span>
                                {info.desc && <span className="permission-desc">{info.desc}</span>}
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === 'bans' && (isOwner || !!myPermissions.ban_members) && (
            <BansTab serverId={server.id} token={token} />
          )}

          {tab === 'members' && canMembers && (
            <div className="settings-section">
              <div className="members-settings-list">
                {members.map(member => {
                  const memberRoles = (member.roles || []).filter(r => r.name !== 'Владелец');
                  const canKick = canKickMember(member);
                  return (
                    <div key={member.user_id} className="member-settings-item">
                      <div className="member-settings-info">
                        <span className="member-settings-name">
                          {member.username}
                          {member.is_owner && <span className="owner-crown" title="Владелец"> 👑</span>}
                        </span>
                        <div className="member-settings-roles">
                          {memberRoles.map(r => {
                            const canRemove = isOwner || r.position < myHighestPos;
                            return (
                              <span key={r.id} className="role-badge-small" style={{ backgroundColor: r.color }}>
                                {r.name}
                                {canRemove && <button className="role-remove-btn" onClick={() => handleRemoveRole(r.id, member.user_id)}>×</button>}
                              </span>
                            );
                          })}
                          {memberRoles.length === 0 && <span className="no-roles-text">Нет ролей</span>}
                        </div>
                      </div>
                      <div className="member-settings-actions">
                        {assignableRoles.length > 0 && (
                          <select className="role-select"
                            onChange={(e) => { if (e.target.value) { handleAssignRole(e.target.value, member.user_id); e.target.value = ''; } }}
                            defaultValue=""
                          >
                            <option value="" disabled>+ Роль</option>
                            {assignableRoles.filter(r => !memberRoles.some(mr => mr.id === r.id)).map(r => (
                              <option key={r.id} value={r.id}>{r.name}</option>
                            ))}
                          </select>
                        )}
                        {canKick && <button className="btn-small-danger" onClick={() => handleKickMember(member.user_id)}>Кик</button>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function BansTab({ serverId, token }) {
  const [bans, setBans] = React.useState([]);
  const [error, setError] = React.useState('');

  React.useEffect(() => { loadBans(); }, []);

  const loadBans = async () => {
    try { const data = await api.get(`/api/members/server/${serverId}/bans`, token); setBans(data.bans || []); }
    catch (err) { setError(err.message); }
  };

  const handleUnban = async (userId) => {
    try {
      await api.delete(`/api/members/server/${serverId}/ban/${userId}`, token);
      loadBans();
    } catch (err) { setError(err.message); }
  };

  return (
    <div className="settings-section">
      {error && <div className="auth-error">{error}</div>}
      {bans.length === 0 ? (
        <p className="roles-hint">Нет забаненных пользователей</p>
      ) : (
        <div className="members-settings-list">
          {bans.map(ban => {
            const banDate = ban.created_at ? new Date(ban.created_at.includes('Z') ? ban.created_at : ban.created_at + 'Z').toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
            return (
              <div key={ban.user_id} className="member-settings-item ban-item">
                <div className="member-settings-info">
                  <span className="member-settings-name">{ban.username}</span>
                  <span className="ban-details">
                    Забанил: <strong>{ban.banned_by_name}</strong>
                    {banDate && <> · {banDate}</>}
                  </span>
                  {ban.reason && (
                    <span className="ban-reason">Причина: {ban.reason}</span>
                  )}
                </div>
                <div className="member-settings-actions">
                  <button className="btn-small-danger" onClick={() => handleUnban(ban.user_id)}>Разбанить</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
