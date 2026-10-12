import { Route } from 'react-router-dom';
import { StorefrontPage } from '@/features/store/StorefrontPage';
import { ProductDetailsPage } from '@/features/store/ProductDetailsPage';
import { CheckoutResultPage } from '@/features/store/CheckoutResultPage';
import { ChatPage } from '@/features/chat/ChatPage';
import { ROUTES } from '../constants/routes';

/**
 * Public route definitions — accessible without authentication.
 *
 * Exported as a plain array of <Route> elements so they can be spread
 * directly inside <Routes> in App.tsx. React Router v6 requires <Route>
 * elements to be static JSX children of <Routes>, not wrapped in a
 * component function.
 *
 * Note: /checkout/result is intentionally public because payment providers
 * (Stripe, eSewa) redirect back to it. The page handles unauthenticated
 * state gracefully with a sign-in nudge.
 */
export const publicRoutes = [
  <Route key="home"            path={ROUTES.HOME}            element={<StorefrontPage />} />,
  <Route key="product-detail"  path={ROUTES.PRODUCT_DETAIL}  element={<ProductDetailsPage />} />,
  <Route key="checkout-result" path={ROUTES.CHECKOUT_RESULT} element={<CheckoutResultPage />} />,
  <Route key="chat"            path={ROUTES.CHAT}            element={<ChatPage />} />,
  <Route key="chat-thread"     path={ROUTES.CHAT_THREAD}     element={<ChatPage />} />,
];
