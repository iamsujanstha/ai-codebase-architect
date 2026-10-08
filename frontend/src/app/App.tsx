import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '@/features/auth/AuthContext';
import { CartProvider } from '@/features/store/CartContext';
import { AppChrome } from '@/shared/ui/AppChrome';
import { ProtectedRoute } from '@/shared/ui/ProtectedRoute';
import { AdminLayout } from '@/features/admin/AdminLayout';
import { AdminDashboard } from '@/features/admin/AdminDashboard';
import { ProductsManagement } from '@/features/admin/ProductsManagement';
import { ProductForm } from '@/features/admin/ProductForm';
import { OrdersManagement } from '@/features/admin/OrdersManagement';
import { OrderDetail } from '@/features/admin/OrderDetail';
import { UsersManagement } from '@/features/admin/UsersManagement';
import { UserDetail } from '@/features/admin/UserDetail';
import { AdminSettings } from '@/features/admin/AdminSettings';
import { authRoutes } from './routes/auth.routes';
import { publicRoutes } from './routes/public.routes';
import { protectedRoutes } from './routes/protected.routes';
import { ROUTES } from './constants/routes';

/**
 * App — composition root.
 *
 * Responsibilities:
 *   1. Mount global context providers in the correct order.
 *   2. Declare the top-level router shell.
 *   3. Spread route arrays from focused route modules.
 *
 * Why arrays instead of components?
 * React Router v6 requires <Route> elements to be static JSX children of
 * <Routes>. Wrapping them in a component function breaks route matching
 * because the router sees a component node, not <Route> elements.
 * Exporting plain JSX arrays and spreading them here is the correct pattern.
 */
export default function App(): JSX.Element {
  return (
    <BrowserRouter>
      <AuthProvider>
        <CartProvider>
          <Routes>
            {/* Admin routes - separate from AppChrome */}
            <Route
              path="/admin/*"
              element={
                <ProtectedRoute requireAdmin>
                  <AdminLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<AdminDashboard />} />
              <Route path="products" element={<ProductsManagement />} />
              <Route path="products/new" element={<ProductForm />} />
              <Route path="products/:id/edit" element={<ProductForm />} />
              <Route path="orders" element={<OrdersManagement />} />
              <Route path="orders/:id" element={<OrderDetail />} />
              <Route path="users" element={<UsersManagement />} />
              <Route path="users/:id" element={<UserDetail />} />
              <Route path="settings" element={<AdminSettings />} />
            </Route>

            {/* Regular routes with AppChrome */}
            <Route element={<AppChrome />}>
              {publicRoutes}
              {authRoutes}
              {protectedRoutes}
              <Route path="*" element={<Navigate replace to={ROUTES.HOME} />} />
            </Route>
          </Routes>
        </CartProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
