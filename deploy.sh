#!/usr/bin/env bash
# Полный деплой: pull, сборка фронта, копирование в каталог nginx, перезапуск бэкенда
# Запуск на сервере: ~/Rucord/deploy.sh

set -e

REPO_DIR="${REPO_DIR:-$HOME/Rucord}"
# Каталог, откуда nginx раздаёт статику (см. root в nginx-rucord-fun.conf)
NGINX_FRONTEND_ROOT="${NGINX_FRONTEND_ROOT:-/var/www/www-root/data/root/Rucord/frontend/dist}"

cd "$REPO_DIR"
echo ">>> git fetch + reset на origin/main (всегда актуальный код)..."
git fetch origin
git reset --hard origin/main

echo ">>> backend: npm install..."
cd "$REPO_DIR/backend" && npm install

echo ">>> frontend: npm install + build..."
cd "$REPO_DIR/frontend" && rm -rf node_modules/.vite && npm install && npm run build

echo ">>> копирование фронта в каталог nginx (очистка старой сборки)..."
sudo mkdir -p "$NGINX_FRONTEND_ROOT"
sudo rm -rf "${NGINX_FRONTEND_ROOT:?}"/*
sudo cp -r "$REPO_DIR/frontend/dist/." "$NGINX_FRONTEND_ROOT"/

echo ">>> перезапуск бэкенда (pm2)..."
cd "$REPO_DIR/backend" && NODE_ENV=production pm2 restart rucord

echo ">>> Готово."
