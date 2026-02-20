// ============================================================
// routes/gifSearch.js — Поиск гифок по ключевым словам (прокси Giphy)
// GET /api/gif-search?q=грустно — возвращает массив { url, title }
// ============================================================

const express = require('express');
const router = express.Router();

const GIPHY_KEY = process.env.GIPHY_API_KEY || '';

router.get('/', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) {
    return res.json({ data: [] });
  }
  if (!GIPHY_KEY) {
    return res.status(503).json({ error: 'Поиск гифок отключён: не задан GIPHY_API_KEY в .env сервера' });
  }
  try {
    const url = `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_KEY}&q=${encodeURIComponent(q)}&limit=20&rating=g`;
    const response = await fetch(url);
    const json = await response.json();
    const list = (json.data || []).map((g) => ({
      url: g.images?.original?.url || g.images?.fixed_height?.url || '',
      title: g.title || g.slug || ''
    })).filter((g) => g.url);
    res.json({ data: list });
  } catch (err) {
    console.error('Giphy search error:', err);
    res.status(500).json({ error: 'Ошибка поиска гифок' });
  }
});

module.exports = router;
