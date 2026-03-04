import { useState } from 'react';
import './OptionSelector.css';

interface Props {
  label: string;
  options: string[];
  value: string | undefined;
  onChange: (val: string) => void;
  disabledOptions?: string[];
}

export default function OptionSelector({ label, options, value, onChange, disabledOptions = [] }: Props) {
  const [showToast, setShowToast] = useState(false);

  if (options.length === 0) return null;

  const handleClick = (opt: string) => {
    if (disabledOptions.includes(opt)) {
      setShowToast(true);
      setTimeout(() => setShowToast(false), 1500);
      return;
    }
    onChange(opt);
  };

  return (
    <div className="option-selector">
      <span className="option-selector__label">{label}</span>
      <div className="option-selector__chips">
        {options.map((opt) => {
          const isDisabled = disabledOptions.includes(opt);
          return (
            <button
              key={opt}
              className={`chip${value === opt ? ' chip--active' : ''}${isDisabled ? ' chip--disabled' : ''}`}
              onClick={() => handleClick(opt)}
            >
              {opt}
            </button>
          );
        })}
      </div>
      {showToast && <div className="option-toast">Нет в наличии</div>}
    </div>
  );
}
