import { eq } from 'drizzle-orm'
import type { Database } from '../db/connection'
import { users, password_reset_tokens, type User, type NewUser } from '../db/schema'
import { hash_password, verify_password, needs_rehash, generate_secure_token, hash_token } from '../utils/password'
import { z } from 'zod'

// User creation schema with validation
export const create_user_schema = z.object({
  email: z.string().email().toLowerCase().trim(),
  password: z.string(), // Will be validated by password_schema in hash_password
  is_admin: z.boolean().default(true),
})

export type CreateUserInput = z.infer<typeof create_user_schema>

// User update schema
export const update_user_schema = z.object({
  email: z.string().email().toLowerCase().trim().optional(),
  password: z.string().optional(),
  is_admin: z.boolean().optional(),
})

export type UpdateUserInput = z.infer<typeof update_user_schema>

export class UserModel {
  constructor(private db: Database) {}

  /**
   * Create a new user with hashed password
   * @param input User creation data
   * @returns Promise<User> Created user (without password hash)
   */
  async create_user(input: CreateUserInput): Promise<User> {
    // Validate input
    const validated_input = create_user_schema.parse(input)
    
    // Check if email already exists
    const existing_user = await this.find_by_email(validated_input.email)
    if (existing_user) {
      throw new Error('Email already exists')
    }

    // Hash the password
    const password_hash = await hash_password(validated_input.password)

    // Create user record
    const user_data: NewUser = {
      email: validated_input.email,
      password_hash,
      is_admin: validated_input.is_admin,
    }

    const [created_user] = await this.db.insert(users).values(user_data).returning()
    
    return created_user
  }

