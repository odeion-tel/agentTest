/**
 * Audit logging utilities for tracking admin actions and authentication events
 */

export interface AuditLogEntry {
  id: string;
  user_id: string;
  user_email: string;
  action: string;
  resource_type: string;
  resource_id?: string;
  details: Record<string, any>;
  ip_address: string;
  user_agent: string;
  timestamp: Date;
}

export type AuditAction = 
  | 'USER_CREATED'
  | 'USER_UPDATED'
  | 'USER_DISABLED'
  | 'USER_ENABLED'
  | 'USER_DELETED'
  | 'PASSWORD_RESET_REQUESTED'
  | 'PASSWORD_RESET_COMPLETED'
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILED'
  | 'LOGOUT'
  | 'ADMIN_LOGIN'
  | 'ADMIN_ACTION';

/**
 * Log an audit event
 * @param db Database instance
 * @param entry Audit log entry data
 */
export async function log_audit_event(
  db: D1Database,
  entry: Omit<AuditLogEntry, 'id' | 'timestamp'>
): Promise<void> {
  const audit_entry = {
    id: crypto.randomUUID(),
    ...entry,
    timestamp: new Date(),
  };

  try {
    await db.prepare(`
      INSERT INTO audit_logs (
        id, user_id, user_email, action, resource_type, resource_id,
        details, ip_address, user_agent, timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      audit_entry.id,
      audit_entry.user_id,
      audit_entry.user_email,
      audit_entry.action,
      audit_entry.resource_type,
      audit_entry.resource_id || null,
      JSON.stringify(audit_entry.details),
      audit_entry.ip_address,
      audit_entry.user_agent,
      audit_entry.timestamp.getTime()
    ).run();
  } catch (error) {
    console.error('Failed to write audit log:', error);
    // Don't throw - audit logging should not break the application
  }
}

/**
 * Create a standardized audit log entry for user management actions
 */
export async function log_user_management_action(
  db: D1Database,
  action: 'USER_CREATED' | 'USER_UPDATED' | 'USER_DISABLED' | 'USER_ENABLED' | 'USER_DELETED',
  user_data: { user_id: string; email: string },
  target_user: { user_id: string; email: string },
  changes?: Record<string, any>,
  request?: Request
): Promise<void> {
  const ip_address = request?.headers.get('x-forwarded-for') || 
                    request?.headers.get('x-real-ip') || 
                    'unknown';
  
  const user_agent = request?.headers.get('user-agent') || 'unknown';

  await log_audit_event(db, {
    user_id: user_data.user_id,
    user_email: user_data.email,
    action,
    resource_type: 'USER',
    resource_id: target_user.user_id,
    details: {
      target_email: target_user.email,
      ...(changes && { changes }),
    },
    ip_address,
    user_agent,
  });
}

/**
 * Log authentication events
 */
export async function log_auth_event(
  db: D1Database,
  action: 'LOGIN_SUCCESS' | 'LOGIN_FAILED' | 'LOGOUT' | 'PASSWORD_RESET_REQUESTED' | 'PASSWORD_RESET_COMPLETED',
  user_data: { user_id: string; email: string },
  request?: Request,
  additional_details?: Record<string, any>
): Promise<void> {
  const ip_address = request?.headers.get('x-forwarded-for') || 
                    request?.headers.get('x-real-ip') || 
                    'unknown';
  
  const user_agent = request?.headers.get('user-agent') || 'unknown';

  await log_audit_event(db, {
    user_id: user_data.user_id,
    user_email: user_data.email,
    action,
    resource_type: 'AUTH',
    details: additional_details || {},
    ip_address,
    user_agent,
  });
}

/**
 * Get audit logs with pagination
 */
export async function get_audit_logs(
  db: D1Database,
  options: {
    page?: number;
    limit?: number;
    user_id?: string;
    action?: AuditAction;
    start_date?: Date;
    end_date?: Date;
  } = {}
): Promise<{
  audit_logs: AuditLogEntry[];
  total: number;
  page: number;
  limit: number;
}> {
  const {
    page = 1,
    limit = 20,
    user_id,
    action,
    start_date,
    end_date,
  } = options;

  const offset = (page - 1) * limit;
  let query = 'SELECT * FROM audit_logs WHERE 1=1';
  const params: any[] = [];

  if (user_id) {
    query += ' AND user_id = ?';
    params.push(user_id);
  }

  if (action) {
    query += ' AND action = ?';
    params.push(action);
  }

  if (start_date) {
    query += ' AND timestamp >= ?';
    params.push(start_date.getTime());
  }

  if (end_date) {
    query += ' AND timestamp <= ?';
    params.push(end_date.getTime());
  }

  query += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const logs = await db.prepare(query).bind(...params).all();

  // Get total count
  let count_query = 'SELECT COUNT(*) as count FROM audit_logs WHERE 1=1';
  const count_params: any[] = [];

  if (user_id) {
    count_query += ' AND user_id = ?';
    count_params.push(user_id);
  }

  if (action) {
    count_query += ' AND action = ?';
    count_params.push(action);
  }

  if (start_date) {
    count_query += ' AND timestamp >= ?';
    count_params.push(start_date.getTime());
  }

  if (end_date) {
    count_query += ' AND timestamp <= ?';
    count_params.push(end_date.getTime());
  }

  const [{ count }] = await db.prepare(count_query).bind(...count_params).all();

  return {
    audit_logs: (logs.results || []).map(log => ({
      ...log,
      details: typeof log.details === 'string' ? JSON.parse(log.details) : log.details,
      timestamp: new Date(log.timestamp),
    })),
    total: Number(count) || 0,
    page,
    limit,
  };
}