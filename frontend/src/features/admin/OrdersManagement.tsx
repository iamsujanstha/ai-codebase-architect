import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  Eye,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Package,
  Calendar,
  DollarSign,
  User
} from 'lucide-react';
import { adminApi } from './api/adminApi';
import { ConfirmModal } from './components/ConfirmModal';
import { TableSkeleton } from './components/TableSkeleton';
import styles from './Admin.module.css';

interface Order {
  _id: string;
  userEmail: string;
  total: number;
  status: string;
  createdAt: string;
  items: any[];
  customer?: {
    fullName?: string;
  };
}

export function OrdersManagement() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sortField, setSortField] = useState<string>('createdAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [totalOrders, setTotalOrders] = useState(0);
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    orderId: string;
    currentStatus: string;
    newStatus: string;
    isLoading: boolean;
  }>({
    isOpen: false,
    orderId: '',
    currentStatus: '',
    newStatus: '',
    isLoading: false,
  });

  const statusOptions = [
    { value: '', label: 'All Status' },
    { value: 'pending', label: 'Pending' },
    { value: 'processing', label: 'Processing' },
    { value: 'paid', label: 'Paid' },
    { value: 'completed', label: 'Completed' },
    { value: 'shipped', label: 'Shipped' },
    { value: 'delivered', label: 'Delivered' },
    { value: 'cancelled', label: 'Cancelled' },
    { value: 'refunded', label: 'Refunded' },
  ];

  useEffect(() => {
    loadOrders();
  }, [currentPage, pageSize, statusFilter, sortField, sortDirection]);

  useEffect(() => {
    const delayedSearch = setTimeout(() => {
      if (currentPage !== 1) {
        setCurrentPage(1);
      } else {
        loadOrders();
      }
    }, 300);

    return () => clearTimeout(delayedSearch);
  }, [searchTerm]);

  const loadOrders = async () => {
    try {
      setLoading(true);
      const data = await adminApi.getOrders(currentPage, pageSize, statusFilter || undefined);

      // Filter by search term on frontend (in production, this should be done on backend)
      let filteredOrders = data.orders;
      if (searchTerm) {
        filteredOrders = data.orders.filter((order: Order) =>
          order._id.toLowerCase().includes(searchTerm.toLowerCase()) ||
          order.userEmail.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (order.customer?.fullName || '').toLowerCase().includes(searchTerm.toLowerCase())
        );
      }

      // Sort orders
      filteredOrders.sort((a: Order, b: Order) => {
        let aValue: any = a[sortField as keyof Order];
        let bValue: any = b[sortField as keyof Order];

        if (sortField === 'createdAt') {
          aValue = new Date(aValue).getTime();
          bValue = new Date(bValue).getTime();
        } else if (sortField === 'total') {
          aValue = Number(aValue);
          bValue = Number(bValue);
        }

        if (sortDirection === 'asc') {
          return aValue > bValue ? 1 : -1;
        } else {
          return aValue < bValue ? 1 : -1;
        }
      });

      setOrders(filteredOrders);
      setTotalPages(data.totalPages);
      setTotalOrders(data.total);
    } catch (error) {
      console.error('Failed to load orders:', error);
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

  const handleStatusChange = (orderId: string, currentStatus: string, newStatus: string) => {
    if (currentStatus === newStatus) return;

    if (!newStatus || !statusOptions.some(s => s.value === newStatus)) return;

    setConfirmModal({
      isOpen: true,
      orderId,
      currentStatus,
      newStatus,
      isLoading: false,
    });
  };

  const confirmStatusChange = async () => {
    try {
      setConfirmModal(prev => ({ ...prev, isLoading: true }));
      await adminApi.updateOrderStatus(confirmModal.orderId, confirmModal.newStatus);
      setConfirmModal({ isOpen: false, orderId: '', currentStatus: '', newStatus: '', isLoading: false });
      loadOrders();
    } catch (error) {
      console.error('Failed to update order status:', error);
      alert('Failed to update order status');
      setConfirmModal(prev => ({ ...prev, isLoading: false }));
    }
  };

  const getStatusBadgeClass = (status: string) => {
    return `${styles.statusBadge} ${styles[status]}`;
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
          <h1 className={styles.pageTitle}>Orders Management</h1>
          <p className={styles.pageSubtitle}>Track and manage customer orders and fulfillment</p>
        </div>
        <div className={styles.tableContainer}>
          <div className={styles.tableToolbar}>
            <div className={styles.searchContainer}>
              <Search className={styles.searchIcon} />
              <input
                type="text"
                placeholder="Search orders by ID, customer email, or name..."
                disabled
                className={styles.searchInput}
              />
            </div>
            <div className={styles.filtersContainer}>
              <select disabled className={styles.filterSelect}>
                <option>All Status</option>
              </select>
            </div>
          </div>
          <TableSkeleton rows={10} columns={7} />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.adminContent}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Orders Management</h1>
        <p className={styles.pageSubtitle}>Track and manage customer orders and fulfillment</p>
      </div>

      <div className={styles.tableContainer}>
        {/* Toolbar */}
        <div className={styles.tableToolbar}>
          <div className={styles.searchContainer}>
            <Search className={styles.searchIcon} />
            <input
              type="text"
              placeholder="Search orders by ID, customer email, or name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={styles.searchInput}
            />
          </div>

          <div className={styles.filtersContainer}>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className={styles.filterSelect}
            >
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Table */}
        {orders.length === 0 ? (
          <div className={styles.emptyState}>
            <Package className={styles.emptyIcon} />
            <div className={styles.emptyTitle}>No orders found</div>
            <div className={styles.emptyText}>
              {searchTerm || statusFilter
                ? 'Try adjusting your search or filter criteria'
                : 'Orders will appear here once customers start placing them'
              }
            </div>
          </div>
        ) : (
          <>
            <table className={styles.table}>
              <thead className={styles.tableHeader}>
                <tr>
                  <th
                    className={styles.sortableHeader}
                    onClick={() => handleSort('_id')}
                  >
                    Order ID
                    {getSortIcon('_id')}
                  </th>
                  <th>Customer</th>
                  <th>Items</th>
                  <th
                    className={styles.sortableHeader}
                    onClick={() => handleSort('total')}
                  >
                    Total
                    {getSortIcon('total')}
                  </th>
                  <th>Status</th>
                  <th
                    className={styles.sortableHeader}
                    onClick={() => handleSort('createdAt')}
                  >
                    Date
                    {getSortIcon('createdAt')}
                  </th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody className={styles.tableBody}>
                {orders.map((order) => (
                  <tr key={order._id}>
                    <td>
                      <div className={styles.orderIdCell}>
                        #{order._id.slice(-8)}
                      </div>
                    </td>
                    <td>
                      <div className={styles.customerCell}>
                        <div className={styles.customerAvatar}>
                          <User size={16} />
                        </div>
                        <div className={styles.tableCellContent}>
                          <div className={styles.primaryText}>
                            {order.customer?.fullName || 'Guest'}
                          </div>
                          <div className={styles.secondaryText}>
                            {order.userEmail}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className={styles.itemsCell}>
                        <Package size={16} style={{ color: '#6b7280' }} />
                        <span className={styles.itemsBadge}>
                          {order.items.length} item{order.items.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className={styles.tableCell}>
                        <DollarSign size={16} style={{ color: '#10b981' }} />
                        <span className={styles.totalCell}>
                          ${order?.total?.toFixed(2)}
                        </span>
                      </div>
                    </td>
                    <td>
                      <button
                        onClick={() => handleStatusChange(order._id, order.status)}
                        className={getStatusBadgeClass(order.status)}
                      >
                        <div className={styles.statusDot}></div>
                        {order.status}
                      </button>
                    </td>
                    <td>
                      <div className={styles.tableCell}>
                        <Calendar size={16} style={{ color: '#6b7280' }} />
                        <span className={styles.dateCell}>
                          {new Date(order.createdAt).toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className={styles.actionsCell}>
                        <button
                          onClick={() => navigate(`/admin/orders/${order._id}`)}
                          className={`${styles.actionBtn} ${styles.viewBtn}`}
                          title="View Order Details"
                        >
                          <Eye size={16} />
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
                Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, totalOrders)} of {totalOrders} orders
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

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal({ isOpen: false, orderId: '', currentStatus: '', newStatus: '', isLoading: false })}
        onConfirm={confirmStatusChange}
        isLoading={confirmModal.isLoading}
        title="Update Order Status"
        message={`Are you sure you want to change the order status from "${confirmModal.currentStatus}" to "${confirmModal.newStatus}"?`}
        confirmText="Update Status"
        variant="info"
      />
    </div>
  );
}
