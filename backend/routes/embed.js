// ============================================================
// routes/embed.js — Разрешение ссылок на гифки (Tenor, Giphy и т.д.) в прямые URL
// GET /api/embed?url=https://tenor.com/view/...
// ============================================================

const express = require('express');
const router = express.Router();

function isTenorViewUrl(url) {
  return /^https?:\/\/(www\.)?tenor\.com\/view\//i.test(url || '');
}

function isGiphyViewUrl(url) {
  return /^https?:\/\/(www\.)?giphy\.com\/gifs\//i.test(url || '');
}

router.get('/', async (req, res) => {
  const rawUrl = (req.query.url || '').trim();
  if (!rawUrl) {
    return res.status(400).json({ error: 'Не указан url' });
  }
  let gifUrl = null;
  try {
    if (isTenorViewUrl(rawUrl)) {
      const response = await fetch(rawUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36' }
      });
      const html = await response.text();
      const m1 = html.match(/https?:\/\/[^"'\s]*\.tenor\.com\/[^"'\s]+\.gif/i);
      const m2 = html.match(/contentUrl["\s:]+["']?(https?:\/\/[^"'\s]+\.gif)/i);
      const m3 = html.match(/"(https?:\/\/media\.tenor\.com\/[^"]+\.gif)"/i);
      const match = m1 || m2 || m3;
      if (match) {
        gifUrl = (match[1] || match[0]).replace(/\\u002F/g, '/').split('?')[0];
        if (!gifUrl.startsWith('http')) gifUrl = 'https://' + gifUrl;
      }
    } else if (isGiphyViewUrl(rawUrl)) {
      const response = await fetch(rawUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Rucord/1.0)' }
      });
      const html = await response.text();
      const match = html.match(/https?:\/\/[^"'\s]*media\.giphy\.com\/[^"'\s]+\.gif/i)
        || html.match(/"(https?:\/\/[^"]*giphy\.com\/media\/[^"]+)"/i);
      if (match) gifUrl = (match[1] || match[0]).replace(/\\u002F/g, '/');
    }
    if (gifUrl) {
      return res.json({ gif_url: gifUrl });
    }
    res.status(404).json({ error: 'Не удалось получить гифку по ссылке' });
  } catch (err) {
    console.error('Embed resolve error:', err);
    res.status(500).json({ error: 'Ошибка при загрузке ссылки' });
  }
});

module.exports = router;
