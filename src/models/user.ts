import type { Database } from '../db/connection'
import { users, type User } from '../db/schema'
import { eq } from 'drizzle-orm'

/**
 * Find user by email
 * @param email User email address
 * @param db Database instance
 * @returns Promise<User | undefined> User if found
 */
export async function find_user_by_email(email: string, db: Database): Promise<User | undefined> {
  const normalized_email = email.toLowerCase().trim()
  
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, normalized_email))
    .limit(1)
  
  return user
}

/**
 * Update user password
 * @param user_id User ID
 * @param new_password_hash New password hash
 * @param db Database instance
 * @returns Promise<void>
 */
export async function update_user_password(user_id: string, new_password_hash: string, db: Database): Promise<void> {
  await db
    .update(users)
    .set({ password_hash: new_password_hash, updated_at: new Date() })
    .where(eq(users.id, user_id))
}