// ============================================================
// UserSettingsModal.jsx — Настройки пользователя: голос/видео и профиль (аватар)
// ============================================================

import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../utils/api';
import {
  VOICE_KEYS,
  loadNumber, saveNumber, loadString, saveString,
  loadBool, saveBool, notifyStorageChange
} from '../../utils/voiceConfig';

const SENSITIVITY_BARS = 24;

export default function UserSettingsModal({ onClose, token, inVoiceChannel = false, onStartMicTest, onStopMicTest }) {
  const { user, refreshUser } = useAuth();
  const [tab, setTab] = useState('voice'); // 'voice' | 'profile'
  const [inputDevices, setInputDevices] = useState([]);
  const [outputDevices, setOutputDevices] = useState([]);
  const [inputDeviceId, setInputDeviceId] = useState(() => loadString(VOICE_KEYS.inputDeviceId, ''));
  const [outputDeviceId, setOutputDeviceId] = useState(() => loadString(VOICE_KEYS.outputDeviceId, ''));
  const [inputGain, setInputGain] = useState(() => loadNumber(VOICE_KEYS.inputGain, 1));
  const [outputGain, setOutputGain] = useState(() => loadNumber(VOICE_KEYS.outputGain, 1));
  const [noiseSuppression, setNoiseSuppression] = useState(() => loadBool(VOICE_KEYS.noiseSuppression, false));
  const [sensitivityAuto, setSensitivityAuto] = useState(() => loadBool(VOICE_KEYS.sensitivityAuto, true));
  const [sensitivityThreshold, setSensitivityThreshold] = useState(() => Math.round(loadNumber(VOICE_KEYS.sensitivityThreshold, 25)));
  const [sensitivityLevel, setSensitivityLevel] = useState(0);
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
  const sensitivityStreamRef = useRef(null);
  const sensitivityAnimationRef = useRef(null);
  const sensitivityGainRef = useRef(null);
  const micTestGainRef = useRef(null);
  const loopbackAudioRef = useRef(null);

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
    saveNumber(VOICE_KEYS.inputGain, inputGain);
    notifyStorageChange(VOICE_KEYS.inputGain);
  }, [inputGain]);
  useEffect(() => {
    saveNumber(VOICE_KEYS.outputGain, outputGain);
    notifyStorageChange(VOICE_KEYS.outputGain);
  }, [outputGain]);
  useEffect(() => {
    if (inputDeviceId) {
      saveString(VOICE_KEYS.inputDeviceId, inputDeviceId);
      notifyStorageChange(VOICE_KEYS.inputDeviceId);
    }
  }, [inputDeviceId]);
  useEffect(() => {
    if (outputDeviceId) {
      saveString(VOICE_KEYS.outputDeviceId, outputDeviceId);
      notifyStorageChange(VOICE_KEYS.outputDeviceId);
    }
  }, [outputDeviceId]);
  useEffect(() => {
    saveBool(VOICE_KEYS.noiseSuppression, noiseSuppression);
    notifyStorageChange(VOICE_KEYS.noiseSuppression);
  }, [noiseSuppression]);

  useEffect(() => {
    saveBool(VOICE_KEYS.sensitivityAuto, sensitivityAuto);
    notifyStorageChange(VOICE_KEYS.sensitivityAuto);
  }, [sensitivityAuto]);
  useEffect(() => {
    saveNumber(VOICE_KEYS.sensitivityThreshold, sensitivityThreshold);
    notifyStorageChange(VOICE_KEYS.sensitivityThreshold);
  }, [sensitivityThreshold]);

  useEffect(() => {
    setUsernameEdit(user?.username || '');
  }, [user?.username]);

  // Поток и индикатор уровня для вкладки «Голос» (чувствительность + проверка микрофона)
  useEffect(() => {
    if (tab !== 'voice') {
      if (sensitivityStreamRef.current) {
        sensitivityStreamRef.current.getTracks().forEach(t => t.stop());
        sensitivityStreamRef.current = null;
      }
      if (sensitivityAnimationRef.current) cancelAnimationFrame(sensitivityAnimationRef.current);
      setSensitivityLevel(0);
      return;
    }
    let stream = null;
    const start = async () => {
      try {
        const constraints = {
          audio: inputDeviceId
            ? { deviceId: { exact: inputDeviceId }, echoCancellation: false, noiseSuppression: false, autoGainControl: false }
            : { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
          video: false
        };
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        sensitivityStreamRef.current = stream;
        sensitivityGainRef.current = null;
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const src = ctx.createMediaStreamSource(stream);
        const gainNode = ctx.createGain();
        gainNode.gain.value = inputGain;
        sensitivityGainRef.current = gainNode;
        src.connect(gainNode);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        gainNode.connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);
        const tick = () => {
          if (!sensitivityStreamRef.current) return;
          analyser.getByteFrequencyData(data);
          const avg = data.reduce((a, b) => a + b, 0) / data.length;
          setSensitivityLevel(Math.min(100, Math.round(avg * 2)));
          sensitivityAnimationRef.current = requestAnimationFrame(tick);
        };
        tick();
      } catch (e) {
        setSensitivityLevel(0);
      }
    };
    start();
    return () => {
      if (stream) stream.getTracks().forEach(t => t.stop());
      sensitivityStreamRef.current = null;
      sensitivityGainRef.current = null;
      if (sensitivityAnimationRef.current) cancelAnimationFrame(sensitivityAnimationRef.current);
    };
  }, [tab, inputDeviceId]);

  // Обновление громкости микрофона без перезапуска потока
  useEffect(() => {
    if (sensitivityGainRef.current) sensitivityGainRef.current.gain.value = inputGain;
    if (micTestGainRef.current) micTestGainRef.current.gain.value = inputGain;
  }, [inputGain]);

  // Прослушивание своего голоса (loopback) при проверке в голосовом канале
  useEffect(() => {
    if (!testingMic || !inVoiceChannel) {
      if (loopbackAudioRef.current) {
        try {
          loopbackAudioRef.current.pause();
          loopbackAudioRef.current.srcObject = null;
          if (loopbackAudioRef.current.parentNode) loopbackAudioRef.current.parentNode.removeChild(loopbackAudioRef.current);
        } catch (e) {}
        loopbackAudioRef.current = null;
      }
      return;
    }
    const stream = sensitivityStreamRef.current;
    if (stream) {
      const audio = document.createElement('audio');
      audio.autoplay = true;
      audio.volume = 1;
      audio.muted = false;
      audio.setAttribute('playsinline', '');
      audio.srcObject = stream;
      document.body.appendChild(audio);
      const play = () => audio.play().catch(() => {});
      play();
      loopbackAudioRef.current = audio;
    }
    return () => {
      if (loopbackAudioRef.current) {
        try {
          loopbackAudioRef.current.pause();
          loopbackAudioRef.current.srcObject = null;
          if (loopbackAudioRef.current.parentNode) loopbackAudioRef.current.parentNode.removeChild(loopbackAudioRef.current);
        } catch (e) {}
        loopbackAudioRef.current = null;
      }
    };
  }, [testingMic, inVoiceChannel]);

  // Проверка микрофона: визуализация уровня (используем общий поток вкладки)
  useEffect(() => {
    if (!testingMic) {
      if (streamRef.current && streamRef.current !== sensitivityStreamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
      streamRef.current = null;
      micTestGainRef.current = null;
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      setMicLevel(0);
      setMicTestError('');
      return;
    }
    if (inVoiceChannel && onStartMicTest) onStartMicTest();
    setMicTestError('');
    const stream = sensitivityStreamRef.current;
    if (stream) {
      streamRef.current = stream;
      micTestGainRef.current = null;
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const src = ctx.createMediaStreamSource(stream);
      const gainNode = ctx.createGain();
      gainNode.gain.value = inputGain;
      micTestGainRef.current = gainNode;
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
    } else {
      let newStream = null;
      (async () => {
        try {
          const constraints = {
            audio: inputDeviceId
              ? { deviceId: { exact: inputDeviceId }, echoCancellation: false, noiseSuppression: false, autoGainControl: false }
              : { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
            video: false
          };
          newStream = await navigator.mediaDevices.getUserMedia(constraints);
          streamRef.current = newStream;
          micTestGainRef.current = null;
          const ctx = new (window.AudioContext || window.webkitAudioContext)();
          const src = ctx.createMediaStreamSource(newStream);
          const gainNode = ctx.createGain();
          gainNode.gain.value = inputGain;
          micTestGainRef.current = gainNode;
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
      })();
      return () => {
        if (newStream) newStream.getTracks().forEach(t => t.stop());
        if (animationRef.current) cancelAnimationFrame(animationRef.current);
      };
    }
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [testingMic, inputDeviceId, inVoiceChannel, onStartMicTest]);

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
                <div className="user-settings-field user-settings-sensitivity">
                  <div className="user-settings-sensitivity-header">
                    <label className="user-settings-sensitivity-label">Шумоподавление (RNNoise)</label>
                    <button
                      type="button"
                      className={`user-settings-toggle ${noiseSuppression ? 'on' : ''}`}
                      onClick={() => setNoiseSuppression(!noiseSuppression)}
                      aria-pressed={noiseSuppression}
                    >
                      <span className="user-settings-toggle-track"><span className="user-settings-toggle-thumb" /></span>
                    </button>
                  </div>
                  <p className="user-settings-sensitivity-desc">Уменьшает фоновый шум микрофона (как в Discord). Для применения переподключитесь к голосовому каналу.</p>
                </div>
                <div className="user-settings-field user-settings-sensitivity">
                  <div className="user-settings-sensitivity-header">
                    <label className="user-settings-sensitivity-label">Автоматически определять чувствительность ввода</label>
                    <button
                      type="button"
                      className={`user-settings-toggle ${sensitivityAuto ? 'on' : ''}`}
                      onClick={() => setSensitivityAuto(!sensitivityAuto)}
                      aria-pressed={sensitivityAuto}
                    >
                      <span className="user-settings-toggle-track"><span className="user-settings-toggle-thumb" /></span>
                    </button>
                  </div>
                  <p className="user-settings-sensitivity-desc">Порог срабатывания индикатора речи в голосовом канале. При включённой автонастройке порог подбирается автоматически; при выключении — настраивается ползунком.</p>
                  {!sensitivityAuto && (
                    <div className="user-settings-field">
                      <div className="user-settings-sensitivity-label-row">
                        <label>Порог чувствительности (когда срабатывает индикатор речи)</label>
                        <span className="user-settings-sensitivity-value" aria-live="polite">{sensitivityThreshold}</span>
                      </div>
                      <div className="user-settings-sensitivity-slider-wrap">
                        <div className="user-settings-sensitivity-level-bg">
                          {Array.from({ length: SENSITIVITY_BARS }, (_, i) => {
                            const filled = (i / (SENSITIVITY_BARS - 1)) * 100 <= sensitivityLevel;
                            const segCenter = (i / (SENSITIVITY_BARS - 1)) * 100;
                            const isThreshold = Math.abs(segCenter - sensitivityThreshold) <= 100 / SENSITIVITY_BARS;
                            return (
                              <div
                                key={i}
                                className={`user-settings-sensitivity-segment ${filled ? 'filled' : ''} ${isThreshold ? 'threshold' : ''}`}
                              />
                            );
                          })}
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={sensitivityThreshold}
                          onChange={e => setSensitivityThreshold(Number(e.target.value))}
                          className="user-settings-sensitivity-input"
                        />
                      </div>
                    </div>
                  )}
                  {sensitivityAuto && (
                    <div className="user-settings-sensitivity-level-bg user-settings-sensitivity-level-live">
                      {Array.from({ length: SENSITIVITY_BARS }, (_, i) => {
                        const filled = (i / (SENSITIVITY_BARS - 1)) * 100 <= sensitivityLevel;
                        return <div key={i} className={`user-settings-sensitivity-segment ${filled ? 'filled' : ''}`} />;
                      })}
                    </div>
                  )}
                </div>
                <div className="user-settings-field">
                  <button
                    type="button"
                    className="user-settings-test-mic-btn"
                    onClick={() => {
                      if (testingMic) {
                        setTestingMic(false);
                        if (inVoiceChannel && onStopMicTest) onStopMicTest();
                      } else {
                        if (inVoiceChannel && onStartMicTest) onStartMicTest();
                        setTestingMic(true);
                      }
                    }}
                  >
                    {testingMic ? 'Остановить проверку' : 'Проверка микрофона'}
                  </button>
                  {inVoiceChannel && (
                    <p className="user-settings-mic-test-hint">В голосовом канале при проверке микрофон и наушники будут отключены, включится прослушивание своего голоса.</p>
                  )}
                  {testingMic && (
                    <div className="user-settings-mic-level user-settings-mic-level-segments">
                      {Array.from({ length: SENSITIVITY_BARS }, (_, i) => (
                        <div
                          key={i}
                          className={`user-settings-mic-level-segment ${(i / (SENSITIVITY_BARS - 1)) * 100 <= micLevel ? 'filled' : ''}`}
                        />
                      ))}
                    </div>
                  )}
                  {testingMic && micTestError && <p className="user-settings-error">{micTestError}</p>}
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
