// ============================================================
// VoicePanel.jsx — Голосовой канал: WebRTC P2P, audio pipeline
// с реальным gain, VAD, device switching, reconnection
// ============================================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, MicOff, Headphones, Settings, X } from 'lucide-react';
import { HeadphonesOff } from '../ui/HeadphonesOff';
import {
  ICE_SERVERS, AUDIO_BITRATE, VOICE_KEYS,
  loadNumber, loadString, loadBool, saveBool,
  setAudioBitrate, getSpeakThreshold, getNoiseSuppressorWorkletUrl
} from '../../utils/voiceConfig';

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
  currentUsername, currentDisplayName,
  user,
  socket,
  onLeave,
  onOpenSettings,
  channelListWidth = 240,
  micTestMode = false,
  onMicTestModeChange
}) {
  const [muted, setMuted] = useState(() => loadBool(VOICE_KEYS.muted, false));
  const [deafened, setDeafened] = useState(() => loadBool(VOICE_KEYS.deafened, false));
  const [connecting, setConnecting] = useState(true);
  const [remoteStreams, setRemoteStreams] = useState({});
  const [speakingUsers, setSpeakingUsers] = useState({});
  const [micError, setMicError] = useState(null);
  const [duration, setDuration] = useState(0);
  const [hasLocalStream, setHasLocalStream] = useState(false);
  const [peerStates, setPeerStates] = useState({});

  // ---- Refs ----
  const rawStreamRef = useRef(null);
  const processedStreamRef = useRef(null);
  const audioCtxRef = useRef(null);
  const sourceNodeRef = useRef(null);
  const gainNodeRef = useRef(null);
  const analyserRef = useRef(null);
  const gateNodeRef = useRef(null);
  const destinationRef = useRef(null);
  const noiseSuppressorNodeRef = useRef(null);
  const peersRef = useRef({});
  const pendingCandidatesRef = useRef({});
  const joinTimeRef = useRef(Date.now());
  const speakingIntervalRef = useRef(null);
  const audioElsRef = useRef({});
  const savedMutedRef = useRef(false);
  const savedDeafenedRef = useRef(false);
  const iceRestartCountRef = useRef({});

  // ---- Settings from localStorage, reactive via storage event ----
  const [inputDeviceId, setInputDeviceId] = useState(() => loadString(VOICE_KEYS.inputDeviceId, ''));
  const [inputGain, setInputGain] = useState(() => loadNumber(VOICE_KEYS.inputGain, 1));
  const [outputDeviceId, setOutputDeviceId] = useState(() => loadString(VOICE_KEYS.outputDeviceId, ''));
  const [outputGain, setOutputGain] = useState(() => loadNumber(VOICE_KEYS.outputGain, 1));

  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === VOICE_KEYS.inputDeviceId) setInputDeviceId(loadString(VOICE_KEYS.inputDeviceId, ''));
      if (e.key === VOICE_KEYS.inputGain) setInputGain(loadNumber(VOICE_KEYS.inputGain, 1));
      if (e.key === VOICE_KEYS.outputDeviceId) setOutputDeviceId(loadString(VOICE_KEYS.outputDeviceId, ''));
      if (e.key === VOICE_KEYS.outputGain) setOutputGain(loadNumber(VOICE_KEYS.outputGain, 1));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // ---- Apply inputGain to the live GainNode ----
  useEffect(() => {
    if (gainNodeRef.current) gainNodeRef.current.gain.value = inputGain;
  }, [inputGain]);

  // ---- Apply outputGain + outputDeviceId to all remote audio elements ----
  useEffect(() => {
    Object.values(audioElsRef.current).forEach(el => {
      if (el) el.volume = Math.max(0, Math.min(1, outputGain));
    });
  }, [outputGain]);

  useEffect(() => {
    if (!outputDeviceId) return;
    Object.values(audioElsRef.current).forEach(el => {
      if (el?.setSinkId) el.setSinkId(outputDeviceId).catch(() => {});
    });
  }, [outputDeviceId]);

  // ---- Audio pipeline: getUserMedia -> GainNode -> destination (for peers) + analyser (for VAD) ----
  const buildAudioPipeline = useCallback(async (deviceId) => {
    const constraints = {
      audio: {
        ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: { ideal: 48000 },
        channelCount: { ideal: 1 }
      },
      video: false
    };

    const stream = await navigator.mediaDevices.getUserMedia(constraints);

    const ctx = audioCtxRef.current || new (window.AudioContext || window.webkitAudioContext)();
    audioCtxRef.current = ctx;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});

    const source = ctx.createMediaStreamSource(stream);
    const gain = ctx.createGain();
    gain.gain.value = inputGain;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.8;
    const destination = ctx.createMediaStreamDestination();

    const gate = ctx.createGain();
    gate.gain.value = 1;

    source.connect(gain);
    gain.connect(analyser);
    const useNoiseSuppression = loadBool(VOICE_KEYS.noiseSuppression, false);
    let noiseNode = null;
    if (useNoiseSuppression) {
      try {
        await ctx.audioWorklet.addModule(getNoiseSuppressorWorkletUrl());
        noiseNode = new AudioWorkletNode(ctx, 'NoiseSuppressorWorklet');
        gain.connect(noiseNode);
        noiseNode.connect(gate);
      } catch (err) {
        console.warn('RNNoise worklet failed, using pipeline without noise suppression:', err);
        gain.connect(gate);
      }
    } else {
      gain.connect(gate);
    }
    gate.connect(destination);

    rawStreamRef.current = stream;
    processedStreamRef.current = destination.stream;
    sourceNodeRef.current = source;
    gainNodeRef.current = gain;
    analyserRef.current = analyser;
    gateNodeRef.current = gate;
    destinationRef.current = destination;
    noiseSuppressorNodeRef.current = noiseNode;

    return { rawStream: stream, processedStream: destination.stream };
  }, [inputGain]);

  const teardownAudioPipeline = useCallback(() => {
    if (rawStreamRef.current) rawStreamRef.current.getTracks().forEach(t => t.stop());
    rawStreamRef.current = null;
    processedStreamRef.current = null;
    if (noiseSuppressorNodeRef.current) { try { noiseSuppressorNodeRef.current.disconnect(); } catch (e) {} }
    noiseSuppressorNodeRef.current = null;
    if (sourceNodeRef.current) { try { sourceNodeRef.current.disconnect(); } catch (e) {} }
    sourceNodeRef.current = null;
    gainNodeRef.current = null;
    analyserRef.current = null;
    gateNodeRef.current = null;
    destinationRef.current = null;
  }, []);

  // ---- Peer connection factory (single source of truth) ----
  const createPeerConnection = useCallback((userId, processedStream, socketRef) => {
    const pc = new RTCPeerConnection({
      iceServers: ICE_SERVERS,
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require'
    });

    if (processedStream) {
      processedStream.getTracks().forEach(track => pc.addTrack(track, processedStream));
    }

    pc.ontrack = (e) => {
      const stream = e.streams[0] || (e.track ? new MediaStream([e.track]) : null);
      if (stream) {
        console.log('[Голос] Получен аудиопоток от участника', userId);
        setRemoteStreams(prev => ({ ...prev, [userId]: stream }));
        setConnecting(false);
      }
    };

    pc.onicecandidate = (e) => {
      if (e.candidate && socketRef) {
        socketRef.emit('voice_signal', {
          toUserId: Number(userId),
          signal: { type: 'ice', candidate: e.candidate }
        });
      }
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      setPeerStates(prev => ({ ...prev, [userId]: state }));

      if (state === 'failed') {
        const count = (iceRestartCountRef.current[userId] || 0) + 1;
        iceRestartCountRef.current[userId] = count;

        if (count <= 2) {
          pc.restartIce();
          pc.createOffer({ iceRestart: true }).then(offer => {
            pc.setLocalDescription(offer);
            if (socketRef) {
              socketRef.emit('voice_signal', { toUserId: Number(userId), signal: offer });
            }
          }).catch(() => {});
        } else {
          // Full reconnection: close and rebuild
          try { pc.close(); } catch (e) {}
          delete peersRef.current[userId];
          setPeerStates(prev => { const n = { ...prev }; delete n[userId]; return n; });
          setRemoteStreams(prev => { const n = { ...prev }; delete n[userId]; return n; });
          iceRestartCountRef.current[userId] = 0;

          if (processedStreamRef.current && socketRef) {
            const newPc = createPeerConnection(userId, processedStreamRef.current, socketRef);
            peersRef.current[userId] = newPc;
            pendingCandidatesRef.current[userId] = [];
            newPc.createOffer().then(offer => {
              newPc.setLocalDescription(offer);
              setAudioBitrate(newPc);
              socketRef.emit('voice_signal', { toUserId: Number(userId), signal: offer });
            }).catch(() => {});
          }
        }
      }
      if (state === 'connected') {
        iceRestartCountRef.current[userId] = 0;
        console.log('[Голос] Соединение с участником', userId, 'установлено');
      }
    };

    if (!pendingCandidatesRef.current[userId]) pendingCandidatesRef.current[userId] = [];
    peersRef.current[userId] = pc;
    return pc;
  }, []);

  // ---- Flush queued ICE candidates ----
  const flushIceCandidates = useCallback(async (pc, userId) => {
    const pending = pendingCandidatesRef.current[userId];
    if (!pending?.length) return;
    for (const c of pending) {
      try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch (e) {}
    }
    pendingCandidatesRef.current[userId] = [];
  }, []);

  // ---- Get microphone on channel join ----
  useEffect(() => {
    if (!channel?.id) return;
    setMicError(null);
    joinTimeRef.current = Date.now();
    setDuration(0);

    let cancelled = false;
    (async () => {
      try {
        await buildAudioPipeline(inputDeviceId);
        if (cancelled) { teardownAudioPipeline(); return; }
        setHasLocalStream(true);
        setConnecting(false);
        const savedMuted = loadBool(VOICE_KEYS.muted, false);
        if (savedMuted && rawStreamRef.current) {
          rawStreamRef.current.getAudioTracks().forEach(t => { t.enabled = false; });
        }
      } catch (err) {
        if (!cancelled) {
          setMicError(err.message || 'Нет доступа к микрофону');
          setConnecting(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      setHasLocalStream(false);
    };
  }, [channel?.id]);

  // ---- Hot-swap input device via replaceTrack ----
  useEffect(() => {
    if (!channel?.id || !hasLocalStream) return;
    // Skip initial mount — only react to changes
    const currentTrack = rawStreamRef.current?.getAudioTracks()[0];
    const currentDeviceId = currentTrack?.getSettings?.()?.deviceId;
    if (!inputDeviceId || currentDeviceId === inputDeviceId) return;

    let cancelled = false;
    (async () => {
      try {
        const oldRaw = rawStreamRef.current;
        const constraints = {
          audio: {
            deviceId: { exact: inputDeviceId },
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            sampleRate: { ideal: 48000 },
            channelCount: { ideal: 1 }
          },
          video: false
        };
        const newRaw = await navigator.mediaDevices.getUserMedia(constraints);
        if (cancelled) { newRaw.getTracks().forEach(t => t.stop()); return; }

        // Disconnect old source, connect new one to existing gain node
        if (sourceNodeRef.current) { try { sourceNodeRef.current.disconnect(); } catch (e) {} }
        const ctx = audioCtxRef.current;
        const newSource = ctx.createMediaStreamSource(newRaw);
        newSource.connect(gainNodeRef.current);
        sourceNodeRef.current = newSource;

        // Apply mute state to new raw tracks
        newRaw.getAudioTracks().forEach(t => { t.enabled = !muted; });

        // Stop old raw stream
        if (oldRaw) oldRaw.getTracks().forEach(t => t.stop());
        rawStreamRef.current = newRaw;

        // Replace tracks in all peer connections
        const newProcessedTrack = processedStreamRef.current?.getAudioTracks()[0];
        if (newProcessedTrack) {
          Object.values(peersRef.current).forEach(pc => {
            pc.getSenders().forEach(sender => {
              if (sender.track?.kind === 'audio') {
                sender.replaceTrack(newProcessedTrack).catch(() => {});
              }
            });
          });
        }
      } catch (err) {
        console.error('Device switch failed:', err);
      }
    })();

    return () => { cancelled = true; };
  }, [inputDeviceId, channel?.id, hasLocalStream, muted]);

  // ---- Timer ----
  useEffect(() => {
    if (!channel?.id) return;
    const t = setInterval(() => {
      setDuration(Math.floor((Date.now() - joinTimeRef.current) / 1000));
    }, 1000);
    return () => clearInterval(t);
  }, [channel?.id]);

  // ---- Mic test mode ----
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
    if (rawStreamRef.current) rawStreamRef.current.getAudioTracks().forEach(t => { t.enabled = false; });
    if (socket && channel?.id) socket.emit('voice_muted', { channelId: channel.id, muted: true });
    if (socket && channel?.id) socket.emit('voice_deafened', { channelId: channel.id, deafened: true });
    return () => {
      const s = rawStreamRef.current;
      if (s) s.getAudioTracks().forEach(t => { t.enabled = !savedMutedRef.current; });
      setMuted(savedMutedRef.current);
      setDeafened(savedDeafenedRef.current);
      if (socket && channel?.id) {
        socket.emit('voice_muted', { channelId: channel.id, muted: savedMutedRef.current });
        socket.emit('voice_deafened', { channelId: channel.id, deafened: savedDeafenedRef.current });
      }
    };
  }, [micTestMode]);

  // ---- Voice Activity Detection + Noise Gate ----
  useEffect(() => {
    if (!hasLocalStream || !socket || !channel?.id || muted || micTestMode) return;
    const analyser = analyserRef.current;
    const gate = gateNodeRef.current;
    if (!analyser) return;

    // Open gate initially
    if (gate) gate.gain.value = 1;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    let lastSpeaking = false;
    let silentSince = 0;
    const SILENT_MS = 250;
    const RAMP_MS = 0.015; // 15ms ramp to avoid clicks

    const check = () => {
      if (!rawStreamRef.current || rawStreamRef.current.getAudioTracks().every(t => !t.enabled)) return;
      const speakThreshold = getSpeakThreshold();
      analyser.getByteFrequencyData(dataArray);
      const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
      const speaking = avg > speakThreshold;
      if (speaking) {
        silentSince = 0;
        if (!lastSpeaking) {
          lastSpeaking = true;
          // Open the noise gate — audio flows to peers
          if (gate) {
            gate.gain.cancelScheduledValues(audioCtxRef.current.currentTime);
            gate.gain.linearRampToValueAtTime(1, audioCtxRef.current.currentTime + RAMP_MS);
          }
          socket.emit('voice_speaking', { channelId: channel.id, speaking: true });
        }
      } else if (lastSpeaking) {
        silentSince = silentSince || Date.now();
        if (Date.now() - silentSince >= SILENT_MS) {
          lastSpeaking = false;
          silentSince = 0;
          // Close the noise gate — silence to peers
          if (gate) {
            gate.gain.cancelScheduledValues(audioCtxRef.current.currentTime);
            gate.gain.linearRampToValueAtTime(0, audioCtxRef.current.currentTime + RAMP_MS);
          }
          socket.emit('voice_speaking', { channelId: channel.id, speaking: false });
        }
      }
    };

    const id = setInterval(check, 100);
    speakingIntervalRef.current = id;
    return () => {
      clearInterval(id);
      // Re-open gate on cleanup so audio isn't stuck muted
      if (gate) gate.gain.value = 1;
    };
  }, [channel?.id, socket, muted, hasLocalStream, micTestMode]);

  // ---- Speaking indicators from others ----
  useEffect(() => {
    if (!socket) return;
    const onSpeaking = ({ userId, speaking }) => {
      setSpeakingUsers(prev => ({ ...prev, [userId]: speaking }));
    };
    socket.on('voice_speaking', onSpeaking);
    return () => socket.off('voice_speaking', onSpeaking);
  }, [socket]);

  // ---- WebRTC: connect to peers ----
  useEffect(() => {
    if (!channel || !socket || !hasLocalStream || !processedStreamRef.current) return;
    const channelId = channel.id;
    const processedStream = processedStreamRef.current;

    const cleanup = () => {
      socket.emit('leave_voice_channel', channelId);
      Object.values(peersRef.current).forEach(pc => { try { pc.close(); } catch (e) {} });
      peersRef.current = {};
      pendingCandidatesRef.current = {};
      iceRestartCountRef.current = {};
      setRemoteStreams({});
      setPeerStates({});
    };

    const handleSignal = async ({ fromUserId, signal }) => {
      const fromId = Number(fromUserId);
      if (fromId === currentUserId) return;
      let pc = peersRef.current[fromId];
      if (!pc) {
        pc = createPeerConnection(fromId, processedStream, socket);
        pendingCandidatesRef.current[fromId] = [];
      }

      const state = pc.signalingState;
      try {
        if (signal.type === 'offer') {
          if (state !== 'stable' && state !== 'have-remote-offer') return;
          await pc.setRemoteDescription(new RTCSessionDescription(signal));
          await flushIceCandidates(pc, fromId);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          setAudioBitrate(pc);
          socket.emit('voice_signal', { toUserId: fromId, signal: pc.localDescription });
        } else if (signal.type === 'answer') {
          if (state !== 'have-local-offer') return;
          await pc.setRemoteDescription(new RTCSessionDescription(signal));
          await flushIceCandidates(pc, fromId);
        } else if (signal.candidate) {
          if (pc.remoteDescription) {
            try { await pc.addIceCandidate(new RTCIceCandidate(signal.candidate)); } catch (e) {}
          } else {
            if (!pendingCandidatesRef.current[fromId]) pendingCandidatesRef.current[fromId] = [];
            pendingCandidatesRef.current[fromId].push(signal.candidate);
          }
        }
      } catch (err) {
        console.error('Signal handling error:', err);
      }
    };

    socket.on('voice_signal', handleSignal);

    (async () => {
      for (const p of participants) {
        const peerId = Number(p.userId);
        if (peerId === currentUserId) continue;
        const pc = createPeerConnection(peerId, processedStream, socket);
        pendingCandidatesRef.current[peerId] = [];
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          setAudioBitrate(pc);
          socket.emit('voice_signal', { toUserId: peerId, signal: pc.localDescription });
        } catch (err) {
          console.error('Offer creation error:', err);
        }
      }
      if (participants.filter(p => Number(p.userId) !== currentUserId).length === 0) setConnecting(false);
    })();

    return () => {
      socket.off('voice_signal', handleSignal);
      cleanup();
    };
  }, [channel?.id, currentUserId, socket, hasLocalStream, createPeerConnection, flushIceCandidates]);

  // ---- New participant: create offer ----
  useEffect(() => {
    if (!channel || !socket || !hasLocalStream || !processedStreamRef.current) return;
    const processedStream = processedStreamRef.current;

    participants.forEach(p => {
      const peerId = Number(p.userId);
      if (peerId === currentUserId || peersRef.current[peerId]) return;
      const pc = createPeerConnection(peerId, processedStream, socket);
      pendingCandidatesRef.current[peerId] = [];
      pc.createOffer().then(offer => pc.setLocalDescription(offer)).then(() => {
        setAudioBitrate(pc);
        socket.emit('voice_signal', { toUserId: peerId, signal: pc.localDescription });
      }).catch(() => {});
    });
  }, [channel?.id, participants, currentUserId, socket, hasLocalStream, createPeerConnection]);

  // ---- Autoplay remote audio (с задержкой, т.к. ref вызывается после commit) ----
  const tryPlayRemoteAudio = useCallback(() => {
    Object.values(audioElsRef.current).forEach(el => {
      if (el?.srcObject && !el.muted && el.paused) {
        el.play().catch((err) => {
          console.warn('[Голос] Воспроизведение не запустилось (часто нужен клик по панели):', err?.name || err);
        });
      }
    });
  }, []);

  useEffect(() => {
    tryPlayRemoteAudio();
    const t1 = setTimeout(tryPlayRemoteAudio, 100);
    const t2 = setTimeout(tryPlayRemoteAudio, 500);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [remoteStreams, tryPlayRemoteAudio]);

  useEffect(() => {
    if (!channel?.id || Object.keys(remoteStreams).length === 0) return;
    const id = setInterval(tryPlayRemoteAudio, 2000);
    return () => clearInterval(id);
  }, [channel?.id, remoteStreams, tryPlayRemoteAudio]);

  // ---- Sync deafen to remote audio (включая force_deafened) ----
  useEffect(() => {
    const me = participants.find(p => Number(p.userId) === currentUserId);
    const forceDeafened = !!me?.force_deafened;
    const effective = deafened || forceDeafened;
    Object.values(audioElsRef.current).forEach(el => {
      if (el) el.muted = effective;
    });
  }, [deafened, participants, currentUserId]);

  // ---- Send saved muted/deafened state on join ----
  useEffect(() => {
    if (!channel?.id || !socket || !hasLocalStream) return;
    socket.emit('voice_muted', { channelId: channel.id, muted });
    socket.emit('voice_deafened', { channelId: channel.id, deafened });
  }, [channel?.id, socket, hasLocalStream]);

  // ---- Cleanup everything on unmount / channel change ----
  useEffect(() => {
    return () => {
      teardownAudioPipeline();
      if (audioCtxRef.current) { try { audioCtxRef.current.close(); } catch (e) {} audioCtxRef.current = null; }
      if (speakingIntervalRef.current) clearInterval(speakingIntervalRef.current);
    };
  }, [channel?.id, teardownAudioPipeline]);

  const inVoice = !!channel;

  const me = participants.find(p => p.userId === currentUserId);
  const forceMuted = !!me?.force_muted;
  const forceDeafened = !!me?.force_deafened;
  const effectiveMuted = muted || forceMuted;
  const effectiveDeafened = deafened || forceDeafened;

  const toggleMute = () => {
    if (forceMuted) return;
    const next = !muted;
    setMuted(next);
    saveBool(VOICE_KEYS.muted, next);
    if (rawStreamRef.current) {
      rawStreamRef.current.getAudioTracks().forEach(t => { t.enabled = !next; });
    }
    if (socket && channel?.id) socket.emit('voice_muted', { channelId: channel.id, muted: next });
  };

  const toggleDeafen = () => {
    if (forceDeafened) return;
    const next = !deafened;
    setDeafened(next);
    saveBool(VOICE_KEYS.deafened, next);
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
      if (el?.srcObject && !el.muted) {
        el.play().catch((err) => {
          console.warn('[Голос] play() после клика:', err?.name || err, err?.message || '');
        });
      }
    });
  };

  // Connection quality indicator
  const connectionQuality = (() => {
    const states = Object.values(peerStates);
    if (states.length === 0) return connecting ? 'connecting' : 'idle';
    if (states.every(s => s === 'connected')) return 'good';
    if (states.some(s => s === 'failed')) return 'bad';
    if (states.some(s => s === 'connecting' || s === 'new')) return 'connecting';
    return 'fair';
  })();

  const qualityColors = { good: '#3ba55c', fair: '#faa61a', bad: '#ed4245', connecting: '#747f8d', idle: '#747f8d' };

  return (
    <div
      className="voice-panel voice-panel-corner"
      style={{ width: Math.max(200, channelListWidth - 16), maxWidth: channelListWidth - 16 }}
      onClick={playAllRemoteAudio}
    >
      <div className="voice-panel-user-row">
        <div
          className="voice-panel-user-avatar"
          style={avatarUrl ? { backgroundImage: `url(${avatarUrl})`, backgroundColor: 'transparent' } : { backgroundColor: getAvatarColor(currentDisplayName || currentUsername || user?.username) }}
        >
          {!avatarUrl && getInitial(currentDisplayName || currentUsername || user?.username)}
        </div>
        <div className="voice-panel-user-info">
          <span className="voice-panel-username">{currentDisplayName || currentUsername || user?.username || 'Вы'}</span>
          <span className="voice-panel-user-status" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span
              style={{
                display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
                backgroundColor: qualityColors[connectionQuality],
                flexShrink: 0
              }}
              title={
                connectionQuality === 'good' ? 'Подключено' :
                connectionQuality === 'fair' ? 'Нестабильное соединение' :
                connectionQuality === 'bad' ? 'Проблема соединения' :
                'Подключение...'
              }
            />
            <span style={{ fontSize: 11, opacity: 0.7 }}>
              {connectionQuality === 'good' ? 'Голосовой канал' :
               connectionQuality === 'bad' ? 'Переподключение...' :
               connectionQuality === 'connecting' ? 'Подключение...' :
               'Голосовой канал'}
            </span>
          </span>
        </div>
        <div className="voice-panel-user-actions">
          {inVoice && (
            <div className="voice-panel-leave-row">
              <button type="button" className="voice-panel-leave-btn" onClick={onLeave} title="Покинуть голосовой канал">
                <X className="voice-panel-leave-icon" size={18} aria-hidden />
                <span className="voice-panel-leave-text">Покинуть</span>
              </button>
            </div>
          )}
          <div className="voice-panel-controls-row">
            <button
              type="button"
              className={`voice-panel-mic-btn ${effectiveMuted ? 'muted' : ''} ${forceMuted ? 'force-muted' : ''}`}
              onClick={toggleMute}
              disabled={forceMuted}
              title={forceMuted ? 'Микрофон выключен модератором' : (effectiveMuted ? 'Включить микрофон' : 'Выключить микрофон')}
            >
              {effectiveMuted ? (
                <MicOff className="voice-panel-mic-icon voice-panel-mic-icon-off" size={20} aria-hidden />
              ) : (
                <Mic className="voice-panel-mic-icon" size={20} aria-hidden />
              )}
              <span className="voice-panel-mic-arrow">▾</span>
            </button>
            <button
              type="button"
              className={`voice-panel-headphone-btn ${effectiveDeafened ? 'deafened' : ''} ${forceDeafened ? 'force-deafened' : ''}`}
              onClick={toggleDeafen}
              disabled={forceDeafened}
              title={forceDeafened ? 'Звук выключен модератором' : (effectiveDeafened ? 'Включить звук' : 'Выключить звук')}
            >
              {effectiveDeafened ? (
                <HeadphonesOff className="voice-panel-headphone-icon voice-panel-headphone-icon-off" size={20} aria-hidden />
              ) : (
                <Headphones className="voice-panel-headphone-icon" size={20} aria-hidden />
              )}
              <span className="voice-panel-mic-arrow">▾</span>
            </button>
            <button type="button" className="voice-panel-gear-btn" onClick={() => onOpenSettings?.()} title="Настройки пользователя">
              <Settings size={20} aria-hidden />
            </button>
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
            if (!el) { delete audioElsRef.current[userId]; return; }
            audioElsRef.current[userId] = el;
            el.srcObject = stream;
            el.muted = effectiveDeafened;
            el.volume = Math.max(0, Math.min(1, outputGain));
            if (outputDeviceId && el.setSinkId) el.setSinkId(outputDeviceId).catch(() => {});
            const tryPlay = () => {
              el.play().catch((err) => {
                console.warn('[Голос] Воспроизведение (авто):', err?.name || err, '— нажмите по панели голоса или кнопке «Включить звук»');
              });
            };
            tryPlay();
            setTimeout(tryPlay, 100);
            setTimeout(tryPlay, 500);
          }}
          autoPlay
          playsInline
        />
      ))}
    </div>
  );
}
