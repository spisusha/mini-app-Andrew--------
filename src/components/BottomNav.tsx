import { NavLink } from 'react-router-dom';
import { useCartStore } from '../store/cartStore';
import './BottomNav.css';

export default function BottomNav() {
  const count = useCartStore((s) => s.count());

  return (
    <nav className="bottom-nav">
      <NavLink to="/catalog" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
        <span>Каталог</span>
      </NavLink>
      <NavLink to="/" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
        <span>Главная</span>
      </NavLink>
      <NavLink to="/cart" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
        <div className="cart-icon-wrap">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
          {count > 0 && <span className="cart-badge">{count}</span>}
        </div>
        <span>Корзина</span>
      </NavLink>
      <NavLink to="/profile" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        <span>Профиль</span>
      </NavLink>
    </nav>
  );
}
