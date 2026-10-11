/**
 * Design tokens matching the Airbnb-style visual reference.
 * These values are the source of truth for the application's design system.
 */

export const colors = {
  // Brand
  brand: '#ff385c',
  brandHover: '#e31c5f',

  // Light theme
  light: {
    bg: '#ffffff',
    ink: '#222222',
    muted: '#6a6a6a',
    border: '#e6e6e6',
    soft: '#f7f7f7',
  },

  // Dark theme
  dark: {
    bg: '#121212',
    ink: '#f2f2f2',
    muted: '#a3a3a3',
    border: '#2e2e2e',
    soft: '#1e1e1e',
  },
} as const;

export const shadows = {
  sm: '0 1px 3px rgba(0, 0, 0, 0.1)',
  md: '0 6px 24px rgba(0, 0, 0, 0.14)',
  mdDark: '0 6px 24px rgba(0, 0, 0, 0.7)',
} as const;

export const borderRadius = {
  sm: '8px',
  md: '12px',
  lg: '14px',
  pill: '999px',
  circle: '50%',
} as const;

export const spacing = {
  xs: '4px',
  sm: '8px',
  md: '12px',
  lg: '16px',
  xl: '24px',
  xxl: '32px',
} as const;

export const typography = {
  fontFamily: 'Figtree, system-ui, -apple-system, sans-serif',
  weights: {
    regular: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
  sizes: {
    xs: '11px',
    sm: '12px',
    base: '13px',
    md: '14px',
    lg: '15px',
    xl: '17px',
    xxl: '19px',
    xxxl: '22px',
  },
} as const;

export const breakpoints = {
  mobile: 700,
  tablet: 1100,
  desktop: 1760,
} as const;

export const layout = {
  maxWidth: '1760px',
  headerHeight: '64px',
  mobileHeaderHeight: '120px', // When search is on its own row
  padding: {
    mobile: '16px',
    tablet: '40px',
    desktop: '80px',
  },
} as const;

export const productCard = {
  imageRatio: '20 / 19',
  borderRadius: borderRadius.lg,
  minWidth: '250px',
  gap: {
    column: '24px',
    row: '32px',
  },
} as const;

export const conciergePanelWidth = '440px';
export const studioSidebarWidth = '280px';
