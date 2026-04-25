import {
  CatalogHero,
  CatalogTestimonial,
  CatalogValueProp,
} from '../interfaces/catalog-home-response.interface';
import { Category } from '../schemas/category.schema';
import { Product } from '../schemas/product.schema';

// Seed data is a teaching-friendly stand-in for the merchandising data
// a real ecommerce team would create in an admin panel or CMS.
//
// Why seed at all?
// - New developers can run the stack and immediately see meaningful UI.
// - Reviewers can validate the design without hand-entering records.
// - Atlas/local Mongo setups stay consistent across environments.
export const CATEGORY_SEED_DATA: Array<Omit<Category, never>> = [
  {
    slug: 'desks',
    name: 'Desks & Setup',
    description: 'Premium foundation pieces for focused workspaces.',
    accentColor: '#8b5cf6',
    icon: '▣',
    featuredCopy: 'Workstation upgrades for teams that live in flow state.',
    sortOrder: 1,
  },
  {
    slug: 'audio',
    name: 'Audio',
    description: 'Immersive listening for calls, focus sessions, and creators.',
    accentColor: '#14b8a6',
    icon: '◉',
    featuredCopy: 'Hear less chaos and more of the work that matters.',
    sortOrder: 2,
  },
  {
    slug: 'productivity',
    name: 'Productivity Gear',
    description: 'Input devices and accessories engineered for speed.',
    accentColor: '#f97316',
    icon: '✦',
    featuredCopy: 'Precision tools for builders, designers, and operators.',
    sortOrder: 3,
  },
  {
    slug: 'lighting',
    name: 'Lighting',
    description: 'Mood, clarity, and camera-ready ambience for hybrid work.',
    accentColor: '#06b6d4',
    icon: '◌',
    featuredCopy: 'Balanced lighting that looks premium on screen and on desk.',
    sortOrder: 4,
  },
];

