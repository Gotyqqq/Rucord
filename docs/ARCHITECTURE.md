# Архитектура Rucord

Документ описывает устройство проекта: API, сокеты, БД, фронтенд и голос. Обновляйте его при изменении маршрутов, событий, схемы или крупных фич.

---

## 1. Общая схема

```
[Браузер]  <--->  [Frontend (React, Vite)]  <--->  [Backend (Node, Express)]
                        |                                    |
                   HTTP (api.js)                      REST API (routes/*)
                   WebSocket (socket.js)               Socket.IO (socket/chat.js)
                        |                                    |
                        |                              SQLite (database.js)
                        |                              Файлы (uploads/)
                        |
                   WebRTC (P2P между клиентами; сигналы через Socket.IO)
```

- **REST API** — авторизация, CRUD серверов/каналов/участников/ролей, сообщения, ЛС, загрузки, GIF, embed.
- **Socket.IO** — реалтайм: новые сообщения, редактирование/удаление, реакции, типинг, ЛС, голосовые комнаты и пересылка WebRTC-сигналов.
- **WebRTC** — аудио между участниками голосового канала идёт напрямую (P2P); сервер только передаёт offer/answer/ICE-кандидаты.

---

## 2. Backend

### 2.1. Точка входа

- **server.js** — подключает `database.init()`, Express, CORS, роуты, раздаёт `uploads`, создаёт HTTP-сервер и Socket.IO, вызывает `setupSocket(io)`.

### 2.2. База данных (database.js)

- Движок: **sql.js** (SQLite в WASM), файл — `backend/rucord.db`.
- При старте: создание таблиц (если нет), миграции через `ALTER TABLE`, при завершении процесса — сохранение БД на диск.

Основные таблицы:

| Таблица | Назначение |
|--------|------------|
| users | id, username, email, password_hash, avatar_url, display_name |
| servers | id, name, icon, invite_code, owner_id |
| channels | id, server_id, name, type ('text' \| 'voice'), slowmode |
| server_members | id, server_id, user_id, display_name, voice_force_muted, voice_force_deafened |
| roles | id, server_id, name, color, permissions (JSON), position |
| member_roles | member_id, role_id |
| messages | id, channel_id, user_id, content, edited, created_at |
| message_attachments | id, message_id, file_path, original_name, mime_type, file_size |
| message_reactions | message_id, emoji, user_id |
| direct_messages | id, from_user_id, to_user_id, content, created_at |
| server_bans | server_id, user_id, banned_by, reason |
| server_mutes | server_id, user_id, muted_by, expires_at |
| user_gif_folders, user_gif_favorites | папки и избранные GIF пользователя |

### 2.3. REST API (routes/)

Все защищённые маршруты используют `middleware/auth.js` (JWT в заголовке `Authorization: Bearer <token>`).

| Префикс | Файл | Кратко |
|---------|------|--------|
| /api/auth | auth.js | register, login, refresh, сброс пароля, смена пароля |
| /api/servers | servers.js | CRUD серверов, инвайты |
| /api/channels | channels.js | CRUD каналов (в т.ч. голосовые) |
| /api/members | members.js | участники сервера, роли, display_name, мьют/бан, voice_force_muted/deafened |
| /api/messages | messages.js | список сообщений канала (с вложениями, реакциями) |
| /api/dm | dm.js | личные сообщения (список, история) |
| /api/upload | upload.js | загрузка файлов (аватар, вложения) |
| /api/gif-favorites | gifFavorites.js | избранные GIF пользователя |
| /api/gif-folders | gifFolders.js | папки для GIF |
| /api/gif-search | gifSearch.js | поиск GIF (GIPHY), требует GIPHY_API_KEY в .env |
| /api/embed | embed.js | метаданные по URL (для превью ссылок) |

Загруженные файлы отдаются по `/api/uploads/...` (express.static).

### 2.4. Права (utils/permissions.js)

- **getUserPermissions(serverId, userId)** — объединение прав по ролям участника; у владельца и при `administrator` — полный набор.
- Ключи прав: administrator, manage_server, manage_channels, manage_roles, kick_members, ban_members, mute_members, deafen_members, send_messages, read_messages, edit_messages, delete_messages, send_gifs, send_media, change_display_name, speak_in_voice, create_voice_channels и др.
- **utils/master.js** — мастер-аккаунт (по ID из .env) имеет все права и может добавляться на любой сервер.

