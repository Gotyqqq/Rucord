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

export default function VoicePanel({
  channel,
  participants,
  currentUserId,
  socket,
  onLeave
}) {
  const [muted, setMuted] = useState(false);
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

  // Индикатор речи: анализ громкости и отправка voice_speaking
  useEffect(() => {
    if (!hasLocalStream) return;
    const stream = localStreamRef.current;
    if (!stream || !socket || !channel?.id || muted) return;

    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.8;
    source.connect(analyser);

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    let lastSpeaking = false;
    let silentSince = 0;
    const SPEAK_THRESHOLD = 25;
    const SILENT_MS = 250;

    const check = () => {
      if (!localStreamRef.current || localStreamRef.current.getAudioTracks().every(t => !t.enabled)) return;
      analyser.getByteFrequencyData(dataArray);
      const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
      const speaking = avg > SPEAK_THRESHOLD;
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
  }, [channel?.id, socket, muted, hasLocalStream]);

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

    const getOrCreatePeer = (userId) => {
      if (peers[userId]) return peers[userId];
      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ],
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
          socket.emit('voice_signal', { toUserId: userId, signal: { type: 'ice', candidate: e.candidate } });
      };
      peers[userId] = pc;
      peersRef.current[userId] = pc;
      return pc;
    };

    const handleSignal = async ({ fromUserId, signal }) => {
      if (fromUserId === currentUserId) return;
      const pc = getOrCreatePeer(fromUserId);
      if (signal.type === 'offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(signal));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('voice_signal', { toUserId: fromUserId, signal: pc.localDescription });
      } else if (signal.type === 'answer') {
        await pc.setRemoteDescription(new RTCSessionDescription(signal));
      } else if (signal.candidate) {
        try { await pc.addIceCandidate(new RTCIceCandidate(signal.candidate)); } catch (e) {}
      }
    };

    socket.on('voice_signal', handleSignal);

    (async () => {
      for (const p of participants) {
        if (p.userId === currentUserId) continue;
        const pc = getOrCreatePeer(p.userId);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        trySetAudioBitrate(pc);
        socket.emit('voice_signal', { toUserId: p.userId, signal: pc.localDescription });
      }
      if (participants.filter(p => p.userId !== currentUserId).length === 0) setConnecting(false);
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
    const participantsWithoutMe = participants.filter(p => p.userId !== currentUserId);
    participantsWithoutMe.forEach(p => {
      if (!peersRef.current[p.userId]) {
        const pc = new RTCPeerConnection({
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
          ],
          bundlePolicy: 'max-bundle',
          rtcpMuxPolicy: 'require'
        });
        localStreamRef.current.getTracks().forEach(track => pc.addTrack(track, localStreamRef.current));
        pc.ontrack = (e) => {
          const stream = e.streams[0] || (e.track ? new MediaStream([e.track]) : null);
          if (stream) setRemoteStreams(prev => ({ ...prev, [p.userId]: stream }));
        };
        pc.onicecandidate = (e) => {
          if (e.candidate) socket.emit('voice_signal', { toUserId: p.userId, signal: { type: 'ice', candidate: e.candidate } });
        };
        peersRef.current[p.userId] = pc;
        pc.createOffer().then(offer => pc.setLocalDescription(offer)).then(() => {
          setAudioBitrate(pc);
          socket.emit('voice_signal', { toUserId: p.userId, signal: pc.localDescription });
        });
      }
    });
  }, [channel?.id, participants, currentUserId, socket, hasLocalStream]);

  // Принудительное воспроизведение удалённого звука (обход политики autoplay в части браузеров)
  useEffect(() => {
    const els = audioElsRef.current;
    Object.keys(els).forEach(userId => {
      const el = els[userId];
      if (el && el.srcObject && el.paused) el.play().catch(() => {});
    });
  }, [remoteStreams]);

  if (!channel) return null;

  const toggleMute = () => {
    if (!localStreamRef.current) return;
    localStreamRef.current.getTracks().forEach(t => { t.enabled = muted; });
    setMuted(!muted);
  };

  return (
    <div className="voice-panel">
      <div className="voice-panel-info">
        <span className="voice-panel-channel">🔊 {channel.name}</span>
        <span className="voice-panel-timer">{formatDuration(duration)}</span>
      </div>
      {micError && <span className="voice-panel-mic-error" title={micError}>⚠</span>}
      <div className="voice-panel-actions">
        <button
          type="button"
          className={`voice-btn ${muted ? 'voice-btn-muted' : ''}`}
          onClick={toggleMute}
          title={muted ? 'Включить микрофон' : 'Выключить микрофон'}
        >
          {muted ? '🔇' : '🎤'}
        </button>
        <button type="button" className="voice-btn voice-btn-leave" onClick={onLeave} title="Покинуть канал">
          Покинуть
        </button>
      </div>
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
            el.muted = false;
            el.play().catch(() => {});
          }}
          autoPlay
          playsInline
        />
      ))}
    </div>
  );
}
