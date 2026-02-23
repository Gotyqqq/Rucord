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
git add -A
$status = git status --short
if (-not $status) {
    Write-Host "Нет изменений для коммита." -ForegroundColor Yellow
    exit 0
}
Write-Host $status
git commit -m $Message
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ">>> Git push origin main..." -ForegroundColor Cyan
git push origin main
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ">>> Пуш выполнен." -ForegroundColor Green
Write-Host ""
Write-Host 'Чтобы изменения появились на сервере:' -ForegroundColor Yellow
Write-Host '  - Если настроен GitHub Actions — деплой запустится сам, проверь вкладку Actions.' -ForegroundColor Gray
Write-Host '  - Иначе зайди по SSH и выполни:  ~/Rucord/deploy.sh' -ForegroundColor Gray
Write-Host '  - После обновления открой сайт с жёстким обновлением (Ctrl+Shift+R), чтобы сбросить кэш браузера.' -ForegroundColor Gray

# SSH deploy: run manually:  ssh root@YOUR_IP 'cd ~/Rucord; ./deploy.sh'
