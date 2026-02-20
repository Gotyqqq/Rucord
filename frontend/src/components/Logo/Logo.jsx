// ============================================================
// Logo.jsx — Логотип Rucord (SVG)
// ============================================================

import React from 'react';

/**
 * Логотип: стилизованная буква R в стиле голосового чата / сообщений.
 * Пропсы: size (число, размер по высоте), className, showText (показать "Rucord" рядом).
 */
export default function Logo({ size = 48, className = '', showText = false }) {
  const s = size;
  return (
    <div className={`logo-wrap ${className}`} style={{ '--logo-size': `${s}px` }}>
      <svg
        viewBox="0 0 48 48"
        width={s}
        height={s}
        className="logo-svg"
        aria-hidden="true"
      >
        {/* Фон — скруглённый квадрат в стиле Discord */}
        <rect x="2" y="2" width="44" height="44" rx="12" fill="#5865f2" />
        {/* Буква R: вертикальная черта */}
        <path d="M16 14v20" stroke="white" strokeWidth="4" strokeLinecap="round" fill="none" />
        {/* Верхняя дуга R */}
        <path d="M16 14h8a6 6 0 1 1 0 12H16" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        {/* Ножка R */}
        <path d="M22 26l8 8" stroke="white" strokeWidth="4" strokeLinecap="round" fill="none" />
      </svg>
      {showText && <span className="logo-text">Rucord</span>}
    </div>
  );
}
