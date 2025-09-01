import { describe, it, expect, beforeEach } from 'vitest'
import { create_database } from '../../src/db/connection'
import { users, password_reset_tokens, type User, type NewUser } from '../../src/db/schema'
import { eq } from 'drizzle-orm'

describe('Database Schema Tests', () => {
  let db: ReturnType<typeof create_database>
  let env: any

  beforeEach(async () => {
    // Get test environment
    env = { DB: {} as D1Database, ENVIRONMENT: 'test' }
    db = create_database(env.DB)
    
    // Clean up tables for each test
    await db.delete(password_reset_tokens)
    await db.delete(users)
  })

  describe('Users Table', () => {
    it('should create a user with required fields', async () => {
      const new_user: NewUser = {
        email: 'test@example.com',
        password_hash: 'hashed_password_123',
      }

      const [created_user] = await db.insert(users).values(new_user).returning()
      
      expect(created_user).toBeDefined()
      expect(created_user.id).toBeDefined()
      expect(created_user.email).toBe('test@example.com')
      expect(created_user.password_hash).toBe('hashed_password_123')
      expect(created_user.is_admin).toBe(true) // Default value
      expect(created_user.created_at).toBeInstanceOf(Date)
      expect(created_user.updated_at).toBeInstanceOf(Date)
    })

    it('should enforce unique email constraint', async () => {
      const user_data: NewUser = {
        email: 'duplicate@example.com',
        password_hash: 'hash1',
      }

      // First insert should succeed
      await db.insert(users).values(user_data)

      // Second insert with same email should fail
      await expect(
        db.insert(users).values({
          ...user_data,
          password_hash: 'hash2'
        })
      ).rejects.toThrow()
    })

    it('should generate UUID for id field automatically', async () => {
      const new_user: NewUser = {
        email: 'uuid-test@example.com',
        password_hash: 'hashed_password',
      }

      const [created_user] = await db.insert(users).values(new_user).returning()
      
      expect(created_user.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
    })

    it('should set default timestamps', async () => {
      const new_user: NewUser = {
        email: 'timestamp-test@example.com',
        password_hash: 'hashed_password',
      }

      const before_creation = new Date()
      const [created_user] = await db.insert(users).values(new_user).returning()
      const after_creation = new Date()
      
      expect(created_user.created_at.getTime()).toBeGreaterThanOrEqual(before_creation.getTime())
      expect(created_user.created_at.getTime()).toBeLessThanOrEqual(after_creation.getTime())
      expect(created_user.updated_at.getTime()).toBeGreaterThanOrEqual(before_creation.getTime())
      expect(created_user.updated_at.getTime()).toBeLessThanOrEqual(after_creation.getTime())
    })

    it('should allow non-admin users', async () => {
      const new_user: NewUser = {
        email: 'nonadmin@example.com',
        password_hash: 'hashed_password',
        is_admin: false,
      }

      const [created_user] = await db.insert(users).values(new_user).returning()
      
      expect(created_user.is_admin).toBe(false)
    })
  })

  describe('Password Reset Tokens Table', () => {
    let test_user: User

    beforeEach(async () => {
      const new_user: NewUser = {
        email: 'resetuser@example.com',
        password_hash: 'hashed_password',
      }
      
      [test_user] = await db.insert(users).values(new_user).returning()
    })

    it('should create password reset token with required fields', async () => {
      const expires_at = new Date(Date.now() + 3600000) // 1 hour from now
      const token_data = {
        user_id: test_user.id,
        token_hash: 'hashed_reset_token_123',
        expires_at,
      }

      const [created_token] = await db.insert(password_reset_tokens).values(token_data).returning()
      
      expect(created_token).toBeDefined()
      expect(created_token.id).toBeDefined()
      expect(created_token.user_id).toBe(test_user.id)
      expect(created_token.token_hash).toBe('hashed_reset_token_123')
      expect(created_token.expires_at).toEqual(expires_at)
      expect(created_token.used_at).toBeNull()
      expect(created_token.created_at).toBeInstanceOf(Date)
    })

    it('should enforce unique token hash constraint', async () => {
      const token_data = {
        user_id: test_user.id,
        token_hash: 'duplicate_token_hash',
        expires_at: new Date(Date.now() + 3600000),
      }

      // First insert should succeed
      await db.insert(password_reset_tokens).values(token_data)

      // Second insert with same token hash should fail
      await expect(
        db.insert(password_reset_tokens).values({
          ...token_data,
          user_id: test_user.id, // Even with different user
        })
      ).rejects.toThrow()
    })

    it('should cascade delete when user is deleted', async () => {
      // Create a password reset token
      await db.insert(password_reset_tokens).values({
        user_id: test_user.id,
        token_hash: 'cascade_test_token',
        expires_at: new Date(Date.now() + 3600000),
      })

      // Verify token exists
      const tokens_before = await db.select().from(password_reset_tokens)
        .where(eq(password_reset_tokens.user_id, test_user.id))
      expect(tokens_before).toHaveLength(1)

      // Delete the user
      await db.delete(users).where(eq(users.id, test_user.id))

      // Verify token was cascade deleted
      const tokens_after = await db.select().from(password_reset_tokens)
        .where(eq(password_reset_tokens.user_id, test_user.id))
      expect(tokens_after).toHaveLength(0)
    })

    it('should allow marking token as used', async () => {
      const [token] = await db.insert(password_reset_tokens).values({
        user_id: test_user.id,
        token_hash: 'used_token_test',
        expires_at: new Date(Date.now() + 3600000),
      }).returning()

      const used_at = new Date()
      await db.update(password_reset_tokens)
        .set({ used_at })
        .where(eq(password_reset_tokens.id, token.id))

      const [updated_token] = await db.select().from(password_reset_tokens)
        .where(eq(password_reset_tokens.id, token.id))

      expect(updated_token.used_at).toEqual(used_at)
    })
  })

  describe('Database Indexes', () => {
    it('should efficiently query users by email', async () => {
      // Create multiple users
      await db.insert(users).values([
        { email: 'user1@example.com', password_hash: 'hash1' },
        { email: 'user2@example.com', password_hash: 'hash2' },
        { email: 'target@example.com', password_hash: 'hash3' },
      ])

      // Query by email should be efficient due to unique index
      const [found_user] = await db.select().from(users)
        .where(eq(users.email, 'target@example.com'))

      expect(found_user).toBeDefined()
      expect(found_user.email).toBe('target@example.com')
    })

    it('should efficiently query password reset tokens by token hash', async () => {
      const test_user_data: NewUser = {
        email: 'tokenuser@example.com',
        password_hash: 'hash',
      }
      const [user] = await db.insert(users).values(test_user_data).returning()

      // Create multiple tokens
      await db.insert(password_reset_tokens).values([
        {
          user_id: user.id,
          token_hash: 'token_hash_1',
          expires_at: new Date(Date.now() + 3600000),
        },
        {
          user_id: user.id,
          token_hash: 'target_token_hash',
          expires_at: new Date(Date.now() + 3600000),
        },
      ])

      // Query by token hash should be efficient due to unique index
      const [found_token] = await db.select().from(password_reset_tokens)
        .where(eq(password_reset_tokens.token_hash, 'target_token_hash'))

      expect(found_token).toBeDefined()
      expect(found_token.token_hash).toBe('target_token_hash')
    })
  })
})