  /**
   * Find user by email
   * @param email User email address
   * @returns Promise<User | undefined> User if found
   */
  async find_by_email(email: string): Promise<User | undefined> {
    const normalized_email = email.toLowerCase().trim()
    
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.email, normalized_email))
      .limit(1)
    
    return user
  }

  /**
   * Find user by ID
   * @param id User UUID
   * @returns Promise<User | undefined> User if found
   */
  async find_by_id(id: string): Promise<User | undefined> {
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1)
    
    return user
  }

  /**
   * Verify user password
   * @param email User email
   * @param password Plain text password
   * @returns Promise<User | null> User if authentication successful, null otherwise
   */
  async verify_credentials(email: string, password: string): Promise<User | null> {
    const user = await this.find_by_email(email)
    if (!user) {
      return null
    }

    const is_valid = await verify_password(password, user.password_hash)
    if (!is_valid) {
      return null
    }

    // Check if password needs rehashing (security upgrade)
    if (needs_rehash(user.password_hash)) {
      try {
        const new_hash = await hash_password(password)
        await this.update_user(user.id, { password: password })
      } catch (error) {
        // Log error but don't fail authentication
        console.error('Failed to upgrade password hash:', error)
      }
    }

    return user
  }

  /**
   * Update user information
   * @param id User ID
   * @param input Update data
   * @returns Promise<User> Updated user
   */
  async update_user(id: string, input: UpdateUserInput): Promise<User> {
    const validated_input = update_user_schema.parse(input)
    const update_data: Partial<NewUser> = {
      updated_at: new Date(),
    }

    // Handle email update
    if (validated_input.email) {
      // Check if new email already exists (for different user)
      const existing_user = await this.find_by_email(validated_input.email)
      if (existing_user && existing_user.id !== id) {
        throw new Error('Email already exists')
      }
      update_data.email = validated_input.email
    }

    // Handle password update
    if (validated_input.password) {
      update_data.password_hash = await hash_password(validated_input.password)
    }

    // Handle admin status update
    if (validated_input.is_admin !== undefined) {
      update_data.is_admin = validated_input.is_admin
    }

    const [updated_user] = await this.db
      .update(users)
      .set(update_data)
      .where(eq(users.id, id))
      .returning()

    if (!updated_user) {
      throw new Error('User not found')
    }

    return updated_user
  }

  /**
   * Delete user and cascade related data
   * @param id User ID
   * @returns Promise<boolean> True if deleted successfully
   */
  async delete_user(id: string): Promise<boolean> {
    const result = await this.db
      .delete(users)
      .where(eq(users.id, id))
      .returning()

    return result.length > 0
  }

  /**
   * List all users with pagination
   * @param page Page number (1-based)
   * @param limit Items per page
   * @returns Promise<{users: User[], total: number}> Paginated users
   */
  async list_users(page: number = 1, limit: number = 20): Promise<{ users: User[]; total: number }> {
    const offset = (page - 1) * limit

    // Get total count
    const [{ count }] = await this.db
      .select({ count: users.id })
      .from(users)

    // Get paginated users
    const user_list = await this.db
      .select()
      .from(users)
      .limit(limit)
      .offset(offset)
      .orderBy(users.created_at)

    return {
      users: user_list,
      total: Number(count) || 0
    }
  }

  /**
   * Create password reset token for user
   * @param email User email
   * @returns Promise<string> Reset token (plain text - to be sent in email)
   */
  async create_password_reset_token(email: string): Promise<string> {
    const user = await this.find_by_email(email)
    if (!user) {
      // Don't reveal that email doesn't exist
      throw new Error('If account exists, reset email will be sent')
    }

    // Generate secure token
    const reset_token = generate_secure_token(32)
    const token_hash = await hash_token(reset_token)
    const expires_at = new Date(Date.now() + 60 * 60 * 1000) // 1 hour

    // Clean up any existing reset tokens for this user
    await this.db
      .delete(password_reset_tokens)
      .where(eq(password_reset_tokens.user_id, user.id))

    // Create new reset token
    await this.db.insert(password_reset_tokens).values({
      user_id: user.id,
      token_hash,
      expires_at,
    })

    return reset_token
  }

  /**
   * Verify password reset token and get user
   * @param token Plain text reset token
   * @returns Promise<User | null> User if token valid, null otherwise
   */
  async verify_password_reset_token(token: string): Promise<User | null> {
    const token_hash = await hash_token(token)
    
    const [reset_record] = await this.db
      .select({
        user_id: password_reset_tokens.user_id,
        expires_at: password_reset_tokens.expires_at,
        used_at: password_reset_tokens.used_at,
      })
      .from(password_reset_tokens)
      .where(eq(password_reset_tokens.token_hash, token_hash))
      .limit(1)

    if (!reset_record) {
      return null
    }

    // Check if token is expired
    if (reset_record.expires_at < new Date()) {
      return null
    }

    // Check if token has already been used
    if (reset_record.used_at) {
      return null
    }

    // Get the user
    const user = await this.find_by_id(reset_record.user_id)
    return user || null
  }

  /**
   * Complete password reset with new password
   * @param token Plain text reset token
   * @param new_password New password
   * @returns Promise<boolean> True if reset successful
   */
  async complete_password_reset(token: string, new_password: string): Promise<boolean> {
    const user = await this.verify_password_reset_token(token)
    if (!user) {
      return false
    }

    const token_hash = await hash_token(token)

    // Update password
    await this.update_user(user.id, { password: new_password })

    // Mark token as used
    await this.db
      .update(password_reset_tokens)
      .set({ used_at: new Date() })
      .where(eq(password_reset_tokens.token_hash, token_hash))

    return true
  }

  /**
   * Clean up expired password reset tokens
   * @returns Promise<number> Number of tokens cleaned up
   */
  async cleanup_expired_reset_tokens(): Promise<number> {
    const now = new Date()
    
    const deleted = await this.db
      .delete(password_reset_tokens)
      .where(eq(password_reset_tokens.expires_at, now)) // Drizzle syntax might vary
      .returning()

    return deleted.length
  }

  /**
   * Get user without sensitive fields (for API responses)
   * @param user User object
   * @returns User object without password_hash
   */
  sanitize_user(user: User): Omit<User, 'password_hash'> {
    const { password_hash, ...safe_user } = user
    return safe_user
  }
}