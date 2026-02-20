// ============================================================
// VoicePanel.jsx — Голосовой канал: участники, mute, выход
// WebRTC через socket.io (signaling)
// ============================================================

import React, { useState, useEffect, useRef } from 'react';

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
  const localStreamRef = useRef(null);
  const peersRef = useRef({});

  useEffect(() => {
    if (!channel || !socket) return;
    const channelId = channel.id;

    let localStream = null;
    const peers = {};
    const remoteStreams = {};

    const cleanup = () => {
      socket.emit('leave_voice_channel', channelId);
      Object.values(peers).forEach(pc => { try { pc.close(); } catch (e) {} });
      if (localStream) localStream.getTracks().forEach(t => t.stop());
      peersRef.current = {};
      setRemoteStreams({});
    };

    const getOrCreatePeer = (userId) => {
      if (peers[userId]) return peers[userId];
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });
      if (localStream) localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
      pc.ontrack = (e) => {
        if (e.streams[0]) {
          remoteStreams[userId] = e.streams[0];
          setRemoteStreams(prev => ({ ...prev, [userId]: e.streams[0] }));
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
      try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        localStreamRef.current = localStream;
        for (const uid of Object.keys(peers)) {
          const pc = peers[uid];
          if (pc.getSenders().length === 0) {
            localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            socket.emit('voice_signal', { toUserId: Number(uid), signal: pc.localDescription });
          }
        }
        for (const p of participants) {
          if (p.userId === currentUserId) continue;
          const pc = getOrCreatePeer(p.userId);
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket.emit('voice_signal', { toUserId: p.userId, signal: pc.localDescription });
        }
        if (participants.filter(p => p.userId !== currentUserId).length === 0) setConnecting(false);
      } catch (err) {
        console.error('Voice getUserMedia:', err);
        setConnecting(false);
      }
    })();

    return () => {
      socket.off('voice_signal', handleSignal);
      cleanup();
    };
  }, [channel?.id, currentUserId, socket]);

  // При появлении нового участника — создаём offer
  useEffect(() => {
    if (!channel || !socket || !localStreamRef.current) return;
    const participantsWithoutMe = participants.filter(p => p.userId !== currentUserId);
    participantsWithoutMe.forEach(p => {
      if (!peersRef.current[p.userId]) {
        const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
        localStreamRef.current.getTracks().forEach(track => pc.addTrack(track, localStreamRef.current));
        pc.ontrack = (e) => {
          if (e.streams[0]) setRemoteStreams(prev => ({ ...prev, [p.userId]: e.streams[0] }));
        };
        pc.onicecandidate = (e) => {
          if (e.candidate) socket.emit('voice_signal', { toUserId: p.userId, signal: { type: 'ice', candidate: e.candidate } });
        };
        peersRef.current[p.userId] = pc;
        pc.createOffer().then(offer => pc.setLocalDescription(offer)).then(() => {
          socket.emit('voice_signal', { toUserId: p.userId, signal: pc.localDescription });
        });
      }
    });
  }, [channel?.id, participants, currentUserId, socket]);

  if (!channel) return null;

  const toggleMute = () => {
    if (!localStreamRef.current) return;
    localStreamRef.current.getTracks().forEach(t => { t.enabled = muted; });
    setMuted(!muted);
  };

  const allParticipants = [{ userId: currentUserId, username: 'Вы' }, ...participants.filter(p => p.userId !== currentUserId)];

  return (
    <div className="voice-panel">
      <div className="voice-panel-header">
        <span className="voice-panel-icon">🔊</span>
        <span className="voice-panel-channel">{channel.name}</span>
      </div>
      <div className="voice-panel-participants">
        {allParticipants.map(p => (
          <div key={p.userId} className="voice-participant">
            <span className="voice-participant-name">{p.username}</span>
            {p.userId === currentUserId && <span className="voice-participant-you">(вы)</span>}
            {remoteStreams[p.userId] && <span className="voice-participant-live">●</span>}
          </div>
        ))}
        {connecting && participants.length > 0 && <div className="voice-connecting">Подключение...</div>}
      </div>
      <div className="voice-panel-actions">
        <button type="button" className={`voice-btn ${muted ? 'voice-btn-muted' : ''}`} onClick={toggleMute} title={muted ? 'Включить микрофон' : 'Выключить микрофон'}>
          {muted ? '🔇' : '🎤'}
        </button>
        <button type="button" className="voice-btn voice-btn-leave" onClick={onLeave} title="Покинуть канал">
          Покинуть
        </button>
      </div>
      {Object.entries(remoteStreams).map(([userId, stream]) => (
        <audio key={userId} ref={el => { if (el) el.srcObject = stream; }} autoPlay playsInline />
      ))}
    </div>
  );
}
