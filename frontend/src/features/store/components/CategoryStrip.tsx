import { Sparkles, Armchair, Lightbulb, Keyboard, Headphones, Monitor, Wrench } from 'lucide-react';

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
 * Matches the design from atlas-app.html with proper aria-pressed states.
 */
export function CategoryStrip({
  categories,
  selectedCategory,
  onSelectCategory,
}: CategoryStripProps): JSX.Element {
  return (
    <div className="cats">
      <div className="strip">
        {categories.map((category) => (
          <button
            key={category.id}
            className="cat"
            data-c={category.id}
            aria-pressed={selectedCategory === category.id}
            onClick={() => onSelectCategory(category.id)}
            type="button"
          >
            <span>{category.icon}</span>
            {category.name}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Default categories matching the demo data structure
 */
export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'all', name: 'All', icon: <Sparkles size={24} /> },
  { id: 'desk', name: 'Desks', icon: <Armchair size={24} /> },
  { id: 'lighting', name: 'Lighting', icon: <Lightbulb size={24} /> },
  { id: 'keyboard', name: 'Keyboards', icon: <Keyboard size={24} /> },
  { id: 'audio', name: 'Audio', icon: <Headphones size={24} /> },
  { id: 'display', name: 'Displays', icon: <Monitor size={24} /> },
  { id: 'accessory', name: 'Accessories', icon: <Wrench size={24} /> },
];
