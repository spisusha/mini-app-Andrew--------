import { useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useCatalogStore } from '../store/catalogStore';
import type { Category, ProductFamily, Variant } from '../domain/types';
import ProductCard from '../components/ProductCard';
import Loader from '../components/Loader';
import './CatalogScreen.css';

const SLUG_TO_CAT: Record<string, Category> = {
  iphone: 'iPhone',
  ipad: 'iPad',
  macbook: 'MacBook',
  watch: 'Watch',
  airpods: 'AirPods',
};

export default function CategoryModelsScreen() {
  const { category: slug } = useParams<{ category: string }>();
  const navigate = useNavigate();
  const { families, variants, loading, load } = useCatalogStore();

  useEffect(() => { load(); }, [load]);

  const category = SLUG_TO_CAT[slug || ''];

  const models = useMemo(() => {
    if (!category) return [];
    return families
      .filter((f) => f.category === category)
      .sort((a, b) => {
        if (b.popularity_score !== a.popularity_score)
          return b.popularity_score - a.popularity_score;
        return a.title.localeCompare(b.title);
      });
  }, [families, category]);

  const stats = useMemo(() => {
    const map = new Map<string, { minPrice: number; totalCount: number; inStockCount: number }>();
    for (const f of models) {
      const fvRaw = variants.filter((v) => v.family_id === f.id);
      const seen = new Map<string, typeof fvRaw[0]>();
      for (const v of fvRaw) {
        const key = v.supplier_xmlid ? v.supplier_xmlid.replace(/^0+/, '') || '0' : v.id;
        const prev = seen.get(key);
        if (!prev || (v.in_stock && !prev.in_stock)) seen.set(key, v);
      }
      const fv = [...seen.values()];
      const inStock = fv.filter((v) => v.in_stock);
      const pricePool = inStock.length > 0 ? inStock : fv.filter((v) => v.price > 0);
      const minPrice = pricePool.length > 0 ? Math.min(...pricePool.map((v) => v.price)) : 0;
      map.set(f.id, { minPrice, totalCount: pricePool.length, inStockCount: inStock.length });
    }
    return map;
  }, [models, variants]);

  const isAirpods = category === 'AirPods';

  const airpodsCards = useMemo(() => {
    if (!isAirpods) return [];
    const nonMaxFamilies = models.filter((f) => !/max/i.test(f.title));
    const nonMaxIds = new Set(nonMaxFamilies.map((f) => f.id));
    const allVars = variants.filter((v) => nonMaxIds.has(v.family_id));
    const seen = new Map<string, Variant>();
    for (const v of allVars) {
      const key = v.supplier_xmlid ? v.supplier_xmlid.replace(/^0+/, '') || '0' : v.id;
      const prev = seen.get(key);
      if (!prev || (v.in_stock && !prev.in_stock)) seen.set(key, v);
    }
    return [...seen.values()].sort((a, b) => {
      if (a.in_stock !== b.in_stock) return a.in_stock ? -1 : 1;
      return a.price - b.price;
    });
  }, [isAirpods, models, variants]);

  const maxFamily = isAirpods ? models.find((f) => /max/i.test(f.title)) : null;

  if (loading) return <Loader />;
  if (!category) return <div className="page"><p>Категория не найдена</p></div>;

  return (
    <div className="page">
      <div className="catalog-header">
        <button className="catalog-back" onClick={() => navigate('/catalog')}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <h1 className="page-title" style={{ marginBottom: 0 }}>{category}</h1>
      </div>

      {isAirpods ? (
        <>
          {maxFamily && (
            <div className="product-grid" style={{ marginBottom: 12 }}>
              <ProductCard
                family={maxFamily}
                variants={variants.filter((v) => v.family_id === maxFamily.id)}
              />
            </div>
          )}
          <div className="product-grid">
            {airpodsCards.map((v) => {
              const fam = models.find((f) => f.id === v.family_id);
              if (!fam) return null;
              return <ProductCard key={v.id} family={fam} variants={[v]} skuVariant={v} />;
            })}
          </div>
          {airpodsCards.length === 0 && !maxFamily && (
            <p className="catalog-empty">Нет моделей в этой категории</p>
          )}
        </>
      ) : (
        <div className="catalog-models">
          {models.map((f) => (
            <ModelCard
              key={f.id}
              family={f}
              stats={stats.get(f.id)!}
              onClick={() => navigate(`/catalog/${slug}/${f.id}`)}
            />
          ))}
          {models.length === 0 && (
            <p className="catalog-empty">Нет моделей в этой категории</p>
          )}
        </div>
      )}
    </div>
  );
}

function ModelCard({ family, stats, onClick }: {
  family: ProductFamily;
  stats: { minPrice: number; totalCount: number; inStockCount: number };
  onClick: () => void;
}) {
  let priceText: string;
  if (stats.minPrice <= 0) {
    priceText = 'Цена уточняется';
  } else if (stats.totalCount <= 1) {
    priceText = `${stats.minPrice.toLocaleString('ru-RU')} ₽`;
  } else {
    priceText = `от ${stats.minPrice.toLocaleString('ru-RU')} ₽`;
  }

  return (
    <button className="catalog-model-btn" onClick={onClick}>
      <div className="catalog-model-info">
        <span className="catalog-model-title">{family.title}</span>
        <span className="catalog-model-sub">{priceText}</span>
      </div>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-muted)" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
    </button>
  );
}
