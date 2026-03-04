import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useCatalogStore } from '../store/catalogStore';
import { useCartStore } from '../store/cartStore';
import { useConfigurator } from '../hooks/useConfigurator';
import OptionSelector from '../components/OptionSelector';
import Loader from '../components/Loader';
import './ProductDetailScreen.css';

const OPTION_LABELS: Record<string, string> = {
  storage: 'Память',
  simType: 'SIM',
  connectivity: 'Связь',
  size: 'Размер',
  anc: 'Шумоподавление',
};

export default function ProductDetailScreen() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { families, variants, loading, load } = useCatalogStore();
  const addToCart = useCartStore((s) => s.add);
  const [added, setAdded] = useState(false);

  useEffect(() => { load(); }, [load]);

  const family = families.find((f) => f.id === id);
  const familyVariants = variants.filter((v) => v.family_id === id);

  const {
    hasColorOptions,
    colorEntries,
    selectedColorHex,
    selectedColorLabel,
    handleColorSelect,
    nonColorKeys,
    allOptionValues,
    disabledOptionValues,
    selectedOptions,
    handleOptionChange,
    resolvedVariant,
    displayImages,
    imgIdx,
    setImgIdx,
  } = useConfigurator(familyVariants, family?.images ?? []);

  if (loading || !family) return <Loader />;

  const outOfStock = resolvedVariant && !resolvedVariant.in_stock;

  const handleAddToCart = () => {
    if (!resolvedVariant || !resolvedVariant.in_stock || !family) return;
    addToCart({
      variantId: resolvedVariant.id,
      familyId: family.id,
      titleSnapshot: family.title,
      optionsSnapshot: resolvedVariant.options,
      priceSnapshot: resolvedVariant.price,
      image: displayImages[0] || family.images[0] || '',
    });
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  };

  return (
    <div className="page detail-page">
      <button className="detail-back" onClick={() => navigate(-1)}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>

      <div className="detail-gallery">
        <img src={displayImages[imgIdx] || '/placeholder.png'} alt={family.title} />
        {displayImages.length > 1 && (
          <div className="detail-dots">
            {displayImages.map((_, i) => (
              <span
                key={i}
                className={`detail-dot${i === imgIdx ? ' active' : ''}`}
                onClick={() => setImgIdx(i)}
              />
            ))}
          </div>
        )}
      </div>

      <h1 className="detail-title">{family.title}</h1>
      <p className="detail-desc">{family.description}</p>

      <div className="detail-options">
        {hasColorOptions && colorEntries.length > 0 && (
          <div className="color-picker">
            <span className="option-selector__label">Цвет</span>
            <div className="color-picker__swatches">
              {colorEntries.map((entry) => (
                <button
                  key={entry.hex}
                  className={`color-swatch${selectedColorHex === entry.hex ? ' color-swatch--active' : ''}`}
                  style={{ '--swatch-color': entry.hex } as React.CSSProperties}
                  onClick={() => handleColorSelect(entry)}
                  aria-label={entry.label}
                />
              ))}
            </div>
            {selectedColorLabel && (
              <span className="color-picker__label">{selectedColorLabel}</span>
            )}
          </div>
        )}

        {nonColorKeys.map((key) => (
          <OptionSelector
            key={key}
            label={OPTION_LABELS[key] ?? key}
            options={allOptionValues[key] ?? []}
            value={selectedOptions[key]}
            onChange={(val) => handleOptionChange(key, val)}
            disabledOptions={disabledOptionValues[key] ?? []}
          />
        ))}
      </div>

      {resolvedVariant?.options?.chip && (
        <p className="detail-chip-info">Чип: {resolvedVariant.options.chip}</p>
      )}

      <div className="detail-price-section">
        {resolvedVariant ? (
          <>
            <span className="detail-price">{resolvedVariant.price.toLocaleString('ru-RU')} ₽</span>
            <span className={`badge ${resolvedVariant.in_stock ? 'badge-stock' : 'badge-out'}`}>
              {resolvedVariant.in_stock ? 'В наличии' : 'Нет в наличии'}
            </span>
          </>
        ) : (
          <span className="detail-no-variant">Выберите опции</span>
        )}
      </div>

      <p className="detail-disclaimer">*Цена и наличие могут меняться</p>

      <button
        className={`btn btn-primary btn-block detail-add${added ? ' detail-add--done' : ''}${outOfStock ? ' detail-add--out' : ''}`}
        disabled={!resolvedVariant || !resolvedVariant.in_stock}
        onClick={handleAddToCart}
      >
        {added ? 'Добавлено ✓' : outOfStock ? 'Нет в наличии' : 'Добавить в корзину'}
      </button>
    </div>
  );
}