### 2.5. Socket.IO (socket/chat.js)

После подключения сокета выполняется проверка JWT; при успехе в сокет записывается `socket.user` (id, username и т.д.). Клиент входит в комнаты:

- `user_<userId>` — личные уведомления, ЛС, голосовые сигналы (кому предназначены).
- `server_<serverId>` — при join_server (после проверки бана/участия).
- `channel_<channelId>` — при join_channel (после проверки прав доступа).

Основные события (клиент → сервер → рассылка):

| Событие (входящее) | Действие |
|--------------------|----------|
| join_channel | вход в комнату канала, проверка прав |
| leave_channel | выход из комнаты канала |
| join_server | вход в комнату сервера (проверка бана) |
| send_message | запись в messages + message_attachments, рассылка new_message по комнате канала, упоминания → mention_notification |
| edit_message, delete_message | обновление/удаление, рассылка message_edited / message_deleted |
| reaction_add, reaction_remove | запись в message_reactions, рассылка reaction_updated |
| send_dm | запись в direct_messages, рассылка new_dm и dm_notification |
| typing | рассылка user_typing по комнате канала |
| join_voice_channel | проверка канала (voice), прав, мьюта; вход в voice_<channelId>, рассылка voice_participants и voice_participant_joined, broadcastVoiceRoster |
| leave_voice_channel | выход из комнаты, voice_participant_left, обновление ростеров |
| voice_muted, voice_deafened | обновление состояния, рассылка по комнате голоса и ростеры |
| voice_force_mute, voice_force_deafen | (в канале) запись в server_members, рассылка voice_force_muted/deafened |
| voice_force_mute_user, voice_force_deafen_user | (вне канала) запись в server_members, рассылка по серверу для обновления ростеров |
| voice_signal | проверка, что отправитель и получатель в одном голосовом канале; пересылка в user_<toUserId> (offer/answer/ICE) |
| voice_speaking | рассылка по комнате голоса для индикатора «говорит» |
| get_voice_rosters | ответ с ростером по голосовым каналам сервера |
| get_online_users | ответ со статусами онлайн по участникам сервера |

Муты и «force mute/deafen»: при мьюте на сервере в БД выставляются voice_force_muted/voice_force_deafened; при входе в голосовой канал это учитывается и рассылается участникам.

---

## 3. Frontend

### 3.1. Точка входа и глобальное состояние

- **main.jsx** — рендер App в root.
- **App.jsx** — корневой компонент: AuthContext (user, token), выбор страницы (landing / login / register / приложение). В режиме приложения хранит:
  - серверы, каналы, выбранный сервер/канал;
  - сообщения, участники, роли;
  - типинг, уведомления, slowmode;
  - права (myPermissions, myHighestPos), онлайн-статусы;
  - ЛС (dmUnreadMap, showDM, dmTargetUserId/Username);
  - модалки (создание/присоединение к серверу, инвайт, настройки сервера/канала/пользователя);
  - голос: currentVoiceChannelId, voiceParticipants, voiceRosters, voiceSpeakingUsers, micTestMode;
  - контекстное меню и попап профиля.

Состояние обновляется через API (api.js) и сокет (socket.js); подписки на события сокета в useEffect в App.jsx и в дочерних компонентах (Chat, ChannelList, VoicePanel и т.д.).

### 3.2. Контекст и утилиты

- **context/AuthContext.jsx** — логин/логаут, хранение user и token, refreshUser.
- **utils/api.js** — HTTP-клиент с базовым URL и подстановкой Bearer token.
- **utils/socket.js** — создание сокета (подключение с token), экспорт getSocket/connectSocket/disconnectSocket.
- **utils/voiceConfig.js** — ключи localStorage для голоса (устройства, громкость, чувствительность, мьют/дефен, RNNoise), ICE_SERVERS, getSpeakThreshold, getNoiseSuppressorWorkletUrl, setAudioBitrate, notifyStorageChange.
- **utils/avatar.js**, **utils/emoji.js** — хелперы для аватарок и эмодзи.

