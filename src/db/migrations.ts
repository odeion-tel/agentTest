import type { Database } from './connection'
import { users, type NewUser } from './schema'
import { hash_password } from '../utils/password'

/**
 * Create initial admin user if none exists
 * @param db Database instance
 * @param admin_email Admin email (default from env or fallback)
 * @param admin_password Admin password (default from env or fallback)
 */
export async function create_initial_admin(
  db: Database,
  admin_email: string = 'admin@conversionware.com',
  admin_password: string = 'AdminPassword123!'
): Promise<void> {
  try {
    // Check if any admin users exist
    const existing_admins = await db
      .select()
      .from(users)
      .where(users.is_admin)
      .limit(1)

    if (existing_admins.length > 0) {
      console.log('Admin user already exists, skipping creation')
      return
    }

    // Create initial admin user
    const admin_data: NewUser = {
      email: admin_email,
      password_hash: await hash_password(admin_password),
      is_admin: true,
    }

    const [created_admin] = await db.insert(users).values(admin_data).returning()
    
    console.log(`Initial admin user created: ${created_admin.email}`)
    console.log('IMPORTANT: Change the default admin password immediately!')
  } catch (error) {
    console.error('Failed to create initial admin user:', error)
    throw error
  }
}

/**
 * Clean up expired password reset tokens
 * This should be run periodically (e.g., via Cloudflare Cron Trigger)
 * @param db Database instance
 */
export async function cleanup_expired_tokens(db: Database): Promise<number> {
  try {
    const now = new Date()
    
    // Note: This is a simplified cleanup query
    // In production, you might want to use a more sophisticated approach
    const result = await db.execute({
      sql: 'DELETE FROM password_reset_tokens WHERE expires_at < ? OR used_at IS NOT NULL',
      args: [now.getTime()]
    })
    
    const deleted_count = result.meta.changes || 0
    console.log(`Cleaned up ${deleted_count} expired/used password reset tokens`)
    
    return deleted_count
  } catch (error) {
    console.error('Failed to cleanup expired tokens:', error)
    throw error
  }
}