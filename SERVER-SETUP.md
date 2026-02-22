# Подробная настройка сервера (команды и файлы)

Пошагово: подключение по SSH, какие файлы менять на сервере и какие команды выполнять.

---

## 1. Подключиться к серверу по SSH

**На своём компьютере** (PowerShell или терминал):

```bash
ssh root@92.63.107.123
```

Если используешь домен (после настройки DNS):

```bash
ssh root@rucrod.io
```

- При первом подключении введи `yes` на вопрос про fingerprint.
- Когда попросит пароль — введи пароль от сервера.
- Дальше все команды ниже выполняются **уже на сервере** (в этой сессии).

---

## 2. Файлы и папки на сервере (что где менять)

| Где | Путь | Что делать |
|-----|------|------------|
| Конфиг Nginx | `/etc/nginx/sites-available/rucord` | Создать или отредактировать (домен, SSL, root) |
| Симлинк Nginx | `/etc/nginx/sites-enabled/rucord` | Должен вести на sites-available/rucord |
| Backend .env | `~/rucord/backend/.env` или `~/Rucord/backend/.env` | Секреты (JWT_SECRET, PORT и т.д.) |
| Frontend сборка | `~/rucord/frontend/dist` или `/var/www/.../Rucord/frontend/dist` | Сюда копируется собранный фронт |
| SSL-сертификаты | Часто `/var/www/httpd-cert/...` | Пути смотреть в панели после выпуска серта |

Точный путь к фронту (`root` в nginx) зависит от того, как ты деплоишь:
- Клонировал репо в домашнюю папку: `root /root/rucord/frontend/dist;` или `root /home/ИМЯ/rucord/frontend/dist;`
- Копируешь через панель в `/var/www/...`: как в `nginx-rucord-example.conf` — `root /var/www/www-root/data/root/Rucord/frontend/dist;`

---

## 3. Домен rucrod.io: что сделать по шагам

### 3.1. DNS

У регистратора домена (где купил rucrod.io) создай A-записи:

| Тип | Имя | Значение | TTL (по умолчанию) |
|-----|-----|----------|--------------------|
| A   | @   | 92.63.107.123 | 300 |
| A   | www | 92.63.107.123 | 300 |

Сохрани изменения и подожди 5–30 минут (иногда до нескольких часов).

### 3.2. SSL-сертификат для rucrod.io

В панели хостинга (ISPmanager и т.п.):

1. Найти раздел типа «SSL-сертификаты» / «Let's Encrypt».
2. Выпустить сертификат для `rucrod.io` (и при необходимости для `www.rucrod.io`).
3. Записать **фактические пути** к файлам, например:
   - Сертификат: `/var/www/httpd-cert/www-root/rucrod.io_le2.crt` (или как покажет панель)
   - Ключ: `/var/www/httpd-cert/www-root/rucrod.io_le2.key`

Эти пути понадобятся в конфиге Nginx.

### 3.3. Создать/изменить конфиг Nginx на сервере

Подключись по SSH (шаг 1), затем:

```bash
sudo nano /etc/nginx/sites-available/rucord
```

**Если файла нет** — вставь конфиг целиком. **Если файл уже есть** (был для другого домена) — замени в нём:

- `server_name` на `rucrod.io www.rucrod.io`
- `ssl_certificate` и `ssl_certificate_key` на пути из панели (шаг 3.2)
- `root` на путь, где у тебя лежит собранный фронт (см. таблицу выше)

**Пример готового конфига** (пути к SSL и root поправь под себя):

```nginx
# Редирект HTTP → HTTPS
server {
    listen 80;
    server_name rucrod.io www.rucrod.io;
    return 301 https://$host$request_uri;
}

# HTTPS
server {
    listen 443 ssl;
    server_name rucrod.io www.rucrod.io;

    ssl_certificate     /var/www/httpd-cert/www-root/rucrod.io_le2.crt;
    ssl_certificate_key /var/www/httpd-cert/www-root/rucrod.io_le2.key;

    root /var/www/www-root/data/root/Rucord/frontend/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /socket.io {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

В nano: сохранить — `Ctrl+O`, Enter, выйти — `Ctrl+X`.

Включить сайт и проверить Nginx:

```bash
sudo ln -sf /etc/nginx/sites-available/rucord /etc/nginx/sites-enabled/rucord
sudo nginx -t
sudo systemctl reload nginx
```

Если `nginx -t` выведет `syntax is ok` — конфиг применён.

---

## 4. Backend: файл .env на сервере

Файл для секретов (один из вариантов пути):

```bash
nano ~/rucord/backend/.env
```

или, если проект лежит в `Rucord`:

```bash
nano ~/Rucord/backend/.env
```

**Что должно быть в .env:**

```env
JWT_SECRET=длинная-случайная-строка-32-символа-и-больше
MASTER_USER_IDS=1
PORT=3001
```

- `JWT_SECRET` — сгенерировать один раз (например на ПК в PowerShell: `[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }) -as [byte[]])`) и вставить в кавычках или без.
- Опционально: `GIPHY_API_KEY=твой_ключ` — если нужен поиск GIF.

Сохранить: `Ctrl+O`, Enter, `Ctrl+X`.

Перезапуск бэкенда после смены .env:

```bash
pm2 restart rucord
pm2 status
```

---

## 5. Обновление сайта (деплой) после изменений в коде

### Вариант A: проект на сервере в ~/rucord (git pull + сборка)

```bash
cd ~/rucord
git pull origin main

