// ============================================================
// LandingPage.jsx — Публичная главная для первых посетителей
// ============================================================

import React from 'react';
import Logo from '../Logo/Logo';

export default function LandingPage({ onOpenApp, onRegister }) {
  return (
    <div className="landing">
      <header className="landing-header">
        <Logo size={36} showText className="landing-logo" />
        <nav className="landing-nav">
          <button type="button" className="landing-nav-btn" onClick={onOpenApp}>Войти</button>
          <button type="button" className="landing-nav-btn primary" onClick={onRegister}>Регистрация</button>
        </nav>
      </header>

      <main className="landing-main">
        <section className="landing-hero">
          <Logo size={96} showText className="landing-hero-logo" />
          <h1 className="landing-hero-title">Общайтесь в своих серверах</h1>
          <p className="landing-hero-subtitle">
            Создавайте серверы, приглашайте друзей по ссылке, общайтесь в каналах — текстовый чат, роли и всё необходимое в одном месте.
          </p>
          <div className="landing-hero-actions">
            <button type="button" className="landing-cta primary" onClick={onOpenApp}>
              Открыть Rucord
            </button>
            <button type="button" className="landing-cta secondary" onClick={onRegister}>
              Создать аккаунт
            </button>
          </div>
        </section>

        <section className="landing-how">
          <h2 className="landing-how-title">Как это устроено</h2>
          <div className="landing-how-steps">
            <div className="landing-step">
              <div className="landing-step-icon">1</div>
              <h3>Создайте сервер</h3>
              <p>Задайте название и за пару секунд ваш сервер готов. Только вы решаете, кого приглашать.</p>
            </div>
            <div className="landing-step">
              <div className="landing-step-icon">2</div>
              <h3>Пригласите по ссылке</h3>
              <p>Скопируйте ссылку-приглашение и отправьте друзьям. Они переходят по ней и сразу попадают на сервер.</p>
            </div>
            <div className="landing-step">
              <div className="landing-step-icon">3</div>
              <h3>Общайтесь в каналах</h3>
              <p>Создавайте текстовые каналы, пишите сообщения, упоминайте участников — всё как в привычном чате.</p>
            </div>
          </div>
        </section>

        <section className="landing-cta-section">
          <p className="landing-cta-text">Готовы начать?</p>
          <button type="button" className="landing-cta primary large" onClick={onOpenApp}>
            Открыть Rucord
          </button>
        </section>
      </main>

      <footer className="landing-footer">
        <span className="landing-footer-logo"><Logo size={24} showText /></span>
        <span className="landing-footer-copy">Rucord — ваш сервер для общения</span>
      </footer>
    </div>
  );
}
