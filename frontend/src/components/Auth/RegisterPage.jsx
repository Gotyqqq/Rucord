// ============================================================
// RegisterPage.jsx — Страница регистрации
// ============================================================

import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';

export default function RegisterPage({ onSwitchToLogin, onBackToLanding }) {
  const { register } = useAuth();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await register(username, email, password);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          {onBackToLanding && (
            <button type="button" className="auth-back" onClick={onBackToLanding} title="На главную">←</button>
          )}
          <h1 className="auth-logo">Rucord</h1>
          <p className="auth-subtitle">Создать аккаунт</p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          {error && <div className="auth-error">{error}</div>}

          <div className="form-group">
            <label>Имя пользователя</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Ваше имя"
              required
              minLength={2}
              maxLength={32}
            />
          </div>

          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="example@mail.ru"
              required
            />
          </div>

          <div className="form-group">
            <label>Пароль</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Минимум 6 символов"
              required
              minLength={6}
            />
          </div>

          <button type="submit" className="auth-button" disabled={loading}>
            {loading ? 'Регистрация...' : 'Зарегистрироваться'}
          </button>
        </form>

        <p className="auth-switch">
          Уже есть аккаунт?{' '}
          <button onClick={onSwitchToLogin} className="auth-link">
            Войти
          </button>
        </p>
        {onBackToLanding && (
          <p className="auth-switch">
            <button onClick={onBackToLanding} className="auth-link">На главную</button>
          </p>
        )}
      </div>
    </div>
  );
}
