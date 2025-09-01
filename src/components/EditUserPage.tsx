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

interface EditUserPageProps {
  user: User;
  currentUser: User;
  csrfToken: string;
  errors?: Record<string, string>;
}

const styles = {
  container: css`
    max-width: 600px;
    margin: 0 auto;
    padding: 2rem;
  `,
  header: css`
    margin-bottom: 2rem;
  `,
  title: css`
    font-size: 2rem;
    font-weight: bold;
    color: #1f2937;
    margin-bottom: 0.5rem;
  `,
  subtitle: css`
    color: #6b7280;
  `,
  form: css`
    background: #f9fafb;
    padding: 2rem;
    border-radius: 0.5rem;
  `,
  formGroup: css`
    margin-bottom: 1.5rem;
  `,
  label: css`
    display: block;
    margin-bottom: 0.5rem;
    font-weight: 500;
    color: #374151;
  `,
  input: css`
    width: 100%;
    padding: 0.75rem;
    border: 1px solid #d1d5db;
    border-radius: 0.375rem;
    font-size: 1rem;
  `,
  inputDisabled: css`
    background: #f3f4f6;
    cursor: not-allowed;
  `,
  checkboxGroup: css`
    display: flex;
    align-items: center;
    gap: 0.5rem;
  `,
  checkbox: css`
    width: auto;
  `,
  error: css`
    color: #ef4444;
    font-size: 0.875rem;
    margin-top: 0.25rem;
  `,
  info: css`
    color: #6b7280;
    font-size: 0.875rem;
    margin-top: 0.25rem;
  `,
  actions: css`
    display: flex;
    gap: 1rem;
    margin-top: 2rem;
  `,
  button: css`
    padding: 0.75rem 1.5rem;
    border: none;
    border-radius: 0.375rem;
    font-size: 1rem;
    cursor: pointer;
  `,
  saveButton: css`
    background: #3b82f6;
    color: white;
  `,
  cancelButton: css`
    background: #6b7280;
    color: white;
  `,
  deleteButton: css`
    background: #ef4444;
    color: white;
  `,
  userInfo: css`
    background: white;
    padding: 1rem;
    border-radius: 0.375rem;
    margin-bottom: 1rem;
    border: 1px solid #e5e7eb;
  `,
  infoRow: css`
    display: flex;
    justify-content: space-between;
    margin-bottom: 0.5rem;
  `,
  infoLabel: css`
    font-weight: 500;
    color: #374151;
  `,
  infoValue: css`
    color: #6b7280;
  `,
};

export function EditUserPage({ user, currentUser, csrfToken, errors = {} }: EditUserPageProps) {
  const isSelf = user.id === currentUser.id;
  
  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>Edit User</h1>
        <p className={styles.subtitle}>Manage user account settings and permissions</p>
      </header>

      <div className={styles.userInfo}>
        <div className={styles.infoRow}>
          <span className={styles.infoLabel}>User ID:</span>
          <span className={styles.infoValue}>{user.id}</span>
        </div>
        <div className={styles.infoRow}>
          <span className={styles.infoLabel}>Account Created:</span>
          <span className={styles.infoValue}>{new Date(user.created_at).toLocaleDateString()}</span>
        </div>
        <div className={styles.infoRow}>
          <span className={styles.infoLabel}>Last Login:</span>
          <span className={styles.infoValue}>{
            user.last_login ? new Date(user.last_login).toLocaleDateString() : 'Never'
          }</span>
        </div>
        <div className={styles.infoRow}>
          <span className={styles.infoLabel}>Status:</span>
          <span className={styles.infoValue}>{user.is_disabled ? 'Disabled' : 'Active'}</span>
        </div>
      </div>

      <form method="POST" action={`/admin/users/${user.id}/edit`} className={styles.form}>
        <input type="hidden" name="csrf_token" value={csrfToken} />
        <div className={styles.formGroup}>
          <label className={styles.label}>Email Address</label>
          <input
            type="email"
            name="email"
            value={user.email}
            required
            className={`${styles.input} ${errors.email ? 'border-red-500' : ''}`}
          />
          {errors.email && <div className={styles.error}>{errors.email}</div>}
          <div className={styles.info}>This will be the user's login email</div>
        </div>

        <div className={styles.formGroup}>
          <label className={styles.label}>Admin Permissions</label>
          <div className={styles.checkboxGroup}>
            <input
              type="checkbox"
              name="is_admin"
              checked={user.is_admin}
              disabled={isSelf}
              className={`${styles.checkbox} ${styles.input}`}
            />
            <label className={styles.label}>Grant admin privileges</label>
          </div>
          {isSelf && (
            <div className={styles.info}>You cannot modify your own admin status</div>
          )}
        </div>

        <div className={styles.formGroup}>
          <label className={styles.label}>Account Status</label>
          <div className={styles.checkboxGroup}>
            <input
              type="checkbox"
              name="is_disabled"
              checked={user.is_disabled}
              disabled={isSelf}
              className={`${styles.checkbox} ${styles.input}`}
            />
            <label className={styles.label}>Disable account</label>
          </div>
          {isSelf && (
            <div className={styles.info}>You cannot disable your own account</div>
          )}
        </div>

        <div className={styles.actions}>
          <button type="submit" className={`${styles.button} ${styles.saveButton}`}>
            Save Changes
          </button>
          <a href="/admin/users" className={`${styles.button} ${styles.cancelButton}`}>
            Cancel
          </a>
          {!isSelf && (
            <button
              type="button"
              className={`${styles.button} ${styles.deleteButton}`}
              onclick="return confirm('Are you sure you want to delete this user? This action cannot be undone.')"
              form="delete-form"
            >
              Delete User
            </button>
          )}
        </div>
      </form>

      {!isSelf && (
        <form
          id="delete-form"
          method="POST"
          action={`/admin/users/${user.id}/delete`}
          style="display: none;"
        >
          <input type="hidden" name="csrf_token" value={csrfToken} />
        </form>
      )}
    </div>
  );
}