#!/usr/bin/env bash
# Проверка деплоя: запустить на сервере после ./deploy.sh
# Показывает, откуда nginx отдаёт фронт и куда копирует deploy.sh — совпадают ли пути.

echo "=== 1. Репозиторий и последний коммит ==="
REPO_DIR="${REPO_DIR:-$HOME/Rucord}"
if [ ! -d "$REPO_DIR" ]; then
  REPO_DIR="$HOME/rucord"
fi
if [ -d "$REPO_DIR" ]; then
  cd "$REPO_DIR" && git log -1 --oneline && echo "Путь: $REPO_DIR"
else
  echo "Папка не найдена: $REPO_DIR и $HOME/rucord"
fi

echo ""
echo "=== 2. Куда deploy.sh копирует фронт (NGINX_FRONTEND_ROOT) ==="
NGINX_FRONTEND_ROOT="${NGINX_FRONTEND_ROOT:-/var/www/www-root/data/root/Rucord/frontend/dist}"
echo "$NGINX_FRONTEND_ROOT"
if [ -d "$NGINX_FRONTEND_ROOT" ]; then
  echo "Дата index.html: $(stat -c '%y' "$NGINX_FRONTEND_ROOT/index.html" 2>/dev/null || stat -f '%Sm' "$NGINX_FRONTEND_ROOT/index.html" 2>/dev/null)"
else
  echo "Папка не существует!"
fi

echo ""
echo "=== 3. Откуда nginx берёт root (проверь свой конфиг) ==="
echo "Обычно: /etc/nginx/sites-enabled/ или /etc/nginx/conf.d/"
grep -r "root.*Rucord\|root.*rucord\|root_path.*Rucord" /etc/nginx/ 2>/dev/null | head -5 || echo "Запусти: grep -r root /etc/nginx/sites-enabled/"

echo ""
echo "=== 4. Если пути разные — задай NGINX_FRONTEND_ROOT и запусти deploy снова ==="
echo "Пример: NGINX_FRONTEND_ROOT=/root/Rucord/frontend/dist $REPO_DIR/deploy.sh"
