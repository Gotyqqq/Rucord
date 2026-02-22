// ============================================================
// VoicePanel.jsx — Голосовой канал: вид как в Discord,
// запрос микрофона при входе, индикатор речи (зелёная рамка)
// ============================================================

import React, { useState, useEffect, useRef } from 'react';

function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h, m, s].map(v => String(v).padStart(2, '0')).join(':');
}

const SENSITIVITY_STORAGE_KEYS = {
  auto: 'rucord_voice_sensitivity_auto',
  threshold: 'rucord_voice_sensitivity_threshold'
};

const VOICE_PANEL_STORAGE_KEYS = {
  muted: 'rucord_voice_panel_muted',
  deafened: 'rucord_voice_panel_deafened'
};

function loadVoicePanelBool(key, def) {
  try {
    const v = localStorage.getItem(key);
    return v === 'true' ? true : v === 'false' ? false : def;
  } catch (e) {}
  return def;
}
function saveVoicePanelBool(key, value) {
  try {
    localStorage.setItem(key, value ? 'true' : 'false');
  } catch (e) {}
}

function getSpeakThreshold() {
  try {
    const auto = localStorage.getItem(SENSITIVITY_STORAGE_KEYS.auto);
    if (auto === 'true') return 25;
    const t = localStorage.getItem(SENSITIVITY_STORAGE_KEYS.threshold);
    if (t != null) {
      const n = parseInt(t, 10);
      if (!Number.isNaN(n) && n >= 0 && n <= 100) return Math.max(1, Math.round((n / 100) * 80));
    }
  } catch (e) {}
  return 25;
}

