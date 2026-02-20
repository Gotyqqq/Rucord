// ============================================================
// ChannelSettingsModal.jsx — Настройки канала (slowmode и т.д.)
// ============================================================

import React, { useState } from 'react';
import { api } from '../../utils/api';
import { useAuth } from '../../context/AuthContext';

const slowmodeOptions = [
  { value: 0, label: 'Выкл' },
  { value: 5, label: '5 секунд' },
  { value: 10, label: '10 секунд' },
  { value: 15, label: '15 секунд' },
  { value: 30, label: '30 секунд' },
  { value: 60, label: '1 минута' },
  { value: 120, label: '2 минуты' },
  { value: 300, label: '5 минут' },
  { value: 600, label: '10 минут' },
];

export default function ChannelSettingsModal({ channel, onClose, onUpdated }) {
  const { token } = useAuth();
  const [channelName, setChannelName] = useState(channel.name);
  const [slowmode, setSlowmode] = useState(channel.slowmode || 0);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSaveSlowmode = async () => {
    try {
      setError('');
      await api.put(`/api/channels/${channel.id}/slowmode`, { slowmode }, token);
      setSuccess('Сохранено!');
      onUpdated && onUpdated();
      setTimeout(() => setSuccess(''), 2000);
    } catch (err) { setError(err.message); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
        <div className="modal-header">
          <h2># {channel.name}</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {error && <div className="auth-error" style={{ marginBottom: 12 }}>{error}</div>}
          {success && <div className="auth-success" style={{ marginBottom: 12 }}>{success}</div>}

          <div className="form-group" style={{ marginBottom: 20 }}>
            <label>Медленный режим (Slowmode)</label>
            <p style={{ color: '#72767d', fontSize: 13, margin: '4px 0 10px' }}>
              Ограничивает частоту отправки сообщений. Владелец сервера не ограничен.
            </p>
            <div className="slowmode-options">
              {slowmodeOptions.map(o => (
                <button
                  key={o.value}
                  className={`slowmode-option-btn ${slowmode === o.value ? 'slowmode-option-active' : ''}`}
                  onClick={() => setSlowmode(o.value)}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <button className="btn-primary" onClick={handleSaveSlowmode}>Сохранить</button>
        </div>
      </div>
    </div>
  );
}
