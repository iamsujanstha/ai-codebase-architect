import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/features/auth/AuthContext';
import { adminApi, AdminUser } from './api/adminApi';
import styles from './Admin.module.css';

const GRADIENTS = [
  ['#f6d9b8', '#e8b98a'],
  ['#fff1b8', '#ffd36b'],
  ['#d6e4ff', '#a9c2ff'],
  ['#ffd6e0', '#ff9fb6'],
  ['#d4f1e4', '#9fdcc0'],
  ['#e6ddf7', '#c7b4ee'],
];

export const UsersManagement: React.FC = () => {
  const { user: currentAdmin } = useAuth();

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & Search & Pagination
  const [roleFilter, setRoleFilter] = useState<'all' | 'customer' | 'admin'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 10;

  // Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  const loadUsers = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await adminApi.getUsers({
        role: roleFilter,
        q: searchQuery,
        page,
        pageSize,
      });
      setUsers(res.items);
      setTotal(res.total);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load users');
    } finally {
      setIsLoading(false);
    }
  }, [roleFilter, searchQuery, page]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleRoleChange = async (targetUser: AdminUser, newRole: string) => {
    if (newRole === 'admin') {
      const confirmed = window.confirm(
        `Promote ${targetUser.name} to admin? This will give them full access to the admin panel.`,
      );
      if (!confirmed) {
        loadUsers();
        return;
      }
    }

    try {
      await adminApi.updateUserRole(targetUser.id, newRole);
      showToast(
        `${targetUser.name} is now ${newRole === 'admin' ? 'an admin' : 'a customer'}`,
      );
      loadUsers();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to update role');
      loadUsers();
    }
  };

  const handleToggleStatus = async (targetUser: AdminUser) => {
    const nextStatus = targetUser.status === 'active' ? 'suspended' : 'active';
    try {
      await adminApi.updateUserStatus(targetUser.id, nextStatus);
      showToast(
        nextStatus === 'active'
          ? 'Account reactivated'
          : 'Account suspended',
      );
      loadUsers();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to update status');
    }
  };

  const totalPages = Math.ceil(total / pageSize) || 1;

  return (
    <div>
      {/* Title Bar */}
      <div className={styles.bar} style={{ marginTop: 0 }}>
        <div>
          <h1 className={styles.title}>Users</h1>
          <p className={styles.sub} style={{ margin: 0 }}>
            {total} registered accounts
          </p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className={styles.bar}>
        <div className={styles.seg} role="group" aria-label="User role filters">
          <button
            type="button"
            className={styles.segBtn}
            aria-pressed={roleFilter === 'all'}
            onClick={() => {
              setRoleFilter('all');
              setPage(1);
            }}
          >
            All users
          </button>
          <button
            type="button"
            className={styles.segBtn}
            aria-pressed={roleFilter === 'customer'}
            onClick={() => {
              setRoleFilter('customer');
              setPage(1);
            }}
          >
            Customers
          </button>
          <button
            type="button"
            className={styles.segBtn}
            aria-pressed={roleFilter === 'admin'}
            onClick={() => {
              setRoleFilter('admin');
              setPage(1);
            }}
          >
            Admins
          </button>
        </div>

        <input
          type="search"
          className={styles.search}
          placeholder="Search name or email"
          aria-label="Search users"
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setPage(1);
          }}
        />
      </div>

      {/* Users Table */}
      <div className={styles.tw}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.thCell}>User</th>
              <th className={styles.thCell}>Role</th>
              <th className={styles.thCell}>Status</th>
              <th className={styles.thCell}>Orders</th>
              <th className={styles.thCell}>Joined</th>
              <th className={styles.thCell} style={{ textAlign: 'right' }}>
                Action
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={6} className={styles.tdCell} style={{ textAlign: 'center', padding: '40px' }}>
                  <span className={styles.sub}>Loading users…</span>
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={6} className={styles.tdCell} style={{ textAlign: 'center', padding: '40px', color: 'var(--bad)' }}>
                  <b>Error loading users:</b> {error}
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={6} className={styles.tdCell}>
                  <div className={styles.empty}>
                    <b>No users found</b>
                  </div>
                </td>
              </tr>
            ) : (
              users.map((u, idx) => {
                const adminId = (currentAdmin as any)?.id || (currentAdmin as any)?._id;
                const isCurrentAdmin =
                  (adminId && String(u.id) === String(adminId)) ||
                  u.email === currentAdmin?.email;
                const gradient = GRADIENTS[idx % GRADIENTS.length];
                const initial = (u.name || 'U').charAt(0).toUpperCase();
                const isActive = u.status === 'active';

                return (
                  <tr key={u.id} className={styles.tr}>
                    <td className={styles.tdCell}>
                      <div className={styles.productRow} style={{ minWidth: '220px' }}>
                        <span
                          className={styles.av}
                          style={{
                            background: `linear-gradient(135deg, ${gradient[0]}, ${gradient[1]})`,
                            color: '#222',
                          }}
                        >
                          {initial}
                        </span>
                        <div>
                          <b>
                            {u.name}
                            {isCurrentAdmin && (
                              <span
                                className={styles.pm}
                                style={{ marginLeft: '6px' }}
                              >
                                You
                              </span>
                            )}
                          </b>
                          <span>{u.email}</span>
                        </div>
                      </div>
                    </td>

                    <td className={styles.tdCell}>
                      <select
                        className={styles.sel2}
                        value={u.role}
                        aria-label={`Role for ${u.name}`}
                        disabled={isCurrentAdmin}
                        onChange={(e) => handleRoleChange(u, e.target.value)}
                      >
                        <option value="customer">Customer</option>
                        <option value="admin">Admin</option>
                      </select>
                    </td>

                    <td className={styles.tdCell}>
                      <span
                        className={`${styles.st} ${
                          isActive ? styles.stLive : styles.stWarn
                        }`}
                      >
                        {isActive ? 'Active' : 'Suspended'}
                      </span>
                    </td>

                    <td className={styles.tdCell}>{u.ordersCount}</td>

                    <td className={`${styles.tdCell} ${styles.sub}`}>
                      {u.joined || '—'}
                    </td>

                    <td className={styles.tdCell} style={{ textAlign: 'right' }}>
                      {isCurrentAdmin ? null : (
                        <button
                          type="button"
                          className={`${styles.btn} ${styles.btnSmall} ${styles.btnGhost}`}
                          onClick={() => handleToggleStatus(u)}
                        >
                          {isActive ? 'Suspend' : 'Reactivate'}
                        </button>
                      )}
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

      {/* Toast Notification */}
      {toastMessage && (
        <div className={styles.toast} role="status">
          {toastMessage}
        </div>
      )}
    </div>
  );
};