export default function VoicePanel({
  channel,
  participants,
  currentUserId,
  currentUsername,
  user,
  socket,
  onLeave,
  onOpenSettings,
  channelListWidth = 240,
  micTestMode = false,
  onMicTestModeChange
}) {
  const [muted, setMuted] = useState(() => loadVoicePanelBool(VOICE_PANEL_STORAGE_KEYS.muted, false));
  const [deafened, setDeafened] = useState(() => loadVoicePanelBool(VOICE_PANEL_STORAGE_KEYS.deafened, false));
  const [connecting, setConnecting] = useState(true);
  const [remoteStreams, setRemoteStreams] = useState({});
  const [speakingUsers, setSpeakingUsers] = useState({});
  const [micError, setMicError] = useState(null);
  const [duration, setDuration] = useState(0);
  const [hasLocalStream, setHasLocalStream] = useState(false);
  const localStreamRef = useRef(null);
  const peersRef = useRef({});
  const joinTimeRef = useRef(Date.now());
  const speakingIntervalRef = useRef(null);
  const analyserRef = useRef(null);
  const audioContextRef = useRef(null);
  const audioElsRef = useRef({});
  const savedMutedRef = useRef(false);
  const savedDeafenedRef = useRef(false);

  // Запрос микрофона сразу при входе в канал (первым делом)
  useEffect(() => {
    if (!channel?.id) return;
    setMicError(null);
    joinTimeRef.current = Date.now();
    setDuration(0);

    const getStream = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            sampleRate: { ideal: 48000 },
            channelCount: { ideal: 1 }
          },
          video: false
        });
        localStreamRef.current = stream;
        setHasLocalStream(true);
        setConnecting(false);
        const savedMuted = loadVoicePanelBool(VOICE_PANEL_STORAGE_KEYS.muted, false);
        stream.getAudioTracks().forEach(t => { t.enabled = !savedMuted; });
      } catch (err) {
        console.error('Voice getUserMedia:', err);
        setMicError(err.message || 'Нет доступа к микрофону');
        setConnecting(false);
      }
    };
    getStream();
    return () => setHasLocalStream(false);
  }, [channel?.id]);

  // Таймер в канале
  useEffect(() => {
    if (!channel?.id) return;
    const t = setInterval(() => {
      setDuration(Math.floor((Date.now() - joinTimeRef.current) / 1000));
    }, 1000);
    return () => clearInterval(t);
  }, [channel?.id]);

  // Режим проверки микрофона: мьют, deafen, loopback
  useEffect(() => {
    if (!micTestMode) {
      setMuted(savedMutedRef.current);
      setDeafened(savedDeafenedRef.current);
      return;
    }
    savedMutedRef.current = muted;
    savedDeafenedRef.current = deafened;
    setMuted(true);
    setDeafened(true);
    const stream = localStreamRef.current;
    if (stream) stream.getAudioTracks().forEach(t => { t.enabled = false; });
    if (socket && channel?.id) socket.emit('voice_muted', { channelId: channel.id, muted: true });
    if (socket && channel?.id) socket.emit('voice_deafened', { channelId: channel.id, deafened: true });
    return () => {
      const s = localStreamRef.current;
      if (s) s.getAudioTracks().forEach(t => { t.enabled = !savedMutedRef.current; });
      setMuted(savedMutedRef.current);
      setDeafened(savedDeafenedRef.current);
      if (socket && channel?.id) {
        socket.emit('voice_muted', { channelId: channel.id, muted: savedMutedRef.current });
        socket.emit('voice_deafened', { channelId: channel.id, deafened: savedDeafenedRef.current });
      }
    };
  }, [micTestMode]);

  // Индикатор речи: анализ громкости и отправка voice_speaking
  useEffect(() => {
    if (!hasLocalStream) return;
    const stream = localStreamRef.current;
    if (!stream || !socket || !channel?.id || muted || micTestMode) return;

    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.8;
    source.connect(analyser);

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    let lastSpeaking = false;
    let silentSince = 0;
    const SILENT_MS = 250;

    const check = () => {
      if (!localStreamRef.current || localStreamRef.current.getAudioTracks().every(t => !t.enabled)) return;
      const speakThreshold = getSpeakThreshold();
      analyser.getByteFrequencyData(dataArray);
      const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
      const speaking = avg > speakThreshold;
      if (speaking) {
        silentSince = 0;
        if (!lastSpeaking) {
          lastSpeaking = true;
          socket.emit('voice_speaking', { channelId: channel.id, speaking: true });
        }
      } else {
        if (lastSpeaking) {
          silentSince = silentSince || Date.now();
          if (Date.now() - silentSince >= SILENT_MS) {
            lastSpeaking = false;
            silentSince = 0;
            socket.emit('voice_speaking', { channelId: channel.id, speaking: false });
          }
        }
      }
    };

    const id = setInterval(check, 100);
    speakingIntervalRef.current = id;
    audioContextRef.current = audioContext;
    analyserRef.current = analyser;

    return () => {
      clearInterval(id);
      try { audioContext.close(); } catch (e) {}
    };
  }, [channel?.id, socket, muted, hasLocalStream, micTestMode]);

  // Слушаем индикатор речи от других
  useEffect(() => {
    if (!socket) return;
    const onSpeaking = ({ userId, speaking }) => {
      setSpeakingUsers(prev => ({ ...prev, [userId]: speaking }));
    };
    socket.on('voice_speaking', onSpeaking);
    return () => socket.off('voice_speaking', onSpeaking);
  }, [socket]);

  // WebRTC: подключение к участникам (после получения потока)
  useEffect(() => {
    if (!channel || !socket || !hasLocalStream || !localStreamRef.current) return;
    const channelId = channel.id;
    const localStream = localStreamRef.current;
    let peers = {};
    const remoteStreamsMap = {};

    const cleanup = () => {
      socket.emit('leave_voice_channel', channelId);
      Object.values(peers).forEach(pc => { try { pc.close(); } catch (e) {} });
      peersRef.current = {};
      setRemoteStreams({});
    };

    const trySetAudioBitrate = (connection, maxBitrate = 64000) => {
      connection.getSenders().forEach(sender => {
        if (sender.track && sender.track.kind === 'audio') {
          sender.getParameters().then(params => {
            if (params.encodings && params.encodings[0]) {
              params.encodings[0].maxBitrate = maxBitrate;
              return sender.setParameters(params);
            }
          }).catch(() => {});
        }
      });
    };

    const iceServers = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' }
    ];
    const pendingCandidates = {};
    const flushIceCandidates = async (pc, userId) => {
      const pending = pendingCandidates[userId];
      if (!pending || pending.length === 0) return;
      for (const c of pending) {
        try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch (err) {}
      }
      pendingCandidates[userId] = [];
    };

    const getOrCreatePeer = (userId) => {
      if (peers[userId]) return peers[userId];
      const pc = new RTCPeerConnection({
        iceServers,
        bundlePolicy: 'max-bundle',
        rtcpMuxPolicy: 'require'
      });
      if (localStream) localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
      pc.ontrack = (e) => {
        const stream = e.streams[0] || e.track ? new MediaStream([e.track]) : null;
        if (stream) {
          remoteStreamsMap[userId] = stream;
          setRemoteStreams(prev => ({ ...prev, [userId]: stream }));
          setConnecting(false);
        }
      };
      pc.onicecandidate = (e) => {
        if (e.candidate)
          socket.emit('voice_signal', { toUserId: Number(userId), signal: { type: 'ice', candidate: e.candidate } });
      };
      peers[userId] = pc;
      peersRef.current[userId] = pc;
      if (!pendingCandidates[userId]) pendingCandidates[userId] = [];
      return pc;
    };

    const handleSignal = async ({ fromUserId, signal }) => {
      const fromId = Number(fromUserId);
      if (fromId === currentUserId) return;
      const pc = getOrCreatePeer(fromId);
      if (signal.type === 'offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(signal));
        await flushIceCandidates(pc, fromId);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('voice_signal', { toUserId: fromId, signal: pc.localDescription });
      } else if (signal.type === 'answer') {
        await pc.setRemoteDescription(new RTCSessionDescription(signal));
        await flushIceCandidates(pc, fromId);
      } else if (signal.candidate) {
        if (pc.remoteDescription) {
          try { await pc.addIceCandidate(new RTCIceCandidate(signal.candidate)); } catch (e) {}
        } else {
          if (!pendingCandidates[fromId]) pendingCandidates[fromId] = [];
          pendingCandidates[fromId].push(signal.candidate);
        }
      }
    };

    socket.on('voice_signal', handleSignal);

    (async () => {
      for (const p of participants) {
        const peerId = Number(p.userId);
        if (peerId === currentUserId) continue;
        const pc = getOrCreatePeer(peerId);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        trySetAudioBitrate(pc);
        socket.emit('voice_signal', { toUserId: peerId, signal: pc.localDescription });
      }
      if (participants.filter(p => Number(p.userId) !== currentUserId).length === 0) setConnecting(false);
    })();

    return () => {
      socket.off('voice_signal', handleSignal);
      cleanup();
    };
  }, [channel?.id, currentUserId, socket, hasLocalStream]);

  // Новый участник — создаём offer
  useEffect(() => {
    if (!channel || !socket || !hasLocalStream || !localStreamRef.current) return;
    const setAudioBitrate = (connection, maxBitrate = 64000) => {
      connection.getSenders().forEach(sender => {
        if (sender.track && sender.track.kind === 'audio') {
          sender.getParameters().then(params => {
            if (params.encodings && params.encodings[0]) {
              params.encodings[0].maxBitrate = maxBitrate;
              return sender.setParameters(params);
            }
          }).catch(() => {});
        }
      });
    };
    const iceServers = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' }
    ];
    const participantsWithoutMe = participants.filter(p => Number(p.userId) !== currentUserId);
    participantsWithoutMe.forEach(p => {
      const peerId = Number(p.userId);
      if (!peersRef.current[peerId]) {
        const pc = new RTCPeerConnection({
          iceServers,
          bundlePolicy: 'max-bundle',
          rtcpMuxPolicy: 'require'
        });
        localStreamRef.current.getTracks().forEach(track => pc.addTrack(track, localStreamRef.current));
        pc.ontrack = (e) => {
          const stream = e.streams[0] || (e.track ? new MediaStream([e.track]) : null);
          if (stream) setRemoteStreams(prev => ({ ...prev, [peerId]: stream }));
        };
        pc.onicecandidate = (e) => {
          if (e.candidate) socket.emit('voice_signal', { toUserId: peerId, signal: { type: 'ice', candidate: e.candidate } });
        };
        peersRef.current[peerId] = pc;
        pc.createOffer().then(offer => pc.setLocalDescription(offer)).then(() => {
          setAudioBitrate(pc);
          socket.emit('voice_signal', { toUserId: peerId, signal: pc.localDescription });
        });
      }
    });
  }, [channel?.id, participants, currentUserId, socket, hasLocalStream]);

  // Принудительное воспроизведение удалённого звука (обход политики autoplay в части браузеров)
  useEffect(() => {
    const els = audioElsRef.current;
    Object.keys(els).forEach(userId => {
      const el = els[userId];
      if (el && el.srcObject && !el.muted && el.paused) el.play().catch(() => {});
    });
  }, [remoteStreams]);

  // Периодическая попытка воспроизведения (на случай, если поток пришёл с задержкой после блокировки autoplay)
  useEffect(() => {
    if (!channel?.id || Object.keys(remoteStreams).length === 0) return;
    const id = setInterval(() => {
      Object.values(audioElsRef.current).forEach(el => {
        if (el && el.srcObject && !el.muted && el.paused) el.play().catch(() => {});
      });
    }, 2000);
    return () => clearInterval(id);
  }, [channel?.id, remoteStreams]);

  // Синхронизация «выключить звук»: заглушаем все удалённые потоки
  useEffect(() => {
    const els = audioElsRef.current;
    Object.keys(els).forEach(userId => {
      const el = els[userId];
      if (el) el.muted = deafened;
    });
  }, [deafened]);

  // При входе в канал отправляем серверу сохранённое состояние микрофона и наушников
  useEffect(() => {
    if (!channel?.id || !socket || !hasLocalStream) return;
    socket.emit('voice_muted', { channelId: channel.id, muted });
    socket.emit('voice_deafened', { channelId: channel.id, deafened });
  }, [channel?.id, socket, hasLocalStream]);

  const inVoice = !!channel;

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    saveVoicePanelBool(VOICE_PANEL_STORAGE_KEYS.muted, next);
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(t => { t.enabled = !next; });
    }
    if (socket && channel?.id) socket.emit('voice_muted', { channelId: channel.id, muted: next });
  };

  const toggleDeafen = () => {
    const next = !deafened;
    setDeafened(next);
    saveVoicePanelBool(VOICE_PANEL_STORAGE_KEYS.deafened, next);
    if (socket && channel?.id) socket.emit('voice_deafened', { channelId: channel.id, deafened: next });
  };

  const getInitial = (name) => name ? name.charAt(0).toUpperCase() : '?';
  const getAvatarColor = (name) => {
    const colors = ['#5865f2', '#57f287', '#fee75c', '#eb459e', '#ed4245', '#3ba55c', '#faa61a', '#e67e22'];
    let hash = 0;
    for (let i = 0; i < (name || '').length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  };
  const avatarUrl = user?.avatar_url ? (user.avatar_url.startsWith('http') ? user.avatar_url : (window.__API_BASE__ || '') + user.avatar_url) : null;

  const playAllRemoteAudio = () => {
    Object.values(audioElsRef.current).forEach(el => {
      if (el && el.srcObject && !el.muted) el.play().catch(() => {});
    });
  };

  return (
    <div
      className="voice-panel voice-panel-corner"
      style={{ width: Math.max(200, channelListWidth - 16), maxWidth: channelListWidth - 16 }}
      onClick={playAllRemoteAudio}
    >
      <div className="voice-panel-user-row">
        <div
          className="voice-panel-user-avatar"
          style={avatarUrl ? { backgroundImage: `url(${avatarUrl})`, backgroundColor: 'transparent' } : { backgroundColor: getAvatarColor(currentUsername || user?.username) }}
        >
          {!avatarUrl && getInitial(currentUsername || user?.username)}
        </div>
        <div className="voice-panel-user-info">
          <span className="voice-panel-username">{currentUsername || user?.username || 'Вы'}</span>
          <span className="voice-panel-user-status">Невидимый</span>
        </div>
        <div className="voice-panel-user-actions">
          {inVoice && (
            <div className="voice-panel-leave-row">
              <button type="button" className="voice-panel-leave-btn" onClick={onLeave} title="Покинуть голосовой канал">
                <span className="voice-panel-leave-icon" aria-hidden>×</span>
                <span className="voice-panel-leave-text">Покинуть</span>
              </button>
            </div>
          )}
          <div className="voice-panel-controls-row">
            <button
              type="button"
              className={`voice-panel-mic-btn ${muted ? 'muted' : ''}`}
              onClick={toggleMute}
              title={muted ? 'Включить микрофон' : 'Выключить микрофон'}
            >
              {muted ? (
                <svg className="voice-panel-mic-icon voice-panel-mic-icon-off" viewBox="0 0 16 16" fill="currentColor" width="16" height="16" aria-hidden>
                  <path d="M8 1a2 2 0 0 1 2 2v4a2 2 0 0 1-4 0V3a2 2 0 0 1 2-2z" />
                  <path d="M5 7v2a3 3 0 0 0 6 0V7h1v2a4 4 0 0 1-8 0V7h1z" />
                  <path d="M2 2L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
                </svg>
              ) : (
                <span className="voice-panel-mic-icon">🎤</span>
              )}
              <span className="voice-panel-mic-arrow">▾</span>
            </button>
            <button
              type="button"
              className={`voice-panel-headphone-btn ${deafened ? 'deafened' : ''}`}
              onClick={toggleDeafen}
              title={deafened ? 'Включить звук' : 'Выключить звук'}
            >
              <span className={`voice-panel-headphone-icon ${deafened ? 'voice-panel-headphone-icon-off' : ''}`}>🎧</span>
              <span className="voice-panel-mic-arrow">▾</span>
            </button>
            <button type="button" className="voice-panel-gear-btn" onClick={() => onOpenSettings?.()} title="Настройки пользователя">⚙</button>
          </div>
        </div>
      </div>
      {micError && <span className="voice-panel-mic-error" title={micError}>⚠</span>}
      {inVoice && Object.keys(remoteStreams).length > 0 && !deafened && (
        <button
          type="button"
          className="voice-panel-enable-sound-btn"
          onClick={e => { e.stopPropagation(); playAllRemoteAudio(); }}
        >
          Включить звук участников
        </button>
      )}
      {Object.entries(remoteStreams).map(([userId, stream]) => (
        <audio
          key={userId}
          ref={el => {
            if (!el) {
              delete audioElsRef.current[userId];
              return;
            }
            audioElsRef.current[userId] = el;
            el.srcObject = stream;
            el.muted = deafened;
            el.play().catch(() => {});
          }}
          autoPlay
          playsInline
        />
      ))}
    </div>
  );
}
