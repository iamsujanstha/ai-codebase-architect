import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import type { CartLineItem, CatalogProduct } from '@/core/types/catalog';

const CART_STORAGE_KEY = 'ai-commerce-platform:cart';

interface CartContextValue {
  items: CartLineItem[];
  itemCount: number;
  subtotal: number;
  isOpen: boolean;
  addItem: (product: CatalogProduct, quantity?: number) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  openCart: () => void;
  closeCart: () => void;
  toggleCart: () => void;
}

const CartContext = createContext<CartContextValue | undefined>(undefined);

function createCartLineItem(
  product: CatalogProduct,
  quantity: number,
): CartLineItem {
  return {
    productId: product.id,
    slug: product.slug,
    name: product.name,
    subtitle: product.subtitle,
    price: product.price,
    currency: product.currency,
    quantity,
    heroBadge: product.heroBadge,
    visual: product.visual,
  };
}

function loadStoredCart(): CartLineItem[] {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const rawValue = window.localStorage.getItem(CART_STORAGE_KEY);
    if (!rawValue) {
      return [];
    }

    return JSON.parse(rawValue) as CartLineItem[];
  } catch {
    return [];
  }
}

// A cart provider is a good example of shared application state that is global,
// but still local to the frontend.
//
// Why not put carts in the database yet?
// Because we do not have authentication or checkout in this iteration.
// Persisting locally is a perfectly sensible step before introducing user accounts.
export function CartProvider({
  children,
}: {
  children: ReactNode;
}): JSX.Element {
  const [items, setItems] = useState<CartLineItem[]>(loadStoredCart);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  function addItem(product: CatalogProduct, quantity = 1) {
    setItems((currentItems) => {
      const existingItem = currentItems.find(
        (item) => item.productId === product.id,
      );

      if (existingItem) {
        return currentItems.map((item) =>
          item.productId === product.id
            ? { ...item, quantity: item.quantity + quantity }
            : item,
        );
      }

      return [...currentItems, createCartLineItem(product, quantity)];
    });

    setIsOpen(true);
  }

  function removeItem(productId: string) {
    setItems((currentItems) =>
      currentItems.filter((item) => item.productId !== productId),
    );
  }

  function updateQuantity(productId: string, quantity: number) {
    if (quantity <= 0) {
      removeItem(productId);
      return;
    }

    setItems((currentItems) =>
      currentItems.map((item) =>
        item.productId === productId ? { ...item, quantity } : item,
      ),
    );
  }

  function clearCart() {
    setItems([]);
  }

  const itemCount = useMemo(
    () => items.reduce((total, item) => total + item.quantity, 0),
    [items],
  );

  const subtotal = useMemo(
    () => items.reduce((total, item) => total + item.price * item.quantity, 0),
    [items],
  );

  const value = useMemo<CartContextValue>(
    () => ({
      items,
      itemCount,
      subtotal,
      isOpen,
      addItem,
      removeItem,
      updateQuantity,
      clearCart,
      openCart: () => setIsOpen(true),
      closeCart: () => setIsOpen(false),
      toggleCart: () => setIsOpen((currentValue) => !currentValue),
    }),
    [isOpen, itemCount, items, subtotal],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext);

  if (!context) {
    throw new Error('useCart must be used inside CartProvider.');
  }

  return context;
}
