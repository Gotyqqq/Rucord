// ============================================================
// JoinServerModal.jsx — Модальное окно присоединения к серверу
// ============================================================

import React, { useState } from 'react';

export default function JoinServerModal({ onClose, onJoin }) {
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!inviteCode.trim()) return;

    setLoading(true);
    setError('');

    try {
      await onJoin(inviteCode.trim());
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Присоединиться к серверу</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body">
          {error && <div className="auth-error">{error}</div>}

          <div className="form-group">
            <label>Инвайт-код</label>
            <input
              type="text"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              placeholder="Вставьте код приглашения"
              autoFocus
            />
            <p className="form-hint">Попросите друга отправить вам код приглашения на сервер</p>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose}>Отмена</button>
            <button type="submit" className="btn-primary" disabled={loading || !inviteCode.trim()}>
              {loading ? 'Подключение...' : 'Присоединиться'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
