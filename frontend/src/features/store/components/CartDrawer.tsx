import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import { useCart } from '@/features/store/CartContext';
import { useAuth } from '@/features/auth/AuthContext';
import { formatCurrency } from '@/shared/utils/formatCurrency';
import { ROUTES, loginWithRedirect } from '@/app/constants/routes';

/**
 * CartDrawer - Shopping cart slide-out drawer matching atlas-app.html design.
 * Features:
 * - Scrim backdrop
 * - Header with close button
 * - Line item list with thumbnail gradient, emoji, and +/- quantity controls
 * - Payment method switcher (Card with Stripe / eSewa)
 * - Order total and Checkout button
 * - Empty state with CTA to AI concierge
 */
export function CartDrawer(): JSX.Element | null {
  const navigate = useNavigate();
  const { user } = useAuth();
  const {
    items,
    itemCount: _itemCount,
    subtotal,
    isOpen,
    closeCart,
    updateQuantity,
  } = useCart();

  const [payMethod, setPayMethod] = useState<'stripe' | 'esewa'>('stripe');

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeCart();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, closeCart]);

  if (!isOpen) return null;

  function handleCheckout() {
    closeCart();
    const destination = `${ROUTES.CHECKOUT}?method=${payMethod}`;
    navigate(user ? destination : loginWithRedirect(destination));
  }

  return (
    <>
      {/* Scrim backdrop */}
      <div className="scrim" onClick={closeCart} />

      {/* Drawer panel */}
      <aside className="drawer" id="cartd" aria-label="Cart">
        {/* Header */}
        <div className="dh">
          <span>Your cart</span>
          <button
            className="icon-btn"
            type="button"
            onClick={closeCart}
            aria-label="Close cart"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="db" id="cartb2">
          {items.length === 0 ? (
            <p className="sub" style={{ textAlign: 'center', padding: '40px 0' }}>
              <b
                style={{
                  color: 'var(--ink)',
                  fontSize: '17px',
                  display: 'block',
                  marginBottom: '8px',
                }}
              >
                Your cart is empty
              </b>
              Add something from the shop to get started.
            </p>
          ) : (
            items.map((item) => (
              <div key={item.productId} className="li">
                <div
                  className="th"
                  style={{
                    background: `linear-gradient(145deg, ${item.visual.gradientFrom}, ${item.visual.gradientTo})`,
                  }}
                  aria-hidden="true"
                >
                  {item.visual.glyph}
                </div>
                <div>
                  <b>{item.name}</b>
                  <div className="qty">
                    <button
                      type="button"
                      onClick={() =>
                        updateQuantity(item.productId, item.quantity - 1)
                      }
                      aria-label="Decrease quantity"
                    >
                      −
                    </button>
                    <span>{item.quantity}</span>
                    <button
                      type="button"
                      onClick={() =>
                        updateQuantity(item.productId, item.quantity + 1)
                      }
                      aria-label="Increase quantity"
                    >
                      +
                    </button>
                  </div>
                </div>
                <b>{formatCurrency(item.price * item.quantity, item.currency)}</b>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        {items.length > 0 && (
          <div className="df" id="cartf">
            <div className="pay">
              <label>
                <input
                  type="radio"
                  name="pay"
                  value="stripe"
                  checked={payMethod === 'stripe'}
                  onChange={() => setPayMethod('stripe')}
                />
                <span>
                  Card with Stripe
                  <small>Hosted checkout, international cards</small>
                </span>
              </label>

              <label>
                <input
                  type="radio"
                  name="pay"
                  value="esewa"
                  checked={payMethod === 'esewa'}
                  onChange={() => setPayMethod('esewa')}
                />
                <span>
                  eSewa
                  <small>Pay in NPR from your wallet</small>
                </span>
              </label>
            </div>

            <div className="tot">
              <span>Total</span>
              <span>{formatCurrency(subtotal, 'USD')}</span>
            </div>

            <button
              className="btn p"
              id="co"
              style={{ width: '100%', marginTop: '12px', padding: '13px' }}
              type="button"
              onClick={handleCheckout}
            >
              Pay with {payMethod === 'stripe' ? 'Stripe' : 'eSewa'}
            </button>
          </div>
        )}
      </aside>
    </>
  );
}
