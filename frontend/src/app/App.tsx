import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ChatPage } from '@/features/chat/ChatPage';
import { CheckoutPage } from '@/features/store/CheckoutPage';
import { CheckoutResultPage } from '@/features/store/CheckoutResultPage';
import { ProductDetailsPage } from '@/features/store/ProductDetailsPage';
import { StorefrontPage } from '@/features/store/StorefrontPage';
import { CartProvider } from '@/features/store/CartContext';
import { AppChrome } from '@/shared/ui/AppChrome';
import { AuthProvider } from '@/features/auth/AuthContext';
import { LoginPage } from '@/features/auth/LoginPage';
import { RegisterPage } from '@/features/auth/RegisterPage';
import { ForgotPasswordPage } from '@/features/auth/ForgotPasswordPage';
import { ResetPasswordPage } from '@/features/auth/ResetPasswordPage';
import { AuthCallbackPage } from '@/features/auth/AuthCallbackPage';
import { DashboardPage } from '@/features/dashboard/DashboardPage';

export default function App(): JSX.Element {
  return (
    <BrowserRouter>
      <AuthProvider>
        <CartProvider>
          <Routes>
            <Route element={<AppChrome />}>
              <Route path="/" element={<StorefrontPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              <Route path="/auth/callback" element={<AuthCallbackPage />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              
              <Route path="/checkout" element={<CheckoutPage />} />
              <Route path="/checkout/result" element={<CheckoutResultPage />} />
              <Route path="/products/:slug" element={<ProductDetailsPage />} />
              <Route path="/chat" element={<ChatPage />} />
              <Route path="/chat/:threadId" element={<ChatPage />} />

              <Route path="*" element={<Navigate replace to="/" />} />
            </Route>
          </Routes>
        </CartProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
