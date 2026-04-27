import { Route } from 'react-router-dom';
import { CheckoutPage } from '@/features/store/CheckoutPage';
import { OrderHistoryPage } from '@/features/store/OrderHistoryPage';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { ProtectedRoute } from '@/shared/ui/ProtectedRoute';
import { ROUTES } from '../constants/routes';

/**
 * Protected route definitions — require authentication.
 *
 * Exported as a plain array of <Route> elements so they can be spread
 * directly inside <Routes> in App.tsx.
 *
 * Each route's element is wrapped in <ProtectedRoute> which redirects to
 * /login?redirect=<current-path> when the user is not signed in.
 *
 * OCP: adding a new protected page means adding one entry here — the
 *      guard logic in ProtectedRoute is never modified.
 */
export const protectedRoutes = [
  <Route
    key="checkout"
    path={ROUTES.CHECKOUT}
    element={<ProtectedRoute><CheckoutPage /></ProtectedRoute>}
  />,
  <Route
    key="orders"
    path={ROUTES.ORDERS}
    element={<ProtectedRoute><OrderHistoryPage /></ProtectedRoute>}
  />,
  <Route
    key="dashboard"
    path={ROUTES.DASHBOARD}
    element={<ProtectedRoute><DashboardPage /></ProtectedRoute>}
  />,
];
