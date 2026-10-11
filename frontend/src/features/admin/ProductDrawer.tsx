import React, { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { adminApi, AdminProduct } from './api/adminApi';
import styles from './Admin.module.css';

interface ProductDrawerProps {
  isOpen: boolean;
  product: AdminProduct | null; // null means create new product
  onClose: () => void;
  onSaved: (product: AdminProduct) => void;
}

const CATEGORIES: Record<string, string> = {
  desk: 'Desks',
  lighting: 'Lighting',
  keyboard: 'Keyboards',
  audio: 'Audio',
  display: 'Displays',
  accessory: 'Accessories',
};

export const ProductDrawer: React.FC<ProductDrawerProps> = ({
  isOpen,
  product,
  onClose,
  onSaved,
}) => {
  const isNew = !product;
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('desk');
  const [price, setPrice] = useState('');
  const [stock, setStock] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<'published' | 'draft'>('published');
  const [imageUrl, setImageUrl] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync form state when product or isOpen changes
  useEffect(() => {
    if (isOpen) {
      if (product) {
        setTitle(product.title || '');
        setCategory(product.category || 'desk');
        // Convert cents to dollars for display
        setPrice((product.price / 100).toFixed(0));
        setStock(String(product.stock ?? 0));
        setDescription(product.description || '');
        setStatus(product.status || 'published');
        setImageUrl(product.imageUrl || '');
      } else {
        setTitle('');
        setCategory('desk');
        setPrice('');
        setStock('');
        setDescription('');
        setStatus('published');
        setImageUrl('');
      }
      setErrors({});
      setDirty(false);
    }
  }, [isOpen, product]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        handleAttemptClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, dirty]);

  if (!isOpen) return null;

  const handleAttemptClose = () => {
    if (dirty && !window.confirm('Discard your changes?')) {
      return;
    }
    onClose();
  };

  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const res = await adminApi.uploadImage(file);
      setImageUrl(res.url);
      setDirty(true);
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to upload image');
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};

    const trimmedTitle = title.trim();
    if (trimmedTitle.length < 3) {
      newErrors.title = 'Enter a product name (at least 3 characters)';
    }

    const numPrice = parseFloat(price);
    if (isNaN(numPrice) || numPrice <= 0) {
      newErrors.price = 'Enter a price above 0';
    }

    const numStock = parseInt(stock, 10);
    if (isNaN(numStock) || numStock < 0) {
      newErrors.stock = 'Enter the stock quantity (0 or greater)';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    try {
      setIsSubmitting(true);
      const payload: Partial<AdminProduct> = {
        title: trimmedTitle,
        category,
        price: Math.round(numPrice * 100), // convert dollars to integer cents
        stock: numStock,
        description,
        status,
        imageUrl,
      };

      let saved: AdminProduct;
      if (isNew) {
        saved = await adminApi.createProduct(payload);
      } else {
        saved = await adminApi.updateProduct(product.id, payload);
      }

      setDirty(false);
      onSaved(saved);
      onClose();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to save product');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <div
        className={styles.dsc}
        onClick={handleAttemptClose}
        aria-hidden="true"
      />
      <aside
        className={styles.dr}
        aria-label="Product form"
        role="dialog"
        aria-modal="true"
      >
        <div className={styles.dh}>
          <span>{isNew ? 'Add product' : 'Edit product'}</span>
          <button
            type="button"
            className={styles.iconClose}
            onClick={handleAttemptClose}
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSave} className={styles.db}>
          {/* Image Upload */}
          <div className={styles.f}>
            <span>Image</span>
            <div className={styles.up}>
              {imageUrl ? (
                <>
                  <div
                    className={styles.pvimg}
                    style={{ backgroundImage: `url(${imageUrl})` }}
                  />
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      type="button"
                      className={`${styles.btn} ${styles.btnSmall} ${styles.btnGhost}`}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      Replace
                    </button>
                    <button
                      type="button"
                      className={`${styles.btn} ${styles.btnSmall} ${styles.btnGhost}`}
                      onClick={() => {
                        setImageUrl('');
                        setDirty(true);
                      }}
                    >
                      Remove
                    </button>
                  </div>
                </>
              ) : (
                <button
                  type="button"
                  className={`${styles.btn} ${styles.btnGhost}`}
                  style={{ width: '100%', padding: '24px' }}
                  onClick={() => fileInputRef.current?.click()}
                >
                  Upload image
                </button>
              )}
            </div>
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handleImageFileChange}
            />
          </div>

          {/* Product Name */}
          <label className={styles.f}>
            Product name
            <span className={styles.ib}>
              <input
                type="text"
                value={title}
                placeholder="e.g. Walnut standing desk"
                onChange={(e) => {
                  setTitle(e.target.value);
                  setDirty(true);
                  if (errors.title) setErrors((prev) => ({ ...prev, title: '' }));
                }}
              />
            </span>
            {errors.title && <span className={styles.err}>{errors.title}</span>}
          </label>

          {/* Category */}
          <label className={styles.f}>
            Category
            <span className={styles.ib}>
              <select
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value);
                  setDirty(true);
                }}
              >
                {Object.keys(CATEGORIES).map((catKey) => (
                  <option key={catKey} value={catKey}>
                    {CATEGORIES[catKey]}
                  </option>
                ))}
              </select>
            </span>
          </label>

          {/* Price & Stock */}
          <div className={styles.g2}>
            <label className={styles.f}>
              Price
              <span className={styles.ib}>
                <i>$</i>
                <input
                  type="number"
                  min="0"
                  step="1"
                  placeholder="0"
                  value={price}
                  onChange={(e) => {
                    setPrice(e.target.value);
                    setDirty(true);
                    if (errors.price) setErrors((prev) => ({ ...prev, price: '' }));
                  }}
                />
              </span>
              {errors.price && <span className={styles.err}>{errors.price}</span>}
            </label>

            <label className={styles.f}>
              Stock
              <span className={styles.ib}>
                <input
                  type="number"
                  min="0"
                  step="1"
                  placeholder="0"
                  value={stock}
                  onChange={(e) => {
                    setStock(e.target.value);
                    setDirty(true);
                    if (errors.stock) setErrors((prev) => ({ ...prev, stock: '' }));
                  }}
                />
              </span>
              {errors.stock && <span className={styles.err}>{errors.stock}</span>}
            </label>
          </div>

          {/* Description */}
          <label className={styles.f}>
            Description
            <span className={styles.ib}>
              <textarea
                rows={5}
                placeholder="What makes it great?"
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value);
                  setDirty(true);
                }}
              />
            </span>
          </label>

          {/* Status */}
          <label className={styles.f}>
            Status
            <span className={styles.ib}>
              <select
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value as 'published' | 'draft');
                  setDirty(true);
                }}
              >
                <option value="published">Published: visible in the store</option>
                <option value="draft">Draft: hidden from shoppers</option>
              </select>
            </span>
          </label>

          {/* Action buttons */}
          <div className={styles.df} style={{ marginTop: '20px' }}>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnGhost}`}
              onClick={handleAttemptClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={`${styles.btn} ${styles.btnPrimary}`}
              disabled={isSubmitting}
            >
              {isSubmitting
                ? 'Saving…'
                : isNew
                ? 'Create product'
                : 'Save changes'}
            </button>
          </div>
        </form>
      </aside>
    </>
  );
};
