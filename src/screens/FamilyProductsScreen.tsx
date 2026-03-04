import { useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useCatalogStore } from '../store/catalogStore';
import type { Category, Variant } from '../domain/types';
import ProductCard from '../components/ProductCard';
import Loader from '../components/Loader';
import './CatalogScreen.css';

function isConfigurator(category: Category, title: string): boolean {
  if (category === 'AirPods' && /max/i.test(title)) return true;
  return false;
}

export default function FamilyProductsScreen() {
  const { category: slug, familyId } = useParams<{ category: string; familyId: string }>();
  const navigate = useNavigate();
  const { families, variants, loading, load } = useCatalogStore();

  useEffect(() => { load(); }, [load]);

  const family = families.find((f) => f.id === familyId);
  const familyVariants = useMemo(
    () => variants.filter((v) => v.family_id === familyId),
    [variants, familyId],
  );

  const redirect = family ? isConfigurator(family.category, family.title) : false;

  useEffect(() => {
    if (!loading && family && redirect) {
      navigate(`/product/${family.id}`, { replace: true });
    }
  }, [loading, family, redirect, navigate]);

  if (loading) return <Loader />;
  if (!family) return <div className="page"><p>Модель не найдена</p></div>;
  if (redirect) return <Loader />;

  const deduped = useMemo(() => {
    const seen = new Map<string, Variant>();
    for (const v of familyVariants) {
      // Deduplicate by supplier_xmlid first
      const xmlKey = v.supplier_xmlid
        ? v.supplier_xmlid.replace(/^0+/, '') || '0'
        : null;
      if (xmlKey) {
        const prev = seen.get(`x:${xmlKey}`);
        if (!prev || (v.in_stock && !prev.in_stock)) seen.set(`x:${xmlKey}`, v);
        continue;
      }
      // For variants without xmlid, deduplicate by options signature
      const sig = Object.entries(v.options)
        .filter(([k]) => !['raw', 'supplierTitle', '_xmlid_audit', 'line'].includes(k))
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, val]) => `${k}=${val}`)
        .join('|');
      const optKey = `o:${sig}`;
      const prev = seen.get(optKey);
      if (!prev || (v.in_stock && !prev.in_stock)) seen.set(optKey, v);
    }
    return [...seen.values()];
  }, [familyVariants]);

  const sorted = [...deduped].sort((a, b) => {
    if (a.in_stock !== b.in_stock) return a.in_stock ? -1 : 1;
    return a.price - b.price;
  });

  return (
    <div className="page">
      <div className="catalog-header">
        <button className="catalog-back" onClick={() => navigate(`/catalog/${slug}`)}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <h1 className="page-title" style={{ marginBottom: 0 }}>{family.title}</h1>
      </div>

      <p className="catalog-family-stats">{sorted.length} позиций</p>

      <div className="product-grid">
        {sorted.map((v) => (
          <ProductCard key={v.id} family={family} variants={[v]} skuVariant={v} />
        ))}
      </div>

      {sorted.length === 0 && (
        <p className="catalog-empty">Нет вариантов для этой модели</p>
      )}
    </div>
  );
}