cd ~/rucord/frontend
npm install
npm run build

cd ~/rucord/backend
npm install
pm2 restart rucord
```

Если фронт копируется в панель в `/var/www/.../Rucord/frontend/dist`, после `npm run build` скопируй содержимое `~/rucord/frontend/dist` в эту папку (через панель или `cp -r`).

### Вариант B: копирование только фронта (бэкенд уже запущен)

Если бэкенд не менялся и фронт собираешь локально или в другом месте:

```bash
# На сервере — если фронт приезжает в ~/rucord/frontend/dist
cd ~/rucord/frontend && npm run build

# Если статика должна лежать в /var/www/...
sudo cp -r ~/rucord/frontend/dist/* /var/www/www-root/data/root/Rucord/frontend/dist/
```

Путь `/var/www/...` замени на тот, что указан в `root` в твоём nginx.

---

## 6. Полезные команды на сервере

| Действие | Команда |
|----------|--------|
| Статус бэкенда | `pm2 status` |
| Логи бэкенда | `pm2 logs rucord --lines 50` |
| Перезапуск бэкенда | `pm2 restart rucord` |
| Проверка конфига Nginx | `sudo nginx -t` |
| Перезагрузка Nginx | `sudo systemctl reload nginx` |
| Проверить, слушает ли порт 3001 | `curl -s http://localhost:3001/` |

---

## 7. Что менять в проекте на своём компьютере (локально)

Для работы по домену **rucrod.io** в самом репозитории менять ничего не нужно:

- Фронт и сокеты подставляют текущий адрес сайта сами (`window.location.origin`).
- В репозитории уже есть пример конфига Nginx с rucrod.io: **`nginx-rucord-example.conf`** — по нему можно сверяться, но править нужно **файл на сервере** `/etc/nginx/sites-available/rucord`, а не этот пример.

Если захочешь поменять домен снова — достаточно обновить в конфиге на сервере `server_name` и пути к SSL и при необходимости скопировать актуальный пример из `nginx-rucord-example.conf`.

---

## 8. Краткий чеклист

1. DNS: A-записи для rucrod.io и www → IP сервера.
2. SSL: выпустить сертификат для rucrod.io в панели, запомнить пути к .crt и .key.
3. На сервере: отредактировать `/etc/nginx/sites-available/rucord` (server_name, ssl_*, root), затем `nginx -t` и `reload nginx`.
4. На сервере: проверить `~/rucord/backend/.env` (JWT_SECRET, PORT), при необходимости `pm2 restart rucord`.
5. Собрать фронт и положить в папку из `root` в nginx (или скопировать из ~/rucord/frontend/dist).
6. Открыть в браузере https://rucrod.io и проверить вход и чат.

Если на каком-то шаге будет ошибка — пришли вывод команды (без паролей), подскажем, что поправить.

---

## 9a. Сброс базы данных (все пользователи и данные удаляются)

Если нужно начать с чистой базы (все аккаунты, серверы, сообщения удалятся):

```bash
pm2 stop rucord
rm -f ~/Rucord/backend/rucord.db
pm2 start rucord
```

После этого при первом обращении к сайту будет создана новая пустая БД. Все пользователи должны заново зарегистрироваться.

**Сброс пароля одного пользователя** (без удаления всей БД): на сервере выполни `node ~/Rucord/backend/reset-password.js EMAIL НОВЫЙ_ПАРОЛЬ`.

---

## 9b. Два конфига для одного домена (HTTPS отдаёт не тот сертификат)

Если в панели включён SSL (rucord.fun_le3), а в браузере всё равно «Не защищено», проверь:

```bash
sudo nginx -T 2>/dev/null | grep -A 80 "server_name rucord.fun"
```

Если в выводе **два** набора блоков `server` для rucord.fun (один из `sites-available/rucord`, другой из `vhosts/www-root/rucord.fun.conf`), то первый блок с `listen 443 ssl` без IP перехватывает запросы и отдаёт старый сертификат (например _le2). Нужно **отключить** конфиг из sites-enabled:

```bash
sudo rm -f /etc/nginx/sites-enabled/rucord
sudo nginx -t
sudo systemctl reload nginx
```

После этого будет использоваться только конфиг панели (`vhosts/www-root/rucord.fun.conf`) с правильным сертификатом _le3.

---

## 9. Проблемы: HTTPS «Не защищено» и сайт пустой (заглушка ISPmanager)

Если в панели SSL вроде получен, но в браузере по https://rucord.fun пишет «Не защищено», а вместо Rucord показывается страница «Сайт только что создан» — значит запрос обрабатывает не тот виртуальный хост или в папке сайта нет файлов. Делай по шагам.

### Шаг 1. Проверить, что в папке сайта лежит собранный фронт

Подключись по SSH и выполни:

```bash
ls -la /var/www/www-root/data/root/Rucord/frontend/dist
```

Должны быть файлы `index.html` и папка `assets` (или похожая). Если папки `dist` нет или она пустая — сайт «пустой» именно из‑за этого.

**Если файлов нет** — собери фронт и скопируй в эту папку.

Вариант А (проект уже есть на сервере, например в `~/rucord`):

```bash
cd ~/rucord/frontend
npm install
npm run build
sudo cp -r dist/* /var/www/www-root/data/root/Rucord/frontend/dist/
```

Вариант Б (собираешь у себя на ПК): собери локально (`cd frontend && npm run build`), затем залей содержимое папки `frontend/dist` на сервер в каталог `/var/www/www-root/data/root/Rucord/frontend/dist` (через SFTP, панель «Файловый менеджер» или `scp`).

### Шаг 2. Убедиться, что Nginx обслуживает rucord.fun с HTTPS и нужной папкой

Сейчас запросы к rucord.fun может обрабатывать виртуальный хост, созданный ISPmanager по умолчанию (он и показывает заглушку). Нужно, чтобы для rucord.fun использовался конфиг с твоим `root` и SSL.

Открой конфиг:

```bash
sudo nano /etc/nginx/sites-available/rucord
```

Проверь, что внутри:

1. **Домен:** в обоих блоках `server` указано `server_name rucord.fun www.rucord.fun;` (не rucrod.io и не другой домен).
2. **HTTPS-блок:** есть блок `listen 443 ssl;` с этим `server_name`, и указаны реальные пути к сертификатам, которые выдала панель для rucord.fun, например:
   - `ssl_certificate     /var/www/httpd-cert/www-root/rucord.fun_le2.crt;`
   - `ssl_certificate_key /var/www/httpd-cert/www-root/rucord.fun_le2.key;`
   (Пути могут отличаться — смотри в панели ISPmanager в разделе SSL для rucord.fun.)
3. **Корень сайта:** `root /var/www/www-root/data/root/Rucord/frontend/dist;`
4. **Прокси для API и сокетов:** блоки `location /api` и `location /socket.io` с `proxy_pass http://127.0.0.1:3001;`

Пример полного конфига для **rucord.fun**:

```nginx
# Редирект HTTP → HTTPS
server {
    listen 80;
    server_name rucord.fun www.rucord.fun;
    return 301 https://$host$request_uri;
}

# HTTPS
server {
    listen 443 ssl;
    server_name rucord.fun www.rucord.fun;

    ssl_certificate     /var/www/httpd-cert/www-root/rucord.fun_le2.crt;
    ssl_certificate_key /var/www/httpd-cert/www-root/rucord.fun_le2.key;

    root /var/www/www-root/data/root/Rucord/frontend/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /socket.io {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Сохрани: `Ctrl+O`, Enter, `Ctrl+X`.

### Шаг 3. Включить сайт и перезагрузить Nginx

```bash
sudo ln -sf /etc/nginx/sites-available/rucord /etc/nginx/sites-enabled/rucord
sudo nginx -t
sudo systemctl reload nginx
```

Если `nginx -t` выдаст ошибку — исправь конфиг по тексту ошибки (часто опечатка в путях к сертификатам).

### Шаг 4. Убедиться, что бэкенд запущен

Rucord не заработает без API и сокетов:

```bash
pm2 status
```

Должен быть процесс `rucord` в статусе `online`. Если нет — запусти: `cd ~/rucord/backend && NODE_ENV=production pm2 start server.js --name rucord && pm2 save`.

### Шаг 5. Проверить в браузере

Открой **https://rucord.fun** (лучше в режиме инкогнито или с очисткой кэша). Должны открыться лендинг Rucord и затем чат, а не заглушка; в адресной строке — замочек (защищённое соединение).

Если по‑прежнему «Не защищено» — значит запрос всё ещё обрабатывает другой server (например default). Тогда в панели ISPmanager посмотри, какой конфиг она создаёт для rucord.fun, и либо отключи лишние сайты по умолчанию для этого IP, либо приведи конфиг панели в соответствие с примером выше (HTTPS, правильный root, прокси на 3001).