### 3.3. Основные компоненты

| Компонент | Назначение |
|-----------|------------|
| LandingPage, LoginPage, RegisterPage | Лендинг, вход, регистрация |
| ServerList | Панель серверов (иконки), создание/присоединение |
| ChannelList | Список каналов (текст/голос), контекстное меню, переход в канал/голос |
| Chat | Сообщения канала, ввод, вложения, реакции, упоминания, slowmode; подписка на new_message, message_edited, message_deleted, reaction_updated, user_typing |
| MemberList | Участники текущего сервера (с ролями, статусом, мьютом) |
| DMPanel | Личные сообщения (список диалогов, выбранный диалог, отправка) |
| VoicePanel | Голосовой канал: пайплайн микрофона (gain → RNNoise → gate), WebRTC (createPeerConnection, ontrack, voice_signal), воспроизведение удалённых потоков, мьют/дефен |
| UserSettingsModal | Настройки пользователя: вкладки «Голос» (устройства, громкость, RNNoise, чувствительность, проверка микрофона) и «Профиль» (аватар, display name) |
| ServerSettings | Настройки сервера (общие, роли, участники, баны, каналы) |
| ChannelSettingsModal | Редактирование/удаление канала, slowmode |
| UserProfilePopup | Попап профиля пользователя |
| UserContextMenu | Контекстное меню участника (роли, кик, бан, мьют, force mute/deafen в голосе и т.д.) |
| CreateServerModal, JoinServerModal, InviteModal | Модалки создания сервера, присоединения по инвайту, копирования инвайта |

### 3.4. Голос (VoicePanel, UserSettingsModal, voiceConfig)

- **Пайплайн микрофона (VoicePanel):** getUserMedia → GainNode (inputGain) → [NoiseSuppressorWorklet при включённом RNNoise] → GateNode (VAD) → MediaStreamDestination. В WebRTC уходит `processedStreamRef.current` (destination.stream). Порог «говорит» задаётся getSpeakThreshold() из localStorage.
- **Проверка микрофона (UserSettingsModal):** тот же конвейер (gain + опционально RNNoise) для индикатора уровня и loopback в канале, чтобы пользователь слышал то же, что уходит на сервер.
- **WebRTC:** создаётся RTCPeerConnection на пару участников; offer/answer и ICE-кандидаты передаются через сокет (voice_signal). Удалённые треки воспроизводятся через `<audio ref={...} srcObject={remoteStream} />`; воспроизведение запускается с задержкой и по клику (политика autoplay). Громкость выхода и устройство вывода задаются из voiceConfig (outputGain, outputDeviceId).
- Worklet: `frontend/src/audio/noise-suppressor-worklet.js`, в проде — `assets/noise-suppressor-worklet.js` (Vite entry).

---

## 4. Деплой

- **Локальный сценарий:** backend на 3001, frontend dev на 5173; для продакшена фронт собирается (`npm run build`), бэкенд раздаёт статику из `frontend/dist` (или через nginx).
- **Сервер:** см. DEPLOY.md (nginx, PM2, .env с JWT_SECRET и т.д.). В репозитории — `.github/workflows/` для деплоя по пушу (секреты: SERVER_HOST, SERVER_USER, SSH_PRIVATE_KEY); на сервере выполняется `~/Rucord/deploy.sh` (pull, установка зависимостей, сборка фронта, перезапуск PM2). Чеклист: `.github/DEPLOY-CHECKLIST.md`.

---

## 5. Что обновлять в этой документации

- Добавили новый REST-маршрут или изменили контракт — обновить раздел 2.3.
- Новое сокет-событие или комната — раздел 2.5.
- Новая таблица или поле в БД — раздел 2.2.
- Крупное изменение на фронте (новый глобальный state, новый раздел приложения) — раздел 3.
- Изменения голоса (пайплайн, события, настройки) — разделы 2.5 и 3.4.
- Изменения процесса деплоя — раздел 4 и README.

Храните этот файл в репозитории и обновляйте при мерже фич, чтобы архитектура оставалась понятной для всех и для ИИ-ассистентов.
