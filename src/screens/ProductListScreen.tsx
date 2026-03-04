import { useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useCatalogStore } from '../store/catalogStore';
import { filterVariants, getMinPrice } from '../domain/catalogLogic';
import type { SortOption } from '../domain/types';
import ProductCard from '../components/ProductCard';
import SortBar from '../components/SortBar';
import Loader from '../components/Loader';
import './ProductListScreen.css';

export default function ProductListScreen() {
  const { families, variants, loading, load, sort, setSort } = useCatalogStore();
  const [params] = useSearchParams();

  useEffect(() => { load(); }, [load]);

  const filters = useMemo(() => {
    const f: Record<string, string> = {};
    params.forEach((val, key) => { f[key] = val; });
    return f;
  }, [params]);

  const matchedFamilies = useMemo(() => {
    const matched = filterVariants(variants, filters, families);
    const familyIds = [...new Set(matched.map((v) => v.family_id))];
    let list = families.filter((f) => familyIds.includes(f.id));

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
  }, [families, variants, filters, sort]);

  if (loading) return <Loader />;

  const filterDesc = Object.entries(filters)
    .map(([k, v]) => `${k}: ${v}`)
    .join(' · ');

  return (
    <div className="page">
      <h1 className="page-title">Товары</h1>
      {filterDesc && <p className="list-filter-desc">{filterDesc}</p>}
      <SortBar value={sort} onChange={(v: SortOption) => setSort(v)} />
      <div className="product-grid">
        {matchedFamilies.flatMap((f) => {
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
            <ProductCard key={f.id} family={f} variants={variants.filter((v) => v.family_id === f.id)} />,
          ];
        })}
        {matchedFamilies.length === 0 && (
          <p style={{ gridColumn: '1/-1', textAlign: 'center', color: 'var(--color-muted)', padding: '32px 0' }}>
            Ничего не найдено по этим фильтрам
          </p>
        )}
      </div>
    </div>
  );
}
