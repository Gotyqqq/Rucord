// ============================================================
// Chat.jsx — Чат: вложения, реакции, эмодзи, GIF, @упоминания, PhotoSwipe
// ============================================================

import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../../utils/api';
import { getSocket } from '../../utils/socket';
import { getRecentEmojis, addRecentEmoji, EMOJI_ALL } from '../../utils/emoji';
import 'photoswipe/style.css';

function normalizeGifUrl(url) {
  if (!url || typeof url !== 'string') return '';
  try {
    const u = new URL(url.trim());
    return (u.origin + u.pathname).replace(/\/+$/, '') || url.trim();
  } catch {
    return url.trim();
  }
}

const LONG_PRESS_MS = 1500;

// Кнопка звезды: короткий клик — добавить/удалить из избранного; долгое нажатие (3 сек) — выбор папки
function FavStarButton({ url, title, inFav, onToggle, onLongPress, className, buttonTitle }) {
  const timerRef = useRef(null);
  const longPressFiredRef = useRef(false);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const onPointerDown = (e) => {
    e.preventDefault();
    longPressFiredRef.current = false;
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      longPressFiredRef.current = true;
      onLongPress?.(url, title);
    }, LONG_PRESS_MS);
  };

  const onPointerUp = () => clearTimer();
  const onPointerLeave = () => clearTimer();

  const onClick = (e) => {
    e.stopPropagation();
    if (longPressFiredRef.current) {
      longPressFiredRef.current = false;
      return;
    }
    onToggle(e, url, title);
  };

  return (
    <button
      type="button"
      className={className}
      title={buttonTitle ?? (inFav ? 'Удалить из избранного (удерживайте для выбора папки)' : 'В избранное (удерживайте для выбора папки)')}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerLeave}
      onClick={onClick}
    >
      {inFav ? '★' : '☆'}
    </button>
  );
}

const MEDIA_VOLUME_KEY = 'rucord_media_volume';
function getSavedVolume() {
  const v = localStorage.getItem(MEDIA_VOLUME_KEY);
  const n = parseFloat(v);
  return (v != null && !isNaN(n) && n >= 0 && n <= 1) ? n : 1;
}
function setSavedVolume(v) {
  localStorage.setItem(MEDIA_VOLUME_KEY, String(v));
}

function DarkAudioPlayer({ src, filename }) {
  const ref = useRef(null);
  const volumePopoverRef = useRef(null);
  const volumeCloseTimeoutRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [volume, setVolume] = useState(getSavedVolume);
  const [showVolumePopover, setShowVolumePopover] = useState(false);
  const [popoverPlace, setPopoverPlace] = useState(null);
  const POPOVER_W = 28;
  const POPOVER_H = 108;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.volume = volume;
  }, [volume]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.volume = getSavedVolume();
    setVolume(getSavedVolume());
    const onTimeUpdate = () => setCurrentTime(el.currentTime);
    const onDurationChange = () => { if (el.duration && isFinite(el.duration)) setDuration(el.duration); };
    const onEnded = () => { setPlaying(false); setCurrentTime(0); };
    const onLoadedMetadata = () => { if (el.duration && isFinite(el.duration)) setDuration(el.duration); setLoaded(true); };
    el.addEventListener('timeupdate', onTimeUpdate);
    el.addEventListener('durationchange', onDurationChange);
    el.addEventListener('ended', onEnded);
    el.addEventListener('loadedmetadata', onLoadedMetadata);
    return () => {
      el.removeEventListener('timeupdate', onTimeUpdate);
      el.removeEventListener('durationchange', onDurationChange);
      el.removeEventListener('ended', onEnded);
      el.removeEventListener('loadedmetadata', onLoadedMetadata);
    };
  }, []);

  const onVolumeWrapEnter = () => {
    if (volumeCloseTimeoutRef.current) {
      clearTimeout(volumeCloseTimeoutRef.current);
      volumeCloseTimeoutRef.current = null;
    }
    setShowVolumePopover(true);
  };
  const onVolumeWrapLeave = () => {
    volumeCloseTimeoutRef.current = setTimeout(() => setShowVolumePopover(false), 200);
  };

  useLayoutEffect(() => {
    if (!showVolumePopover || !volumePopoverRef.current) {
      setPopoverPlace(null);
      return;
    }
    const update = () => {
      const el = volumePopoverRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setPopoverPlace({
        bottom: window.innerHeight - r.top + 6,
        left: r.left + r.width / 2 - POPOVER_W / 2
      });
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [showVolumePopover]);

  const togglePlay = () => {
    if (!ref.current) return;
    if (playing) ref.current.pause();
    else ref.current.play();
    setPlaying(!playing);
  };

  const onSeek = (e) => {
    const v = parseFloat(e.target.value);
    if (ref.current && !isNaN(v)) {
      ref.current.currentTime = v;
      setCurrentTime(v);
    }
  };

  const onVolumeChange = (e) => {
    const v = parseFloat(e.target.value);
    if (!isNaN(v) && ref.current) {
      ref.current.volume = v;
      setVolume(v);
      setSavedVolume(v);
    }
  };

  const fmt = (t) => {
    if (!t || !isFinite(t)) return '0:00';
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="message-attachment-audio-wrap">
      <audio ref={ref} src={src} preload="metadata" className="message-attachment-audio-native" />
      <div className="message-attachment-audio-inner">
        <button type="button" className="message-attachment-audio-play" onClick={togglePlay} aria-label={playing ? 'Пауза' : 'Воспроизвести'}>
          {playing ? '❚❚' : '▶'}
        </button>
        <div className="message-attachment-audio-times">{fmt(currentTime)} / {fmt(duration)}</div>
        <div className="message-attachment-audio-bar">
          <div className="message-attachment-audio-progress-wrap">
            <div className="message-attachment-audio-progress-track" />
            <div className="message-attachment-audio-progress-fill" style={{ width: `${progressPercent}%` }} />
            <input type="range" className="message-attachment-audio-range" min={0} max={duration || 100} value={currentTime} onChange={onSeek} />
          </div>
        </div>
        <div className="message-attachment-audio-volume-wrap" ref={volumePopoverRef} onMouseEnter={onVolumeWrapEnter} onMouseLeave={onVolumeWrapLeave}>
          <button type="button" className="message-attachment-audio-volume-btn" aria-label="Громкость" title="Громкость (наведение)">
            {volume === 0 ? '🔇' : volume < 0.5 ? '🔈' : '🔉'}
          </button>
          {showVolumePopover && popoverPlace && createPortal(
            <div
              className="message-attachment-audio-volume-popover message-attachment-audio-volume-popover-portal"
              style={{ position: 'fixed', bottom: popoverPlace.bottom, left: popoverPlace.left, width: POPOVER_W, height: POPOVER_H, transform: 'none' }}
              onMouseEnter={onVolumeWrapEnter}
              onMouseLeave={onVolumeWrapLeave}
            >
              <div className="message-attachment-audio-volume-slider-wrap">
                <div className="message-attachment-audio-volume-track" />
                <div className="message-attachment-audio-volume-fill" style={{ height: `${volume * 92}px` }} />
                <input type="range" className="message-attachment-audio-volume-range" min={0} max={1} step={0.01} value={volume} onInput={onVolumeChange} onChange={onVolumeChange} />
              </div>
            </div>,
            document.body
          )}
        </div>
      </div>
    </div>
  );
}

function VideoWithVolume({ src, className, ...props }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.volume = getSavedVolume();
    const onVolumeChange = () => {
      if (el.volume !== undefined) setSavedVolume(el.volume);
    };
    const onLoadedMetadata = () => { el.volume = getSavedVolume(); };
    el.addEventListener('volumechange', onVolumeChange);
    el.addEventListener('loadedmetadata', onLoadedMetadata);
    return () => {
      el.removeEventListener('volumechange', onVolumeChange);
      el.removeEventListener('loadedmetadata', onLoadedMetadata);
    };
  }, []);
  return <video ref={ref} src={src} className={className} {...props} />;
}

