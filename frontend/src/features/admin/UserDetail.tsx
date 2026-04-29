import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, 
  User, 
  Mail, 
  Calendar, 
  Shield, 
  Package, 
  DollarSign,
  Eye,
  Search,
  ChevronLeft, 
  ChevronRight, 
  ChevronsLeft, 
  ChevronsRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  UserCheck,
  UserX
} from 'lucide-react';
import { adminApi } from './api/adminApi';
import styles from './Admin.module.css';

interface UserData {
  _id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  createdAt: string;
  avatar?: string;
}

interface Order {
  _id: string;
  total: number;
  status: string;
  createdAt: string;
  items: any[];
}

interface UserStats {
  totalOrders: number;
  totalSpent: number;
}

export function UserDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [user, setUser] = useState<UserData | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [stats, setStats] = useState<UserStats>({ totalOrders: 0, totalSpent: 0 });
  const [loading, setLoading] = useState(true);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sortField, setSortField] = useState<string>('createdAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [totalOrders, setTotalOrders] = useState(0);

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
    if (id) {
      loadUserData();
      loadUserOrders();
    }
  }, [id, currentPage, pageSize, statusFilter, sortField, sortDirection]);

  useEffect(() => {
    const delayedSearch = setTimeout(() => {
      if (currentPage !== 1) {
        setCurrentPage(1);
      } else {
        loadUserOrders();
      }
    }, 300);

    return () => clearTimeout(delayedSearch);
  }, [searchTerm]);

  const loadUserData = async () => {
    try {
      setLoading(true);
      const data = await adminApi.getUserById(id!);
      setUser(data.user);
      setStats(data.stats);
    } catch (error) {
      console.error('Failed to load user data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadUserOrders = async () => {
    try {
      setOrdersLoading(true);
      // Use the new getUserOrders API endpoint
      const data = await adminApi.getUserOrders(id!, currentPage, pageSize, statusFilter || undefined);
      
      let userOrders = data.orders;

      // Filter by search term
      if (searchTerm) {
        userOrders = userOrders.filter((order: Order) =>
          order._id.toLowerCase().includes(searchTerm.toLowerCase()) ||
          order.status.toLowerCase().includes(searchTerm.toLowerCase())
        );
      }

      // Sort orders
      userOrders.sort((a: Order, b: Order) => {
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

      setOrders(userOrders);
      setTotalOrders(data.total);
      setTotalPages(data.totalPages);
    } catch (error) {
      console.error('Failed to load user orders:', error);
    } finally {
      setOrdersLoading(false);
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

  const toggleUserRole = async () => {
    if (!user) return;
    const newRole = user.role === 'admin' ? 'user' : 'admin';
    if (!confirm(`Change ${user.name}'s role to ${newRole}?`)) return;

    try {
      await adminApi.updateUser(user._id, { role: newRole });
      setUser({ ...user, role: newRole });
    } catch (error) {
      console.error('Failed to update user role:', error);
      alert('Failed to update user role');
    }
  };

  const toggleUserStatus = async () => {
    if (!user) return;
    const newStatus = !user.isActive;
    if (!confirm(`${newStatus ? 'Activate' : 'Deactivate'} ${user.name}?`)) return;

    try {
      await adminApi.updateUser(user._id, { isActive: newStatus });
      setUser({ ...user, isActive: newStatus });
    } catch (error) {
      console.error('Failed to update user status:', error);
      alert('Failed to update user status');
    }
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
        <div className={styles.loadingContainer}>
          <div className={styles.loadingSpinner}></div>
          <div className={styles.loadingText}>Loading user details...</div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className={styles.adminContent}>
        <div className={styles.emptyState}>
          <User className={styles.emptyIcon} />
          <div className={styles.emptyTitle}>User not found</div>
          <div className={styles.emptyText}>The requested user could not be found</div>
          <button
            onClick={() => navigate('/admin/users')}
            className={styles.emptyAction}
          >
            <ArrowLeft size={20} />
            Back to Users
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.adminContent}>
      <div className={styles.pageHeader}>
        <button
          onClick={() => navigate('/admin/users')}
          className={`${styles.btn} ${styles.btnSecondary}`}
          style={{ marginBottom: '1rem' }}
        >
          <ArrowLeft size={20} />
          Back to Users
        </button>
        <h1 className={styles.pageTitle}>User Details</h1>
        <p className={styles.pageSubtitle}>Manage user account and view order history</p>
      </div>

      {/* User Info Card */}
      <div className={styles.card} style={{ marginBottom: '2rem' }}>
        <div className={styles.cardHeader}>
          <User className={styles.cardIcon} />
          <h3 className={styles.cardTitle}>User Information</h3>
        </div>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem' }}>
          <div>
            <div className={styles.customerCell} style={{ marginBottom: '1.5rem' }}>
              <div className={styles.customerAvatar} style={{ width: '64px', height: '64px' }}>
                {user.avatar ? (
                  <img
                    src={user.avatar}
                    alt={user.name}
                    style={{ width: '100%', height: '100%', borderRadius: '50%' }}
                  />
                ) : (
                  <User size={32} />
                )}
              </div>
              <div className={styles.tableCellContent}>
                <div className={styles.primaryText} style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>
                  {user.name}
                </div>
                <div className={styles.tableCell} style={{ marginBottom: '0.5rem' }}>
                  <Mail size={16} style={{ color: '#6b7280' }} />
                  <span className={styles.secondaryText}>{user.email}</span>
                </div>
                <div className={styles.tableCell}>
                  <Calendar size={16} style={{ color: '#6b7280' }} />
                  <span className={styles.secondaryText}>
                    Joined {new Date(user.createdAt).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}
                  </span>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              <button
                onClick={toggleUserRole}
                className={`${styles.statusBadge} ${user.role === 'admin' ? styles.processing : styles.pending}`}
                style={{ cursor: 'pointer', border: 'none' }}
              >
                {user.role === 'admin' && <Shield size={12} />}
                <span style={{ textTransform: 'capitalize' }}>{user.role}</span>
              </button>
              
              <button
                onClick={toggleUserStatus}
                className={`${styles.statusBadge} ${user.isActive ? styles.completed : styles.cancelled}`}
                style={{ cursor: 'pointer', border: 'none' }}
              >
                {user.isActive ? <UserCheck size={12} /> : <UserX size={12} />}
                <span>{user.isActive ? 'Active' : 'Inactive'}</span>
              </button>
            </div>
          </div>

          <div>
            <div className={styles.statsGrid} style={{ gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className={styles.statCard}>
                <div className={styles.statContent}>
                  <div className={styles.statInfo}>
                    <div className={styles.statLabel}>Total Orders</div>
                    <div className={styles.statValue}>{stats.totalOrders}</div>
                  </div>
                  <div className={styles.statIconWrapper}>
                    <Package className={styles.statIcon} />
                  </div>
                </div>
              </div>
              
              <div className={styles.statCard}>
                <div className={styles.statContent}>
                  <div className={styles.statInfo}>
                    <div className={styles.statLabel}>Total Spent</div>
                    <div className={styles.statValue}>${stats.totalSpent.toFixed(2)}</div>
                  </div>
                  <div className={styles.statIconWrapper}>
                    <DollarSign className={styles.statIcon} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Orders Table */}
      <div className={styles.tableContainer}>
        <div className={styles.tableToolbar}>
          <div className={styles.searchContainer}>
            <Search className={styles.searchIcon} />
            <input
              type="text"
              placeholder="Search orders by ID or status..."
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

        {ordersLoading ? (
          <div className={styles.loadingContainer}>
            <div className={styles.loadingSpinner}></div>
            <div className={styles.loadingText}>Loading orders...</div>
          </div>
        ) : orders.length === 0 ? (
          <div className={styles.emptyState}>
            <Package className={styles.emptyIcon} />
            <div className={styles.emptyTitle}>No orders found</div>
            <div className={styles.emptyText}>
              {searchTerm || statusFilter 
                ? 'Try adjusting your search or filter criteria'
                : 'This user has not placed any orders yet'
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
                          ${order.total.toFixed(2)}
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className={`${styles.statusBadge} ${styles[order.status]}`}>
                        <div className={styles.statusDot}></div>
                        {order.status}
                      </span>
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
            {totalPages > 1 && (
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
            )}
          </>
        )}
      </div>
    </div>
  );
}