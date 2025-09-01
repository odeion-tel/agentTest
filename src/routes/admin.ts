import { Hono } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { admin_middleware } from '../middleware/admin';
import { AdminDashboard } from '../components/AdminDashboard';
import { EditUserPage } from '../components/EditUserPage';
import { generateSecureToken, hashPassword } from '../utils/crypto';
import { log_user_management_action } from '../utils/audit';

const admin = new Hono<{ Bindings: Env }>();

// User creation schema
const createUserSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string()
    .min(12, 'Password must be at least 12 characters')
    .regex(/[A-Z]/, 'Password must contain uppercase letters')
    .regex(/[a-z]/, 'Password must contain lowercase letters')
    .regex(/[0-9]/, 'Password must contain numbers')
    .regex(/[^A-Za-z0-9]/, 'Password must contain special characters'),
  is_admin: z.boolean().default(false),
  csrf_token: z.string(),
});

// User update schema
const updateUserSchema = z.object({
  email: z.string().email('Invalid email address'),
  is_admin: z.boolean().default(false),
  is_disabled: z.boolean().default(false),
  csrf_token: z.string(),
});

// Admin user listing
admin.get('/users', admin_middleware, async (c) => {
  const db = c.env.DB;
  const user = c.get('user');
  
  const page = Math.max(1, parseInt(c.req.query('page') || '1'));
  const limit = 20;
  const search = c.req.query('search') || '';
  
  let query = 'SELECT * FROM users WHERE 1=1';
  let countQuery = 'SELECT COUNT(*) as count FROM users WHERE 1=1';
  const params: any[] = [];
  
  if (search) {
    query += ' AND email LIKE ?';
    countQuery += ' AND email LIKE ?';
    params.push(`%${search}%`);
  }
  
  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, (page - 1) * limit);
  
  const [usersResult, countResult] = await Promise.all([
    db.prepare(query).bind(...params).all(),
    db.prepare(countQuery).bind(...params.slice(0, -2)).all()
  ]);
  
  const users = (usersResult.results || []).map(u => ({
    ...u,
    created_at: new Date(u.created_at as string).toISOString(),
    last_login: u.last_login ? new Date(u.last_login as string).toISOString() : null
  }));
  
  const total = Number((countResult.results?.[0] as any)?.count || 0);
  const totalPages = Math.ceil(total / limit);
  
  // Generate CSRF token
  const csrfToken = await generateSecureToken();
  setCookie(c, 'csrf_token', csrfToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'Strict',
    maxAge: 60 * 60, // 1 hour
  });
  
  return c.html(
    AdminDashboard({
      users,
      currentUser: {
        id: user.user_id,
        email: user.email,
        is_admin: user.is_admin,
        is_disabled: false,
        created_at: new Date().toISOString(),
        last_login: null
      },
      pagination: {
        page,
        limit,
        total,
        totalPages
      },
      searchQuery: search,
      csrfToken
    })
  );
});

// Admin audit logs
admin.get('/audit-logs', admin_middleware, async (c) => {
  const db = c.env.DB;
  
  const page = Math.max(1, parseInt(c.req.query('page') || '1'));
  const limit = 50;
  const userId = c.req.query('user_id');
  const action = c.req.query('action');
  
  let query = 'SELECT * FROM audit_logs WHERE 1=1';
  let countQuery = 'SELECT COUNT(*) as count FROM audit_logs WHERE 1=1';
  const params: any[] = [];
  
  if (userId) {
    query += ' AND user_id = ?';
    countQuery += ' AND user_id = ?';
    params.push(userId);
  }
  
  if (action) {
    query += ' AND action = ?';
    countQuery += ' AND action = ?';
    params.push(action);
  }
  
  query += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
  params.push(limit, (page - 1) * limit);
  
  const [logsResult, countResult] = await Promise.all([
    db.prepare(query).bind(...params).all(),
    db.prepare(countQuery).bind(...params.slice(0, -2)).all()
  ]);
  
  const audit_logs = (logsResult.results || []).map(log => ({
    ...log,
    timestamp: new Date(log.timestamp as number).toISOString(),
    details: typeof log.details === 'string' ? JSON.parse(log.details) : log.details
  }));
  
  const total = Number((countResult.results?.[0] as any)?.count || 0);
  
  return c.json({ audit_logs, total, page, limit });
});

