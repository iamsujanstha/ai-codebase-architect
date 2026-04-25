import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ChatPage } from '@/features/chat/ChatPage';
import { CheckoutPage } from '@/features/store/CheckoutPage';
import { CheckoutResultPage } from '@/features/store/CheckoutResultPage';
import { ProductDetailsPage } from '@/features/store/ProductDetailsPage';
import { StorefrontPage } from '@/features/store/StorefrontPage';
import { CartProvider } from '@/features/store/CartContext';
import { AppChrome } from '@/shared/ui/AppChrome';

// The App component is now the frontend composition root.
// Instead of rendering one single screen, it wires together:
// - routing
// - global cart state
// - shared app chrome
// - page-level experiences
//
// Production analogy:
// This is the "shell application" that hosts multiple product surfaces:
// a storefront and an AI workspace living inside the same SaaS.
export default function App(): JSX.Element {
  return (
    <BrowserRouter>
      <CartProvider>
        <Routes>
          <Route element={<AppChrome />}>
            <Route path="/" element={<StorefrontPage />} />
            <Route path="/checkout" element={<CheckoutPage />} />
            <Route path="/checkout/result" element={<CheckoutResultPage />} />
            <Route path="/products/:slug" element={<ProductDetailsPage />} />
            <Route path="/chat" element={<ChatPage />} />
            <Route path="/chat/:threadId" element={<ChatPage />} />

            <Route path="*" element={<Navigate replace to="/" />} />
          </Route>
        </Routes>
      </CartProvider>
    </BrowserRouter>
  );
}
