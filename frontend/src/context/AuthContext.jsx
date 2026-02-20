// ============================================================
// AuthContext.jsx — Хранение состояния авторизации
// Предоставляет данные о пользователе всем компонентам
// ============================================================

import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../utils/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('rucord_token'));
  const [loading, setLoading] = useState(true);

  // При загрузке приложения проверяем сохранённый токен
  useEffect(() => {
    if (token) {
      api.get('/api/auth/me', token)
        .then(data => {
          if (data.user) {
            setUser(data.user);
          } else {
            logout();
          }
        })
        .catch(() => logout())
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  // Вход
  const login = async (email, password) => {
    const data = await api.post('/api/auth/login', { email, password });
    if (data.error) throw new Error(data.error);
    localStorage.setItem('rucord_token', data.token);
    setToken(data.token);
    setUser(data.user);
    return data;
  };

  // Регистрация
  const register = async (username, email, password) => {
    const data = await api.post('/api/auth/register', { username, email, password });
    if (data.error) throw new Error(data.error);
    localStorage.setItem('rucord_token', data.token);
    setToken(data.token);
    setUser(data.user);
    return data;
  };

  // Выход
  const logout = () => {
    localStorage.removeItem('rucord_token');
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// Хук для использования в компонентах: const { user, login, logout } = useAuth();
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth должен использоваться внутри AuthProvider');
  }
  return context;
}
