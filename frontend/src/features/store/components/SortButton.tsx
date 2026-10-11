import { useState, useRef } from 'react';
import { useOnClickOutside } from '@/shared/hooks/useOnClickOutside';

export type SortOption = 'featured' | 'price-asc' | 'price-desc' | 'rating';

interface SortButtonProps {
  currentSort: SortOption;
  onSortChange: (sort: SortOption) => void;
}

const SORT_LABELS: Record<SortOption, string> = {
  featured: 'Featured',
  'price-asc': 'Price: low to high',
  'price-desc': 'Price: high to low',
  rating: 'Top rated',
};

/**
 * SortButton - Dropdown button to change product sort order.
 * Styled as a chip matching the atlas-app.html design.
 */
export function SortButton({ currentSort, onSortChange }: SortButtonProps): JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useOnClickOutside(menuRef, () => setIsOpen(false));

  const handleSelect = (sort: SortOption) => {
    onSortChange(sort);
    setIsOpen(false);
  };

  return (
    <div className="rel" ref={menuRef} style={{ marginBottom: '10px' }}>
      <button
        className="chip"
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        type="button"
      >
        Sort: {SORT_LABELS[currentSort]}
      </button>

      {isOpen && (
        <div className="menu" role="menu" style={{ right: 0, top: '44px', minWidth: '200px' }}>
          {Object.entries(SORT_LABELS).map(([key, label]) => (
            <button
              key={key}
              role="menuitem"
              onClick={() => handleSelect(key as SortOption)}
              type="button"
              style={{
                fontWeight: currentSort === key ? '700' : '500',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