function LazyGifEmbed({ pageUrl, onLightbox, onAddToFavorites, onLongPress, isInFavorites }) {
  const [gifUrl, setGifUrl] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/embed?url=${encodeURIComponent(pageUrl)}`)
      .then((r) => r.ok ? r.json() : Promise.reject(new Error('Не удалось загрузить')))
      .then((data) => { if (!cancelled && data.gif_url) setGifUrl(data.gif_url); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [pageUrl]);
  if (failed) {
    return <a href={pageUrl} target="_blank" rel="noopener noreferrer" className="message-link">{pageUrl}</a>;
  }
  if (!gifUrl) {
    return <span className="message-inline-image-loading">Загрузка гифки…</span>;
  }
  const inFav = isInFavorites(gifUrl);
  return (
    <span className="message-inline-image-wrap">
      <div className="message-inline-image-inner">
        <img
          src={gifUrl}
          alt=""
          className="message-inline-image"
          onClick={(e) => { e.preventDefault(); onLightbox(gifUrl); }}
          loading="lazy"
        />
        <FavStarButton
          url={gifUrl}
          title=""
          inFav={inFav}
          onToggle={onAddToFavorites}
          onLongPress={onLongPress}
          className={`message-inline-image-fav-btn ${inFav ? 'in-favorites' : ''}`}
          buttonTitle={inFav ? 'Удалить из избранного' : 'В избранное'}
        />
      </div>
    </span>
  );
}

export default function Chat({
  channel, messages, onSendMessage, onEditMessage, onDeleteMessage,
  typingUsers, currentUserId, members, currentUsername,
  isOwner, slowmodeWait = 0, onOpenProfile, onlineStatuses = {},
  onContextMenu, token, readOnly = false,
  onCreateServer, onJoinServer
}) {
  const [messageText, setMessageText] = useState('');
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);

  const [showMentions, setShowMentions] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');
  const [mentionIndex, setMentionIndex] = useState(0);

  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editText, setEditText] = useState('');
  const editInputRef = useRef(null);

  const [pendingAttachments, setPendingAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [reactionPickerMessageId, setReactionPickerMessageId] = useState(null);
  const [reactionPickerAnchor, setReactionPickerAnchor] = useState(null); // { left, top } для позиции попапа
  const reactionPickerPopoverRef = useRef(null);
  const [recentEmojis, setRecentEmojis] = useState(getRecentEmojis);
  const pswpInstanceRef = useRef(null);
  const [favoriteGifUrls, setFavoriteGifUrls] = useState(new Set());
  const [favoriteGifIdByUrl, setFavoriteGifIdByUrl] = useState({}); // normalizedUrl -> id для удаления
  const [messageToDelete, setMessageToDelete] = useState(null);
  const [folderPickerFor, setFolderPickerFor] = useState(null); // { url, title } или null
  const [folderPickerFolders, setFolderPickerFolders] = useState([]);
  const emojiPickerRef = useRef(null);
  const emojiToolbarBtnRef = useRef(null);
  const scrollPositionsRef = useRef({}); // channelId -> scrollTop
  const prevChannelIdRef = useRef(null);
  const isAtBottomRef = useRef(true);
  const [unreadBelowCount, setUnreadBelowCount] = useState(0);
  const messagesLengthRef = useRef(0);

  const hasEditPermission = (() => {
    if (isOwner) return true;
    const me = (members || []).find(m => m.user_id === currentUserId);
    if (!me || !me.roles) return false;
    return me.roles.some(r => {
      try {
        const perms = typeof r.permissions === 'string' ? JSON.parse(r.permissions) : r.permissions;
        return perms.edit_messages;
      } catch { return false; }
    });
  })();

  const hasDeletePermission = (() => {
    if (isOwner) return true;
    const me = (members || []).find(m => m.user_id === currentUserId);
    if (!me || !me.roles) return false;
    return me.roles.some(r => {
      try {
        const perms = typeof r.permissions === 'string' ? JSON.parse(r.permissions) : r.permissions;
        return perms.delete_messages;
      } catch { return false; }
    });
  })();

  // Сохраняем позицию прокрутки при уходе с канала
  useEffect(() => {
    const prev = prevChannelIdRef.current;
    const el = messagesContainerRef.current;
    if (prev != null && prev !== channel?.id && el) {
      scrollPositionsRef.current[prev] = el.scrollTop;
    }
    prevChannelIdRef.current = channel?.id ?? null;
    if (channel?.id != null) {
      messagesLengthRef.current = 0;
      setUnreadBelowCount(0);
    }
  }, [channel?.id]);

  // Обновляем «у низа ли пользователь» при прокрутке
  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const onScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = el;
      isAtBottomRef.current = scrollHeight - scrollTop - clientHeight < 120;
      if (isAtBottomRef.current) setUnreadBelowCount(0);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [channel?.id]);

  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el || !channel?.id) return;
    const saved = scrollPositionsRef.current[channel.id];
    const prevLen = messagesLengthRef.current;
    const newMessagesCount = messages.length - prevLen;
    messagesLengthRef.current = messages.length;

    if (saved != null) {
      delete scrollPositionsRef.current[channel.id];
      requestAnimationFrame(() => { el.scrollTop = saved; });
      return;
    }

    const scrollToEnd = () => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    const atBottom = isAtBottomRef.current;
    // Новые сообщения пришли по сокету (уже были сообщения), а пользователь не у низа — не скроллить, показать баннер
    if (prevLen > 0 && newMessagesCount > 0 && !atBottom) {
      setUnreadBelowCount(c => c + newMessagesCount);
      return;
    }
    scrollToEnd();
    const t1 = setTimeout(scrollToEnd, 200);
    const t2 = setTimeout(scrollToEnd, 600);
    const t3 = setTimeout(scrollToEnd, 1200);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [messages, channel?.id]);

  // При росте контента (загрузка медиа) прокручиваем вниз, если пользователь уже у низа
  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const { scrollTop, scrollHeight, clientHeight } = el;
      const nearBottom = scrollHeight - scrollTop - clientHeight < 300;
      if (nearBottom) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [channel?.id]);

  useEffect(() => {
    if (editingMessageId && editInputRef.current) editInputRef.current.focus();
  }, [editingMessageId]);

  // Закрытие окна реакций по клику вне (не при наведении на другое сообщение)
  useEffect(() => {
    if (!reactionPickerMessageId) return;
    const onMouseDown = (e) => {
      if (reactionPickerPopoverRef.current?.contains(e.target)) return;
      setReactionPickerMessageId(null);
      setReactionPickerAnchor(null);
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [reactionPickerMessageId]);

  useEffect(() => {
    if (!showEmojiPicker) return;
    const onMouseDown = (e) => {
      if (emojiPickerRef.current?.contains(e.target) || emojiToolbarBtnRef.current?.contains(e.target)) return;
      setShowEmojiPicker(false);
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [showEmojiPicker]);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key !== 'Enter' || e.shiftKey) return;
      if (showGifPicker || showEmojiPicker) return;
      if (document.activeElement === inputRef.current) return;
      const hasContent = messageText.trim() || pendingAttachments.length > 0;
      if (!hasContent || slowmodeWait > 0) return;
      e.preventDefault();
      onSendMessage(messageText.trim() || '', pendingAttachments);
      setMessageText('');
      setPendingAttachments([]);
      setShowMentions(false);
      setShowEmojiPicker(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [showGifPicker, showEmojiPicker, messageText, pendingAttachments, slowmodeWait, onSendMessage]);

  useEffect(() => {
    if (!token || !channel) return;
    api.get('/api/gif-favorites', token).then(data => {
      const list = data.favorites || [];
      const urlSet = new Set();
      const idByUrl = {};
      list.forEach((f) => {
        const key = normalizeGifUrl(f.gif_url);
        urlSet.add(key);
        idByUrl[key] = f.id;
      });
      setFavoriteGifUrls(urlSet);
      setFavoriteGifIdByUrl(idByUrl);
    }).catch(() => {
      setFavoriteGifUrls(new Set());
      setFavoriteGifIdByUrl({});
    });
  }, [token, channel?.id]);

  const refetchGifFavorites = useCallback(() => {
    if (!token) return;
    api.get('/api/gif-favorites', token).then(data => {
      const list = data.favorites || [];
      const urlSet = new Set();
      const idByUrl = {};
      list.forEach((f) => {
        const key = normalizeGifUrl(f.gif_url);
        urlSet.add(key);
        idByUrl[key] = f.id;
      });
      setFavoriteGifUrls(urlSet);
      setFavoriteGifIdByUrl(idByUrl);
    }).catch(() => {
      setFavoriteGifUrls(new Set());
      setFavoriteGifIdByUrl({});
    });
  }, [token]);

  // Special mention items: @everyone and @here
  const specialMentions = [
    { username: 'everyone', label: '@everyone', desc: 'Упомянуть всех на сервере', special: true },
    { username: 'here', label: '@here', desc: 'Упомянуть всех в сети', special: true },
  ];

  const checkMentionTrigger = (text) => {
    const cursorPos = inputRef.current?.selectionStart || text.length;
    const textBefore = text.slice(0, cursorPos);
    const lastAt = textBefore.lastIndexOf('@');
    if (lastAt === -1 || (lastAt > 0 && textBefore[lastAt - 1] !== ' ' && textBefore[lastAt - 1] !== '\n')) {
      setShowMentions(false); return;
    }
    const query = textBefore.slice(lastAt + 1);
    if (query.includes(' ')) { setShowMentions(false); return; }
    setMentionFilter(query.toLowerCase());
    setShowMentions(true);
    setMentionIndex(0);
  };

  const filteredSpecial = specialMentions.filter(s => s.username.startsWith(mentionFilter));
  const filteredMembers = (members || []).filter(m =>
    m.username.toLowerCase().includes(mentionFilter) && m.user_id !== currentUserId
  ).slice(0, 6);
  const allMentionOptions = [...filteredSpecial, ...filteredMembers];

  const insertMention = (username) => {
    const cursorPos = inputRef.current?.selectionStart || messageText.length;
    const textBefore = messageText.slice(0, cursorPos);
    const textAfter = messageText.slice(cursorPos);
    const lastAt = textBefore.lastIndexOf('@');
    const newText = textBefore.slice(0, lastAt) + `@${username} ` + textAfter;
    setMessageText(newText);
    setShowMentions(false);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleChange = (e) => {
    setMessageText(e.target.value);
    checkMentionTrigger(e.target.value);
  };

  const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15 МБ

  const uploadFiles = useCallback(async (fileList) => {
    if (!fileList?.length || !token) return;
    const files = Array.from(fileList);
    setUploading(true);
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.size > MAX_FILE_SIZE) {
          setUploadError('Файл слишком большой (макс. 15 МБ)');
          setTimeout(() => setUploadError(''), 4000);
          continue;
        }
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch('/api/upload', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData
        });
        const data = await res.json();
        if (data.error) {
          setUploadError(data.error);
          setTimeout(() => setUploadError(''), 4000);
          continue;
        }
        if (data.url) setPendingAttachments(prev => [...prev, { url: data.url, filename: data.filename, mimeType: data.mimeType }]);
      }
    } catch (err) { console.error(err); }
    setUploading(false);
  }, [token]);

  const handleFileSelect = async (e) => {
    const files = e.target.files;
    if (!files?.length) return;
    await uploadFiles(files);
    e.target.value = '';
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    const files = e.dataTransfer.files;
    if (files?.length) uploadFiles(files);
  }, [uploadFiles]);

  const removePendingAttachment = (index) => {
    setPendingAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const text = messageText.trim();
    if ((!text && pendingAttachments.length === 0) || slowmodeWait > 0) return;
    onSendMessage(text || '', pendingAttachments);
    setMessageText('');
    setPendingAttachments([]);
    setShowMentions(false);
    setShowEmojiPicker(false);
  };

  const insertEmoji = (emoji) => {
    const el = inputRef.current;
    if (!el) return;
    addRecentEmoji(emoji);
    setRecentEmojis(getRecentEmojis());
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const before = messageText.slice(0, start);
    const after = messageText.slice(end);
    setMessageText(before + emoji + after);
    setShowEmojiPicker(false);
    setTimeout(() => { el.focus(); el.setSelectionRange(start + emoji.length, start + emoji.length); }, 0);
  };

  const handleReactionAdd = (messageId, emoji) => {
    addRecentEmoji(emoji);
    setRecentEmojis(getRecentEmojis());
    const socket = getSocket();
    if (socket) socket.emit('reaction_add', { messageId, emoji });
    setReactionPickerMessageId(null);
    setReactionPickerAnchor(null);
  };
  const handleReactionRemove = (messageId, emoji) => {
    const socket = getSocket();
    if (socket) socket.emit('reaction_remove', { messageId, emoji });
  };
  const hasUserReacted = (reaction) => reaction.userIds && reaction.userIds.includes(currentUserId);

  const toggleGifFavorite = (e, gifUrl, gifTitle) => {
    e.stopPropagation();
    if (!token) return;
    const key = normalizeGifUrl(gifUrl);
    if (favoriteGifUrls.has(key)) {
      const id = favoriteGifIdByUrl[key];
      if (id == null) return;
      api.delete(`/api/gif-favorites/${id}`, token).then(() => {
        setFavoriteGifUrls(prev => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
        setFavoriteGifIdByUrl(prev => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
      }).catch(() => {});
    } else {
      if (favoriteGifUrls.has(key)) return; // уже в избранном
      api.post('/api/gif-favorites', { gif_url: gifUrl, gif_title: gifTitle || '' }, token).then((data) => {
        const fav = data.favorite;
        if (fav && fav.id) {
          setFavoriteGifUrls(prev => new Set([...prev, key]));
          setFavoriteGifIdByUrl(prev => ({ ...prev, [key]: fav.id }));
        }
      }).catch(() => {});
    }
  };

  const isGifInFavorites = (url) => favoriteGifUrls.has(normalizeGifUrl(url));

  useEffect(() => {
    if (!folderPickerFor || !token) return;
    api.get('/api/gif-folders', token).then(data => setFolderPickerFolders(data.folders || [])).catch(() => setFolderPickerFolders([]));
  }, [folderPickerFor, token]);

  const addGifToFolder = useCallback((folderId) => {
    if (!folderPickerFor || !token) return;
    const { url: gifUrl, title: gifTitle } = folderPickerFor;
    const body = { gif_url: gifUrl, gif_title: gifTitle || '' };
    if (folderId != null) body.folder_id = folderId;
    api.post('/api/gif-favorites', body, token).then((data) => {
      const fav = data.favorite;
      if (fav && fav.id) {
        const key = normalizeGifUrl(fav.gif_url || gifUrl);
        setFavoriteGifUrls(prev => new Set([...prev, key]));
        setFavoriteGifIdByUrl(prev => ({ ...prev, [key]: fav.id }));
      }
      setFolderPickerFor(null);
      refetchGifFavorites();
    }).catch(() => {});
  }, [folderPickerFor, token, refetchGifFavorites]);

  const handleKeyDown = (e) => {
    if (showMentions && allMentionOptions.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIndex(prev => Math.min(prev + 1, allMentionOptions.length - 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setMentionIndex(prev => Math.max(prev - 1, 0)); return; }
      if (e.key === 'Tab' || e.key === 'Enter') { e.preventDefault(); insertMention(allMentionOptions[mentionIndex].username); return; }
      if (e.key === 'Escape') { setShowMentions(false); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(e); }
  };

  const startEdit = (msg) => { setEditingMessageId(msg.id); setEditText(msg.content); };
  const cancelEdit = () => { setEditingMessageId(null); setEditText(''); };
  const submitEdit = () => {
    if (editText.trim()) { onEditMessage(editingMessageId, editText.trim()); cancelEdit(); }
  };
  const handleEditKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitEdit(); }
    if (e.key === 'Escape') cancelEdit();
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
    return isToday ? `Сегодня в ${time}` : date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }) + ` в ${time}`;
  };

  const formatTimeShort = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr.toString().includes('Z') ? dateStr : dateStr + 'Z');
    return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  };

  const shouldShowHeader = (msg, index) => {
    if (index === 0) return true;
    const prev = messages[index - 1];
    if (prev.user_id !== msg.user_id) return true;
    return (new Date(msg.created_at) - new Date(prev.created_at)) > 5 * 60 * 1000;
  };

  // Проверка: является ли URL прямой ссылкой на картинку/гифку
  const isImageUrl = (url) => {
    if (!url || typeof url !== 'string') return false;
    const u = url.split('?')[0].toLowerCase();
    if (/\.(gif|jpe?g|png|webp|bmp)(\?|$)/i.test(u)) return true;
    if (/media\.discordapp\.net\/attachments/i.test(url) || /cdn\.discordapp\.com\/attachments/i.test(url)) return true;
    if (/\.(giphy\.com|giphy\.gif|imgur\.com\/[a-zA-Z0-9]+\.(gif|jpg|png|webp))/i.test(url)) return true;
    return false;
  };

  // Ссылки на страницы с гифками (Tenor, Giphy и т.д.) — нужно разрешать через /api/embed
  const isEmbedGifUrl = (url) => {
    if (!url || typeof url !== 'string') return false;
    return /^https?:\/\/(www\.)?tenor\.com\/view\//i.test(url)
      || /^https?:\/\/(www\.)?giphy\.com\/gifs\//i.test(url);
  };

  // Сбор всех картинок из сообщений для галереи PhotoSwipe (порядок: контент → вложения)
  const getMessageImageItems = useCallback((msgList) => {
    const urlRegex = /(https?:\/\/[^\s<>[\]()]+)/gi;
    const items = [];
    (msgList || []).forEach((msg) => {
      if (msg.content) {
        const parts = msg.content.split(urlRegex);
        parts.forEach((seg) => {
          if (seg.match(/^https?:\/\//i) && isImageUrl(seg)) items.push({ src: seg, width: 1920, height: 1080 });
        });
      }
      (msg.attachments || []).forEach((att) => {
        if ((att.mime_type || '').startsWith('image/'))
          items.push({ src: att.url, width: 1920, height: 1080, alt: att.original_name || '' });
      });
    });
    return items;
  }, []);

  const openPhotoSwipe = useCallback((clickedUrl) => {
    const items = getMessageImageItems(messages);
    let index = items.findIndex((i) => i.src === clickedUrl);
    if (index === -1) {
      items.length = 0;
      items.push({ src: clickedUrl, width: 1920, height: 1080 });
      index = 0;
    }
    const loadImageSizes = (item) =>
      new Promise((resolve) => {
        const img = new Image();
        const timeout = setTimeout(() => {
          resolve({ ...item, width: item.width || 1920, height: item.height || 1080 });
        }, 3000);
        img.onload = () => {
          clearTimeout(timeout);
          resolve({ ...item, width: img.naturalWidth || item.width || 1920, height: img.naturalHeight || item.height || 1080 });
        };
        img.onerror = () => {
          clearTimeout(timeout);
          resolve({ ...item, width: item.width || 1920, height: item.height || 1080 });
        };
        img.src = item.src;
      });
    Promise.all(items.map(loadImageSizes)).then((itemsWithSizes) => {
      import('photoswipe').then((module) => {
        const PhotoSwipe = module.default;
        const pswp = new PhotoSwipe({
          dataSource: itemsWithSizes,
          index,
          bgOpacity: 0.9,
          padding: { top: 20, bottom: 20, left: 20, right: 20 },
          // Базовая логика зума: изначально «по ширине», по клику — увеличение
          initialZoomLevel: 'fit',
          secondaryZoomLevel: 2,
          maxZoomLevel: 4,
          imageClickAction: 'zoom',
          tapAction: 'zoom',
          bgClickAction: 'close'
        });
        pswpInstanceRef.current = pswp;
        pswp.init();
      });
    });
  }, [messages, getMessageImageItems]);

  const renderMessageText = (content) => {
    if (!content) return null;
    // Разбиваем по @упоминаниям и по URL (http/https)
    const urlRegex = /(https?:\/\/[^\s<>[\]()]+)/gi;
    const parts = content.split(/(@\S+)/g);
    const result = [];
    let key = 0;
    for (const part of parts) {
      if (part.startsWith('@')) {
        const target = part.slice(1).toLowerCase();
        const isMentionOfMe = currentUsername && target === currentUsername.toLowerCase();
        const isGroupMention = target === 'everyone' || target === 'here';
        result.push(
          <span key={key++} className={`mention ${isMentionOfMe || isGroupMention ? 'mention-me' : ''}`}>
            {part}
          </span>
        );
        continue;
      }
      const urlParts = part.split(urlRegex);
      for (const seg of urlParts) {
        if (seg.match(/^https?:\/\//i) && isImageUrl(seg)) {
          const inFav = isGifInFavorites(seg);
          result.push(
            <span key={key++} className="message-inline-image-wrap">
              <div className="message-inline-image-inner">
                <img
                  src={seg}
                  alt=""
                  className="message-inline-image"
                  onClick={(e) => { e.preventDefault(); openPhotoSwipe(seg); }}
                  loading="lazy"
                />
                <FavStarButton
                  url={seg}
                  title=""
                  inFav={inFav}
                  onToggle={toggleGifFavorite}
                  onLongPress={(u, t) => setFolderPickerFor({ url: u, title: t })}
                  className={`message-inline-image-fav-btn ${inFav ? 'in-favorites' : ''}`}
                  buttonTitle={inFav ? 'Удалить из избранного' : 'В избранное'}
                />
              </div>
            </span>
          );
        } else if (seg.match(/^https?:\/\//i) && isEmbedGifUrl(seg)) {
          result.push(
            <LazyGifEmbed
              key={key++}
              pageUrl={seg}
              onLightbox={openPhotoSwipe}
              onAddToFavorites={toggleGifFavorite}
              onLongPress={(u, t) => setFolderPickerFor({ url: u, title: t })}
              isInFavorites={isGifInFavorites}
            />
          );
        } else if (seg.match(/^https?:\/\//i)) {
          result.push(
            <a key={key++} href={seg} target="_blank" rel="noopener noreferrer" className="message-link">{seg}</a>
          );
        } else {
          result.push(<span key={key++}>{seg}</span>);
        }
      }
    }
    return result;
  };

  const handleUsernameClick = (msg) => {
    if (!onOpenProfile) return;
    const member = (members || []).find(m => m.user_id === msg.user_id);
    if (member) onOpenProfile(member);
  };

  const handleUsernameContext = (e, msg) => {
    if (!onContextMenu) return;
    const member = (members || []).find(m => m.user_id === msg.user_id);
    if (member) onContextMenu(e, member);
  };

  if (!channel) {
    return (
      <div className="chat-area">
        <div className="chat-empty">
          <div className="chat-empty-content">
            <div className="chat-empty-icon">💬</div>
            <h2>Добро пожаловать в Rucord!</h2>
            <p>Выберите канал слева или начните с одного из действий ниже</p>
            {(onCreateServer || onJoinServer) && (
              <div className="chat-empty-actions">
                {onCreateServer && (
                  <button type="button" className="chat-empty-action-btn" onClick={onCreateServer}>
                    <span>➕</span>
                    <span>Создать сервер</span>
                  </button>
                )}
                {onJoinServer && (
                  <button type="button" className="chat-empty-action-btn" onClick={onJoinServer}>
                    <span>↗</span>
                    <span>Присоединиться по коду</span>
                  </button>
                )}
              </div>
            )}
            <div className="chat-empty-steps">
              <div className="chat-empty-steps-title">Как начать</div>
              <ol>
                <li>Создайте сервер или вступите по приглашению</li>
                <li>Выберите сервер в списке слева</li>
                <li>Откройте канал и напишите сообщение</li>
              </ol>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="chat-area"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {messageToDelete && (
        <div className="chat-delete-confirm-overlay" onClick={() => setMessageToDelete(null)}>
          <div className="chat-delete-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="chat-delete-confirm-title">Удалить сообщение?</h3>
            <p className="chat-delete-confirm-text">Сообщение будет удалено безвозвратно.</p>
            <div className="chat-delete-confirm-actions">
              <button type="button" className="chat-delete-confirm-btn chat-delete-confirm-cancel" onClick={() => setMessageToDelete(null)}>Отмена</button>
              <button type="button" className="chat-delete-confirm-btn chat-delete-confirm-submit" onClick={() => { if (messageToDelete && onDeleteMessage) { onDeleteMessage(messageToDelete.id); setMessageToDelete(null); } }}>Удалить</button>
            </div>
          </div>
        </div>
      )}

      {folderPickerFor && (
        <div className="gif-folder-picker-overlay" onClick={() => setFolderPickerFor(null)}>
          <div className="gif-folder-picker-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="gif-folder-picker-title">Сохранить в папку</h3>
            <p className="gif-folder-picker-hint">Удерживайте звёздочку 1.5 сек для выбора папки</p>
            <div className="gif-folder-picker-list">
              <button type="button" className="gif-folder-picker-item" onClick={() => addGifToFolder(null)}>
                <span className="gif-folder-picker-icon">☆</span>
                <span>Без папки</span>
              </button>
              {folderPickerFolders.map((f) => (
                <button key={f.id} type="button" className="gif-folder-picker-item" onClick={() => addGifToFolder(f.id)}>
                  <span className="gif-folder-picker-icon">📁</span>
                  <span>{f.name}</span>
                </button>
              ))}
            </div>
            <button type="button" className="gif-folder-picker-close" onClick={() => setFolderPickerFor(null)}>Отмена</button>
          </div>
        </div>
      )}

      <div className="chat-header">
        <span className="chat-header-hash">#</span>
        <span className="chat-header-name">{channel.name}</span>
        {channel.slowmode > 0 && (
          <span className="chat-header-slowmode" title={`Slowmode: ${channel.slowmode}с`}>
            🕐 {channel.slowmode}с
          </span>
        )}
      </div>

      {reactionPickerMessageId != null && reactionPickerAnchor && createPortal(
        <div
          ref={reactionPickerPopoverRef}
          className="message-reaction-picker message-reaction-picker-popover message-reaction-picker-anchored"
          style={{
            left: reactionPickerAnchor.left,
            bottom: typeof window !== 'undefined' ? window.innerHeight - reactionPickerAnchor.top + 8 : 0,
            transform: 'none'
          }}
        >
          {EMOJI_ALL.map((emoji, idx) => (
            <button
              key={idx}
              type="button"
              className="message-reaction-picker-btn"
              onMouseDown={(e) => { e.preventDefault(); handleReactionAdd(reactionPickerMessageId, emoji); }}
            >{emoji}</button>
          ))}
        </div>,
        document.body
      )}

      <div className="chat-messages" ref={messagesContainerRef}>
        {unreadBelowCount > 0 && (
          <div className="chat-new-messages-banner">
            <span className="chat-new-messages-text">
              {unreadBelowCount === 1 ? '1 новое сообщение' : `${unreadBelowCount} новых сообщений`}
            </span>
            <button type="button" className="chat-new-messages-btn" onClick={() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); setUnreadBelowCount(0); }}>
              Пометить как прочитанное
              <span className="chat-new-messages-btn-icon">✓</span>
            </button>
          </div>
        )}
        {messages.length === 0 ? (
          <div className="chat-welcome">
            <div className="chat-welcome-icon">#</div>
            <h3>Добро пожаловать в #{channel.name}!</h3>
            <p>Это начало канала. Напишите первое сообщение!</p>
          </div>
        ) : (
          messages.map((msg, index) => {
            const showHeader = shouldShowHeader(msg, index);
            const canEdit = msg.user_id === currentUserId || hasEditPermission;
            const canDelete = msg.user_id === currentUserId || hasDeletePermission;
            const isEditing = editingMessageId === msg.id;
            const status = onlineStatuses[msg.user_id] || 'offline';

            return (
              <div key={msg.id || index} className={`message ${showHeader ? 'message-with-header' : 'message-compact'}`}>
                <div className="message-avatar-col">
                  {showHeader ? (
                    <div
                      className="message-avatar clickable-avatar"
                      style={{ backgroundColor: getAvatarColor(msg.username) }}
                      onClick={() => handleUsernameClick(msg)}
                      onContextMenu={(e) => handleUsernameContext(e, msg)}
                    >
                      {getInitial(msg.username)}
                      <span className="message-avatar-status" style={{
                        backgroundColor: status === 'online' ? '#3ba55c' : status === 'idle' ? '#faa61a' : '#72767d'
                      }} />
                    </div>
                  ) : (
                    <span className="message-time-hover">{formatTimeShort(msg.created_at)}</span>
                  )}
                </div>
                <div className="message-body">
                  {showHeader && (
                    <div className="message-header">
                      <span
                        className="message-username clickable-username"
                        style={{ color: getAvatarColor(msg.username) }}
                        onClick={() => handleUsernameClick(msg)}
                        onContextMenu={(e) => handleUsernameContext(e, msg)}
                      >
                        {msg.username}
                      </span>
                      <span className="message-time">{formatTime(msg.created_at)}</span>
                    </div>
                  )}
                  {isEditing ? (
                    <div className="message-edit-form">
                      <input
                        ref={editInputRef}
                        type="text" value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        onKeyDown={handleEditKeyDown}
                        className="message-edit-input"
                      />
                      <div className="message-edit-hint">
                        Escape — <span onClick={cancelEdit}>отменить</span> | Enter — <span onClick={submitEdit}>сохранить</span>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="message-text">
                        {renderMessageText(msg.content)}
                        {msg.edited ? <span className="message-edited-label">(ред.)</span> : null}
                      </div>
                      {msg.attachments && msg.attachments.length > 0 && (
                        <div className="message-attachments">
                          {msg.attachments.map((att, i) => (
                            <div key={i} className="message-attachment">
                              {(att.mime_type || '').startsWith('image/') ? (
                                <div className="message-attachment-image-wrap">
                                  <div
                                    onClick={() => openPhotoSwipe(att.url)}
                                    role="button"
                                    tabIndex={0}
                                    onKeyDown={(e) => e.key === 'Enter' && openPhotoSwipe(att.url)}
                                    title="Увеличить"
                                    className="message-attachment-image-click"
                                  >
                                    <img src={att.url} alt={att.original_name} className="message-attachment-img" />
                                  </div>
                                  <FavStarButton
                                    url={att.url}
                                    title={att.original_name}
                                    inFav={isGifInFavorites(att.url)}
                                    onToggle={toggleGifFavorite}
                                    onLongPress={(u, t) => setFolderPickerFor({ url: u, title: t })}
                                    className={`message-attachment-fav-btn ${isGifInFavorites(att.url) ? 'in-favorites' : ''}`}
                                    buttonTitle={isGifInFavorites(att.url) ? 'Удалить из избранного' : 'В избранное'}
                                  />
                                </div>
                              ) : (att.mime_type || '').startsWith('audio/') ? (
                                <div className="message-attachment-media">
                                  <DarkAudioPlayer src={att.url} filename={att.original_name} />
                                  <a href={att.url} target="_blank" rel="noopener noreferrer" className="message-attachment-file">📎 {att.original_name}</a>
                                </div>
                              ) : (att.mime_type || '').startsWith('video/') ? (
                                <div className="message-attachment-media">
                                  <div className="message-attachment-video-wrap">
                                    <VideoWithVolume src={att.url} controls preload="metadata" className="message-attachment-video" />
                                  </div>
                                  <a href={att.url} target="_blank" rel="noopener noreferrer" className="message-attachment-file">📎 {att.original_name}</a>
                                </div>
                              ) : (
                                <a href={att.url} target="_blank" rel="noopener noreferrer" className="message-attachment-file">📎 {att.original_name}</a>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="message-reactions-row">
                        {(msg.reactions || []).map((r, i) => (
                          <button
                            key={i}
                            type="button"
                            className={`message-reaction ${hasUserReacted(r) ? 'message-reaction-me' : ''}`}
                            onClick={() => hasUserReacted(r) ? handleReactionRemove(msg.id, r.emoji) : handleReactionAdd(msg.id, r.emoji)}
                          >
                            <span className="message-reaction-emoji">{r.emoji}</span>
                            <span className="message-reaction-count">{r.count}</span>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
                {!isEditing && (
                  <div className="message-actions">
                    {(recentEmojis.length ? recentEmojis : EMOJI_ALL).slice(0, 3).map((emoji, i) => (
                      <button key={i} type="button" className="message-action-btn message-action-emoji" onClick={() => handleReactionAdd(msg.id, emoji)} title="Добавить реакцию">{emoji}</button>
                    ))}
                    <button
                      type="button"
                      className="message-action-btn message-action-emoji-picker"
                      onClick={(e) => {
                        if (reactionPickerMessageId === msg.id) {
                          setReactionPickerMessageId(null);
                          setReactionPickerAnchor(null);
                        } else {
                          const rect = e.currentTarget.getBoundingClientRect();
                          setReactionPickerMessageId(msg.id);
                          setReactionPickerAnchor({ left: rect.left, top: rect.top, bottom: rect.bottom });
                        }
                      }}
                      title="Выбрать эмодзи"
                    ><span className="message-action-emoji-icon">☺</span></button>
                    {canEdit && (
                      <button className="message-action-btn" onClick={() => startEdit(msg)} title="Редактировать">✏️</button>
                    )}
                    {canDelete && (
                      <button type="button" className="message-action-btn message-action-delete" onClick={() => setMessageToDelete(msg)} title="Удалить">🗑</button>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {typingUsers.length > 0 && (
        <div className="chat-typing">
          <span className="typing-dots">●●●</span>
          {typingUsers.join(', ')} {typingUsers.length === 1 ? 'печатает' : 'печатают'}...
        </div>
      )}

      <div className="chat-input-wrapper">
        {readOnly && (
          <div className="chat-readonly-notice">В режиме просмотра нельзя писать. Нажмите «Вступить», чтобы участвовать.</div>
        )}
        {!readOnly && showMentions && allMentionOptions.length > 0 && (
          <div className="mention-popup">
            {allMentionOptions.map((m, i) => (
              <div
                key={m.username}
                className={`mention-item ${i === mentionIndex ? 'active' : ''} ${m.special ? 'mention-item-special' : ''}`}
                onMouseDown={(e) => { e.preventDefault(); insertMention(m.username); }}
                onMouseEnter={() => setMentionIndex(i)}
              >
                {m.special ? (
                  <>
                    <div className="mention-special-icon">{m.username === 'everyone' ? '📢' : '🟢'}</div>
                    <div className="mention-special-info">
                      <span className="mention-name">{m.label}</span>
                      <span className="mention-desc">{m.desc}</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="mention-avatar" style={{ backgroundColor: getAvatarColor(m.username) }}>
                      {getInitial(m.username)}
                    </div>
                    <span className="mention-name">{m.username}</span>
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        {!readOnly && slowmodeWait > 0 && (
          <div className="slowmode-countdown">
            Подождите {slowmodeWait}с перед следующим сообщением
          </div>
        )}
        {!readOnly && uploadError && (
          <div className="chat-upload-error">
            {uploadError}
          </div>
        )}

        {!readOnly && pendingAttachments.length > 0 && (
          <div className="chat-pending-attachments">
            {pendingAttachments.map((a, i) => (
              <span key={i} className="chat-pending-attachment">
                {(a.mimeType || '').startsWith('image/') ? (
                  <img src={a.url} alt="" className="chat-pending-attachment-preview" />
                ) : (
                  <span>📎 {a.filename}</span>
                )}
                <button type="button" className="chat-pending-attachment-remove" onClick={() => removePendingAttachment(i)}>×</button>
              </span>
            ))}
          </div>
        )}

        {!readOnly && showEmojiPicker && (
          <div ref={emojiPickerRef} className="chat-emoji-picker chat-emoji-picker-single">
            <div className="chat-emoji-picker-section-title">Популярные у вас</div>
            <div className="chat-emoji-picker-recent">
              {(recentEmojis.length ? recentEmojis : EMOJI_ALL.slice(0, 12)).map((emoji, idx) => (
                <button key={`recent-${emoji}-${idx}`} type="button" className="chat-emoji-picker-btn" onMouseDown={(e) => { e.preventDefault(); insertEmoji(emoji); }}>{emoji}</button>
              ))}
            </div>
            <div className="chat-emoji-picker-section-title">Все эмодзи</div>
            <div className="chat-emoji-picker-grid">
              {EMOJI_ALL.map((emoji, idx) => (
                <button key={`all-${emoji}-${idx}`} type="button" className="chat-emoji-picker-btn" onMouseDown={(e) => { e.preventDefault(); insertEmoji(emoji); }}>{emoji}</button>
              ))}
            </div>
          </div>
        )}

        {!readOnly && showGifPicker && (
          <GifPickerModal
            token={token}
            onClose={() => {
              refetchGifFavorites();
              setShowGifPicker(false);
            }}
            onSelect={(gifUrl, title) => {
              setPendingAttachments(prev => [...prev, { url: gifUrl, filename: title || 'gif.gif', mimeType: 'image/gif' }]);
              refetchGifFavorites();
              setShowGifPicker(false);
            }}
          />
        )}

        {!readOnly && (
          <form onSubmit={handleSubmit} className="chat-input-form">
            <input type="file" ref={fileInputRef} className="chat-file-input-hidden" accept="image/*,.pdf,video/mp4,video/webm,video/quicktime,audio/mpeg,audio/mp3,audio/wav,audio/ogg,audio/mp4,audio/x-m4a" multiple onChange={handleFileSelect} />
            <button type="button" className="chat-toolbar-btn" onClick={() => fileInputRef.current?.click()} disabled={uploading || slowmodeWait > 0} title="Прикрепить файл">📎</button>
            <button type="button" ref={emojiToolbarBtnRef} className="chat-toolbar-btn" onClick={() => setShowEmojiPicker(prev => !prev)} title="Эмодзи">😀</button>
            <button type="button" className="chat-toolbar-btn" onClick={() => setShowGifPicker(true)} title="GIF">GIF</button>
            <input
              ref={inputRef}
              type="text"
              value={messageText}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              placeholder={channel ? `Написать в #${channel.name} (@ для упоминания)` : 'Сообщение'}
              className="chat-input"
              autoFocus
              disabled={slowmodeWait > 0}
            />
            <button type="submit" className="chat-send-btn" disabled={(!messageText.trim() && pendingAttachments.length === 0) || slowmodeWait > 0}>➤</button>
          </form>
        )}
      </div>
    </div>
  );
}

