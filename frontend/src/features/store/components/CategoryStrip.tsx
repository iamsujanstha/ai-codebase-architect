import { Sparkles, Laptop, Armchair, BookOpen, Wrench, Package } from 'lucide-react';

export interface Category {
  id: string;
  name: string;
  icon: React.ReactNode;
  count?: number;
}

interface CategoryStripProps {
  categories: Category[];
  selectedCategory: string;
  onSelectCategory: (categoryId: string) => void;
}

/**
 * CategoryStrip - Horizontal scrollable category tabs with Lucide icons.
 * Matches Airbnb design with smooth active state indicator and no nested .cats wrapper.
 */
export function CategoryStrip({
  categories,
  selectedCategory,
  onSelectCategory,
}: CategoryStripProps): JSX.Element {
  return (
    <div className="strip" role="tablist" aria-label="Product categories">
      {categories.map((category) => (
        <button
          key={category.id}
          className="cat"
          data-c={category.id}
          role="tab"
          aria-selected={selectedCategory === category.id}
          aria-pressed={selectedCategory === category.id}
          onClick={() => onSelectCategory(category.id)}
          type="button"
        >
          <span className="cat-icon">{category.icon}</span>
          <span className="cat-label">{category.name}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * Default categories matching the Neon PostgreSQL database seed
 * so the initial render never jumps or flickers upon reload.
 */
export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'all', name: 'All', icon: <Sparkles size={24} /> },
  { id: 'electronics', name: 'Electronics', icon: <Laptop size={24} /> },
  { id: 'furniture', name: 'Furniture', icon: <Armchair size={24} /> },
  { id: 'books', name: 'Books', icon: <BookOpen size={24} /> },
  { id: 'accessories', name: 'Accessories', icon: <Wrench size={24} /> },
  { id: 'software', name: 'Software', icon: <Package size={24} /> },
];