export const PRODUCT_SEED_DATA: Array<Omit<Product, never>> = [
  {
    slug: 'nova-standing-desk',
    name: 'Nova Standing Desk',
    subtitle: 'Motorized walnut workstation with cable-first design',
    shortDescription:
      'A dual-motor standing desk built for modern home offices and startup studios.',
    description:
      'Nova Standing Desk combines quiet height adjustment, cable concealment, and a soft-touch walnut surface so your workspace feels as intentional as your software stack. It is designed for engineers, designers, and operators who want one premium desk that works from deep-focus mornings through evening collaboration blocks.',
    price: 1199,
    compareAtPrice: 1399,
    currency: 'USD',
    nprPrice: 162000,
    rating: 4.9,
    reviewCount: 182,
    inventoryCount: 14,
    categorySlug: 'desks',
    categoryName: 'Desks & Setup',
    tags: ['standing desk', 'home office', 'workspace'],
    keyHighlights: [
      'Dual-motor lift system with four preset heights',
      'Integrated cable tray and magnetic power rail',
      'Studio-grade walnut finish with anti-fingerprint coating',
    ],
    heroBadge: 'Flagship setup',
    featured: true,
    bestSeller: true,
    newArrival: false,
    visual: {
      gradientFrom: '#111827',
      gradientTo: '#7c3aed',
      accent: '#c4b5fd',
      glyph: '▧',
    },
    specs: [
      { label: 'Desktop width', value: '160 cm' },
      { label: 'Height range', value: '62–127 cm' },
      { label: 'Weight capacity', value: '120 kg' },
      { label: 'Memory presets', value: '4 profiles' },
    ],
  },
  {
    slug: 'atlas-4k-display',
    name: 'Atlas 4K Display',
    subtitle: '27-inch color-accurate monitor for builders and creatives',
    shortDescription:
      'A razor-sharp 4K panel with USB-C docking and factory color calibration.',
    description:
      'Atlas 4K Display is tuned for people who spend all day with pixels: product designers, frontend engineers, video editors, and anyone who wants one dependable monitor with a premium finish. Its wide-color panel, KVM-ready IO, and clean industrial frame make it ideal for both code and creative work.',
    price: 799,
    compareAtPrice: 899,
    currency: 'USD',
    nprPrice: 108000,
    rating: 4.8,
    reviewCount: 241,
    inventoryCount: 31,
    categorySlug: 'desks',
    categoryName: 'Desks & Setup',
    tags: ['monitor', '4k', 'usb-c', 'creator'],
    keyHighlights: [
      '3840×2160 resolution with 98% DCI-P3 coverage',
      'Single-cable USB-C docking with 90W power delivery',
      'Minimal-bezel design that scales to dual-monitor rigs',
    ],
    heroBadge: 'Creator favorite',
    featured: true,
    bestSeller: false,
    newArrival: true,
    visual: {
      gradientFrom: '#0f172a',
      gradientTo: '#2563eb',
      accent: '#93c5fd',
      glyph: '▤',
    },
    specs: [
      { label: 'Panel', value: '27-inch IPS' },
      { label: 'Refresh rate', value: '144 Hz' },
      { label: 'Ports', value: 'USB-C, HDMI, DisplayPort' },
      { label: 'Power delivery', value: '90W USB-C' },
    ],
  },
  {
    slug: 'drift-noise-canceling-headphones',
    name: 'Drift Headphones',
    subtitle: 'Adaptive ANC for deep work and travel days',
    shortDescription:
      'Wireless over-ear headphones with rich detail and all-day comfort.',
    description:
      'Drift Headphones are built for people who move between focused solo work and noisy team environments. Adaptive active noise cancellation, a low-latency wired mode, and crystal-clear beamforming microphones make them equally useful for flights, sprint planning, and late-night coding sessions.',
    price: 349,
    compareAtPrice: 399,
    currency: 'USD',
    nprPrice: 47000,
    rating: 4.7,
    reviewCount: 328,
    inventoryCount: 56,
    categorySlug: 'audio',
    categoryName: 'Audio',
    tags: ['audio', 'headphones', 'anc', 'hybrid work'],
    keyHighlights: [
      'Adaptive noise cancellation with transparency mode',
      '48-hour battery life with USB-C fast charging',
      'Low-latency wired mode for editing and live monitoring',
    ],
    heroBadge: 'Best seller',
    featured: true,
    bestSeller: true,
    newArrival: false,
    visual: {
      gradientFrom: '#042f2e',
      gradientTo: '#0f766e',
      accent: '#99f6e4',
      glyph: '◎',
    },
    specs: [
      { label: 'Battery life', value: '48 hours' },
      { label: 'Charging', value: 'USB-C fast charge' },
      { label: 'Microphones', value: '6 beamforming mics' },
      { label: 'Weight', value: '264 g' },
    ],
  },
  {
    slug: 'echo-studio-speaker-bar',
    name: 'Echo Studio Bar',
    subtitle: 'Desk speaker system that fills the room without the clutter',
    shortDescription:
      'A compact stereo bar tuned for focus playlists, meetings, and product demos.',
    description:
      'Echo Studio Bar delivers surprisingly full sound from a compact footprint, making it perfect for premium desk setups where space is limited but expectations are high. It blends Bluetooth convenience with a direct USB-C connection for lower-latency desktop audio.',
    price: 229,
    compareAtPrice: 259,
    currency: 'USD',
    nprPrice: 31000,
    rating: 4.6,
    reviewCount: 147,
    inventoryCount: 43,
    categorySlug: 'audio',
    categoryName: 'Audio',
    tags: ['speakers', 'desk audio', 'usb-c'],
    keyHighlights: [
      'Balanced stereo tuning for desks and small studios',
      'Bluetooth and USB-C input with simple source switching',
      'Acoustic fabric wrap with aluminum control dial',
    ],
    heroBadge: 'Space-saving audio',
    featured: false,
    bestSeller: false,
    newArrival: true,
    visual: {
      gradientFrom: '#083344',
      gradientTo: '#0891b2',
      accent: '#67e8f9',
      glyph: '◈',
    },
    specs: [
      { label: 'Connectivity', value: 'Bluetooth 5.3, USB-C' },
      { label: 'Drivers', value: 'Dual 45 mm' },
      { label: 'Desk footprint', value: '42 cm' },
      { label: 'Controls', value: 'Touch + dial' },
    ],
  },
  {
    slug: 'pulse-ergo-mouse',
    name: 'Pulse Ergo Mouse',
    subtitle: 'Precision ergonomic mouse tuned for long creative sessions',
    shortDescription:
      'An ergonomic wireless mouse with tactile scrolling and quiet switches.',
    description:
      'Pulse Ergo Mouse is designed to disappear into your workflow. With a sculpted shell, ultra-precise tracking, and cross-device switching, it supports everything from high-volume spreadsheet work to pixel-perfect interface design.',
    price: 139,
    compareAtPrice: 169,
    currency: 'USD',
    nprPrice: 19000,
    rating: 4.8,
    reviewCount: 509,
    inventoryCount: 72,
    categorySlug: 'productivity',
    categoryName: 'Productivity Gear',
    tags: ['mouse', 'ergonomic', 'productivity'],
    keyHighlights: [
      'Ergonomic sculpt with adjustable scroll resistance',
      'Tracks on glass and high-gloss desks',
      'Multi-device switching for laptop, desktop, and tablet',
    ],
    heroBadge: 'Operator essential',
    featured: true,
    bestSeller: true,
    newArrival: false,
    visual: {
      gradientFrom: '#431407',
      gradientTo: '#ea580c',
      accent: '#fdba74',
      glyph: '◐',
    },
    specs: [
      { label: 'Sensor', value: '8000 DPI' },
      { label: 'Battery', value: '70 days' },
      { label: 'Connection', value: 'Bluetooth + 2.4 GHz' },
      { label: 'Switches', value: 'Quiet tactile' },
    ],
  },
  {
    slug: 'rift-mechanical-keyboard',
    name: 'Rift Mechanical Keyboard',
    subtitle: 'Low-profile board with warm acoustics and hot-swap switches',
    shortDescription:
      'A premium low-profile mechanical keyboard for coding, writing, and shipping.',
    description:
      'Rift Mechanical Keyboard balances satisfying acoustics with professional aesthetics. Its gasket mounting, hot-swap sockets, and per-key customization make it ideal for developers who care about feel but also want a board polished enough for any client-facing workspace.',
    price: 249,
    compareAtPrice: 289,
    currency: 'USD',
    nprPrice: 33600,
    rating: 4.9,
    reviewCount: 416,
    inventoryCount: 38,
    categorySlug: 'productivity',
    categoryName: 'Productivity Gear',
    tags: ['keyboard', 'mechanical keyboard', 'developer'],
    keyHighlights: [
      'Gasket-mounted chassis for a softer typing profile',
      'Hot-swap switch sockets with VIA-compatible remapping',
      'Wireless tri-mode support plus wired competitive mode',
    ],
    heroBadge: 'Developer pick',
    featured: false,
    bestSeller: true,
    newArrival: true,
    visual: {
      gradientFrom: '#312e81',
      gradientTo: '#7c3aed',
      accent: '#ddd6fe',
      glyph: '⌘',
    },
    specs: [
      { label: 'Layout', value: '75%' },
      { label: 'Connectivity', value: 'USB-C, Bluetooth, 2.4 GHz' },
      { label: 'Battery', value: '75 hours RGB off' },
      { label: 'Mount', value: 'Gasket' },
    ],
  },
  {
    slug: 'lumen-monitor-light',
    name: 'Lumen Monitor Light',
    subtitle: 'Glare-free desk lighting with video-call side fill',
    shortDescription:
      'A smart light bar that brightens your desk without blowing out your screen.',
    description:
      'Lumen Monitor Light combines front-facing desk illumination with a subtle rear ambient glow to create a cleaner, calmer workstation. It is especially useful in dim offices, late-night setups, and creator spaces where background ambience matters almost as much as function.',
    price: 119,
    compareAtPrice: 149,
    currency: 'USD',
    nprPrice: 16000,
    rating: 4.5,
    reviewCount: 198,
    inventoryCount: 87,
    categorySlug: 'lighting',
    categoryName: 'Lighting',
    tags: ['lighting', 'monitor light', 'desk setup'],
    keyHighlights: [
      'Asymmetric optics reduce screen glare',
      'Rear glow mode improves webcam presence',
      'Magnetic remote with scene presets',
    ],
    heroBadge: 'Desk glow',
    featured: false,
    bestSeller: false,
    newArrival: true,
    visual: {
      gradientFrom: '#164e63',
      gradientTo: '#06b6d4',
      accent: '#a5f3fc',
      glyph: '✺',
    },
    specs: [
      { label: 'Color temperature', value: '2700K–6500K' },
      { label: 'Brightness', value: 'Up to 700 lux' },
      { label: 'Control', value: 'Magnetic wireless dial' },
      { label: 'Mount', value: 'Universal monitor clamp' },
    ],
  },
  {
    slug: 'halo-floor-lamp',
    name: 'Halo Floor Lamp',
    subtitle: 'Architectural ambient lamp for premium studio corners',
    shortDescription:
      'A vertical ambient light designed to make small rooms feel expensive.',
    description:
      'Halo Floor Lamp adds depth to workspaces, video call backdrops, and studio corners. Its diffused vertical glow gives rooms a premium feel without occupying much footprint, making it a favorite for founders and creators upgrading the full aesthetic of their environment.',
    price: 189,
    compareAtPrice: 219,
    currency: 'USD',
    nprPrice: 25500,
    rating: 4.6,
    reviewCount: 124,
    inventoryCount: 22,
    categorySlug: 'lighting',
    categoryName: 'Lighting',
    tags: ['ambient light', 'studio setup', 'home office'],
    keyHighlights: [
      'Slim architectural profile with weighted base',
      'Warm-to-cool scenes for work and wind-down hours',
      'Thread-ready smart home integration',
    ],
    heroBadge: 'Room upgrade',
    featured: true,
    bestSeller: false,
    newArrival: false,
    visual: {
      gradientFrom: '#172554',
      gradientTo: '#2563eb',
      accent: '#bfdbfe',
      glyph: '│',
    },
    specs: [
      { label: 'Height', value: '142 cm' },
      { label: 'Scenes', value: '6 presets' },
      { label: 'Connectivity', value: 'Thread + Bluetooth' },
      { label: 'Finish', value: 'Matte aluminum' },
    ],
  },
];

