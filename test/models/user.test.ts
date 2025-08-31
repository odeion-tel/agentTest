import { describe, it, expect, beforeEach } from 'vitest'
import { create_database } from '../../src/db/connection'
import { users, password_reset_tokens } from '../../src/db/schema'
import { UserModel, type CreateUserInput, type UpdateUserInput } from '../../src/models/user'

describe('User Model', () => {
  let db: ReturnType<typeof create_database>
  let user_model: UserModel
  let env: any

  beforeEach(async () => {
    env = { DB: {} as D1Database, ENVIRONMENT: 'test' }
    db = create_database(env.DB)
    user_model = new UserModel(db)
    
    // Clean up tables for each test
    await db.delete(password_reset_tokens)
    await db.delete(users)
  })

  describe('User Creation', () => {
    it('should create a new user with valid data', async () => {
      const user_input: CreateUserInput = {
        email: 'test@example.com',
        password: 'ValidPassword123!',
        is_admin: true,
      }

      const created_user = await user_model.create_user(user_input)
      
      expect(created_user).toBeDefined()
      expect(created_user.id).toBeDefined()
      expect(created_user.email).toBe('test@example.com')
      expect(created_user.is_admin).toBe(true)
      expect(created_user.password_hash).toBeDefined()
      expect(created_user.password_hash).not.toBe('ValidPassword123!')
      expect(created_user.created_at).toBeInstanceOf(Date)
    })

    it('should normalize email during creation', async () => {
      const user_input: CreateUserInput = {
        email: '  TEST@EXAMPLE.COM  ',
        password: 'ValidPassword123!',
      }

      const created_user = await user_model.create_user(user_input)
      expect(created_user.email).toBe('test@example.com')
    })

    it('should reject duplicate emails', async () => {
      const user_input: CreateUserInput = {
        email: 'duplicate@example.com',
        password: 'ValidPassword123!',
      }

      await user_model.create_user(user_input)
      
      await expect(
        user_model.create_user(user_input)
      ).rejects.toThrow('Email already exists')
    })

    it('should reject invalid passwords', async () => {
      const invalid_user_input: CreateUserInput = {
        email: 'test@example.com',
        password: 'weak', // Doesn't meet OWASP requirements
      }

      await expect(
        user_model.create_user(invalid_user_input)
      ).rejects.toThrow('Invalid password')
    })

    it('should set default admin status', async () => {
      const user_input = {
        email: 'admin@example.com',
        password: 'ValidPassword123!',
        // is_admin not specified - should default to true
      }

      const created_user = await user_model.create_user(user_input)
      expect(created_user.is_admin).toBe(true)
    })

    it('should allow non-admin users', async () => {
      const user_input: CreateUserInput = {
        email: 'user@example.com',
        password: 'ValidPassword123!',
        is_admin: false,
      }

      const created_user = await user_model.create_user(user_input)
      expect(created_user.is_admin).toBe(false)
    })
  })

  describe('User Lookup', () => {
    let test_user_id: string

    beforeEach(async () => {
      const user = await user_model.create_user({
        email: 'lookup@example.com',
        password: 'TestPassword123!',
      })
      test_user_id = user.id
    })

    it('should find user by email', async () => {
      const found_user = await user_model.find_by_email('lookup@example.com')
      
      expect(found_user).toBeDefined()
      expect(found_user?.id).toBe(test_user_id)
      expect(found_user?.email).toBe('lookup@example.com')
    })

    it('should find user by id', async () => {
      const found_user = await user_model.find_by_id(test_user_id)
      
      expect(found_user).toBeDefined()
      expect(found_user?.id).toBe(test_user_id)
      expect(found_user?.email).toBe('lookup@example.com')
    })

    it('should return undefined for non-existent email', async () => {
      const found_user = await user_model.find_by_email('nonexistent@example.com')
      expect(found_user).toBeUndefined()
    })

    it('should return undefined for non-existent id', async () => {
      const fake_id = crypto.randomUUID()
      const found_user = await user_model.find_by_id(fake_id)
      expect(found_user).toBeUndefined()
    })

    it('should normalize email during lookup', async () => {
      const found_user = await user_model.find_by_email('  LOOKUP@EXAMPLE.COM  ')
      
      expect(found_user).toBeDefined()
      expect(found_user?.email).toBe('lookup@example.com')
    })
  })

  describe('Credential Verification', () => {
    beforeEach(async () => {
      await user_model.create_user({
        email: 'auth@example.com',
        password: 'AuthPassword123!',
      })
    })

    it('should verify correct credentials', async () => {
      const user = await user_model.verify_credentials('auth@example.com', 'AuthPassword123!')
      
      expect(user).toBeDefined()
      expect(user?.email).toBe('auth@example.com')
    })

    it('should reject incorrect password', async () => {
      const user = await user_model.verify_credentials('auth@example.com', 'WrongPassword123!')
      
      expect(user).toBeNull()
    })

    it('should reject non-existent email', async () => {
      const user = await user_model.verify_credentials('nonexistent@example.com', 'AuthPassword123!')
      
      expect(user).toBeNull()
    })

    it('should normalize email during authentication', async () => {
      const user = await user_model.verify_credentials('  AUTH@EXAMPLE.COM  ', 'AuthPassword123!')
      
      expect(user).toBeDefined()
      expect(user?.email).toBe('auth@example.com')
    })
  })

  describe('User Updates', () => {
    let test_user_id: string

    beforeEach(async () => {
      const user = await user_model.create_user({
        email: 'update@example.com',
        password: 'OriginalPassword123!',
        is_admin: false,
      })
      test_user_id = user.id
    })

    it('should update user email', async () => {
      const update_input: UpdateUserInput = {
        email: 'newemail@example.com',
      }

      const updated_user = await user_model.update_user(test_user_id, update_input)
      
      expect(updated_user.email).toBe('newemail@example.com')
      expect(updated_user.updated_at).toBeInstanceOf(Date)
    })

    it('should update user password', async () => {
      const update_input: UpdateUserInput = {
        password: 'NewPassword123!',
      }

      const updated_user = await user_model.update_user(test_user_id, update_input)
      
      // Verify new password works
      const auth_user = await user_model.verify_credentials('update@example.com', 'NewPassword123!')
      expect(auth_user).toBeDefined()
      
      // Verify old password doesn't work
      const old_auth = await user_model.verify_credentials('update@example.com', 'OriginalPassword123!')
      expect(old_auth).toBeNull()
    })

    it('should update admin status', async () => {
      const update_input: UpdateUserInput = {
        is_admin: true,
      }

      const updated_user = await user_model.update_user(test_user_id, update_input)
      expect(updated_user.is_admin).toBe(true)
    })

    it('should reject duplicate email updates', async () => {
      // Create another user
      await user_model.create_user({
        email: 'existing@example.com',
        password: 'Password123!',
      })

      // Try to update first user to existing email
      const update_input: UpdateUserInput = {
        email: 'existing@example.com',
      }

      await expect(
        user_model.update_user(test_user_id, update_input)
      ).rejects.toThrow('Email already exists')
    })

    it('should reject invalid password updates', async () => {
      const update_input: UpdateUserInput = {
        password: 'weak', // Invalid password
      }

      await expect(
        user_model.update_user(test_user_id, update_input)
      ).rejects.toThrow('Invalid password')
    })

    it('should handle non-existent user updates', async () => {
      const fake_id = crypto.randomUUID()
      const update_input: UpdateUserInput = {
        email: 'new@example.com',
      }

      await expect(
        user_model.update_user(fake_id, update_input)
      ).rejects.toThrow('User not found')
    })
  })

  describe('Password Reset', () => {
    let test_user_id: string

    beforeEach(async () => {
      const user = await user_model.create_user({
        email: 'reset@example.com',
        password: 'OriginalPassword123!',
      })
      test_user_id = user.id
    })

    it('should create password reset token', async () => {
      const reset_token = await user_model.create_password_reset_token('reset@example.com')
      
      expect(reset_token).toBeDefined()
      expect(typeof reset_token).toBe('string')
      expect(reset_token.length).toBe(64) // 32 bytes = 64 hex chars
    })

    it('should verify valid reset token', async () => {
      const reset_token = await user_model.create_password_reset_token('reset@example.com')
      const user = await user_model.verify_password_reset_token(reset_token)
      
      expect(user).toBeDefined()
      expect(user?.email).toBe('reset@example.com')
    })

    it('should reject invalid reset token', async () => {
      const fake_token = 'invalid-token-12345'
      const user = await user_model.verify_password_reset_token(fake_token)
      
      expect(user).toBeNull()
    })

    it('should complete password reset', async () => {
      const reset_token = await user_model.create_password_reset_token('reset@example.com')
      const success = await user_model.complete_password_reset(reset_token, 'NewResetPassword123!')
      
      expect(success).toBe(true)
      
      // Verify new password works
      const auth_user = await user_model.verify_credentials('reset@example.com', 'NewResetPassword123!')
      expect(auth_user).toBeDefined()
      
      // Verify old password doesn't work
      const old_auth = await user_model.verify_credentials('reset@example.com', 'OriginalPassword123!')
      expect(old_auth).toBeNull()
    })

    it('should prevent token reuse', async () => {
      const reset_token = await user_model.create_password_reset_token('reset@example.com')
      
      // First use should succeed
      const first_reset = await user_model.complete_password_reset(reset_token, 'FirstReset123!')
      expect(first_reset).toBe(true)
      
      // Second use should fail
      const second_reset = await user_model.complete_password_reset(reset_token, 'SecondReset123!')
      expect(second_reset).toBe(false)
    })

    it('should clean up old tokens when creating new ones', async () => {
      // Create first token
      const first_token = await user_model.create_password_reset_token('reset@example.com')
      
      // Create second token (should clean up first)
      const second_token = await user_model.create_password_reset_token('reset@example.com')
      
      // First token should no longer be valid
      const first_user = await user_model.verify_password_reset_token(first_token)
      expect(first_user).toBeNull()
      
      // Second token should be valid
      const second_user = await user_model.verify_password_reset_token(second_token)
      expect(second_user).toBeDefined()
    })

    it('should handle reset for non-existent email gracefully', async () => {
      await expect(
        user_model.create_password_reset_token('nonexistent@example.com')
      ).rejects.toThrow('If account exists, reset email will be sent')
    })
  })

  describe('User Management', () => {
    it('should list users with pagination', async () => {
      // Create multiple users
      const users_data = [
        { email: 'user1@example.com', password: 'Password123!' },
        { email: 'user2@example.com', password: 'Password123!' },
        { email: 'user3@example.com', password: 'Password123!' },
      ]

      for (const user_data of users_data) {
        await user_model.create_user(user_data)
      }

      const result = await user_model.list_users(1, 2)
      
      expect(result.users).toHaveLength(2)
      expect(result.total).toBe(3)
      expect(result.users[0].email).toBe('user1@example.com') // Ordered by created_at
    })

    it('should delete user successfully', async () => {
      const user = await user_model.create_user({
        email: 'delete@example.com',
        password: 'Password123!',
      })

      const deleted = await user_model.delete_user(user.id)
      expect(deleted).toBe(true)

      const found_user = await user_model.find_by_id(user.id)
      expect(found_user).toBeUndefined()
    })

    it('should return false when deleting non-existent user', async () => {
      const fake_id = crypto.randomUUID()
      const deleted = await user_model.delete_user(fake_id)
      expect(deleted).toBe(false)
    })

    it('should sanitize user data for API responses', async () => {
      const user = await user_model.create_user({
        email: 'sanitize@example.com',
        password: 'Password123!',
      })

      const sanitized = user_model.sanitize_user(user)
      
      expect(sanitized).toBeDefined()
      expect(sanitized.email).toBe('sanitize@example.com')
      expect('password_hash' in sanitized).toBe(false)
    })
  })
})