const MAX_FOLDERS = 5;

function GifPickerModal({ token, onClose, onSelect }) {
  const [tab, setTab] = useState('catalog');
  const [favorites, setFavorites] = useState([]);
  const [folders, setFolders] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [favoriteUrls, setFavoriteUrls] = useState(new Set());
  const [favoriteIdByUrl, setFavoriteIdByUrl] = useState({});
  const [folderPickerFor, setFolderPickerFor] = useState(null);
  const [expandedFolderIds, setExpandedFolderIds] = useState(new Set());
  const [newFolderName, setNewFolderName] = useState('');
  const [showNewFolderInput, setShowNewFolderInput] = useState(false);
  const [folderError, setFolderError] = useState('');

  const loadFavorites = useCallback(() => {
    if (!token) return;
    Promise.all([
      api.get('/api/gif-favorites', token),
      api.get('/api/gif-folders', token)
    ]).then(([favData, folderData]) => {
      const list = favData.favorites || [];
      setFavorites(list);
      setFolders(folderData.folders || []);
      const urlSet = new Set();
      const idByUrl = {};
      list.forEach((f) => {
        const key = normalizeGifUrl(f.gif_url);
        urlSet.add(key);
        idByUrl[key] = f.id;
      });
      setFavoriteUrls(urlSet);
      setFavoriteIdByUrl(idByUrl);
    }).catch(() => {
      setFavorites([]);
      setFolders([]);
      setFavoriteUrls(new Set());
      setFavoriteIdByUrl({});
    });
  }, [token]);

  useEffect(() => {
    if (tab === 'favorites') loadFavorites();
  }, [tab, token]);

  const searchGifs = useCallback(async (q) => {
    if (!q.trim()) {
      setSearchResults([]);
      setSearchError('');
      return;
    }
    setSearchLoading(true);
    setSearchError('');
    try {
      const res = await fetch(`/api/gif-search?q=${encodeURIComponent(q.trim())}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        setSearchResults([]);
        setSearchError('Поиск недоступен. Запустите бэкенд и добавьте GIPHY_API_KEY в backend/.env');
        setSearchLoading(false);
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        setSearchResults([]);
        setSearchError(data.error || 'Ошибка поиска');
        setSearchLoading(false);
        return;
      }
      setSearchResults(data.data || []);
    } catch (err) {
      setSearchResults([]);
      const msg = err.message || '';
      setSearchError(msg.includes('JSON') || msg.includes('Unexpected token') ? 'Поиск недоступен. Запустите бэкенд и добавьте GIPHY_API_KEY в backend/.env' : msg);
    }
    setSearchLoading(false);
  }, [token]);

  useEffect(() => {
    if (tab !== 'catalog' || !searchQuery.trim()) return;
    const t = setTimeout(() => searchGifs(searchQuery), 400);
    return () => clearTimeout(t);
  }, [searchQuery, tab, searchGifs]);

  const addGifToFolderInModal = (gifUrl, gifTitle, folderId) => {
    if (!token) return;
    const body = { gif_url: gifUrl, gif_title: gifTitle || '' };
    if (folderId != null) body.folder_id = folderId;
    api.post('/api/gif-favorites', body, token).then((data) => {
      const fav = data.favorite;
      if (fav && fav.id) {
        const k = normalizeGifUrl(fav.gif_url || gifUrl);
        setFavoriteUrls((prev) => new Set([...prev, k]));
        setFavoriteIdByUrl((prev) => ({ ...prev, [k]: fav.id }));
        setFavorites((prev) => {
          const inList = prev.find((f) => f.id === fav.id || normalizeGifUrl(f.gif_url) === k);
          if (inList) {
            return prev.map((f) =>
              f.id === fav.id || normalizeGifUrl(f.gif_url) === k
                ? { ...f, folder_id: fav.folder_id ?? null }
                : f
            );
          }
          const without = prev.filter((f) => normalizeGifUrl(f.gif_url) !== k);
          return [{ id: fav.id, gif_url: fav.gif_url || gifUrl, gif_title: fav.gif_title || gifTitle, folder_id: fav.folder_id ?? null }, ...without];
        });
      }
      setFolderPickerFor(null);
    }).catch(() => setFolderPickerFor(null));
  };

  const createFolder = () => {
    const name = newFolderName.trim();
    if (!name || !token) return;
    if (folders.length >= MAX_FOLDERS) {
      setFolderError(`Максимум ${MAX_FOLDERS} папок`);
      return;
    }
    setFolderError('');
    api.post('/api/gif-folders', { name }, token).then((data) => {
      setFolders(prev => [...prev, data.folder]);
      setNewFolderName('');
      setShowNewFolderInput(false);
    }).catch((err) => setFolderError(err.message || 'Ошибка'));
  };

  const toggleGifFavoriteInModal = (e, gifUrl, gifTitle) => {
    e.stopPropagation();
    if (!token) return;
    const key = normalizeGifUrl(gifUrl);
    if (favoriteUrls.has(key)) {
      const id = favoriteIdByUrl[key];
      if (id == null) return;
      api.delete(`/api/gif-favorites/${id}`, token).then(() => {
        setFavoriteUrls((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
        setFavoriteIdByUrl((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
        setFavorites((prev) => prev.filter((f) => normalizeGifUrl(f.gif_url) !== key));
      }).catch(() => {});
    } else {
      if (favoriteUrls.has(key)) return;
      api.post('/api/gif-favorites', { gif_url: gifUrl, gif_title: gifTitle || '' }, token).then((data) => {
        const fav = data.favorite;
        if (fav && fav.id) {
          const k = normalizeGifUrl(fav.gif_url || gifUrl);
          setFavoriteUrls((prev) => new Set([...prev, k]));
          setFavoriteIdByUrl((prev) => ({ ...prev, [k]: fav.id }));
          setFavorites((prev) => {
            const without = prev.filter((f) => normalizeGifUrl(f.gif_url) !== k);
            return [{ id: fav.id, gif_url: fav.gif_url || gifUrl, gif_title: fav.gif_title || gifTitle, folder_id: fav.folder_id ?? null }, ...without];
          });
        }
      }).catch(() => {});
    }
  };

  const STATIC_GIFS = [
    { url: 'https://media.giphy.com/media/3o7TKsQ82JpGLcS7g4/giphy.gif', title: 'Wave' },
    { url: 'https://media.giphy.com/media/26BRv0ThflsHCqDrG/giphy.gif', title: 'Thumbs up' },
    { url: 'https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif', title: 'OK' },
    { url: 'https://media.giphy.com/media/3o72F7YT6s0mJ2F2I0/giphy.gif', title: 'Happy' },
    { url: 'https://media.giphy.com/media/Is1O1TWV0LEJn/giphy.gif', title: 'Dance' },
    { url: 'https://media.giphy.com/media/13CoXDiaCcCoyk/giphy.gif', title: 'Laugh' },
    { url: 'https://media.giphy.com/media/Ph7CyAhQyPkB2/giphy.gif', title: 'Love' },
    { url: 'https://media.giphy.com/media/111ebonMs90YLu/giphy.gif', title: 'Fire' },
  ];

  const catalogList = searchQuery.trim() ? searchResults : STATIC_GIFS;

  return (
    <div className="gif-picker-overlay" onClick={onClose}>
      <div className="gif-picker-modal" onClick={(e) => e.stopPropagation()}>
        <div className="gif-picker-header">
          <span className="gif-picker-title">GIF</span>
          <button type="button" className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="gif-picker-tabs">
          <button type="button" className={tab === 'catalog' ? 'gif-picker-tab active' : 'gif-picker-tab'} onClick={() => setTab('catalog')}>Каталог</button>
          <button type="button" className={tab === 'favorites' ? 'gif-picker-tab active' : 'gif-picker-tab'} onClick={() => setTab('favorites')}>Избранное</button>
        </div>
        {tab === 'catalog' && (
          <div className="gif-picker-search">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && searchGifs(searchQuery)}
              placeholder="Поиск по словам: грустно, хахаха, смех..."
              className="gif-picker-search-input"
            />
            <button type="button" className="gif-picker-search-btn" onClick={() => searchGifs(searchQuery)} disabled={searchLoading}>
              {searchLoading ? '...' : 'Найти'}
            </button>
          </div>
        )}
        <div className="gif-picker-body">
          {tab === 'catalog' && (
            <div className="gif-picker-grid">
              {searchLoading && catalogList.length === 0 && <p className="gif-picker-empty">Загрузка...</p>}
              {searchError && <p className="gif-picker-empty gif-picker-error">{searchError}</p>}
              {!searchLoading && !searchError && searchQuery.trim() && catalogList.length === 0 && (
                <p className="gif-picker-empty">Ничего не найдено. Попробуйте другие слова.</p>
              )}
              {catalogList.map((g, i) => {
                const inFav = favoriteUrls.has(normalizeGifUrl(g.url));
                return (
                  <div key={`${g.url}-${i}`} className="gif-picker-item" onClick={() => onSelect(g.url, g.title)}>
                    <img src={g.url} alt={g.title} />
                    <FavStarButton
                      url={g.url}
                      title={g.title}
                      inFav={inFav}
                      onToggle={toggleGifFavoriteInModal}
                      onLongPress={(u, t) => setFolderPickerFor({ url: u, title: t })}
                      className={`gif-picker-fav-btn ${inFav ? 'in-favorites' : ''}`}
                      buttonTitle={inFav ? 'Удалить из избранного' : 'В избранное'}
                    />
                  </div>
                );
              })}
            </div>
          )}
          {tab === 'favorites' && (
            <div className="gif-favorites-tab">
              {folders.length < MAX_FOLDERS && (
                <div className="gif-folders-create">
                  {!showNewFolderInput ? (
                    <button type="button" className="gif-folders-create-btn" onClick={() => setShowNewFolderInput(true)}>
                      + Создать папку
                    </button>
                  ) : (
                    <div className="gif-folders-create-inline">
                      <input
                        type="text"
                        value={newFolderName}
                        onChange={(e) => { setNewFolderName(e.target.value); setFolderError(''); }}
                        onKeyDown={(e) => { if (e.key === 'Enter') createFolder(); if (e.key === 'Escape') { setShowNewFolderInput(false); setNewFolderName(''); setFolderError(''); } }}
                        placeholder="Название папки"
                        className="gif-folders-create-input"
                        autoFocus
                      />
                      <button type="button" className="gif-folders-create-submit" onClick={createFolder}>Создать</button>
                      <button type="button" className="gif-folders-create-cancel" onClick={() => { setShowNewFolderInput(false); setNewFolderName(''); setFolderError(''); }}>×</button>
                    </div>
                  )}
              {folderError && <span className="gif-folders-error">{folderError}</span>}
                </div>
              )}
              {folders.map((folder) => {
                const folderItems = favorites.filter((f) => f.folder_id === folder.id);
                const isExpanded = expandedFolderIds.has(folder.id);
                return (
                  <div key={folder.id} className="gif-folder-block">
                    <button
                      type="button"
                      className="gif-folder-header"
                      onClick={() => setExpandedFolderIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(folder.id)) next.delete(folder.id);
                        else next.add(folder.id);
                        return next;
                      })}
                    >
                      <span className="gif-folder-icon">📁</span>
                      <span className="gif-folder-name">{folder.name}</span>
                      <span className="gif-folder-count">{folderItems.length}</span>
                      <span className="gif-folder-chevron">{isExpanded ? '▼' : '▶'}</span>
                    </button>
                    {isExpanded && (
                      <div className="gif-picker-grid gif-folder-grid">
                        {folderItems.map((f) => (
                          <div key={f.id} className="gif-picker-item" onClick={() => onSelect(f.gif_url, f.gif_title)}>
                            <img src={f.gif_url} alt={f.gif_title} />
                            <FavStarButton
                              url={f.gif_url}
                              title={f.gif_title}
                              inFav={true}
                              onToggle={toggleGifFavoriteInModal}
                              onLongPress={(u, t) => setFolderPickerFor({ url: u, title: t })}
                              className="gif-picker-fav-btn in-favorites"
                              buttonTitle="Удалить из избранного (удерживайте — перенести в папку)"
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              <div className="gif-folder-block gif-folder-general">
                <div className="gif-folder-header gif-folder-header-static">
                  <span className="gif-folder-icon">☆</span>
                  <span className="gif-folder-name">Общие сохранённые</span>
                  <span className="gif-folder-count">{favorites.filter((f) => !f.folder_id).length}</span>
                </div>
                <div className="gif-picker-grid gif-folder-grid">
                  {favorites.filter((f) => !f.folder_id).map((f) => (
                    <div key={f.id} className="gif-picker-item" onClick={() => onSelect(f.gif_url, f.gif_title)}>
                      <img src={f.gif_url} alt={f.gif_title} />
                      <FavStarButton
                        url={f.gif_url}
                        title={f.gif_title}
                        inFav={true}
                        onToggle={toggleGifFavoriteInModal}
                        onLongPress={(u, t) => setFolderPickerFor({ url: u, title: t })}
                        className="gif-picker-fav-btn in-favorites"
                        buttonTitle="Удалить из избранного (удерживайте — перенести в папку)"
                      />
                    </div>
                  ))}
                </div>
              </div>
              {favorites.length === 0 && <p className="gif-picker-empty">Нет избранных GIF</p>}
            </div>
          )}
          {folderPickerFor && (
            <div className="gif-folder-picker-overlay gif-folder-picker-in-modal" onClick={() => setFolderPickerFor(null)}>
              <div className="gif-folder-picker-modal" onClick={(e) => e.stopPropagation()}>
                <h3 className="gif-folder-picker-title">Сохранить в папку</h3>
                <div className="gif-folder-picker-list">
                  <button type="button" className="gif-folder-picker-item" onClick={() => addGifToFolderInModal(folderPickerFor.url, folderPickerFor.title, null)}>
                    <span className="gif-folder-picker-icon">☆</span>
                    <span>Без папки</span>
                  </button>
                  {folders.map((f) => (
                    <button key={f.id} type="button" className="gif-folder-picker-item" onClick={() => addGifToFolderInModal(folderPickerFor.url, folderPickerFor.title, f.id)}>
                      <span className="gif-folder-picker-icon">📁</span>
                      <span>{f.name}</span>
                    </button>
                  ))}
                </div>
                <button type="button" className="gif-folder-picker-close" onClick={() => setFolderPickerFor(null)}>Отмена</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