export const STOREFRONT_HERO: CatalogHero = {
  eyebrow: 'Atlas-backed storefront',
  title: 'Build the workspace your best work deserves.',
  description:
    'A premium ecommerce experience powered by React, NestJS, MongoDB, and a local AI concierge that lives right inside the same platform.',
  primaryCtaLabel: 'Shop the collection',
  primaryCtaHref: '#catalog',
  secondaryCtaLabel: 'Open AI concierge',
  secondaryCtaHref: '/chat',
  stats: [
    { label: 'Curated SKUs', value: '08' },
    { label: 'Avg. product rating', value: '4.8/5' },
    { label: 'Mongo-backed catalog', value: 'Atlas-ready' },
  ],
};

export const STOREFRONT_VALUE_PROPS: CatalogValueProp[] = [
  {
    title: 'Merchandising-first API design',
    description:
      'The catalog endpoint is shaped around what storefronts actually need: categories, featured inventory, and polished product cards.',
  },
  {
    title: 'Atlas-ready persistence',
    description:
      'Swap in a MongoDB Atlas connection string and the same Mongoose module continues to power the storefront with minimal change.',
  },
  {
    title: 'AI and commerce in one platform',
    description:
      'The `/chat` route stays alive as a dedicated local-model workspace, which makes the monorepo feel like a realistic SaaS product rather than a demo.',
  },
];

export const STOREFRONT_TESTIMONIALS: CatalogTestimonial[] = [
  {
    customer: 'Avery Chen',
    role: 'Founding Designer, Northstar',
    quote:
      'The catalog feels premium end-to-end, and having the AI concierge in the same app makes it feel like a serious product platform.',
  },
  {
    customer: 'Mika Patel',
    role: 'Staff Engineer, Relay',
    quote:
      'This stack is exactly how I’d teach a junior engineer to structure a commerce frontend talking to a NestJS gateway with MongoDB behind it.',
  },
  {
    customer: 'Jordan Brooks',
    role: 'Operations Lead, Frame',
    quote:
      'The seeded inventory is polished enough that the first run already feels investor-demo ready.',
  },
];

export const STOREFRONT_ANNOUNCEMENT =
  'Spring launch: premium workspace gear, Mongo-backed catalog APIs, and a local Ollama-powered AI concierge in one experience.';
