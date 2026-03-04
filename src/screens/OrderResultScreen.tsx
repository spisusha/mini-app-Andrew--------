import { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { OrderPayload } from '../domain/types';
import './OrderResultScreen.css';

interface LocationState {
  payload: OrderPayload;
  orderId: string;
}

function loadState(locationState: unknown): LocationState | null {
  if (locationState && typeof locationState === 'object' && 'orderId' in locationState) {
    return locationState as LocationState;
  }
  try {
    const raw = sessionStorage.getItem('lastOrder');
    if (raw) return JSON.parse(raw) as LocationState;
  } catch { /* ignore */ }
  return null;
}

export default function OrderResultScreen() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = useMemo(() => loadState(location.state), [location.state]);

  if (!state) {
    return (
      <div className="page result-page">
        <div className="result-icon">📦</div>
        <h1 className="result-title">Заказ отправлен</h1>
        <p className="result-subtitle">
          Ваш заказ в обработке. Менеджер свяжется с вами в ближайшее время.
        </p>
        <button className="btn btn-primary btn-block" onClick={() => navigate('/')}>
          На главную
        </button>
      </div>
    );
  }

  const { payload, orderId } = state;

  return (
    <div className="page result-page">
      <div className="result-icon">✅</div>
      <h1 className="result-title">Заказ оформлен!</h1>
      <p className="result-subtitle">
        Спасибо за заказ! Менеджер свяжется с вами в ближайшее время
        для подтверждения и уточнения деталей.
      </p>

      <div className="result-card">
        <div className="result-row">
          <span>Номер заказа</span>
          <span className="result-val">{orderId.slice(0, 8).toUpperCase()}</span>
        </div>
        <div className="result-row">
          <span>Товаров</span>
          <span className="result-val">{payload.items.reduce((s, i) => s + i.qty, 0)} шт.</span>
        </div>
        <div className="result-row">
          <span>Итого</span>
          <span className="result-val result-val--bold">
            {payload.totals.toLocaleString('ru-RU')} ₽
          </span>
        </div>
        <div className="result-row">
          <span>Получение</span>
          <span className="result-val">
            {payload.deliveryMethod === 'pickup' ? 'Самовывоз' : 'Доставка'}
          </span>
        </div>
        {payload.address && (
          <div className="result-row">
            <span>Адрес</span>
            <span className="result-val">{payload.address}</span>
          </div>
        )}
        {payload.phone && (
          <div className="result-row">
            <span>Телефон</span>
            <span className="result-val">{payload.phone}</span>
          </div>
        )}
        <div className="result-row">
          <span>Оплата</span>
          <span className="result-val">
            {payload.paymentMethod === 'cash' ? 'Наличными' : 'Перевод'}
          </span>
        </div>
      </div>

      <h3 className="result-items-title">Товары</h3>
      <div className="result-items">
        {payload.items.map((item, i) => (
          <div key={i} className="result-item">
            <span className="result-item__name">{item.titleSnapshot}</span>
            <span className="result-item__opts">
              {Object.values(item.optionsSnapshot).filter(Boolean).join(' · ')}
            </span>
            <span className="result-item__price">
              {item.qty} × {item.priceSnapshot.toLocaleString('ru-RU')} ₽
            </span>
          </div>
        ))}
      </div>

      <button className="btn btn-primary btn-block" onClick={() => {
        sessionStorage.removeItem('lastOrder');
        navigate('/');
      }}>
        На главную
      </button>
    </div>
  );
}
