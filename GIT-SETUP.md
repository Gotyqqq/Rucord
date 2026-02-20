# Полная инструкция: репозиторий в GitHub и первый пуш

---

## Часть 1. Аккаунт на GitHub

### 1.1. Регистрация

1. Открой в браузере: **https://github.com**
2. Нажми **Sign up** (вверху справа).
3. Введи:
   - **Email** — твой рабочий email.
   - **Password** — придумай пароль (минимум 15 символов или 8+ с буквами и цифрами).
   - **Username** — логин на GitHub (например `ulyan` или `myrucord`). Он будет в ссылке: `github.com/ТВОЙ_USERNAME`.
4. Подтверди, что ты не робот, и нажми **Create account**.
5. GitHub отправит код на email — введи его на сайте для верификации.

Аккаунт готов.

---

## Часть 2. Создать новый репозиторий на GitHub

### 2.1. Новая страница репозитория

1. Зайди на **https://github.com** и войди в аккаунт.
2. В правом верхнем углу нажми **+** → **New repository** (или перейди по ссылке **https://github.com/new**).

### 2.2. Настройки репозитория

Заполни форму:

| Поле | Что указать |
|------|-------------|
| **Repository name** | Например: `rucord` или `dota-mini`. Латинские буквы, цифры, дефис. |
| **Description** | По желанию: «Rucord — чат в стиле Discord». |
| **Public** | Оставь **Public** (репо будет виден всем, код можно не показывать никому, если не дашь ссылку). |
| **Add a README file** | **Не ставь галочку** — у тебя уже есть проект, не нужен пустой README от GitHub. |
| **Add .gitignore** | **Не выбирай** — в проекте уже есть свой `.gitignore`. |
| **Choose a license** | Можно оставить **None**. |

3. Нажми зелёную кнопку **Create repository**.

### 2.3. Что ты увидишь дальше

Откроется страница с подсказками вроде «…or push an existing repository from the command line».  
Там будет блок с командами — они для уже инициализированного локального репо. Дальше мы сделаем всё по шагам у себя на компьютере.

**Скопируй и сохрани URL репозитория.** Он выглядит так:

- **HTTPS:** `https://github.com/ТВОЙ_USERNAME/rucord.git`
- **SSH:** `git@github.com:ТВОЙ_USERNAME/rucord.git`

Для начала удобнее использовать **HTTPS** (проще с паролем/токеном).

---

## Часть 3. Подключить локальный проект к репозиторию

Все команды выполняй **на своём компьютере** в терминале (PowerShell или CMD). Git должен быть установлен.

### 3.1. Открыть папку проекта

```bash
cd c:\Users\ulyan\dota-mini
```

### 3.2. Инициализировать Git (если ещё не делал)

```bash
git init
```

Должно появиться: `Initialized empty Git repository in c:/Users/ulyan/dota-mini/.git/`

### 3.3. Добавить удалённый репозиторий

Подставь **свой** URL вместо `https://github.com/ТВОЙ_USERNAME/rucord.git`:

```bash
git remote add origin https://github.com/ТВОЙ_USERNAME/rucord.git
```

Пример: если логин `ulyan` и репо называется `rucord`:

```bash
git remote add origin https://github.com/ulyan/rucord.git
```

Если напишет, что `origin` уже есть, заменить URL можно так:

```bash
git remote set-url origin https://github.com/ТВОЙ_USERNAME/rucord.git
```

### 3.4. Добавить все файлы и сделать первый коммит

```bash
git add .
git status
```

`git status` покажет список файлов. Должны быть папки `backend`, `frontend`, файлы в корне. Не должно быть `backend/.env` (он в `.gitignore`).

```bash
git commit -m "Первый коммит: Rucord"
```

### 3.5. Назвать основную ветку и отправить код на GitHub

```bash
git branch -M main
git push -u origin main
```

При первом `git push` браузер или терминал попросят **авторизацию на GitHub**.

---

## Часть 4. Авторизация при push (HTTPS)

Раньше GitHub принимал обычный пароль от аккаунта. Сейчас для HTTPS чаще нужен **Personal Access Token (PAT)**.

### 4.1. Создать токен

1. На GitHub: правый верхний угол → **профиль** → **Settings**.
2. Слева внизу: **Developer settings**.
3. **Personal access tokens** → **Tokens (classic)**.
4. **Generate new token** → **Generate new token (classic)**.
5. Заполни:
   - **Note:** например `rucord-push`.
   - **Expiration:** 90 days или No expiration (как тебе удобнее).
   - **Scopes:** поставь галочку **repo** (полный доступ к репозиториям).
6. Нажми **Generate token**.
7. **Скопируй токен сразу** — потом его не покажут. Сохрани в надёжное место (блокнот, менеджер паролей).

### 4.2. Выполнить push с токеном

В терминале снова выполни:

```bash
git push -u origin main
```

Когда спросит логин и пароль:

- **Username:** твой GitHub username (например `ulyan`).
- **Password:** вставь **токен** (не пароль от входа в GitHub).

После успешного пуша в репозитории на GitHub появятся все файлы проекта.

---

## Часть 5. Дальнейшая работа

- **После изменений в коде** (сам или с моей помощью в Cursor):

```bash
cd c:\Users\ulyan\dota-mini
git add .
git commit -m "Кратко что сделано"
git push origin main
```

- **На сервере** после каждого такого пуша выполняешь (по инструкции из DEPLOY.md):

```bash
~/rucord/deploy.sh
```

или вручную: `git pull`, `npm run build` в frontend, `pm2 restart rucord` в backend.

---

## Часть 6. Если что-то пошло не так

| Ошибка | Что сделать |
|--------|-------------|
| `git is not recognized` | Установить Git: https://git-scm.com/download/win и перезапустить терминал. |
| `remote origin already exists` | Выполнить: `git remote set-url origin https://github.com/USER/rucord.git` со своим URL. |
| `Support for password authentication was removed` | Использовать **Personal Access Token** вместо пароля (Часть 4). |
| `failed to push some refs` | Сначала выполнить: `git pull origin main --rebase`, потом снова `git push origin main`. |
| В репо попал файл `backend/.env` | Не пушить пароли. Удалить из индекса: `git rm --cached backend/.env`, добавить `backend/.env` в `.gitignore`, закоммитить и пуш. В самом GitHub в настройках репо смени пароли/секреты, если они там были. |

Если пришлёшь точный текст ошибки (без паролей и токенов), можно разобрать по шагам под твой случай.
