// ============================================================
// routes/gifFolders.js — Папки избранных GIF (макс. 5 на пользователя)
// GET    /api/gif-folders — список папок
// POST   /api/gif-folders — создать папку (name)
// PATCH  /api/gif-folders/:id — переименовать
// DELETE /api/gif-folders/:id — удалить (избранное внутри переходит в «общие»)
// ============================================================

const express = require('express');
const db = require('../database');
const { authMiddleware } = require('../middleware/auth');

const MAX_FOLDERS = 5;
const router = express.Router();
router.use(authMiddleware);

router.get('/', (req, res) => {
  try {
    const list = db.prepare(
      'SELECT id, name, created_at FROM user_gif_folders WHERE user_id = ? ORDER BY id ASC'
    ).all(req.user.id);
    res.json({ folders: list });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

router.post('/', (req, res) => {
  try {
    const { name } = req.body;
    const trimmed = (name != null && typeof name === 'string') ? name.trim() : '';
    if (!trimmed) {
      return res.status(400).json({ error: 'Название папки обязательно' });
    }
    const count = db.prepare('SELECT COUNT(*) as n FROM user_gif_folders WHERE user_id = ?').get(req.user.id);
    if (count.n >= MAX_FOLDERS) {
      return res.status(400).json({ error: `Максимум ${MAX_FOLDERS} папок` });
    }
    db.prepare('INSERT INTO user_gif_folders (user_id, name) VALUES (?, ?)').run(req.user.id, trimmed.slice(0, 100));
    const row = db.prepare(
      'SELECT id, name, created_at FROM user_gif_folders WHERE user_id = ? ORDER BY id DESC LIMIT 1'
    ).get(req.user.id);
    res.status(201).json({ folder: row });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

router.patch('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { name } = req.body;
    const trimmed = (name != null && typeof name === 'string') ? name.trim() : '';
    if (!trimmed) {
      return res.status(400).json({ error: 'Название папки обязательно' });
    }
    const row = db.prepare('SELECT id FROM user_gif_folders WHERE id = ? AND user_id = ?').get(id, req.user.id);
    if (!row) return res.status(404).json({ error: 'Папка не найдена' });
    db.prepare('UPDATE user_gif_folders SET name = ? WHERE id = ?').run(trimmed.slice(0, 100), id);
    const updated = db.prepare('SELECT id, name, created_at FROM user_gif_folders WHERE id = ?').get(id);
    res.json({ folder: updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

router.delete('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const row = db.prepare('SELECT id FROM user_gif_folders WHERE id = ? AND user_id = ?').get(id, req.user.id);
    if (!row) return res.status(404).json({ error: 'Папка не найдена' });
    db.prepare('UPDATE user_gif_favorites SET folder_id = NULL WHERE folder_id = ?').run(id);
    db.prepare('DELETE FROM user_gif_folders WHERE id = ?').run(id);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

module.exports = router;
