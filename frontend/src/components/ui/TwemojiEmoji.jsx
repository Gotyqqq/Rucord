import React, { useMemo } from 'react';
import twemoji from 'twemoji';

/**
 * Рендерит эмодзи в стиле Twitter (Twemoji), как в пикере — единый вид везде.
 */
export function TwemojiEmoji({ emoji, className, size = 20, ...props }) {
  const html = useMemo(() => {
    if (!emoji || typeof emoji !== 'string') return '';
    return twemoji.parse(emoji.trim(), {
      folder: 'svg',
      ext: '.svg',
      base: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/'
    });
  }, [emoji]);

  if (!html) return null;

  return (
    <span
      className={`twemoji-wrap ${className || ''}`.trim()}
      dangerouslySetInnerHTML={{ __html: html }}
      data-size={size}
      {...props}
    />
  );
}
