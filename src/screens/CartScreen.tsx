import { useNavigate } from 'react-router-dom';
import { useCartStore } from '../store/cartStore';
import './CartScreen.css';

export default function CartScreen() {
  const { items, setQty, remove, total } = useCartStore();
  const navigate = useNavigate();

  if (items.length === 0) {
    return (
      <div className="page cart-empty">
        <div className="cart-empty-icon">🛒</div>
        <h2>Корзина пуста</h2>
        <p>Добавьте товары из каталога</p>
        <button className="btn btn-primary" onClick={() => navigate('/')}>
          На главную
        </button>
      </div>
    );
  }

  return (
    <div className="page">
      <h1 className="page-title">Корзина</h1>
      <div className="cart-items">
        {items.map((item) => (
          <div key={item.variantId} className="cart-item">
            <div className="cart-item__img">
              {item.image ? (
                <img src={item.image} alt={item.titleSnapshot} />
              ) : (
                <div className="cart-item__placeholder" />
              )}
            </div>
            <div className="cart-item__info">
              <h3 className="cart-item__title">{item.titleSnapshot}</h3>
              <p className="cart-item__opts">
                {Object.entries(item.optionsSnapshot)
                  .filter(([, v]) => v)
                  .map(([, v]) => v)
                  .join(' · ')}
              </p>
              <span className="cart-item__price">
                {item.priceSnapshot.toLocaleString('ru-RU')} ₽
              </span>
              <div className="cart-item__qty">
                <button onClick={() => setQty(item.variantId, item.qty - 1)}>−</button>
                <span>{item.qty}</span>
                <button onClick={() => setQty(item.variantId, item.qty + 1)}>+</button>
              </div>
            </div>
            <button className="cart-item__remove" onClick={() => remove(item.variantId)}>
              ✕
            </button>
          </div>
        ))}
      </div>

      <div className="cart-total">
        <span>Итого</span>
        <span className="cart-total__value">{total().toLocaleString('ru-RU')} ₽</span>
      </div>

      <p className="cart-price-note">
        ℹ️ Мы стараемся держать цены актуальными, но из-за высокой волатильности
        рынка цены на сайте носят информативный характер. Менеджер зафиксирует для
        вас лучшее предложение после размещения заказа!
      </p>

      <button className="btn btn-primary btn-block" onClick={() => navigate('/checkout')}>
        Оформить заказ
      </button>
    </div>
  );
}
