import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useCatalogStore } from '../store/catalogStore';
import { useCartStore } from '../store/cartStore';
import { formatWatchDisplay } from '../domain/watchFormat';
import { getDisplayImages } from '../domain/imageUtils';
import Loader from '../components/Loader';
import './ProductDetailScreen.css';

export default function SkuVariantScreen() {
  const { variantId } = useParams<{ variantId: string }>();
  const navigate = useNavigate();
  const { families, variants, loading, load } = useCatalogStore();
  const addToCart = useCartStore((s) => s.add);

  const [imgIdx, setImgIdx] = useState(0);
  const [added, setAdded] = useState(false);

  useEffect(() => { load(); }, [load]);

  const variant = variants.find((v) => v.id === variantId);
  const family = variant ? families.find((f) => f.id === variant.family_id) : null;

  if (loading || !variant || !family) return <Loader />;

  const isWatch = family.category === 'Watch';
  const isIphone = family.category === 'iPhone';

  let title: string;
  let subtitleParts: string[] = [];
  if (isWatch) {
    const raw = variant.options.supplierTitle || variant.options.raw || '';
    const wd = formatWatchDisplay(raw);
    title = wd.shortTitle || family.title;
    subtitleParts = wd.subtitleParts;
  } else if (isIphone) {
    title = family.title;
    const opts = variant.options || {};
    const parts: string[] = [];
    if (opts.storage) {
      const gb = Number(opts.storage);
      parts.push(gb >= 1024 ? `${gb / 1024} ТБ` : `${gb} ГБ`);
    }
    if (opts.colorLabel) parts.push(String(opts.colorLabel));
    if (opts.simType) parts.push(String(opts.simType));
    subtitleParts = parts;
  } else if (family.category === 'MacBook') {
    title = family.title;
    const opts = variant.options || {};
    const parts: string[] = [];
    if (opts.chip) parts.push(String(opts.chip));
    if (opts.memStorage) parts.push(String(opts.memStorage));
    if (opts.colorLabel) parts.push(String(opts.colorLabel));
    if (opts.ruKeyboard) parts.push('RU');
    subtitleParts = parts;
  } else {
    title = family.title;
  }

  const images = getDisplayImages(variant, family);

  const handleAdd = () => {
    const subtitle = subtitleParts.join(' • ');
    addToCart({
      variantId: variant.id,
      familyId: family.id,
      titleSnapshot: subtitle ? `${title} • ${subtitle}` : title,
      optionsSnapshot: variant.options,
      priceSnapshot: variant.price,
      image: images[0] || '',
    });
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  };

  const outOfStock = !variant.in_stock;

  return (
    <div className="page detail-page">
      <button className="detail-back" onClick={() => navigate(-1)}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>

      <div className="detail-gallery">
        <img
          src={images[imgIdx] || '/placeholder.png'}
          alt={title}
        />
        {images.length > 1 && (
          <div className="detail-dots">
            {images.map((_, i) => (
              <span
                key={i}
                className={`detail-dot${i === imgIdx ? ' active' : ''}`}
                onClick={() => setImgIdx(i)}
              />
            ))}
          </div>
        )}
      </div>

      <h1 className="detail-title">{title}</h1>

      {subtitleParts.length > 0 && (
        <p className="detail-desc">{subtitleParts.join(' • ')}</p>
      )}

      {isWatch && subtitleParts.length > 0 && (
        <div className="watch-specs">
          <WatchSpecs parts={subtitleParts} />
        </div>
      )}

      <div className="detail-price-section">
        <span className="detail-price">{variant.price.toLocaleString('ru-RU')} ₽</span>
        <span className={`badge ${variant.in_stock ? 'badge-stock' : 'badge-out'}`}>
          {variant.in_stock ? 'В наличии' : 'Нет в наличии'}
        </span>
      </div>

      <p className="detail-disclaimer">*Цена и наличие могут меняться</p>

      <button
        className={`btn btn-primary btn-block detail-add${added ? ' detail-add--done' : ''}${outOfStock ? ' detail-add--out' : ''}`}
        disabled={outOfStock}
        onClick={handleAdd}
      >
        {added ? 'Добавлено ✓' : outOfStock ? 'Нет в наличии' : 'Добавить в корзину'}
      </button>
    </div>
  );
}

function WatchSpecs({ parts }: { parts: string[] }) {
  if (parts.length === 0) return null;

  const labels: string[] = [];

  for (const p of parts) {
    if (/мм$/.test(p)) {
      labels.push(`Размер корпуса: ${p}`);
    } else if (/Titanium|Space Grey|Jet Black|Rose Gold|Starlight|Midnight|Silver|Slate|Natural|Black|Gold/i.test(p)
      && !/Band|Loop/i.test(p)) {
      labels.push(`Корпус: ${p}`);
    } else if (/Band|Loop/i.test(p)) {
      labels.push(`Ремешок: ${p}`);
    } else if (/^(S\/M|M\/L|[SML])$/.test(p)) {
      labels.push(`Размер ремешка: ${p}`);
    } else if (/^[A-Za-z0-9]{4,6}$/.test(p) && /[A-Za-z]/.test(p) && /\d/.test(p)) {
      labels.push(`Код: ${p}`);
    } else {
      labels.push(p);
    }
  }

  return (
    <ul className="watch-specs__list">
      {labels.map((l, i) => (
        <li key={i}>{l}</li>
      ))}
    </ul>
  );
}
