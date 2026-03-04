import type { Category } from '../domain/types';
import { ALL_CATEGORIES } from '../domain/types';
import './CategoryFilter.css';

interface Props {
  value: Category | null;
  onChange: (c: Category | null) => void;
}

const ICONS: Record<Category, string> = {
  iPhone: '📱',
  iPad: '📟',
  MacBook: '💻',
  Watch: '⌚',
  AirPods: '🎧',
};

export default function CategoryFilter({ value, onChange }: Props) {
  return (
    <div className="cat-filter">
      <button
        className={`cat-chip${value === null ? ' cat-chip--active' : ''}`}
        onClick={() => onChange(null)}
      >
        Все
      </button>
      {ALL_CATEGORIES.map((c) => (
        <button
          key={c}
          className={`cat-chip${value === c ? ' cat-chip--active' : ''}`}
          onClick={() => onChange(c)}
        >
          <span>{ICONS[c]}</span> {c}
        </button>
      ))}
    </div>
  );
}
