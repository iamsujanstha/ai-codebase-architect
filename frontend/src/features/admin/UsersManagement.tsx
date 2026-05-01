import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Search, 
  Eye, 
  Trash2, 
  User, 
  Shield, 
  ChevronLeft, 
  ChevronRight, 
  ChevronsLeft, 
  ChevronsRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Calendar,
  UserCheck,
  UserX
} from 'lucide-react';
import { adminApi } from './api/adminApi';
import { ConfirmModal } from './components/ConfirmModal';
import { TableSkeleton } from './components/TableSkeleton';
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

export function UsersManagement() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sortField, setSortField] = useState<string>('createdAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [totalUsers, setTotalUsers] = useState(0);
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    action: 'delete' | 'role' | 'status' | null;
    userId: string;
    userName: string;
    data?: any;
    isLoading: boolean;
  }>({
    isOpen: false,
    action: null,
    userId: '',
    userName: '',
    isLoading: false,
  });

  const roleOptions = [
    { value: '', label: 'All Roles' },
    { value: 'admin', label: 'Admin' },
    { value: 'user', label: 'User' },
  ];

  const statusOptions = [
    { value: '', label: 'All Status' },
    { value: 'active', label: 'Active' },
    { value: 'inactive', label: 'Inactive' },
  ];

  useEffect(() => {
    loadUsers();
  }, [currentPage, pageSize, sortField, sortDirection]);

  useEffect(() => {
    const delayedSearch = setTimeout(() => {
      if (currentPage !== 1) {
        setCurrentPage(1);
      } else {
        loadUsers();
      }
    }, 300);

    return () => clearTimeout(delayedSearch);
  }, [searchTerm]);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const data = await adminApi.getUsers(currentPage, pageSize, searchTerm || undefined);
      
      // Filter by role and status on frontend (in production, this should be done on backend)
      let filteredUsers = data.users;
      if (roleFilter) {
        filteredUsers = filteredUsers.filter((user: UserData) => user.role === roleFilter);
      }
      if (statusFilter) {
        filteredUsers = filteredUsers.filter((user: UserData) => 
          statusFilter === 'active' ? user.isActive : !user.isActive
        );
      }

      // Sort users
      filteredUsers.sort((a: UserData, b: UserData) => {
        let aValue: any = a[sortField as keyof UserData];
        let bValue: any = b[sortField as keyof UserData];

        if (sortField === 'createdAt') {
          aValue = new Date(aValue).getTime();
          bValue = new Date(bValue).getTime();
        }

        if (sortDirection === 'asc') {
          return aValue > bValue ? 1 : -1;
        } else {
          return aValue < bValue ? 1 : -1;
        }
      });

      setUsers(filteredUsers);
      setTotalPages(data.totalPages);
      setTotalUsers(data.total);
    } catch (error) {
      console.error('Failed to load users:', error);
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

  const handleDelete = async (id: string, name: string) => {
    setConfirmModal({
      isOpen: true,
      action: 'delete',
      userId: id,
      userName: name,
      isLoading: false,
    });
  };

  const toggleUserRole = async (user: UserData) => {
    const newRole = user.role === 'admin' ? 'user' : 'admin';
    setConfirmModal({
      isOpen: true,
      action: 'role',
      userId: user._id,
      userName: user.name,
      data: { newRole },
      isLoading: false,
    });
  };

  const toggleUserStatus = async (user: UserData) => {
    const newStatus = !user.isActive;
    setConfirmModal({
      isOpen: true,
      action: 'status',
      userId: user._id,
      userName: user.name,
      data: { newStatus },
      isLoading: false,
    });
  };

  const handleConfirmAction = async () => {
    try {
      setConfirmModal(prev => ({ ...prev, isLoading: true }));
      if (confirmModal.action === 'delete') {
        await adminApi.deleteUser(confirmModal.userId);
      } else if (confirmModal.action === 'role') {
        await adminApi.updateUser(confirmModal.userId, { role: confirmModal.data.newRole });
      } else if (confirmModal.action === 'status') {
        await adminApi.updateUser(confirmModal.userId, { isActive: confirmModal.data.newStatus });
      }
      setConfirmModal({ isOpen: false, action: null, userId: '', userName: '', isLoading: false });
      loadUsers();
    } catch (error) {
      console.error('Failed to perform action:', error);
      alert('Failed to perform action');
      setConfirmModal(prev => ({ ...prev, isLoading: false }));
    }
  };

  const getConfirmModalProps = () => {
    switch (confirmModal.action) {
      case 'delete':
        return {
          title: 'Delete User',
          message: `Are you sure you want to delete "${confirmModal.userName}"? This action cannot be undone.`,
          confirmText: 'Delete User',
          variant: 'danger' as const,
        };
      case 'role':
        return {
          title: 'Change User Role',
          message: `Change "${confirmModal.userName}"'s role to ${confirmModal.data?.newRole}?`,
          confirmText: 'Change Role',
          variant: 'warning' as const,
        };
      case 'status':
        return {
          title: confirmModal.data?.newStatus ? 'Activate User' : 'Deactivate User',
          message: `${confirmModal.data?.newStatus ? 'Activate' : 'Deactivate'} "${confirmModal.userName}"?`,
          confirmText: confirmModal.data?.newStatus ? 'Activate' : 'Deactivate',
          variant: 'info' as const,
        };
      default:
        return {
          title: '',
          message: '',
          confirmText: 'Confirm',
          variant: 'info' as const,
        };
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
        <div className={styles.pageHeader}>
          <h1 className={styles.pageTitle}>Users Management</h1>
          <p className={styles.pageSubtitle}>Manage user accounts, roles, and permissions</p>
        </div>
        <div className={styles.tableContainer}>
          <div className={styles.tableToolbar}>
            <div className={styles.searchContainer}>
              <Search className={styles.searchIcon} />
              <input
                type="text"
                placeholder="Search users by name or email..."
                disabled
                className={styles.searchInput}
              />
            </div>
            <div className={styles.filtersContainer}>
              <select disabled className={styles.filterSelect}>
                <option>All Roles</option>
              </select>
              <select disabled className={styles.filterSelect}>
                <option>All Status</option>
              </select>
            </div>
          </div>
          <TableSkeleton rows={10} columns={5} />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.adminContent}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Users Management</h1>
        <p className={styles.pageSubtitle}>Manage user accounts, roles, and permissions</p>
      </div>

      <div className={styles.tableContainer}>
        {/* Toolbar */}
        <div className={styles.tableToolbar}>
          <div className={styles.searchContainer}>
            <Search className={styles.searchIcon} />
            <input
              type="text"
              placeholder="Search users by name or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={styles.searchInput}
            />
          </div>
          
          <div className={styles.filtersContainer}>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className={styles.filterSelect}
            >
              {roleOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            
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
        {users.length === 0 ? (
          <div className={styles.emptyState}>
            <User className={styles.emptyIcon} />
            <div className={styles.emptyTitle}>No users found</div>
            <div className={styles.emptyText}>
              {searchTerm || roleFilter || statusFilter 
                ? 'Try adjusting your search or filter criteria'
                : 'No users have registered yet'
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
                    onClick={() => handleSort('name')}
                  >
                    User
                    {getSortIcon('name')}
                  </th>
                  <th>Role</th>
                  <th>Status</th>
                  <th 
                    className={styles.sortableHeader}
                    onClick={() => handleSort('createdAt')}
                  >
                    Joined
                    {getSortIcon('createdAt')}
                  </th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody className={styles.tableBody}>
                {users.map((user) => (
                  <tr key={user._id}>
                    <td>
                      <div className={styles.customerCell}>
                        <div className={styles.customerAvatar}>
                          {user.avatar ? (
                            <img
                              src={user.avatar}
                              alt={user.name}
                              style={{ width: '100%', height: '100%', borderRadius: '50%' }}
                            />
                          ) : (
                            <User size={16} />
                          )}
                        </div>
                        <div className={styles.tableCellContent}>
                          <div className={styles.primaryText}>
                            {user.name}
                          </div>
                          <div className={styles.secondaryText}>
                            {user.email}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <button
                        onClick={() => toggleUserRole(user)}
                        className={`${styles.statusBadge} ${user.role === 'admin' ? styles.processing : styles.pending}`}
                        style={{ cursor: 'pointer', border: 'none' }}
                      >
                        {user.role === 'admin' && <Shield size={12} />}
                        <span style={{ textTransform: 'capitalize' }}>{user.role}</span>
                      </button>
                    </td>
                    <td>
                      <button
                        onClick={() => toggleUserStatus(user)}
                        className={`${styles.statusBadge} ${user.isActive ? styles.completed : styles.cancelled}`}
                        style={{ cursor: 'pointer', border: 'none' }}
                      >
                        {user.isActive ? <UserCheck size={12} /> : <UserX size={12} />}
                        <span>{user.isActive ? 'Active' : 'Inactive'}</span>
                      </button>
                    </td>
                    <td>
                      <div className={styles.tableCell}>
                        <Calendar size={16} style={{ color: '#6b7280' }} />
                        <span className={styles.dateCell}>
                          {new Date(user.createdAt).toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric'
                          })}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className={styles.actionsCell}>
                        <button
                          onClick={() => navigate(`/admin/users/${user._id}`)}
                          className={`${styles.actionBtn} ${styles.viewBtn}`}
                          title="View User Details"
                        >
                          <Eye size={16} />
                        </button>
                        <button
                          onClick={() => handleDelete(user._id, user.name)}
                          className={`${styles.actionBtn} ${styles.deleteBtn}`}
                          title="Delete User"
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
                Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, totalUsers)} of {totalUsers} users
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
        onClose={() => setConfirmModal({ isOpen: false, action: null, userId: '', userName: '', isLoading: false })}
        onConfirm={handleConfirmAction}
        isLoading={confirmModal.isLoading}
        {...getConfirmModalProps()}
      />
    </div>
  );
}
