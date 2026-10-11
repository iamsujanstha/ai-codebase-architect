import React, { useState, useEffect, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { adminApi, AdminProduct } from './api/adminApi';
import { ProductDrawer } from './ProductDrawer';
import { DeleteProductDialog } from './DeleteProductDialog';
import styles from './Admin.module.css';

const CATEGORIES: Record<string, string> = {
  desk: 'Desks',
  lighting: 'Lighting',
  keyboard: 'Keyboards',
  audio: 'Audio',
  display: 'Displays',
  accessory: 'Accessories',
};

const EMOJI_MAP: Record<string, string> = {
  desk: '🪑',
  lighting: '💡',
  keyboard: '⌨️',
  audio: '🎧',
  display: '🖥️',
  accessory: '🧰',
};

const GRADIENTS = [
  ['#f6d9b8', '#e8b98a'],
  ['#fff1b8', '#ffd36b'],
  ['#d6e4ff', '#a9c2ff'],
  ['#ffd6e0', '#ff9fb6'],
  ['#d4f1e4', '#9fdcc0'],
  ['#e6ddf7', '#c7b4ee'],
];

export const ProductsManagement: React.FC = () => {
  const { refreshStats } = useOutletContext<{ refreshStats?: () => void }>() || {};

  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState({ all: 0, published: 0, draft: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & Sorting & Pagination
  const [statusFilter, setStatusFilter] = useState<'all' | 'published' | 'draft'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState<string>('title');
  const [sortDir, setSortDir] = useState<1 | -1>(1);
  const [page, setPage] = useState(1);
  const pageSize = 10;

  // Drawer & Dialog State
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<AdminProduct | null>(null);
  const [deleteProduct, setDeleteProduct] = useState<AdminProduct | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  const loadProducts = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await adminApi.getProducts({
        status: statusFilter,
        q: searchQuery,
        sort: sortDir === -1 ? `-${sortKey}` : sortKey,
        page,
        pageSize,
      });
      setProducts(res.items);
      setTotal(res.total);
      if (res.counts) setCounts(res.counts);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load products');
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, searchQuery, sortKey, sortDir, page]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir(sortDir === 1 ? -1 : 1);
    } else {
      setSortKey(key);
      setSortDir(1);
    }
    setPage(1);
  };

  const handleCreateClick = () => {
    setSelectedProduct(null);
    setDrawerOpen(true);
  };

  const handleEditClick = (p: AdminProduct) => {
    setSelectedProduct(p);
    setDrawerOpen(true);
  };

  const handleDeleteClick = (p: AdminProduct) => {
    setDeleteProduct(p);
  };

  const handleConfirmDelete = async () => {
    if (!deleteProduct) return;
    try {
      setIsDeleting(true);
      await adminApi.deleteProduct(deleteProduct.id);
      showToast('Product deleted');
      setDeleteProduct(null);
      // Invalidate public catalog so storefront reflects deletion
      window.dispatchEvent(new Event('atlas:catalog-updated'));
      loadProducts();
      if (refreshStats) refreshStats();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to delete product');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSaved = () => {
    showToast(selectedProduct ? 'Changes saved' : 'Product created');
    // Invalidate public storefront queries
    window.dispatchEvent(new Event('atlas:catalog-updated'));
    loadProducts();
    if (refreshStats) refreshStats();
  };

  const totalPages = Math.ceil(total / pageSize) || 1;

  return (
    <div>
      {/* Top Bar with Title and Add Button */}
      <div className={styles.bar} style={{ marginTop: 0 }}>
        <div>
          <h1 className={styles.title}>Products</h1>
          <p className={styles.sub} style={{ margin: 0 }}>
            Create, edit and remove what shoppers see in the store.
          </p>
        </div>
        <button
          type="button"
          className={`${styles.btn} ${styles.btnPrimary}`}
          onClick={handleCreateClick}
        >
          <Plus size={18} />
          <span>Add product</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className={styles.bar}>
        <div className={styles.seg} role="group" aria-label="Product status filters">
          <button
            type="button"
            className={styles.segBtn}
            aria-pressed={statusFilter === 'all'}
            onClick={() => {
              setStatusFilter('all');
              setPage(1);
            }}
          >
            All {counts.all}
          </button>
          <button
            type="button"
            className={styles.segBtn}
            aria-pressed={statusFilter === 'published'}
            onClick={() => {
              setStatusFilter('published');
              setPage(1);
            }}
          >
            Published {counts.published}
          </button>
          <button
            type="button"
            className={styles.segBtn}
            aria-pressed={statusFilter === 'draft'}
            onClick={() => {
              setStatusFilter('draft');
              setPage(1);
            }}
          >
            Drafts {counts.draft}
          </button>
        </div>

        <input
          type="search"
          className={styles.search}
          placeholder="Search name or SKU"
          aria-label="Search products"
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setPage(1);
          }}
        />
      </div>

      {/* Products Table */}
      <div className={styles.tw}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.thCell}>
                <button
                  type="button"
                  className={styles.sortBtn}
                  onClick={() => handleSort('title')}
                >
                  Product {sortKey === 'title' ? (sortDir === 1 ? '↑' : '↓') : ''}
                </button>
              </th>
              <th className={styles.thCell}>
                <button
                  type="button"
                  className={styles.sortBtn}
                  onClick={() => handleSort('category')}
                >
                  Category {sortKey === 'category' ? (sortDir === 1 ? '↑' : '↓') : ''}
                </button>
              </th>
              <th className={styles.thCell}>
                <button
                  type="button"
                  className={styles.sortBtn}
                  onClick={() => handleSort('price')}
                >
                  Price {sortKey === 'price' ? (sortDir === 1 ? '↑' : '↓') : ''}
                </button>
              </th>
              <th className={styles.thCell}>
                <button
                  type="button"
                  className={styles.sortBtn}
                  onClick={() => handleSort('stock')}
                >
                  Stock {sortKey === 'stock' ? (sortDir === 1 ? '↑' : '↓') : ''}
                </button>
              </th>
              <th className={styles.thCell}>
                <button
                  type="button"
                  className={styles.sortBtn}
                  onClick={() => handleSort('status')}
                >
                  Status {sortKey === 'status' ? (sortDir === 1 ? '↑' : '↓') : ''}
                </button>
              </th>
              <th className={styles.thCell} style={{ textAlign: 'right' }}>
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={6} className={styles.tdCell} style={{ textAlign: 'center', padding: '40px' }}>
                  <span className={styles.sub}>Loading products…</span>
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={6} className={styles.tdCell} style={{ textAlign: 'center', padding: '40px', color: 'var(--bad)' }}>
                  <b>Error loading products:</b> {error}
                </td>
              </tr>
            ) : products.length === 0 ? (
              <tr>
                <td colSpan={6} className={styles.tdCell}>
                  <div className={styles.empty}>
                    <b>No products found</b>
                    Try another filter, or add a product.
                  </div>
                </td>
              </tr>
            ) : (
              products.map((p, idx) => {
                const gradient = GRADIENTS[idx % GRADIENTS.length];
                const emoji = EMOJI_MAP[p.category] || '📦';
                const priceDollars = Math.round(p.price / 100);
                const isLive = p.status === 'published';

                return (
                  <tr key={p.id} className={styles.tr}>
                    <td className={styles.tdCell}>
                      <div className={styles.productRow}>
                        <div
                          className={styles.th}
                          style={
                            p.imageUrl
                              ? { backgroundImage: `url(${p.imageUrl})` }
                              : {
                                  background: `linear-gradient(145deg, ${gradient[0]}, ${gradient[1]})`,
                                }
                          }
                        >
                          {!p.imageUrl && emoji}
                        </div>
                        <div>
                          <b>{p.title}</b>
                          <span>{p.sku}</span>
                        </div>
                      </div>
                    </td>
                    <td className={styles.tdCell}>
                      {CATEGORIES[p.category] || p.category}
                    </td>
                    <td className={styles.tdCell}>${priceDollars}</td>
                    <td className={styles.tdCell}>
                      {p.stock === 0 ? (
                        <span className={styles.out}>Out of stock</span>
                      ) : p.stock <= 5 ? (
                        <span className={styles.low}>{p.stock} left</span>
                      ) : (
                        p.stock
                      )}
                    </td>
                    <td className={styles.tdCell}>
                      <span
                        className={`${styles.st} ${
                          isLive ? styles.stLive : styles.stDraft
                        }`}
                      >
                        {isLive ? 'Published' : 'Draft'}
                      </span>
                    </td>
                    <td
                      className={styles.tdCell}
                      style={{ textAlign: 'right', whiteSpace: 'nowrap' }}
                    >
                      <button
                        type="button"
                        className={`${styles.btn} ${styles.btnSmall}`}
                        onClick={() => handleEditClick(p)}
                        style={{ marginRight: '8px' }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className={`${styles.btn} ${styles.btnSmall} ${styles.btnGhost}`}
                        style={{ color: 'var(--bad)' }}
                        onClick={() => handleDeleteClick(p)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '8px',
            marginTop: '16px',
            alignItems: 'center',
          }}
        >
          <span className={styles.sub} style={{ margin: 0, fontSize: '13px' }}>
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnSmall} ${styles.btnGhost}`}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
          >
            Previous
          </button>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnSmall} ${styles.btnGhost}`}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
          >
            Next
          </button>
        </div>
      )}

      {/* Product Drawer (Create / Edit) */}
      <ProductDrawer
        isOpen={drawerOpen}
        product={selectedProduct}
        onClose={() => setDrawerOpen(false)}
        onSaved={handleSaved}
      />

      {/* Delete Confirmation Dialog */}
      <DeleteProductDialog
        isOpen={!!deleteProduct}
        product={deleteProduct}
        isDeleting={isDeleting}
        onClose={() => setDeleteProduct(null)}
        onConfirm={handleConfirmDelete}
      />

      {/* Toast Notification */}
      {toastMessage && (
        <div className={styles.toast} role="status">
          {toastMessage}
        </div>
      )}
    </div>
  );
};
