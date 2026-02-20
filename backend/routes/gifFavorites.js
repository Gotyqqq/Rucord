// ============================================================
// routes/gifFavorites.js — Избранные GIF пользователя
// GET    /api/gif-favorites — список
// POST   /api/gif-favorites — добавить
// DELETE /api/gif-favorites/:id — удалить
// ============================================================

const express = require('express');
const db = require('../database');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

function normalizeGifUrl(url) {
  if (!url || typeof url !== 'string') return '';
  try {
    const u = new URL(url.trim());
    return (u.origin + u.pathname).replace(/\/+$/, '') || url.trim();
  } catch {
    return url.trim();
  }
}

router.get('/', (req, res) => {
  try {
    const list = db.prepare(
      'SELECT id, gif_url, gif_title, folder_id, created_at FROM user_gif_favorites WHERE user_id = ? ORDER BY created_at DESC'
    ).all(req.user.id);
    const seen = new Set();
    const deduped = list.filter((f) => {
      const key = normalizeGifUrl(f.gif_url);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    res.json({ favorites: deduped });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

router.post('/', (req, res) => {
  try {
    const { gif_url, gif_title, folder_id } = req.body;
    if (!gif_url || typeof gif_url !== 'string') {
      return res.status(400).json({ error: 'gif_url обязателен' });
    }
    const rawUrl = gif_url.trim();
    const normalized = normalizeGifUrl(rawUrl);
    const title = (gif_title || '').trim();
    let fid = (folder_id != null && folder_id !== '') ? parseInt(folder_id, 10) : null;
    if (fid !== null && !isNaN(fid)) {
      const folderRow = db.prepare('SELECT id FROM user_gif_folders WHERE id = ? AND user_id = ?').get(fid, req.user.id);
      if (!folderRow) fid = null;
    } else {
      fid = null;
    }
    const all = db.prepare(
      'SELECT id, gif_url, gif_title, folder_id, created_at FROM user_gif_favorites WHERE user_id = ?'
    ).all(req.user.id);
    const existing = all.find((f) => normalizeGifUrl(f.gif_url) === normalized);
    if (existing) {
      const currentFid = existing.folder_id ?? null;
      if (fid !== currentFid) {
        db.prepare('UPDATE user_gif_favorites SET folder_id = ? WHERE id = ?').run(fid, existing.id);
        const updated = db.prepare('SELECT id, gif_url, gif_title, folder_id, created_at FROM user_gif_favorites WHERE id = ?').get(existing.id);
        return res.json({ favorite: updated });
      }
      return res.json({ favorite: existing });
    }
    db.prepare(
      'INSERT INTO user_gif_favorites (user_id, gif_url, gif_title, folder_id) VALUES (?, ?, ?, ?)'
    ).run(req.user.id, rawUrl, title, fid);
    const row = db.prepare(
      'SELECT id, gif_url, gif_title, folder_id, created_at FROM user_gif_favorites WHERE user_id = ? ORDER BY id DESC LIMIT 1'
    ).get(req.user.id);
    res.json({ favorite: row });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

router.delete('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const row = db.prepare('SELECT id FROM user_gif_favorites WHERE id = ? AND user_id = ?').get(id, req.user.id);
    if (!row) return res.status(404).json({ error: 'Не найдено' });
    db.prepare('DELETE FROM user_gif_favorites WHERE id = ?').run(id);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

module.exports = router;
