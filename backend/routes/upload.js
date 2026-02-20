// ============================================================
// routes/upload.js — Загрузка файлов (вложения к сообщениям)
// POST /api/upload — multipart, возвращает url для вставки в сообщение
// ============================================================

const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
const MAX_SIZE = 5 * 1024 * 1024; // 5 MB — макс. размер файла (аудио/видео и прочие вложения)
const ALLOWED_MIMES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/pdf',
  'video/mp4', 'video/webm', 'video/quicktime',
  'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/mp4', 'audio/webm', 'audio/x-m4a'
];

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '';
    const safeExt = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf', '.mp4', '.webm', '.mov', '.mp3', '.wav', '.ogg', '.m4a'].includes(ext.toLowerCase()) ? ext : '';
    cb(null, uuidv4() + safeExt);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_SIZE },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIMES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Недопустимый тип файла. Разрешены: изображения, PDF, видео (mp4, webm, mov), аудио (mp3, wav, ogg, m4a). Макс. 5 МБ.'));
    }
  }
});

// POST /api/upload — один файл в поле "file"
router.post('/', (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'Файл слишком большой (макс. 5 МБ)' });
      return res.status(400).json({ error: err.message || 'Ошибка загрузки' });
    }
    next();
  });
}, (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Файл не выбран' });
    }
    const url = '/api/uploads/' + req.file.filename;
    res.json({
      url,
      filename: req.file.originalname,
      mimeType: req.file.mimetype,
      file_path: req.file.filename
    });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: err.message || 'Ошибка загрузки' });
  }
});

module.exports = router;
