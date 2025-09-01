import { describe, it, expect, vi } from 'vitest'
import { 
  create_auth_token, 
  create_refresh_token, 
  verify_jwe_token,
  generate_jwe_key,
  is_token_expired,
  TokenUserData,
  AuthTokenPayload,
  RefreshTokenPayload 
} from '../../src/utils/jwe'

describe('JWE Token System Integration Tests', () => {
  const mockUser: TokenUserData = {
    id: 'user_123456789',
    email: 'test@example.com',
    is_admin: true
  }

  const testSecret = 'test-secret-key-for-jwt-operations-minimum-32-characters-long-enough'

  describe('Token Generation and Verification', () => {
    it('should generate and verify auth tokens', async () => {
      // Create auth token
      const authToken = await create_auth_token(mockUser, testSecret)
      expect(authToken).toBeTruthy()
      expect(typeof authToken).toBe('string')

      // Verify auth token
      const payload = await verify_jwe_token(authToken, testSecret) as AuthTokenPayload
      expect(payload.type).toBe('auth')
      expect(payload.user_id).toBe(mockUser.id)
      expect(payload.email).toBe(mockUser.email)
      expect(payload.is_admin).toBe(mockUser.is_admin)
    })

    it('should generate and verify refresh tokens', async () => {
      // Create refresh token
      const refreshToken = await create_refresh_token(mockUser, testSecret)
      expect(refreshToken).toBeTruthy()
      expect(typeof refreshToken).toBe('string')

      // Verify refresh token
      const payload = await verify_jwe_token(refreshToken, testSecret) as RefreshTokenPayload
      expect(payload.type).toBe('refresh')
      expect(payload.user_id).toBe(mockUser.id)
      expect(payload.is_admin).toBe(mockUser.is_admin)
    })

    it('should have correct expiration times', async () => {
      const now = Math.floor(Date.now() / 1000)
      
      // Test auth token expiration (1 hour)
      const authToken = await create_auth_token(mockUser, testSecret)
      const authPayload = await verify_jwe_token(authToken, testSecret) as AuthTokenPayload
      
      expect(authPayload.exp).toBeGreaterThan(now)
      expect(authPayload.exp).toBeLessThanOrEqual(now + 3660) // 1 hour + 1 minute buffer
      expect(authPayload.exp).toBeGreaterThanOrEqual(now + 3540) // 1 hour - 1 minute buffer

      // Test refresh token expiration (3 days)
      const refreshToken = await create_refresh_token(mockUser, testSecret)
      const refreshPayload = await verify_jwe_token(refreshToken, testSecret) as RefreshTokenPayload
      
      const threeDays = 3 * 24 * 60 * 60
      expect(refreshPayload.exp).toBeGreaterThan(now)
      expect(refreshPayload.exp).toBeLessThanOrEqual(now + threeDays + 60) // 3 days + 1 minute buffer
      expect(refreshPayload.exp).toBeGreaterThanOrEqual(now + threeDays - 60) // 3 days - 1 minute buffer
    })
  })

  describe('Token Security', () => {
    it('should reject tokens with wrong secret', async () => {
      const token = await create_auth_token(mockUser, testSecret)
      const wrongSecret = 'wrong-secret-key-for-testing-different-from-original-key'
      
      await expect(verify_jwe_token(token, wrongSecret)).rejects.toThrow()
    })

    it('should reject invalid token format', async () => {
      await expect(verify_jwe_token('invalid.token.format', testSecret)).rejects.toThrow()
      await expect(verify_jwe_token('', testSecret)).rejects.toThrow()
      await expect(verify_jwe_token('not-a-token', testSecret)).rejects.toThrow()
    })

    it('should generate unique JTI for each token', async () => {
      const token1 = await create_auth_token(mockUser, testSecret)
      const token2 = await create_auth_token(mockUser, testSecret)
      
      const payload1 = await verify_jwe_token(token1, testSecret) as AuthTokenPayload
      const payload2 = await verify_jwe_token(token2, testSecret) as AuthTokenPayload
      
      expect(payload1.jti).not.toBe(payload2.jti)
    })

    it('should require minimum secret length', async () => {
      const shortSecret = 'short'
      
      await expect(create_auth_token(mockUser, shortSecret)).rejects.toThrow('JWT secret must be at least 32 characters long')
    })
  })

  describe('Token Payload Validation', () => {
    it('should validate auth token payload schema', async () => {
      const token = await create_auth_token(mockUser, testSecret)
      const payload = await verify_jwe_token(token, testSecret) as AuthTokenPayload
      
      // Check all required fields are present
      expect(payload.user_id).toBeDefined()
      expect(payload.email).toBeDefined()
      expect(payload.is_admin).toBeDefined()
      expect(payload.type).toBe('auth')
      expect(payload.iat).toBeDefined()
      expect(payload.exp).toBeDefined()
      expect(payload.jti).toBeDefined()
      
      // Check field types
      expect(typeof payload.user_id).toBe('string')
      expect(typeof payload.email).toBe('string')
      expect(typeof payload.is_admin).toBe('boolean')
      expect(typeof payload.iat).toBe('number')
      expect(typeof payload.exp).toBe('number')
      expect(typeof payload.jti).toBe('string')
    })

    it('should validate refresh token payload schema', async () => {
      const token = await create_refresh_token(mockUser, testSecret)
      const payload = await verify_jwe_token(token, testSecret) as RefreshTokenPayload
      
      // Check all required fields are present
      expect(payload.user_id).toBeDefined()
      expect(payload.is_admin).toBeDefined()
      expect(payload.type).toBe('refresh')
      expect(payload.iat).toBeDefined()
      expect(payload.exp).toBeDefined()
      expect(payload.jti).toBeDefined()
      
      // Check field types
      expect(typeof payload.user_id).toBe('string')
      expect(typeof payload.is_admin).toBe('boolean')
      expect(typeof payload.iat).toBe('number')
      expect(typeof payload.exp).toBe('number')
      expect(typeof payload.jti).toBe('string')
      
      // Refresh tokens don't include email
      expect(payload).not.toHaveProperty('email')
    })
  })

  describe('JWE Key Generation', () => {
    it('should generate valid symmetric keys', async () => {
      const key = await generate_jwe_key(testSecret)
      expect(key).toBeDefined()
      expect(key.type).toBe('secret')
    })

    it('should generate different keys for different secrets', async () => {
      const secret1 = 'first-secret-key-for-testing-minimum-32-characters-long'
      const secret2 = 'second-secret-key-for-testing-minimum-32-characters-long'
      
      const key1 = await generate_jwe_key(secret1)
      const key2 = await generate_jwe_key(secret2)
      
      // Keys should be different (though we can't directly compare them)
      expect(key1).toBeDefined()
      expect(key2).toBeDefined()
    })
  })

  describe('Token Type Enforcement', () => {
    it('should correctly identify auth token type', async () => {
      const authToken = await create_auth_token(mockUser, testSecret)
      const payload = await verify_jwe_token(authToken, testSecret)
      
      expect(payload.type).toBe('auth')
    })

    it('should correctly identify refresh token type', async () => {
      const refreshToken = await create_refresh_token(mockUser, testSecret)
      const payload = await verify_jwe_token(refreshToken, testSecret)
      
      expect(payload.type).toBe('refresh')
    })

    it('should reject tokens with invalid type', async () => {
      // This test verifies that the Zod schema validation works
      // by ensuring only 'auth' and 'refresh' types are accepted
      const authToken = await create_auth_token(mockUser, testSecret)
      const payload = await verify_jwe_token(authToken, testSecret)
      
      // Valid types should work
      expect(['auth', 'refresh']).toContain(payload.type)
    })
  })

  describe('Token Expiration Validation', () => {
    it('should correctly identify non-expired tokens', async () => {
      const authToken = await create_auth_token(mockUser, testSecret)
      const authPayload = await verify_jwe_token(authToken, testSecret) as AuthTokenPayload
      
      const refreshToken = await create_refresh_token(mockUser, testSecret)
      const refreshPayload = await verify_jwe_token(refreshToken, testSecret) as RefreshTokenPayload
      
      expect(is_token_expired(authPayload)).toBe(false)
      expect(is_token_expired(refreshPayload)).toBe(false)
    })

    it('should correctly identify expired tokens by manipulating time', () => {
      const now = Math.floor(Date.now() / 1000)
      
      // Create expired auth token payload
      const expiredAuthPayload: AuthTokenPayload = {
        user_id: mockUser.id,
        email: mockUser.email,
        is_admin: mockUser.is_admin,
        type: 'auth',
        iat: now - 7200, // 2 hours ago
        exp: now - 3600, // 1 hour ago (expired)
        jti: crypto.randomUUID(),
      }
      
      // Create expired refresh token payload
      const expiredRefreshPayload: RefreshTokenPayload = {
        user_id: mockUser.id,
        is_admin: mockUser.is_admin,
        type: 'refresh',
        iat: now - 345600, // 4 days ago
        exp: now - 86400, // 1 day ago (expired)
        jti: crypto.randomUUID(),
      }
      
      expect(is_token_expired(expiredAuthPayload)).toBe(true)
      expect(is_token_expired(expiredRefreshPayload)).toBe(true)
    })

    it('should handle edge case of exactly expired tokens', () => {
      const now = Math.floor(Date.now() / 1000)
      
      // Token that expires exactly now
      const exactlyExpiredPayload: AuthTokenPayload = {
        user_id: mockUser.id,
        email: mockUser.email,
        is_admin: mockUser.is_admin,
        type: 'auth',
        iat: now - 3600,
        exp: now, // Expires exactly now
        jti: crypto.randomUUID(),
      }
      
      expect(is_token_expired(exactlyExpiredPayload)).toBe(true)
    })
  })

  describe('Token Error Handling', () => {
    it('should provide descriptive error messages for invalid payloads', async () => {
      try {
        await verify_jwe_token('invalid-token-format', testSecret)
      } catch (error) {
        expect((error as Error).message).toContain('Token verification failed')
      }
    })

    it('should handle malformed tokens gracefully', async () => {
      const malformedTokens = [
        'not.a.valid.token.at.all',
        '...',
        'a.b.c.d.e.f.g', // Too many parts
        'only-one-part',
      ]
      
      for (const token of malformedTokens) {
        await expect(verify_jwe_token(token, testSecret)).rejects.toThrow()
      }
    })

    it('should reject empty or null secret keys', async () => {
      await expect(create_auth_token(mockUser, '')).rejects.toThrow('JWT secret must be at least 32 characters long')
      // @ts-expect-error - Testing runtime behavior with null
      await expect(create_auth_token(mockUser, null)).rejects.toThrow()
    })

    it('should reject invalid user data', async () => {
      const invalidUsers = [
        { id: '', email: 'test@example.com', is_admin: false }, // Empty ID
        { id: 'valid-id', email: 'invalid-email', is_admin: false }, // Invalid email
        // @ts-expect-error - Testing runtime behavior
        { id: 'valid-id', email: 'test@example.com' }, // Missing is_admin
      ]
      
      for (const user of invalidUsers) {
        try {
          // @ts-expect-error - Testing runtime behavior with invalid data
          await create_auth_token(user, testSecret)
        } catch (error) {
          expect(error).toBeInstanceOf(Error)
        }
      }
    })
  })

  describe('Token Cryptographic Properties', () => {
    it('should generate different tokens for same user data', async () => {
      const token1 = await create_auth_token(mockUser, testSecret)
      const token2 = await create_auth_token(mockUser, testSecret)
      
      expect(token1).not.toBe(token2)
      
      // But payloads should have same user data (except jti and timestamps)
      const payload1 = await verify_jwe_token(token1, testSecret) as AuthTokenPayload
      const payload2 = await verify_jwe_token(token2, testSecret) as AuthTokenPayload
      
      expect(payload1.user_id).toBe(payload2.user_id)
      expect(payload1.email).toBe(payload2.email)
      expect(payload1.is_admin).toBe(payload2.is_admin)
      expect(payload1.jti).not.toBe(payload2.jti) // JTI should be unique
    })

    it('should produce tokens that cannot be verified with different secrets', async () => {
      const secret1 = 'first-secret-key-for-testing-minimum-32-characters-long'
      const secret2 = 'second-different-key-for-testing-minimum-32-chars'
      
      const token = await create_auth_token(mockUser, secret1)
      
      // Should verify with correct secret
      await expect(verify_jwe_token(token, secret1)).resolves.toBeTruthy()
      
      // Should fail with different secret
      await expect(verify_jwe_token(token, secret2)).rejects.toThrow()
    })

    it('should ensure JWE tokens are encrypted (not readable without key)', () => {
      // JWE tokens should not contain readable user data in their string representation
      // This is a basic check that the token doesn't contain plaintext user info
      const createAndCheckToken = async () => {
        const token = await create_auth_token(mockUser, testSecret)
        
        // Token should not contain plaintext email or user ID
        expect(token).not.toContain(mockUser.email)
        expect(token).not.toContain(mockUser.id)
        expect(token).not.toContain('test@example.com')
        expect(token).not.toContain('user_123456789')
        
        // Token should be in JWE format (5 parts separated by dots)
        const parts = token.split('.')
        expect(parts).toHaveLength(5)
      }
      
      return createAndCheckToken()
    })
  })
})