// Create new user
admin.post('/users', admin_middleware, zValidator('json', createUserSchema), async (c) => {
  const db = c.env.DB;
  const currentUser = c.get('user');
  const data = c.req.valid('json');
  
  // Verify CSRF token
  const csrfToken = getCookie(c, 'csrf_token');
  if (!csrfToken || csrfToken !== data.csrf_token) {
    return c.json({ error: 'Invalid CSRF token' }, 400);
  }
  
  try {
    // Check if email already exists
    const existing = await db.prepare('SELECT id FROM users WHERE email = ?')
      .bind(data.email)
      .first();
    
    if (existing) {
      return c.json({ error: 'Email already exists' }, 409);
    }
    
    const userId = crypto.randomUUID();
    const hashedPassword = await hashPassword(data.password);
    const now = new Date().toISOString();
    
    await db.prepare(`
      INSERT INTO users (id, email, password_hash, is_admin, is_disabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      userId,
      data.email,
      hashedPassword,
      data.is_admin ? 1 : 0,
      0,
      now,
      now
    ).run();
    
    const newUser = await db.prepare('SELECT * FROM users WHERE id = ?')
      .bind(userId)
      .first();
    
    // Log the action
    await log_user_management_action(
      db,
      'USER_CREATED',
      { user_id: currentUser.user_id, email: currentUser.email },
      { user_id: userId, email: data.email },
      { is_admin: data.is_admin },
      c.req
    );
    
    return c.json({
      id: userId,
      email: data.email,
      is_admin: data.is_admin,
      is_disabled: false,
      created_at: now
    }, 201);
    
  } catch (error) {
    console.error('Error creating user:', error);
    return c.json({ error: 'Failed to create user' }, 500);
  }
});

// Edit user form
admin.get('/users/:id/edit', admin_middleware, async (c) => {
  const db = c.env.DB;
  const userId = c.req.param('id');
  const currentUser = c.get('user');
  
  const user = await db.prepare('SELECT * FROM users WHERE id = ?')
    .bind(userId)
    .first();
  
  if (!user) {
    return c.notFound();
  }
  
  // Generate CSRF token
  const csrfToken = await generateSecureToken();
  setCookie(c, 'csrf_token', csrfToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'Strict',
    maxAge: 60 * 60, // 1 hour
  });
  
  return c.html(
    EditUserPage({
      user: {
        ...user,
        created_at: new Date(user.created_at as string).toISOString(),
        last_login: user.last_login ? new Date(user.last_login as string).toISOString() : null
      },
      currentUser: {
        id: currentUser.user_id,
        email: currentUser.email,
        is_admin: user.is_admin,
        is_disabled: false,
        created_at: new Date().toISOString(),
        last_login: null
      },
      csrfToken
    })
  );
});

// Update user
admin.post('/users/:id/edit', admin_middleware, zValidator('form', updateUserSchema), async (c) => {
  const db = c.env.DB;
  const currentUser = c.get('user');
  const userId = c.req.param('id');
  const data = c.req.valid('form');
  
  // Verify CSRF token
  const csrfToken = getCookie(c, 'csrf_token');
  if (!csrfToken || csrfToken !== data.csrf_token) {
    return c.json({ error: 'Invalid CSRF token' }, 400);
  }
  
  // Prevent self-modification of admin status
  if (userId === currentUser.user_id) {
    data.is_admin = currentUser.is_admin;
    data.is_disabled = false;
  }
  
  try {
    // Check if email already exists for another user
    const existing = await db.prepare('SELECT id FROM users WHERE email = ? AND id != ?')
      .bind(data.email, userId)
      .first();
    
    if (existing) {
      return c.json({ error: 'Email already exists' }, 409);
    }
    
    const oldUser = await db.prepare('SELECT * FROM users WHERE id = ?')
      .bind(userId)
      .first();
    
    if (!oldUser) {
      return c.json({ error: 'User not found' }, 404);
    }
    
    const changes = {
      email: data.email,
      is_admin: data.is_admin,
      is_disabled: data.is_disabled,
      updated_at: new Date().toISOString()
    };
    
    await db.prepare(`
      UPDATE users 
      SET email = ?, is_admin = ?, is_disabled = ?, updated_at = ?
      WHERE id = ?
    `).bind(
      changes.email,
      changes.is_admin ? 1 : 0,
      changes.is_disabled ? 1 : 0,
      changes.updated_at,
      userId
    ).run();
    
    // Log the action
    await log_user_management_action(
      db,
      'USER_UPDATED',
      { user_id: currentUser.user_id, email: currentUser.email },
      { user_id: userId, email: data.email },
      changes,
      c.req
    );
    
    return c.json({
      id: userId,
      email: data.email,
      is_admin: data.is_admin,
      is_disabled: data.is_disabled,
      updated_at: changes.updated_at
    });
    
  } catch (error) {
    console.error('Error updating user:', error);
    return c.json({ error: 'Failed to update user' }, 500);
  }
});

// Disable user
admin.post('/users/:id/disable', admin_middleware, async (c) => {
  const db = c.env.DB;
  const currentUser = c.get('user');
  const userId = c.req.param('id');
  
  // Verify CSRF token
  const formData = await c.req.formData();
  const csrfToken = formData.get('csrf_token');
  const cookieToken = getCookie(c, 'csrf_token');
  
  if (!csrfToken || !cookieToken || csrfToken !== cookieToken) {
    return c.json({ error: 'Invalid CSRF token' }, 400);
  }
  
  if (userId === currentUser.user_id) {
    return c.json({ error: 'Cannot disable your own account' }, 400);
  }
  
  try {
    const user = await db.prepare('SELECT * FROM users WHERE id = ?')
      .bind(userId)
      .first();
    
    if (!user) {
      return c.json({ error: 'User not found' }, 404);
    }
    
    if (user.is_disabled) {
      return c.json({ error: 'User is already disabled' }, 400);
    }
    
    await db.prepare(`
      UPDATE users 
      SET is_disabled = 1, updated_at = ?
      WHERE id = ?
    `).bind(new Date().toISOString(), userId).run();
    
    // Log the action
    await log_user_management_action(
      db,
      'USER_DISABLED',
      { user_id: currentUser.user_id, email: currentUser.email },
      { user_id: userId, email: user.email as string },
      { is_disabled: true },
      c.req
    );
    
    return c.json({ success: true });
    
  } catch (error) {
    console.error('Error disabling user:', error);
    return c.json({ error: 'Failed to disable user' }, 500);
  }
});

// Enable user
admin.post('/users/:id/enable', admin_middleware, async (c) => {
  const db = c.env.DB;
  const currentUser = c.get('user');
  const userId = c.req.param('id');
  
  // Verify CSRF token
  const formData = await c.req.formData();
  const csrfToken = formData.get('csrf_token');
  const cookieToken = getCookie(c, 'csrf_token');
  
  if (!csrfToken || !cookieToken || csrfToken !== cookieToken) {
    return c.json({ error: 'Invalid CSRF token' }, 400);
  }
  
  try {
    const user = await db.prepare('SELECT * FROM users WHERE id = ?')
      .bind(userId)
      .first();
    
    if (!user) {
      return c.json({ error: 'User not found' }, 404);
    }
    
    if (!user.is_disabled) {
      return c.json({ error: 'User is already enabled' }, 400);
    }
    
    await db.prepare(`
      UPDATE users 
      SET is_disabled = 0, updated_at = ?
      WHERE id = ?
    `).bind(new Date().toISOString(), userId).run();
    
    // Log the action
    await log_user_management_action(
      db,
      'USER_ENABLED',
      { user_id: currentUser.user_id, email: currentUser.email },
      { user_id: userId, email: user.email as string },
      { is_disabled: false },
      c.req
    );
    
    return c.json({ success: true });
    
  } catch (error) {
    console.error('Error enabling user:', error);
    return c.json({ error: 'Failed to enable user' }, 500);
  }
});

// Delete user
admin.post('/users/:id/delete', admin_middleware, async (c) => {
  const db = c.env.DB;
  const currentUser = c.get('user');
  const userId = c.req.param('id');
  
  // Verify CSRF token
  const formData = await c.req.formData();
  const csrfToken = formData.get('csrf_token');
  const cookieToken = getCookie(c, 'csrf_token');
  
  if (!csrfToken || !cookieToken || csrfToken !== cookieToken) {
    return c.json({ error: 'Invalid CSRF token' }, 400);
  }
  
  if (userId === currentUser.user_id) {
    return c.json({ error: 'Cannot delete your own account' }, 400);
  }
  
  try {
    const user = await db.prepare('SELECT * FROM users WHERE id = ?')
      .bind(userId)
      .first();
    
    if (!user) {
      return c.json({ error: 'User not found' }, 404);
    }
    
    // Log the action before deletion
    await log_user_management_action(
      db,
      'USER_DELETED',
      { user_id: currentUser.user_id, email: currentUser.email },
      { user_id: userId, email: user.email as string },
      {},
      c.req
    );
    
    // Delete user and related data
    await db.prepare('DELETE FROM users WHERE id = ?').bind(userId).run();
    await db.prepare('DELETE FROM password_reset_tokens WHERE user_id = ?').bind(userId).run();
    
    return c.json({ success: true });
    
  } catch (error) {
    console.error('Error deleting user:', error);
    return c.json({ error: 'Failed to delete user' }, 500);
  }
});

export default admin;