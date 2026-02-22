// ============================================================
// UserSettingsModal.jsx — Настройки пользователя: голос/видео и профиль (аватар)
// ============================================================

import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../utils/api';

const VOICE_STORAGE_KEYS = {
  inputDeviceId: 'rucord_voice_input_device',
  outputDeviceId: 'rucord_voice_output_device',
  inputGain: 'rucord_voice_input_gain',
  outputGain: 'rucord_voice_output_gain'
};

function loadNumber(key, def) {
  try {
    const v = localStorage.getItem(key);
    if (v != null) { const n = parseFloat(v); if (!Number.isNaN(n)) return n; }
  } catch (e) {}
  return def;
}
function saveNumber(key, value) {
  try { localStorage.setItem(key, String(value)); } catch (e) {}
}
function loadString(key, def) {
  try { const v = localStorage.getItem(key); return v != null ? v : def; } catch (e) {}
  return def;
}

export default function UserSettingsModal({ onClose, token }) {
  const { user, refreshUser } = useAuth();
  const [tab, setTab] = useState('voice'); // 'voice' | 'profile'
  const [inputDevices, setInputDevices] = useState([]);
  const [outputDevices, setOutputDevices] = useState([]);
  const [inputDeviceId, setInputDeviceId] = useState(() => loadString(VOICE_STORAGE_KEYS.inputDeviceId, ''));
  const [outputDeviceId, setOutputDeviceId] = useState(() => loadString(VOICE_STORAGE_KEYS.outputDeviceId, ''));
  const [inputGain, setInputGain] = useState(() => loadNumber(VOICE_STORAGE_KEYS.inputGain, 1));
  const [outputGain, setOutputGain] = useState(() => loadNumber(VOICE_STORAGE_KEYS.outputGain, 1));
  const [testingMic, setTestingMic] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [micTestError, setMicTestError] = useState('');
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarError, setAvatarError] = useState('');
  const [avatarLoading, setAvatarLoading] = useState(false);
  const [usernameEdit, setUsernameEdit] = useState(user?.username || '');
  const analyserRef = useRef(null);
  const streamRef = useRef(null);
  const animationRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const inputs = devices.filter(d => d.kind === 'audioinput').map(d => ({ id: d.deviceId, label: d.label || `Микрофон ${d.deviceId.slice(0, 8)}` }));
        const outputs = devices.filter(d => d.kind === 'audiooutput').map(d => ({ id: d.deviceId, label: d.label || `Динамик ${d.deviceId.slice(0, 8)}` }));
        if (!cancelled) {
          setInputDevices(inputs);
          setOutputDevices(outputs);
          if (!inputDeviceId && inputs.length) setInputDeviceId(inputs[0].id);
          if (!outputDeviceId && outputs.length) setOutputDeviceId(outputs[0].id);
        }
      } catch (e) {
        console.error(e);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    saveNumber(VOICE_STORAGE_KEYS.inputGain, inputGain);
  }, [inputGain]);
  useEffect(() => {
    saveNumber(VOICE_STORAGE_KEYS.outputGain, outputGain);
  }, [outputGain]);
  useEffect(() => {
    if (inputDeviceId) saveNumber(VOICE_STORAGE_KEYS.inputDeviceId, inputDeviceId);
  }, [inputDeviceId]);
  useEffect(() => {
    if (outputDeviceId) saveNumber(VOICE_STORAGE_KEYS.outputDeviceId, outputDeviceId);
  }, [outputDeviceId]);

  useEffect(() => {
    setUsernameEdit(user?.username || '');
  }, [user?.username]);

  // Проверка микрофона: визуализация уровня
  useEffect(() => {
    if (!testingMic) {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      setMicLevel(0);
      setMicTestError('');
      return;
    }
    setMicTestError('');
    let stream = null;
    const start = async () => {
      try {
        const constraints = { audio: inputDeviceId ? { deviceId: { exact: inputDeviceId } } : true, video: false };
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        streamRef.current = stream;
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const src = ctx.createMediaStreamSource(stream);
        const gainNode = ctx.createGain();
        gainNode.gain.value = inputGain;
        src.connect(gainNode);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        gainNode.connect(analyser);
        analyserRef.current = analyser;
        const data = new Uint8Array(analyser.frequencyBinCount);

        const tick = () => {
          if (!analyserRef.current) return;
          analyser.getByteFrequencyData(data);
          const avg = data.reduce((a, b) => a + b, 0) / data.length;
          setMicLevel(Math.min(100, Math.round(avg * 2)));
          animationRef.current = requestAnimationFrame(tick);
        };
        tick();
      } catch (e) {
        setMicTestError(e.message || 'Нет доступа к микрофону');
        setTestingMic(false);
      }
    };
    start();
    return () => {
      if (stream) stream.getTracks().forEach(t => t.stop());
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [testingMic, inputDeviceId, inputGain]);

  const handleInputDeviceChange = (e) => {
    const id = e.target.value;
    setInputDeviceId(id);
  };
  const handleOutputDeviceChange = (e) => {
    const id = e.target.value;
    setOutputDeviceId(id);
  };

  const handleAvatarChange = (e) => {
    const file = e.target.files?.[0];
    setAvatarError('');
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setAvatarError('Файл не более 5 МБ');
      return;
    }
    const ok = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file.type);
    if (!ok) {
      setAvatarError('Только изображения или GIF');
      return;
    }
    setAvatarFile(file);
  };

  const handleAvatarUpload = async () => {
    if (!avatarFile || !token) return;
    setAvatarLoading(true);
    setAvatarError('');
    try {
      const form = new FormData();
      form.append('avatar', avatarFile);
      const data = await api.postFormData('/api/auth/me/avatar', form, token);
      if (data.user) await refreshUser();
      setAvatarFile(null);
    } catch (err) {
      setAvatarError(err.message || 'Ошибка загрузки');
    } finally {
      setAvatarLoading(false);
    }
  };

  const handleSaveUsername = async () => {
    if (!usernameEdit.trim() || usernameEdit === user?.username) return;
    try {
      await api.patch('/api/auth/me', { username: usernameEdit.trim() }, token);
      await refreshUser();
    } catch (err) {
      setAvatarError(err.message || 'Ошибка');
    }
  };

  const getInitial = (name) => name ? name.charAt(0).toUpperCase() : '?';
  const getAvatarColor = (name) => {
    const colors = ['#5865f2', '#57f287', '#fee75c', '#eb459e', '#ed4245', '#3ba55c', '#faa61a', '#e67e22'];
    let hash = 0;
    for (let i = 0; i < (name || '').length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  };

  const avatarUrl = user?.avatar_url ? (user.avatar_url.startsWith('http') ? user.avatar_url : (window.__API_BASE__ || '') + user.avatar_url) : null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal user-settings-modal" onClick={e => e.stopPropagation()}>
        <button type="button" className="modal-close" onClick={onClose} aria-label="Закрыть">×</button>
        <div className="user-settings-layout">
          <aside className="user-settings-sidebar">
            <div className="user-settings-profile-preview">
              <div
                className="user-settings-avatar"
                style={avatarUrl ? { backgroundImage: `url(${avatarUrl})`, backgroundColor: 'transparent' } : { backgroundColor: getAvatarColor(user?.username) }}
              >
                {!avatarUrl && getInitial(user?.username)}
              </div>
              <span className="user-settings-username">{user?.username || 'Пользователь'}</span>
              <button type="button" className="user-settings-edit-profile" onClick={() => setTab('profile')}>
                Редактировать профиль
              </button>
            </div>
            <nav className="user-settings-nav">
              <div className="user-settings-nav-section">Настройки приложения</div>
              <button
                type="button"
                className={`user-settings-nav-item ${tab === 'voice' ? 'active' : ''}`}
                onClick={() => setTab('voice')}
              >
                Голос и видео
              </button>
              <button
                type="button"
                className={`user-settings-nav-item ${tab === 'profile' ? 'active' : ''}`}
                onClick={() => setTab('profile')}
              >
                Профиль
              </button>
            </nav>
          </aside>
          <main className="user-settings-content">
            {tab === 'voice' && (
              <>
                <h2 className="user-settings-title">Голос и видео</h2>
                <div className="user-settings-field">
                  <label>Микрофон</label>
                  <select value={inputDeviceId} onChange={handleInputDeviceChange}>
                    {inputDevices.map(d => (
                      <option key={d.id} value={d.id}>{d.label}</option>
                    ))}
                  </select>
                </div>
                <div className="user-settings-field">
                  <label>Динамик</label>
                  <select value={outputDeviceId} onChange={handleOutputDeviceChange}>
                    {outputDevices.map(d => (
                      <option key={d.id} value={d.id}>{d.label}</option>
                    ))}
                  </select>
                </div>
                <div className="user-settings-field">
                  <label>Громкость микрофона</label>
                  <input
                    type="range"
                    min="0"
                    max="2"
                    step="0.05"
                    value={inputGain}
                    onChange={e => setInputGain(parseFloat(e.target.value))}
                  />
                </div>
                <div className="user-settings-field">
                  <label>Громкость динамика</label>
                  <input
                    type="range"
                    min="0"
                    max="2"
                    step="0.05"
                    value={outputGain}
                    onChange={e => setOutputGain(parseFloat(e.target.value))}
                  />
                </div>
                <div className="user-settings-field">
                  <button
                    type="button"
                    className="user-settings-test-mic-btn"
                    onClick={() => setTestingMic(!testingMic)}
                  >
                    {testingMic ? 'Остановить проверку' : 'Проверка микрофона'}
                  </button>
                  {testingMic && (
                    <>
                      <div className="user-settings-mic-level">
                        <div className="user-settings-mic-level-bar" style={{ width: `${micLevel}%` }} />
                      </div>
                      {micTestError && <p className="user-settings-error">{micTestError}</p>}
                    </>
                  )}
                </div>
                <p className="user-settings-help">Нужна помощь с голосом или видео? Ознакомьтесь с руководством по устранению неполадок.</p>
              </>
            )}
            {tab === 'profile' && (
              <>
                <h2 className="user-settings-title">Профиль</h2>
                <div className="user-settings-field">
                  <label>Аватар (изображение или GIF, макс. 5 МБ)</label>
                  <div className="user-settings-avatar-upload">
                    <div
                      className="user-settings-avatar big"
                      style={avatarUrl ? { backgroundImage: `url(${avatarUrl})`, backgroundColor: 'transparent' } : { backgroundColor: getAvatarColor(user?.username) }}
                    >
                      {!avatarUrl && getInitial(user?.username)}
                    </div>
                    <div>
                      <input type="file" accept="image/jpeg,image/png,image/gif,image/webp" onChange={handleAvatarChange} />
                      {avatarFile && (
                        <button type="button" className="user-settings-upload-btn" onClick={handleAvatarUpload} disabled={avatarLoading}>
                          {avatarLoading ? 'Загрузка...' : 'Загрузить'}
                        </button>
                      )}
                    </div>
                  </div>
                  {avatarError && <p className="user-settings-error">{avatarError}</p>}
                </div>
                <div className="user-settings-field">
                  <label>Имя пользователя</label>
                  <input
                    type="text"
                    value={usernameEdit}
                    onChange={e => setUsernameEdit(e.target.value)}
                    maxLength={32}
                  />
                  <button type="button" className="user-settings-save-btn" onClick={handleSaveUsername}>Сохранить</button>
                </div>
              </>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
