// ============================================================
// LoginPage.jsx — Страница входа
// ============================================================

import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';

export default function LoginPage({ onSwitchToRegister, onBackToLanding }) {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email, password);
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
          <p className="auth-subtitle">С возвращением!</p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          {error && <div className="auth-error">{error}</div>}

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
              placeholder="Введите пароль"
              required
            />
          </div>

          <button type="submit" className="auth-button" disabled={loading}>
            {loading ? 'Вход...' : 'Войти'}
          </button>
        </form>

        <p className="auth-switch">
          Нет аккаунта?{' '}
          <button onClick={onSwitchToRegister} className="auth-link">
            Зарегистрироваться
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
