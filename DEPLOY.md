# Пошаговая настройка сервера (вариант А)

Ты подключаешься по SSH и выполняешь команды по шагам. Пароль вводишь только у себя.

---

## Часть 1. Один раз у себя на компьютере (перед первым деплоем)

### 1.1. Репозиторий и первый пуш

Если проект ещё не в git или не запушен:

```bash
cd c:\Users\ulyan\dota-mini
git init
git add .
git commit -m "Initial: Rucord"
git remote add origin https://github.com/ТВОЙ_ЛОГИН/rucord.git
git branch -M main
git push -u origin main
```

(Замени `ТВОЙ_ЛОГИН/rucord` на свой репозиторий. Если репо уже есть и привязан — просто сделай `git add .` → `git commit` → `git push`.)

### 1.2. Сгенерировать JWT_SECRET для продакшена

В PowerShell или в браузере (консоль) выполни один раз и сохрани строку:

```powershell
# PowerShell (одна строка):
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }) -as [byte[]])
```

Или сгенерируй любую длинную случайную строкку (32+ символов) и сохрани — её потом вставишь в `.env` на сервере.

---

## Часть 2. Подключение к серверу

1. Открой терминал (PowerShell или PuTTY).
2. Подключись по SSH (подставь свой IP и логин):

```bash
ssh root@ТВОЙ_IP
```

Или, если создавал пользователя:

```bash
ssh rucord@ТВОЙ_IP
```

3. Введи пароль когда попросит. Дальше все команды выполняются уже на сервере.

---

## Часть 3. Установка софта на сервере (один раз)

Копируй и вставляй блоки по очереди. После каждого блока дождись окончания.

### 3.1. Обновление системы

```bash
sudo apt update && sudo apt upgrade -y
```

### 3.2. Node.js (LTS), git, nginx

```bash
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt install -y nodejs git nginx
node -v
npm -v
```

Должны показаться версии Node и npm.

### 3.3. PM2 (запуск Node в фоне)

```bash
sudo npm install -g pm2
```

---

## Часть 4. Клонирование проекта и настройка

### 4.1. Клонировать репозиторий

Замени `https://github.com/ТВОЙ_ЛОГИН/rucord.git` на свой URL репо.

```bash
cd ~
git clone https://github.com/ТВОЙ_ЛОГИН/rucord.git rucord
cd rucord
```

### 4.2. Backend: зависимости и .env

```bash
cd ~/rucord/backend
npm install
cp .env.example .env
nano .env
```

В открывшемся редакторе задай (подставь свои значения):

- `JWT_SECRET=` — вставь длинную случайную строку из шага 1.2.
- `MASTER_USER_IDS=1` — id мастера (можно оставить 1, потом поменять).
- `PORT=3001`
- При необходимости раскомментируй и впиши `GIPHY_API_KEY=...`

Сохранить в nano: `Ctrl+O`, Enter, затем `Ctrl+X`.

### 4.3. Frontend: сборка

```bash
cd ~/rucord/frontend
npm install
npm run build
```

Должна появиться папка `frontend/dist`.

### 4.4. Запуск backend через PM2

```bash
cd ~/rucord/backend
NODE_ENV=production pm2 start server.js --name rucord
pm2 save
pm2 status
```

В списке должен быть процесс `rucord` в статусе `online`. Проверка локально на сервере:

```bash
curl -s http://localhost:3001/
```

Должен вернуться JSON с сообщением, что API работает.

---

## Часть 5. Nginx (раздача фронта и проксирование API/Socket)

### 5.1. Создать конфиг

Подставь вместо `ТВОЙ_IP` свой IP или домен (например `rucord.example.com`). Если пока без домена — укажи IP или `_`.

Путь к фронту зависит от пользователя, под которым клонировал репо:
- если заходил как **root**: `root /root/rucord/frontend/dist;`
- если как пользователь **rucord**: `root /home/rucord/rucord/frontend/dist;`

```bash
sudo nano /etc/nginx/sites-available/rucord
```

Вставь целиком (замени `ТВОЙ_IP` и при необходимости путь в `root`):

```nginx
server {
    listen 80;
    server_name ТВОЙ_IP;

    root /root/rucord/frontend/dist;
    index index.html;

    location / {
        try_files $uri /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /socket.io/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

Сохрани: `Ctrl+O`, Enter, `Ctrl+X`.

### 5.2. Включить сайт и перезагрузить Nginx

```bash
sudo ln -sf /etc/nginx/sites-available/rucord /etc/nginx/sites-enabled/rucord
sudo nginx -t
sudo systemctl reload nginx
```

Если `nginx -t` написал «syntax is ok» — всё ок.

---

## Часть 6. Проверка

1. В браузере открой: `http://ТВОЙ_IP`
2. Должна открыться главная Rucord (лендинг).
3. Зарегистрируй пользователя и зайди — чат и сокеты должны работать.

Если что-то не открывается или не работает — пришли вывод команд (без паролей):

```bash
pm2 status
pm2 logs rucord --lines 30
sudo nginx -t
```

---

## Часть 7. Обновление сайта после изменений в коде

Когда ты вносишь изменения в Cursor и пушишь в репозиторий, на сервере нужно подтянуть код и пересобрать фронт.

Подключись по SSH и выполни (подставь свой путь, если заходишь не под `root`):

```bash
cd ~/Rucord
git pull --ff-only

cd backend
npm install
# В бэкенде нет шага build — только во фронте

cd ../frontend
npm install
npm run build

cd ../backend
NODE_ENV=production pm2 restart rucord
```

Готовый скрипт на сервере (один раз создать):

```bash
nano ~/Rucord/deploy.sh
```

Вставь:

```bash
#!/usr/bin/env bash
set -e
cd ~/Rucord
git pull --ff-only
cd backend && npm install
cd ../frontend && npm install && npm run build
cd ../backend && NODE_ENV=production pm2 restart rucord
echo "Done."
```

Сохрани, затем:

```bash
chmod +x ~/Rucord/deploy.sh
```

Дальше после каждого `git push` достаточно зайти по SSH и выполнить:

```bash
~/Rucord/deploy.sh
```

---

## Краткая шпаргалка

| Действие | Где | Команда |
|----------|-----|--------|
| Подключиться к серверу | У себя в терминале | `ssh root@ТВОЙ_IP` |
| Обновить сайт после правок | На сервере | `~/rucord/deploy.sh` |
| Логи бэкенда | На сервере | `pm2 logs rucord` |
| Перезапуск бэкенда | На сервере | `pm2 restart rucord` |

Если на каком-то шаге будет ошибка — скопируй её текст (без паролей) и пришли, подправим команды.
