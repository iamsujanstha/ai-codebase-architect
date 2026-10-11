import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '@/features/auth/AuthContext';
import { CartProvider } from '@/features/store/CartContext';
import { AIConciergeProvider } from '@/features/chat/AIConciergeContext';
import { ToastProvider } from '@/shared/contexts/ToastContext';
import { AppLayout } from '@/shared/ui/AppLayout';
import { AdminRoute } from '@/shared/ui/AdminRoute';
import { authRoutes } from './routes/auth.routes';
import { publicRoutes } from './routes/public.routes';
import { protectedRoutes } from './routes/protected.routes';
import { ROUTES } from './constants/routes';

// Lazy-loaded admin bundle so shoppers never download admin code
const AdminLayout = React.lazy(() =>
  import('@/features/admin/AdminLayout').then((m) => ({
    default: m.AdminLayout,
  })),
);
const AdminDashboard = React.lazy(() =>
  import('@/features/admin/AdminDashboard').then((m) => ({
    default: m.AdminDashboard,
  })),
);
const ProductsManagement = React.lazy(() =>
  import('@/features/admin/ProductsManagement').then((m) => ({
    default: m.ProductsManagement,
  })),
);
const UsersManagement = React.lazy(() =>
  import('@/features/admin/UsersManagement').then((m) => ({
    default: m.UsersManagement,
  })),
);

/**
 * App — composition root.
 */
export default function App(): JSX.Element {
  return (
    <BrowserRouter>
      <AuthProvider>
        <CartProvider>
          <AIConciergeProvider>
            <ToastProvider>
              <Routes>
                {/* Admin routes - lazy loaded with AdminRoute guard */}
                <Route
                  path="/admin/*"
                  element={
                    <AdminRoute>
                      <React.Suspense
                        fallback={
                          <div
                            style={{
                              minHeight: '100vh',
                              display: 'grid',
                              placeItems: 'center',
                              color: 'var(--mute, #6a6a6a)',
                            }}
                          >
                            Loading admin…
                          </div>
                        }
                      >
                        <AdminLayout />
                      </React.Suspense>
                    </AdminRoute>
                  }
                >
                  <Route index element={<AdminDashboard />} />
                  <Route path="products" element={<ProductsManagement />} />
                  <Route path="users" element={<UsersManagement />} />
                  <Route path="*" element={<Navigate replace to="/admin" />} />
                </Route>

                {/* Regular storefront routes */}
                <Route element={<AppLayout />}>
                  {publicRoutes}
                  {authRoutes}
                  {protectedRoutes}
                  <Route path="*" element={<Navigate replace to={ROUTES.HOME} />} />
                </Route>
              </Routes>
            </ToastProvider>
          </AIConciergeProvider>
        </CartProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
