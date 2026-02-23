// Преобразует avatar_url из API в полный URL для отображения
export function getAvatarUrl(avatarUrl) {
  if (!avatarUrl) return null;
  return avatarUrl.startsWith('http') ? avatarUrl : (typeof window !== 'undefined' && window.__API_BASE__ ? window.__API_BASE__ : '') + avatarUrl;
}
