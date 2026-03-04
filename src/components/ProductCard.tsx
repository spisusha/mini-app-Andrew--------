import { useNavigate } from 'react-router-dom';
import type { Category, ProductFamily, Variant } from '../domain/types';
import { getMinPrice, hasStock } from '../domain/catalogLogic';
import { formatWatchDisplay } from '../domain/watchFormat';
import './ProductCard.css';

function formatStorage(gb: number): string {
  return gb >= 1024 ? `${gb / 1024} ТБ` : `${gb} ГБ`;
}

function buildSkuSubtitle(v: Variant, category: Category): string {
  const opts = v.options || {};
  if (category === 'iPhone') {
    const parts: string[] = [];
    if (opts.storage) parts.push(formatStorage(Number(opts.storage)));
    if (opts.colorLabel) parts.push(String(opts.colorLabel));
    if (opts.simType) parts.push(String(opts.simType));
    return parts.join(' • ');
  }
  return '';
}

interface Props {
  family: ProductFamily;
  variants: Variant[];
  skuVariant?: Variant;
}

export default function ProductCard({ family, variants, skuVariant }: Props) {
  const navigate = useNavigate();

  if (skuVariant) {
    const isWatch = family.category === 'Watch';
    let title: string;
    if (isWatch) {
      const raw = skuVariant.options.supplierTitle || skuVariant.options.raw || '';
      title = formatWatchDisplay(raw).longTitle || family.title;
    } else {
      title = family.title;
    }

    const subtitle = buildSkuSubtitle(skuVariant, family.category);

    return (
      <div className="product-card" onClick={() => navigate(`/variant/${skuVariant.id}`)}>
        <div className="product-card__img-wrap">
          <img
            src={skuVariant.images?.[0] || family.images[0] || '/placeholder.png'}
            alt={title}
            loading="lazy"
          />
        </div>
        <div className="product-card__info">
          <h3 className={`product-card__title${isWatch ? ' product-card__title--watch' : ''}`}>{title}</h3>
          {subtitle && <p className="product-card__desc">{subtitle}</p>}
          <div className="product-card__footer">
            <span className="product-card__price">
              {skuVariant.price.toLocaleString('ru-RU')} ₽
            </span>
            <span className={`badge ${skuVariant.in_stock ? 'badge-stock' : 'badge-out'}`}>
              {skuVariant.in_stock ? 'В наличии' : 'Нет в наличии'}
            </span>
          </div>
        </div>
      </div>
    );
  }

  const minPrice = getMinPrice(variants, family.id);
  const inStock = hasStock(variants, family.id);

  return (
    <div className="product-card" onClick={() => navigate(`/product/${family.id}`)}>
      <div className="product-card__img-wrap">
        <img
          src={family.images[0] || '/placeholder.png'}
          alt={family.title}
          loading="lazy"
        />
      </div>
      <div className="product-card__info">
        <h3 className="product-card__title">{family.title}</h3>
        <p className="product-card__desc">{family.description}</p>
        <div className="product-card__footer">
          <span className="product-card__price">
            {minPrice ? `от ${minPrice.toLocaleString('ru-RU')} ₽` : '—'}
          </span>
          <span className={`badge ${inStock ? 'badge-stock' : 'badge-out'}`}>
            {inStock ? 'В наличии' : 'Нет в наличии'}
          </span>
        </div>
      </div>
    </div>
  );
}
