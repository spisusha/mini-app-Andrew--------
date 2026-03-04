import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCatalogStore } from '../store/catalogStore';
import { ALL_CATEGORIES, type Category } from '../domain/types';
import Loader from '../components/Loader';
import './CatalogScreen.css';

const CAT_ICONS: Record<Category, string> = {
  iPhone: '📱',
  iPad: '📟',
  MacBook: '💻',
  Watch: '⌚',
  AirPods: '🎧',
};

const CAT_SLUG: Record<Category, string> = {
  iPhone: 'iphone',
  iPad: 'ipad',
  MacBook: 'macbook',
  Watch: 'watch',
  AirPods: 'airpods',
};

export default function CatalogScreen() {
  const { families, loading, load } = useCatalogStore();
  const navigate = useNavigate();

  useEffect(() => { load(); }, [load]);

  if (loading) return <Loader />;

  return (
    <div className="page">
      <h1 className="page-title">Каталог</h1>
      <div className="catalog-categories">
        {ALL_CATEGORIES.map((cat) => (
          <button
            key={cat}
            className="catalog-cat-btn"
            onClick={() => navigate(`/catalog/${CAT_SLUG[cat]}`)}
          >
            <span className="catalog-cat-icon">{CAT_ICONS[cat]}</span>
            <span className="catalog-cat-label">{cat}</span>
            <span className="catalog-cat-count">
              {families.filter((f) => f.category === cat).length} моделей
            </span>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-muted)" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        ))}
      </div>
    </div>
  );
}
