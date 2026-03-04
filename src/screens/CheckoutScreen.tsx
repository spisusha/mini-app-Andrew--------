import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCartStore } from '../store/cartStore';
import { createOrder } from '../api/orderRepo';
import { getTgUser, getGuestId } from '../telegram/telegramWebApp';
import type { DeliveryMethod, PaymentMethod, OrderPayload } from '../domain/types';
import './CheckoutScreen.css';

export default function CheckoutScreen() {
  const { items, total, clear } = useCartStore();
  const navigate = useNavigate();

  const [delivery, setDelivery] = useState<DeliveryMethod>('pickup');
  const [payment, setPayment] = useState<PaymentMethod>('cash');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (items.length === 0) {
    const saved = sessionStorage.getItem('lastOrder');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        navigate('/result', { state: parsed, replace: true });
        return null;
      } catch { /* ignore */ }
    }
    navigate('/cart', { replace: true });
    return null;
  }

  const handleSubmit = async () => {
    if (delivery === 'delivery' && !address.trim()) {
      setError('Укажите адрес доставки');
      return;
    }
    setError('');
    setSubmitting(true);

    const tgUser = getTgUser();
    const payload: OrderPayload = {
      items,
      totals: total(),
      deliveryMethod: delivery,
      address: delivery === 'delivery' ? address.trim() : undefined,
      phone: phone.trim() || undefined,
      paymentMethod: payment,
      tgUser: tgUser || null,
      guestId: tgUser ? undefined : getGuestId(),
      createdAt: new Date().toISOString(),
    };

    const orderId = await createOrder(payload);
    setSubmitting(false);

    if (orderId) {
      const resultState = { payload, orderId };
      sessionStorage.setItem('lastOrder', JSON.stringify(resultState));
      clear();
      navigate('/result', { state: resultState, replace: true });
    } else {
      setError('Ошибка при оформлении. Попробуйте ещё раз.');
    }
  };

  return (
    <div className="page">
      <h1 className="page-title">Оформление заказа</h1>

      <section className="checkout-section checkout-items">
        <h3>Ваш заказ</h3>
        {items.map((item) => (
          <div key={item.variantId} className="checkout-item">
            {item.image && <img className="checkout-item__img" src={item.image} alt="" />}
            <div className="checkout-item__info">
              <span className="checkout-item__name">{item.titleSnapshot}</span>
              <span className="checkout-item__opts">
                {Object.values(item.optionsSnapshot).filter(Boolean).join(' · ')}
              </span>
              <span className="checkout-item__price">
                {item.qty > 1 ? `${item.qty} × ` : ''}
                {item.priceSnapshot.toLocaleString('ru-RU')} ₽
              </span>
            </div>
          </div>
        ))}
      </section>

      <section className="checkout-section">
        <h3>Контактный телефон <span className="checkout-optional">необязательно</span></h3>
        <div className="checkout-phone">
          <input
            type="tel"
            placeholder="+7 (___) ___-__-__"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            autoComplete="tel"
          />
        </div>
      </section>

      <section className="checkout-section">
        <h3>Способ получения</h3>
        <div className="checkout-options">
          <label className={`checkout-option${delivery === 'pickup' ? ' active' : ''}`}>
            <input
              type="radio"
              name="delivery"
              checked={delivery === 'pickup'}
              onChange={() => setDelivery('pickup')}
            />
            <div>
              <strong>Самовывоз</strong>
              <span>Забрать в магазине</span>
            </div>
          </label>
          <label className={`checkout-option${delivery === 'delivery' ? ' active' : ''}`}>
            <input
              type="radio"
              name="delivery"
              checked={delivery === 'delivery'}
              onChange={() => setDelivery('delivery')}
            />
            <div>
              <strong>Доставка</strong>
              <span>Курьером по городу</span>
            </div>
          </label>
        </div>

        {delivery === 'delivery' && (
          <div className="checkout-address">
            <input
              type="text"
              placeholder="Адрес доставки"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </div>
        )}
      </section>

      <section className="checkout-section">
        <h3>Способ оплаты</h3>
        <div className="checkout-options">
          <label className={`checkout-option${payment === 'cash' ? ' active' : ''}`}>
            <input
              type="radio"
              name="payment"
              checked={payment === 'cash'}
              onChange={() => setPayment('cash')}
            />
            <div>
              <strong>Наличными</strong>
              <span>При получении</span>
            </div>
          </label>
          <label className={`checkout-option${payment === 'online' ? ' active' : ''}`}>
            <input
              type="radio"
              name="payment"
              checked={payment === 'online'}
              onChange={() => setPayment('online')}
            />
            <div>
              <strong>Онлайн</strong>
              <span>Перевод</span>
            </div>
          </label>
        </div>
      </section>

      <div className="checkout-summary">
        <div className="checkout-summary__row">
          <span>Товаров: {items.reduce((s, i) => s + i.qty, 0)}</span>
          <span>{total().toLocaleString('ru-RU')} ₽</span>
        </div>
      </div>

      {error && <p className="checkout-error">{error}</p>}

      <button
        className="btn btn-primary btn-block"
        onClick={handleSubmit}
        disabled={submitting}
      >
        {submitting ? 'Оформляем...' : 'Подтвердить заказ'}
      </button>
    </div>
  );
}
