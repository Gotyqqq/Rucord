// ============================================================
// utils/api.js — Обёртки для HTTP-запросов к серверу
// Все запросы к API проходят через эти функции
// ============================================================

const BASE_URL = '';  // Vite proxy перенаправляет /api на бэкенд

async function request(method, url, body = null, token = null) {
  const headers = {
    'Content-Type': 'application/json'
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const options = { method, headers };
  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(BASE_URL + url, options);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Произошла ошибка');
  }

  return data;
}

export const api = {
  get: (url, token) => request('GET', url, null, token),
  post: (url, body, token) => request('POST', url, body, token),
  put: (url, body, token) => request('PUT', url, body, token),
  patch: (url, body, token) => request('PATCH', url, body, token),
  delete: (url, token) => request('DELETE', url, null, token),
  async postFormData(url, formData, token) {
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch((typeof window !== 'undefined' && window.__BASE_URL__ ? window.__BASE_URL__ : '') + url, { method: 'POST', headers, body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Ошибка');
    return data;
  }
};
