import { useEffect, useMemo, useState } from 'react';
import { useCatalogStore } from '../store/catalogStore';
import type { Category, SortOption, ProductFamily } from '../domain/types';
import { getMinPrice } from '../domain/catalogLogic';
import ProductCard from '../components/ProductCard';
import CategoryFilter from '../components/CategoryFilter';
import SortBar from '../components/SortBar';
import Loader from '../components/Loader';
import './HomeScreen.css';

export default function HomeScreen() {
  const { families, variants, loading, load, sort, setSort } = useCatalogStore();
  const [category, setCategory] = useState<Category | null>(null);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    let list = families;
    if (category) list = list.filter((f) => f.category === category);

    const sorted = [...list];
    switch (sort) {
      case 'price_asc':
        sorted.sort((a, b) => (getMinPrice(variants, a.id) ?? Infinity) - (getMinPrice(variants, b.id) ?? Infinity));
        break;
      case 'price_desc':
        sorted.sort((a, b) => (getMinPrice(variants, b.id) ?? 0) - (getMinPrice(variants, a.id) ?? 0));
        break;
      case 'popularity':
        sorted.sort((a, b) => b.popularity_score - a.popularity_score);
        break;
      case 'newest':
        sorted.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        break;
    }
    return sorted;
  }, [families, variants, category, sort]);

  if (loading) return <Loader />;

  return (
    <div className="page">
      <h1 className="page-title">Apple Store</h1>
      <CategoryFilter value={category} onChange={setCategory} />
      <SortBar value={sort} onChange={(v: SortOption) => setSort(v)} />
      <div className="product-grid">
        {filtered.flatMap((f: ProductFamily) => {
          const isSkuPerRow =
            f.category === 'Watch' ||
            (f.category === 'AirPods' && !/max/i.test(f.title));
          if (isSkuPerRow) {
            const fvAll = variants.filter((v) => v.family_id === f.id && v.in_stock);
            const seen = new Map<string, typeof fvAll[0]>();
            for (const v of fvAll) {
              const key = v.supplier_xmlid ? v.supplier_xmlid.replace(/^0+/, '') || '0' : v.id;
              if (!seen.has(key)) seen.set(key, v);
            }
            const fv = [...seen.values()];
            if (fv.length === 0) return [];
            return fv.map((v) => (
              <ProductCard key={v.id} family={f} variants={[v]} skuVariant={v} />
            ));
          }
          return [
            <ProductCard
              key={f.id}
              family={f}
              variants={variants.filter((v) => v.family_id === f.id)}
            />,
          ];
        })}
        {filtered.length === 0 && (
          <p style={{ gridColumn: '1/-1', textAlign: 'center', color: 'var(--color-muted)', padding: '32px 0' }}>
            Товары не найдены
          </p>
        )}
      </div>
    </div>
  );
}
