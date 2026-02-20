// ============================================================
// DMPanel.jsx — Панель личных сообщений
// ============================================================

import React, { useState, useEffect, useRef } from 'react';
import { api } from '../../utils/api';
import { getSocket } from '../../utils/socket';

export default function DMPanel({ token, currentUserId, targetUserId, targetUsername, onClose, onlineStatuses = {}, dmUnreadMap = {}, onClearUnread }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [conversations, setConversations] = useState([]);
  const [activePartner, setActivePartner] = useState(targetUserId ? { id: targetUserId, username: targetUsername } : null);
  const messagesEndRef = useRef(null);

  useEffect(() => { loadConversations(); }, []);
  useEffect(() => {
    if (targetUserId) {
      setActivePartner({ id: targetUserId, username: targetUsername });
    }
  }, [targetUserId, targetUsername]);

  useEffect(() => {
    if (activePartner) {
      loadMessages(activePartner.id);
      if (onClearUnread) onClearUnread(activePartner.id);
    }
  }, [activePartner?.id]);

  useEffect(() => {
    if (messagesEndRef.current) messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const handler = (msg) => {
      if (activePartner && (msg.from_user_id === activePartner.id || msg.to_user_id === activePartner.id)) {
        setMessages(prev => {
          if (prev.some(m => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
        if (onClearUnread && msg.from_user_id === activePartner.id) onClearUnread(activePartner.id);
      }
      loadConversations();
    };
    socket.on('new_dm', handler);
    return () => socket.off('new_dm', handler);
  }, [activePartner?.id]);

  const loadConversations = async () => {
    try {
      const data = await api.get('/api/dm/conversations', token);
      setConversations(data.conversations || []);
    } catch (err) { console.error(err); }
  };

  const loadMessages = async (userId) => {
    try {
      const data = await api.get(`/api/dm/${userId}`, token);
      setMessages(data.messages || []);
    } catch (err) { console.error(err); }
  };

  const handleSend = (e) => {
    e.preventDefault();
    if (!text.trim() || !activePartner) return;
    const socket = getSocket();
    if (socket) {
      socket.emit('send_dm', { toUserId: activePartner.id, content: text.trim() });
    }
    setText('');
  };

  const getInitial = (name) => name ? name.charAt(0).toUpperCase() : '?';
  const getAvatarColor = (name) => {
    const colors = ['#5865f2', '#57f287', '#fee75c', '#eb459e', '#ed4245', '#3ba55c', '#faa61a', '#e67e22'];
    let hash = 0;
    for (let i = 0; i < (name || '').length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  };

  const formatTime = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr.toString().includes('Z') ? dateStr : dateStr + 'Z');
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const time = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    return isToday ? `Сегодня ${time}` : date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }) + ` ${time}`;
  };

  const getStatus = (userId) => onlineStatuses[userId] || 'offline';
  const statusColor = (userId) => {
    const s = getStatus(userId);
    return s === 'online' ? '#3ba55c' : s === 'idle' ? '#faa61a' : '#72767d';
  };

  return (
    <div className="dm-panel-overlay" onClick={onClose}>
      <div className="dm-panel" onClick={(e) => e.stopPropagation()}>
        <div className="dm-panel-header">
          <h3>Личные сообщения</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="dm-panel-body">
          {/* Conversations list */}
          <div className="dm-conversations">
            <div className="dm-conv-title">Беседы</div>
            {conversations.length === 0 && <div className="dm-empty-conv">Нет бесед</div>}
            {conversations.map(c => {
              const unread = dmUnreadMap[c.partner.id] || 0;
              return (
                <div
                  key={c.partner.id}
                  className={`dm-conv-item ${activePartner?.id === c.partner.id ? 'dm-conv-active' : ''}`}
                  onClick={() => setActivePartner(c.partner)}
                >
                  <div className="dm-conv-avatar-wrapper">
                    <div className="dm-conv-avatar" style={{ backgroundColor: getAvatarColor(c.partner.username) }}>
                      {getInitial(c.partner.username)}
                    </div>
                    <span className="dm-conv-status" style={{ backgroundColor: statusColor(c.partner.id) }} />
                  </div>
                  <div className="dm-conv-info">
                    <span className="dm-conv-name">{c.partner.username}</span>
                    <span className="dm-conv-last">{c.lastMessage ? c.lastMessage.content.slice(0, 30) : ''}</span>
                  </div>
                  {unread > 0 && <span className="dm-conv-unread">{unread > 99 ? '99+' : unread}</span>}
                </div>
              );
            })}
          </div>

          {/* Chat area */}
          <div className="dm-chat">
            {activePartner ? (
              <>
                <div className="dm-chat-header">
                  <div className="dm-chat-partner-avatar" style={{ backgroundColor: getAvatarColor(activePartner.username) }}>
                    {getInitial(activePartner.username)}
                  </div>
                  <span className="dm-chat-partner-name">{activePartner.username}</span>
                  <span className="dm-chat-partner-status" style={{ color: statusColor(activePartner.id) }}>
                    {getStatus(activePartner.id) === 'online' ? 'В сети' : getStatus(activePartner.id) === 'idle' ? 'Неактивен' : 'Не в сети'}
                  </span>
                </div>
                <div className="dm-messages">
                  {messages.length === 0 && (
                    <div className="dm-empty-messages">Начните беседу с {activePartner.username}!</div>
                  )}
                  {messages.map(msg => {
                    const isMe = msg.from_user_id === currentUserId;
                    const name = msg.from_username || (isMe ? 'Вы' : activePartner.username);
                    return (
                      <div key={msg.id} className={`dm-message ${isMe ? 'dm-message-mine' : ''}`}>
                        <div className="dm-message-avatar" style={{ backgroundColor: getAvatarColor(name) }}>
                          {getInitial(name)}
                        </div>
                        <div className="dm-message-body">
                          <div className="dm-message-header">
                            <span className="dm-message-name">{name}</span>
                            <span className="dm-message-time">{formatTime(msg.created_at)}</span>
                          </div>
                          <div className="dm-message-text">{msg.content}</div>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>
                <form onSubmit={handleSend} className="dm-input-form">
                  <input
                    type="text"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder={`Сообщение @${activePartner.username}`}
                    className="dm-input"
                    autoFocus
                  />
                  <button type="submit" className="dm-send-btn" disabled={!text.trim()}>➤</button>
                </form>
              </>
            ) : (
              <div className="dm-no-chat">
                <div className="dm-no-chat-icon">💬</div>
                <p>Выберите беседу или откройте профиль пользователя</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
