import { useEffect, useState } from 'react';
import { useCart } from '@/features/store/CartContext';
import { formatCurrency } from '@/shared/utils/formatCurrency';
import type { CatalogProduct } from '@/core/types/catalog';


interface ChatProductCardProps {
  productId: string;
}



export function ChatProductCard({ productId }: ChatProductCardProps) {
  const [product, setProduct] = useState<CatalogProduct | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { addItem } = useCart();
  const [isAdded, setIsAdded] = useState(false);

  useEffect(() => {
    async function fetchProduct() {
      try {
        const response = await fetch(`/catalog/products`);
        const data = await response.json();
        // The backend returns _id, frontend wants id
        const rawProduct = data.products.find((p: any) => p._id === productId);
        if (rawProduct) {
          setProduct({
            ...rawProduct,
            id: rawProduct._id
          } as CatalogProduct);
        } else {
          setProduct(null);
        }
      } catch (error) {
        console.error('Failed to fetch product for chat card', error);
      } finally {
        setIsLoading(false);
      }
    }
    fetchProduct();
  }, [productId]);


  if (isLoading) {
    return <div className="chat-product-card loading">Loading product details...</div>;
  }

  if (!product) {
    return null;
  }

  const handleAddToCart = () => {
    if (product) {
      addItem(product);
      setIsAdded(true);
      setTimeout(() => setIsAdded(false), 2000);
    }
  };


  return (
    <div className="chat-product-card panel-surface">
      <div className="chat-product-info">
        <h3>{product.name}</h3>
        <p className="chat-product-price">{formatCurrency(product.price, 'USD')}</p>
        <p className="chat-product-desc">{product.description.slice(0, 80)}...</p>
      </div>
      <button 
        className={`primary-button chat-product-add ${isAdded ? 'success' : ''}`}
        onClick={handleAddToCart}
        disabled={isAdded}
      >
        {isAdded ? 'Added!' : 'Add to Cart'}
      </button>
    </div>
  );
}
