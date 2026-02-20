# deploy.ps1 — Пуш в GitHub и (опционально) деплой на сервер по SSH
# Запуск: в папке проекта выполнить: .\deploy.ps1
# Или: .\deploy.ps1 "сообщение коммита"
# Чтобы деплой на сервер работал без ввода пароля, настрой вход по SSH-ключу.

param(
    [string]$Message = "Update " + (Get-Date -Format "yyyy-MM-dd HH:mm")
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host ">>> Git add + commit..." -ForegroundColor Cyan
git add .
$status = git status --short
if (-not $status) {
    Write-Host "Нет изменений для коммита." -ForegroundColor Yellow
    exit 0
}
git commit -m $Message
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ">>> Git push origin main..." -ForegroundColor Cyan
git push origin main
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ">>> Пуш выполнен." -ForegroundColor Green

# Деплой на сервер по SSH (раскомментируй и подставь свой хост и пользователя)
# Требуется: вход по SSH-ключу без пароля (ssh-keygen, затем ssh-copy-id root@IP)
# $SERVER = "root@92.63.107.123"   # замени на свой IP или домен
# Write-Host ">>> Деплой на сервер $SERVER ..." -ForegroundColor Cyan
# ssh $SERVER "cd ~/Rucord && ./deploy.sh && sudo chmod -R 755 /root/Rucord/frontend/dist && sudo systemctl reload nginx"
# if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
# Write-Host ">>> Готово. Сайт обновлён." -ForegroundColor Green
