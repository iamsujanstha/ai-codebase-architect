import type { CSSProperties } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '@/features/store/CartContext';
import { formatCurrency } from '@/shared/utils/formatCurrency';

export function CartDrawer(): JSX.Element {
  const navigate = useNavigate();
  const {
    items,
    itemCount,
    subtotal,
    isOpen,
    closeCart,
    removeItem,
    updateQuantity,
    clearCart,
  } = useCart();

  return (
    <>
      <div
        className={`cart-backdrop ${isOpen ? 'visible' : ''}`}
        onClick={closeCart}
      />

      <aside className={`cart-drawer ${isOpen ? 'open' : ''}`}>
        <div className="cart-drawer-header">
          <div>
            <p className="section-kicker">Cart</p>
            <h2>{itemCount} items saved</h2>
          </div>

          <button
            className="icon-button"
            type="button"
            onClick={closeCart}
            aria-label="Close cart drawer"
          >
            ×
          </button>
        </div>

        {items.length === 0 ? (
          <div className="empty-cart-state">
            <h3>Your cart is ready when you are.</h3>
            <p>
              Add a few products from the storefront, then use the local AI route
              if you want help comparing setup options.
            </p>
            <Link className="secondary-link-button" to="/chat" onClick={closeCart}>
              Open AI concierge
            </Link>
          </div>
        ) : (
          <>
            <div className="cart-line-list">
              {items.map((item) => {
                const visualStyle = {
                  '--product-gradient-from': item.visual.gradientFrom,
                  '--product-gradient-to': item.visual.gradientTo,
                  '--product-accent': item.visual.accent,
                } as CSSProperties;

                return (
                  <article key={item.productId} className="cart-line-item">
                    <div className="cart-line-visual" style={visualStyle}>
                      <span>{item.visual.glyph}</span>
                    </div>

                    <div className="cart-line-copy">
                      <h3>{item.name}</h3>
                      <p>{item.subtitle}</p>
                      <strong>
                        {formatCurrency(item.price, item.currency)}
                      </strong>

                      <div className="cart-line-controls">
                        <button
                          type="button"
                          className="quantity-button"
                          onClick={() =>
                            updateQuantity(item.productId, item.quantity - 1)
                          }
                        >
                          −
                        </button>
                        <span>{item.quantity}</span>
                        <button
                          type="button"
                          className="quantity-button"
                          onClick={() =>
                            updateQuantity(item.productId, item.quantity + 1)
                          }
                        >
                          +
                        </button>
                        <button
                          type="button"
                          className="ghost-button"
                          onClick={() => removeItem(item.productId)}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>

            <div className="cart-summary">
              <div className="cart-summary-row">
                <span>Subtotal</span>
                <strong>{formatCurrency(subtotal, 'USD')}</strong>
              </div>
              <div className="cart-summary-row">
                <span>Shipping</span>
                <strong>Calculated at checkout</strong>
              </div>
              <div className="cart-summary-actions">
                <button className="ghost-button" type="button" onClick={clearCart}>
                  Clear cart
                </button>
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => {
                    closeCart();
                    navigate('/checkout');
                  }}
                >
                  Continue to checkout
                </button>
              </div>
              <p className="cart-note">
                Checkout is intentionally UI-only in this iteration. The catalog
                is production-shaped; payments and auth are the next natural layer.
              </p>
            </div>
          </>
        )}
      </aside>
    </>
  );
}
