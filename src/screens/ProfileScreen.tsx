import { getTgUser } from '../telegram/telegramWebApp';
import './ProfileScreen.css';

export default function ProfileScreen() {
  const tgUser = getTgUser();

  const firstName = tgUser?.first_name || 'Пользователь';
  const lastName = tgUser?.last_name || '';
  const username = tgUser?.username;
  const tgId = tgUser?.id;

  return (
    <div className="page profile-page">
      <h1 className="page-title">Профиль</h1>

      <div className="profile-card">
        <div className="profile-avatar">
          <span className="profile-avatar__letter">
            {firstName[0].toUpperCase()}
          </span>
        </div>
        <div className="profile-info">
          <h2 className="profile-name">
            {firstName} {lastName}
          </h2>
          {username && (
            <p className="profile-username">@{username}</p>
          )}
          {tgId && (
            <p className="profile-id">ID: {tgId}</p>
          )}
        </div>
      </div>

      <div className="profile-section">
        <h3>О магазине</h3>
        <div className="profile-about">
          <p className="profile-about__lead">Оригинальные гаджеты по сифанутым ценам 🤙</p>
          <p className="profile-about__note">Цены меняются ежедневно ‼️</p>
          <p>iPhone, MacBook, iPad, Watch, AirPods. Если не нашли интересующий товар — обращайтесь в личном порядке 🙌</p>
        </div>
      </div>

      <div className="profile-section">
        <h3>Контакты</h3>
        <div className="profile-contacts">
          <div className="profile-contact-row">
            <span>📞</span>
            <span>
              <a href="tel:+79164050444" className="profile-contact-link">+7 916 405-04-44</a>
              {' и '}
              <a href="tel:+79252010234" className="profile-contact-link">+7 925 201-02-34</a>
            </span>
          </div>
          <div className="profile-contact-row">
            <span>💬</span>
            <span>
              <a href="https://t.me/andr3i23" target="_blank" rel="noopener noreferrer" className="profile-contact-link">@andr3i23</a>
              {' и '}
              <a href="https://t.me/l_bobr_l" target="_blank" rel="noopener noreferrer" className="profile-contact-link">@l_bobr_l</a>
            </span>
          </div>
          <div className="profile-contact-row">
            <span>📍</span>
            <span>город Москва</span>
          </div>
        </div>
      </div>

      <p className="profile-version">Версия 1.0.0</p>
    </div>
  );
}
