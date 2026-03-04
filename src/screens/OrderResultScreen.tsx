import { useLocation, useNavigate } from 'react-router-dom';
import type { OrderPayload } from '../domain/types';
import './OrderResultScreen.css';

interface LocationState {
  payload: OrderPayload;
  orderId: string;
}

export default function OrderResultScreen() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as LocationState | null;

  if (!state) {
    return (
      <div className="page result-page">
        <h1>Нет данных о заказе</h1>
        <button className="btn btn-primary" onClick={() => navigate('/')}>
          На главную
        </button>
      </div>
    );
  }

  const { payload, orderId } = state;

  return (
    <div className="page result-page">
      <div className="result-icon">✅</div>
      <h1 className="result-title">Заказ в обработке</h1>
      <p className="result-subtitle">
        Менеджер свяжется с вами в ближайшее время для подтверждения заказа.
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
        <div className="result-row">
          <span>Оплата</span>
          <span className="result-val">
            {payload.paymentMethod === 'cash' ? 'Наличными' : 'Онлайн'}
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

      <button className="btn btn-primary btn-block" onClick={() => navigate('/')}>
        На главную
      </button>
    </div>
  );
}
