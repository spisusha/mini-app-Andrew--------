import type { SortOption } from '../domain/types';
import './SortBar.css';

const OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'popularity', label: 'Популярные' },
  { value: 'price_asc', label: 'Дешевле' },
  { value: 'price_desc', label: 'Дороже' },
  { value: 'newest', label: 'Новинки' },
];

interface Props {
  value: SortOption;
  onChange: (v: SortOption) => void;
}

export default function SortBar({ value, onChange }: Props) {
  return (
    <div className="sort-bar">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          className={`sort-chip${value === o.value ? ' sort-chip--active' : ''}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
