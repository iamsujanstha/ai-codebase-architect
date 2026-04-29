import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Plus, 
  Search, 
  Edit, 
  Trash2, 
  Package, 
  ChevronLeft, 
  ChevronRight, 
  ChevronsLeft, 
  ChevronsRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  DollarSign,
  Tag,
  Warehouse
} from 'lucide-react';
import { adminApi } from './api/adminApi';
import styles from './Admin.module.css';

interface Product {
  _id: string;
  name: string;
  subtitle?: string;
  categoryName?: string;
  price: number;
  inventoryCount: number;
  createdAt: string;
}

export function ProductsManagement() {
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, ] = useState('');
  const [stockFilter, setStockFilter] = useState('');
  const [sortField, setSortField] = useState<string>('createdAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [totalProducts, setTotalProducts] = useState(0);

  const stockOptions = [
    { value: '', label: 'All Stock Levels' },
    { value: 'in-stock', label: 'In Stock (>10)' },
    { value: 'low-stock', label: 'Low Stock (1-10)' },
    { value: 'out-of-stock', label: 'Out of Stock (0)' },
  ];

  useEffect(() => {
    loadProducts();
  }, [currentPage, pageSize, categoryFilter, sortField, sortDirection]);

  useEffect(() => {
    const delayedSearch = setTimeout(() => {
      if (currentPage !== 1) {
        setCurrentPage(1);
      } else {
        loadProducts();
      }
    }, 300);

    return () => clearTimeout(delayedSearch);
  }, [searchTerm]);

  const loadProducts = async () => {
    try {
      setLoading(true);
      const data = await adminApi.getProducts(currentPage, pageSize, searchTerm || undefined, categoryFilter || undefined);
      
      // Filter by stock level on frontend (in production, this should be done on backend)
      let filteredProducts = data.products;
      if (stockFilter) {
        filteredProducts = data.products.filter((product: Product) => {
          if (stockFilter === 'in-stock') return product.inventoryCount > 10;
          if (stockFilter === 'low-stock') return product.inventoryCount > 0 && product.inventoryCount <= 10;
          if (stockFilter === 'out-of-stock') return product.inventoryCount === 0;
          return true;
        });
      }

      // Sort products
      filteredProducts.sort((a: Product, b: Product) => {
        let aValue: any = a[sortField as keyof Product];
        let bValue: any = b[sortField as keyof Product];

        if (sortField === 'createdAt') {
          aValue = new Date(aValue).getTime();
          bValue = new Date(bValue).getTime();
        } else if (sortField === 'price' || sortField === 'inventoryCount') {
          aValue = Number(aValue);
          bValue = Number(bValue);
        }

        if (sortDirection === 'asc') {
          return aValue > bValue ? 1 : -1;
        } else {
          return aValue < bValue ? 1 : -1;
        }
      });

      setProducts(filteredProducts);
      setTotalPages(data.totalPages);
      setTotalProducts(data.total);
    } catch (error) {
      console.error('Failed to load products:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this product?')) return;

    try {
      await adminApi.deleteProduct(id);
      loadProducts();
    } catch (error) {
      console.error('Failed to delete product:', error);
      alert('Failed to delete product');
    }
  };

  const handleStockUpdate = async (id: string, currentStock: number) => {
    const newStock = prompt(`Update stock for this product (current: ${currentStock}):`, String(currentStock));
    if (newStock === null) return;

    try {
      await adminApi.updateProductStock(id, parseInt(newStock));
      loadProducts();
    } catch (error) {
      console.error('Failed to update stock:', error);
      alert('Failed to update stock');
    }
  };

  const getStockStatusClass = (inventoryCount: number) => {
    if (inventoryCount > 10) return `${styles.badge} ${styles.completed}`;
    if (inventoryCount > 0) return `${styles.badge} ${styles.pending}`;
    return `${styles.badge} ${styles.cancelled}`;
  };

  const getStockStatusText = (inventoryCount: number) => {
    if (inventoryCount > 10) return 'In Stock';
    if (inventoryCount > 0) return 'Low Stock';
    return 'Out of Stock';
  };

  const getSortIcon = (field: string) => {
    if (sortField !== field) return <ArrowUpDown size={16} className={styles.sortIcon} />;
    return sortDirection === 'asc' ? 
      <ArrowUp size={16} className={styles.sortIcon} /> : 
      <ArrowDown size={16} className={styles.sortIcon} />;
  };

  const renderPagination = () => {
    const pages = [];
    const maxVisiblePages = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

    if (endPage - startPage + 1 < maxVisiblePages) {
      startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
      pages.push(
        <button
          key={i}
          onClick={() => setCurrentPage(i)}
          className={`${styles.pageNumber} ${i === currentPage ? styles.active : ''}`}
        >
          {i}
        </button>
      );
    }

    return pages;
  };

  if (loading) {
    return (
      <div className={styles.adminContent}>
        <div className={styles.pageHeader}>
          <h1 className={styles.pageTitle}>Products Management</h1>
          <p className={styles.pageSubtitle}>Manage your product catalog, inventory, and pricing</p>
        </div>
        <div className={styles.loadingContainer}>
          <div className={styles.loadingSpinner}></div>
          <div className={styles.loadingText}>Loading products...</div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.adminContent}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Products Management</h1>
        <p className={styles.pageSubtitle}>Manage your product catalog, inventory, and pricing</p>
      </div>

      <div style={{ marginBottom: '2rem' }}>
        <button
          onClick={() => navigate('/admin/products/new')}
          className={`${styles.btn} ${styles.btnPrimary}`}
        >
          <Plus size={20} />
          Add Product
        </button>
      </div>

      <div className={styles.tableContainer}>
        {/* Toolbar */}
        <div className={styles.tableToolbar}>
          <div className={styles.searchContainer}>
            <Search className={styles.searchIcon} />
            <input
              type="text"
              placeholder="Search products by name or description..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={styles.searchInput}
            />
          </div>
          
          <div className={styles.filtersContainer}>
            <select
              value={stockFilter}
              onChange={(e) => setStockFilter(e.target.value)}
              className={styles.filterSelect}
            >
              {stockOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Table */}
        {products.length === 0 ? (
          <div className={styles.emptyState}>
            <Package className={styles.emptyIcon} />
            <div className={styles.emptyTitle}>No products found</div>
            <div className={styles.emptyText}>
              {searchTerm || stockFilter 
                ? 'Try adjusting your search or filter criteria'
                : 'Start by adding your first product to the catalog'
              }
            </div>
            <button
              onClick={() => navigate('/admin/products/new')}
              className={styles.emptyAction}
            >
              <Plus size={20} />
              Add First Product
            </button>
          </div>
        ) : (
          <>
            <table className={styles.table}>
              <thead className={styles.tableHeader}>
                <tr>
                  <th 
                    className={styles.sortableHeader}
                    onClick={() => handleSort('name')}
                  >
                    Product
                    {getSortIcon('name')}
                  </th>
                  <th>Category</th>
                  <th 
                    className={styles.sortableHeader}
                    onClick={() => handleSort('price')}
                  >
                    Price
                    {getSortIcon('price')}
                  </th>
                  <th 
                    className={styles.sortableHeader}
                    onClick={() => handleSort('inventoryCount')}
                  >
                    Stock
                    {getSortIcon('inventoryCount')}
                  </th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody className={styles.tableBody}>
                {products.map((product) => (
                  <tr key={product._id}>
                    <td>
                      <div className={styles.customerCell}>
                        <div className={styles.customerAvatar}>
                          <Package size={16} />
                        </div>
                        <div className={styles.tableCellContent}>
                          <div className={styles.primaryText}>
                            {product.name}
                          </div>
                          <div className={styles.secondaryText}>
                            {product.subtitle || 'No description'}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className={styles.tableCell}>
                        <Tag size={16} style={{ color: '#6b7280' }} />
                        <span className={styles.secondaryText}>
                          {product.categoryName || 'Uncategorized'}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className={styles.tableCell}>
                        <DollarSign size={16} style={{ color: '#10b981' }} />
                        <span className={styles.totalCell}>
                          ${product.price.toFixed(2)}
                        </span>
                      </div>
                    </td>
                    <td>
                      <button
                        onClick={() => handleStockUpdate(product._id, product.inventoryCount)}
                        className={styles.tableCell}
                        style={{ cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}
                      >
                        <Warehouse size={16} style={{ color: '#6b7280' }} />
                        <span className={styles.primaryText}>
                          {product.inventoryCount} units
                        </span>
                      </button>
                    </td>
                    <td>
                      <span className={getStockStatusClass(product.inventoryCount)}>
                        {getStockStatusText(product.inventoryCount)}
                      </span>
                    </td>
                    <td>
                      <div className={styles.actionsCell}>
                        <button
                          onClick={() => navigate(`/admin/products/${product._id}/edit`)}
                          className={`${styles.actionBtn} ${styles.editBtn}`}
                          title="Edit Product"
                        >
                          <Edit size={16} />
                        </button>
                        <button
                          onClick={() => handleDelete(product._id)}
                          className={`${styles.actionBtn} ${styles.deleteBtn}`}
                          title="Delete Product"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            <div className={styles.paginationContainer}>
              <div className={styles.paginationInfo}>
                Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, totalProducts)} of {totalProducts} products
              </div>
              
              <div className={styles.paginationControls}>
                <button
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                  className={styles.paginationBtn}
                >
                  <ChevronsLeft size={16} />
                </button>
                
                <button
                  onClick={() => setCurrentPage(currentPage - 1)}
                  disabled={currentPage === 1}
                  className={styles.paginationBtn}
                >
                  <ChevronLeft size={16} />
                  Previous
                </button>

                <div className={styles.pageNumbers}>
                  {renderPagination()}
                </div>

                <button
                  onClick={() => setCurrentPage(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className={styles.paginationBtn}
                >
                  Next
                  <ChevronRight size={16} />
                </button>
                
                <button
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage === totalPages}
                  className={styles.paginationBtn}
                >
                  <ChevronsRight size={16} />
                </button>
              </div>

              <div className={styles.pageSizeSelector}>
                <span>Show</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className={styles.pageSizeSelect}
                >
                  <option value={5}>5</option>
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                </select>
                <span>per page</span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
