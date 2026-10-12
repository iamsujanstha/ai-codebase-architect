import type { CatalogProduct } from '@/core/types/catalog';

export interface DynamicVisual {
  gradient: string;
  darkGradient: string;
  glyph: string;
  accent: string;
  badgeBg: string;
}

// 12 curated, high-end Airbnb-style color palettes
const CURATED_PALETTES = [
  {
    // Sunset Coral
    gradient: 'linear-gradient(145deg, #ff8c69 0%, #ff5e62 100%)',
    darkGradient: 'linear-gradient(145deg, #7c2d12 0%, #431407 100%)',
    accent: '#ff5e62',
    badgeBg: 'rgba(255, 94, 98, 0.15)',
  },
  {
    // Nordic Azure
    gradient: 'linear-gradient(145deg, #38bdf8 0%, #0284c7 100%)',
    darkGradient: 'linear-gradient(145deg, #075985 0%, #082f49 100%)',
    accent: '#0284c7',
    badgeBg: 'rgba(2, 132, 199, 0.15)',
  },
  {
    // Cosmic Lavender
    gradient: 'linear-gradient(145deg, #c084fc 0%, #7c3aed 100%)',
    darkGradient: 'linear-gradient(145deg, #581c87 0%, #2e1065 100%)',
    accent: '#7c3aed',
    badgeBg: 'rgba(124, 58, 237, 0.15)',
  },
  {
    // Emerald Breeze
    gradient: 'linear-gradient(145deg, #34d399 0%, #059669 100%)',
    darkGradient: 'linear-gradient(145deg, #064e3b 0%, #022c22 100%)',
    accent: '#059669',
    badgeBg: 'rgba(5, 150, 105, 0.15)',
  },
  {
    // Rose Berry
    gradient: 'linear-gradient(145deg, #fb7185 0%, #e11d48 100%)',
    darkGradient: 'linear-gradient(145deg, #881337 0%, #4c0519 100%)',
    accent: '#e11d48',
    badgeBg: 'rgba(225, 29, 72, 0.15)',
  },
  {
    // Honey Amber
    gradient: 'linear-gradient(145deg, #fbbf24 0%, #d97706 100%)',
    darkGradient: 'linear-gradient(145deg, #78350f 0%, #451a03 100%)',
    accent: '#d97706',
    badgeBg: 'rgba(217, 119, 6, 0.15)',
  },
  {
    // Indigo Twilight
    gradient: 'linear-gradient(145deg, #818cf8 0%, #4338ca 100%)',
    darkGradient: 'linear-gradient(145deg, #312e81 0%, #1e1b4b 100%)',
    accent: '#4338ca',
    badgeBg: 'rgba(67, 56, 202, 0.15)',
  },
  {
    // Ocean Teal
    gradient: 'linear-gradient(145deg, #2dd4bf 0%, #0f766e 100%)',
    darkGradient: 'linear-gradient(145deg, #134e4a 0%, #042f2e 100%)',
    accent: '#0f766e',
    badgeBg: 'rgba(15, 118, 110, 0.15)',
  },
  {
    // Velvet Orchid
    gradient: 'linear-gradient(145deg, #f472b6 0%, #db2777 100%)',
    darkGradient: 'linear-gradient(145deg, #701a75 0%, #4a044e 100%)',
    accent: '#db2777',
    badgeBg: 'rgba(219, 39, 119, 0.15)',
  },
  {
    // Tangerine Sun
    gradient: 'linear-gradient(145deg, #fb923c 0%, #ea580c 100%)',
    darkGradient: 'linear-gradient(145deg, #9a3412 0%, #431407 100%)',
    accent: '#ea580c',
    badgeBg: 'rgba(234, 88, 12, 0.15)',
  },
  {
    // Polar Cyan
    gradient: 'linear-gradient(145deg, #22d3ee 0%, #0891b2 100%)',
    darkGradient: 'linear-gradient(145deg, #155e75 0%, #083344 100%)',
    accent: '#0891b2',
    badgeBg: 'rgba(8, 145, 178, 0.15)',
  },
  {
    // Golden Lime
    gradient: 'linear-gradient(145deg, #a3e635 0%, #65a30d 100%)',
    darkGradient: 'linear-gradient(145deg, #3f6212 0%, #1a2e05 100%)',
    accent: '#65a30d',
    badgeBg: 'rgba(101, 163, 13, 0.15)',
  },
];

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

/**
 * Intelligently pick appropriate emoji/glyph based on product keywords and category.
 */
export function getProductGlyph(product: Partial<CatalogProduct>): string {
  const name = (product.name || '').toLowerCase();
  const slug = (product.slug || '').toLowerCase();
  const cat = (product.categorySlug || '').toLowerCase();

  if (name.includes('laptop') || name.includes('macbook') || name.includes('xps') || slug.includes('laptop')) return '💻';
  if (name.includes('keyboard') || slug.includes('keyboard')) return '⌨️';
  if (name.includes('mouse') || slug.includes('mouse')) return '🖱️';
  if (name.includes('airpods') || name.includes('headphone') || name.includes('audio') || name.includes('wh-1000') || slug.includes('audio')) return '🎧';
  if (name.includes('monitor') || name.includes('display') || name.includes('4k') || slug.includes('monitor')) return '🖥️';
  if (name.includes('chair') || name.includes('ergochair') || slug.includes('chair')) return '🪑';
  if (name.includes('desk') || slug.includes('desk')) return '🛋️';
  if (name.includes('book') || slug.includes('book') || cat === 'books') return '📚';
  if (name.includes('watch') || slug.includes('watch')) return '⌚';
  if (name.includes('phone') || name.includes('ipad') || name.includes('tablet')) return '📱';
  if (name.includes('cable') || name.includes('hub') || name.includes('charger')) return '🔌';
  if (name.includes('bag') || name.includes('backpack')) return '🎒';
  if (name.includes('camera')) return '📷';
  if (name.includes('lamp') || name.includes('light')) return '💡';
  if (cat === 'software') return '⚡';
  if (cat === 'accessories') return '🧰';
  if (cat === 'furniture') return '🪑';
  if (cat === 'electronics') return '💻';

  return product.visual?.glyph || '✨';
}

/**
 * Returns dynamic, harmonized visual properties (gradient, glyph, accent)
 * for a product, ensuring each card looks unique and premium like Airbnb listings.
 */
export function getDynamicProductVisual(
  product: CatalogProduct,
  index = 0,
): DynamicVisual {
  // Use product id or slug to ensure deterministic visual assignment
  const key = product.slug || product.id || `${product.name}-${index}`;
  const paletteIndex = hashString(key) % CURATED_PALETTES.length;
  const palette = CURATED_PALETTES[paletteIndex];
  const glyph = getProductGlyph(product);

  return {
    gradient: palette.gradient,
    darkGradient: palette.darkGradient,
    glyph,
    accent: palette.accent,
    badgeBg: palette.badgeBg,
  };
}
