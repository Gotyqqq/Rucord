// ============================================================
// InviteModal.jsx — Модальное окно с инвайт-кодом
// ============================================================

import React, { useState } from 'react';

function fallbackCopyText(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  ta.setAttribute('readonly', '');
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand('copy');
  } finally {
    document.body.removeChild(ta);
  }
}

export default function InviteModal({ inviteCode, onClose }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    const onSuccess = () => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    };
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      navigator.clipboard.writeText(inviteCode).then(onSuccess).catch(() => {
        fallbackCopyText(inviteCode);
        onSuccess();
      });
    } else {
      fallbackCopyText(inviteCode);
      onSuccess();
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Пригласить на сервер</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          <p style={{ marginBottom: '12px', color: '#b9bbbe' }}>
            Отправьте этот код другу, чтобы он мог присоединиться к серверу:
          </p>

          <div className="invite-code-box">
            <span className="invite-code-text">{inviteCode}</span>
            <button
              className="btn-primary"
              onClick={handleCopy}
              style={{ marginLeft: '12px', minWidth: '120px' }}
            >
              {copied ? 'Скопировано!' : 'Копировать'}
            </button>
          </div>

          <div className="modal-footer">
            <button className="btn-secondary" onClick={onClose}>Закрыть</button>
          </div>
        </div>
      </div>
    </div>
  );
}
