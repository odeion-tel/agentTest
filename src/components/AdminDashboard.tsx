import { css } from 'hono/css';
import { jsx } from 'hono/jsx';

interface User {
  id: string;
  email: string;
  is_admin: boolean;
  is_disabled: boolean;
  created_at: string;
  last_login: string | null;
}

interface AdminDashboardProps {
  users: User[];
  currentUser: User;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  searchQuery?: string;
  csrfToken: string;
}

const styles = {
  container: css`
    max-width: 1200px;
    margin: 0 auto;
    padding: 2rem;
  `,
  header: css`
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 2rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid #e5e7eb;
  `,
  title: css`
    font-size: 2rem;
    font-weight: bold;
    color: #1f2937;
  `,
  userInfo: css`
    text-align: right;
    color: #6b7280;
  `,
  searchBar: css`
    display: flex;
    gap: 1rem;
    margin-bottom: 2rem;
  `,
  searchInput: css`
    flex: 1;
    padding: 0.5rem 1rem;
    border: 1px solid #d1d5db;
    border-radius: 0.375rem;
    font-size: 1rem;
  `,
  searchButton: css`
    padding: 0.5rem 1rem;
    background: #3b82f6;
    color: white;
    border: none;
    border-radius: 0.375rem;
    cursor: pointer;
    font-size: 1rem;
  `,
  createButton: css`
    padding: 0.5rem 1rem;
    background: #10b981;
    color: white;
    border: none;
    border-radius: 0.375rem;
    cursor: pointer;
    font-size: 1rem;
  `,
  table: css`
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 2rem;
  `,
  th: css`
    background: #f9fafb;
    padding: 1rem;
    text-align: left;
    font-weight: 600;
    border-bottom: 1px solid #e5e7eb;
  `,
  td: css`
    padding: 1rem;
    border-bottom: 1px solid #e5e7eb;
  `,
  userRow: css`
    &:hover {
      background: #f9fafb;
    }
  `,
  disabled: css`
    opacity: 0.6;
    text-decoration: line-through;
  `,
  adminBadge: css`
    background: #fef3c7;
    color: #92400e;
    padding: 0.25rem 0.5rem;
    border-radius: 0.25rem;
    font-size: 0.75rem;
    font-weight: 500;
  `,
  actions: css`
    display: flex;
    gap: 0.5rem;
  `,
  button: css`
    padding: 0.25rem 0.5rem;
    border: 1px solid #d1d5db;
    border-radius: 0.25rem;
    background: white;
    cursor: pointer;
    font-size: 0.875rem;
  `,
  editButton: css`
    color: #3b82f6;
  `,
  disableButton: css`
    color: #ef4444;
  `,
  enableButton: css`
    color: #10b981;
  `,
  pagination: css`
    display: flex;
    justify-content: center;
    gap: 0.5rem;
  `,
  pageButton: css`
    padding: 0.5rem 1rem;
    border: 1px solid #d1d5db;
    border-radius: 0.25rem;
    background: white;
    cursor: pointer;
  `,
  activePage: css`
    background: #3b82f6;
    color: white;
    border-color: #3b82f6;
  `,
  modal: css`
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  `,
  modalContent: css`
    background: white;
    padding: 2rem;
    border-radius: 0.5rem;
    max-width: 500px;
    width: 90%;
  `,
  formGroup: css`
    margin-bottom: 1rem;
  `,
  label: css`
    display: block;
    margin-bottom: 0.5rem;
    font-weight: 500;
  `,
  input: css`
    width: 100%;
    padding: 0.5rem;
    border: 1px solid #d1d5db;
    border-radius: 0.25rem;
  `,
  checkbox: css`
    margin-right: 0.5rem;
  `,
  error: css`
    color: #ef4444;
    font-size: 0.875rem;
    margin-top: 0.25rem;
  `,
};

export function AdminDashboard({ users, currentUser, pagination, searchQuery = '', csrfToken }: AdminDashboardProps) {
  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>Admin Dashboard</h1>
        <div className={styles.userInfo}>
          <div>Welcome, {currentUser.email}</div>
          <div><a href="/app/logout">Logout</a></div>
        </div>
      </header>

      <div className={styles.searchBar}>
        <form method="GET" action="/admin/users">
          <input
            type="text"
            name="search"
            placeholder="Search users by email..."
            defaultValue={searchQuery}
            className={styles.searchInput}
          />
          <button type="submit" className={styles.searchButton}>Search</button>
        </form>
        <button
          type="button"
          className={styles.createButton}
          x-data="{ open: false }"
          @click="open = true"
        >
          Create User
        </button>
      </div>

      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.th}>Email</th>
            <th className={styles.th}>Role</th>
            <th className={styles.th}>Status</th>
            <th className={styles.th}>Created</th>
            <th className={styles.th}>Last Login</th>
            <th className={styles.th}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id} className={`${styles.userRow} ${user.is_disabled ? styles.disabled : ''}`}>
              <td className={styles.td}>{user.email}</td>
              <td className={styles.td}>
                {user.is_admin && <span className={styles.adminBadge}>Admin</span>}
              </td>
              <td className={styles.td}>
                {user.is_disabled ? 'Disabled' : 'Active'}
              </td>
              <td className={styles.td}>{new Date(user.created_at).toLocaleDateString()}</td>
              <td className={styles.td}>
                {user.last_login ? new Date(user.last_login).toLocaleDateString() : 'Never'}
              </td>
              <td className={styles.td}>
                <div className={styles.actions}>
                  <form method="GET" action={`/admin/users/${user.id}/edit`}>
                    <button type="submit" className={`${styles.button} ${styles.editButton}`}>
                      Edit
                    </button>
                  </form>
                  {user.id !== currentUser.id && (
                    <form method="POST" action={`/admin/users/${user.id}/${user.is_disabled ? 'enable' : 'disable'}`}>
                      <input type="hidden" name="csrf_token" value={csrfToken} />
                      <button
                        type="submit"
                        className={`${styles.button} ${user.is_disabled ? styles.enableButton : styles.disableButton}`}
                        onclick={user.is_disabled ? null : "return confirm('Are you sure you want to disable this user?')"}
                      >
                        {user.is_disabled ? 'Enable' : 'Disable'}
                      </button>
                    </form>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {pagination.totalPages > 1 && (
        <div className={styles.pagination}>
          {Array.from({ length: pagination.totalPages }, (_, i) => i + 1).map((page) => (
            <a
              key={page}
              href={`/admin/users?page=${page}${searchQuery ? `&search=${encodeURIComponent(searchQuery)}` : ''}`}
              className={`${styles.pageButton} ${page === pagination.page ? styles.activePage : ''}`}
            >
              {page}
            </a>
          ))}
        </div>
      )}

      {/* Create User Modal */}
      <div
        x-data="{ open: false }"
        x-show="open"
        x-transition
        className={styles.modal}
        style="display: none;"
      >
        <div className={styles.modalContent}>
          <h2>Create New User</h2>
          <form method="POST" action="/admin/users" x-ref="createForm">
            <input type="hidden" name="csrf_token" value={csrfToken} />
            <div className={styles.formGroup}>
              <label className={styles.label}>Email</label>
              <input type="email" name="email" required className={styles.input} />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Password</label>
              <input type="password" name="password" required minLength="12" className={styles.input} />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>
                <input type="checkbox" name="is_admin" className={styles.checkbox} />
                Admin User
              </label>
            </div>
            <div className={styles.actions}>
              <button type="submit" className={styles.createButton}>Create User</button>
              <button type="button" @click="open = false">Cancel</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}