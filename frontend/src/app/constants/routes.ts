/**
 * Centralised route path constants.
 *
 * Every navigation call and <Link to=...> in the app imports from here.
 * Changing a URL means editing one line — not hunting across 20 files.
 */
export const ROUTES = {
  // ── public ──────────────────────────────────────────────────────────────
  HOME:             '/',
  PRODUCT_DETAIL:   '/products/:slug',
  CHAT:             '/chat',
  CHAT_THREAD:      '/chat/:threadId',

  // ── auth ────────────────────────────────────────────────────────────────
  LOGIN:            '/login',
  REGISTER:         '/register',
  FORGOT_PASSWORD:  '/forgot-password',
  RESET_PASSWORD:   '/reset-password',
  AUTH_CALLBACK:    '/auth/callback',

  // ── protected (require login) ────────────────────────────────────────────
  CHECKOUT:         '/checkout',
  CHECKOUT_RESULT:  '/checkout/result',
  ORDERS:           '/orders',
  DASHBOARD:        '/dashboard',
} as const;

export type AppRoute = (typeof ROUTES)[keyof typeof ROUTES];

/** Build a product detail URL from a slug. */
export const productDetailPath = (slug: string) => `/products/${slug}`;

/** Build a checkout result URL. */
export const checkoutResultPath = (orderNumber: string, provider: string) =>
  `${ROUTES.CHECKOUT_RESULT}?orderNumber=${encodeURIComponent(orderNumber)}&provider=${provider}`;

/** Build a login URL that redirects back to a given path after sign-in. */
export const loginWithRedirect = (returnTo: string) =>
  `${ROUTES.LOGIN}?redirect=${encodeURIComponent(returnTo)}`;
