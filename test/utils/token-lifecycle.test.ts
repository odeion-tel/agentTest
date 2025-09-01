import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  create_auth_token,
  create_refresh_token, 
  verify_jwe_token,
  is_token_expired,
  generate_jwe_key,
  type TokenUserData,
  type AuthTokenPayload,
  type RefreshTokenPayload,
} from '../../src/utils/jwe'

describe('Token Lifecycle Management - Pure Functions', () => {
  const TEST_SECRET = 'test-secret-32-chars-minimum-length'
  const TEST_USER: TokenUserData = {
    id: '123',
    email: 'test@example.com',
    is_admin: false,
  }

  beforeEach(() => {
    vi.useRealTimers()
  })

  describe('Token Expiration Validation - Golden Path + Invariants', () => {
    it('should correctly identify expired tokens', () => {
      const expiredPayload: AuthTokenPayload = {
        user_id: '123',
        email: 'test@example.com',
        is_admin: false,
        type: 'auth',
        iat: Math.floor(Date.now() / 1000) - 7200, // 2 hours ago
        exp: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago (expired)
        jti: 'test-token-id',
      }
      
      expect(is_token_expired(expiredPayload)).toBe(true)
    })

    it('should correctly identify valid tokens', () => {
      const validPayload: AuthTokenPayload = {
        user_id: '123',
        email: 'test@example.com',
        is_admin: false,
        type: 'auth',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
        jti: 'test-token-id',
      }
      
      expect(is_token_expired(validPayload)).toBe(false)
    })
  })

  describe('End-to-End Token Lifecycle - Cryptographic Integrity', () => {
    it('should create and verify auth tokens successfully', async () => {
      const token = await create_auth_token(TEST_USER, TEST_SECRET)
      const payload = await verify_jwe_token(token, TEST_SECRET) as AuthTokenPayload
      
      expect(payload.user_id).toBe(TEST_USER.id)
      expect(payload.email).toBe(TEST_USER.email)
      expect(payload.is_admin).toBe(TEST_USER.is_admin)
      expect(payload.type).toBe('auth')
      expect(is_token_expired(payload)).toBe(false)
    })

    it('should create and verify refresh tokens successfully', async () => {
      const token = await create_refresh_token(TEST_USER, TEST_SECRET)
      const payload = await verify_jwe_token(token, TEST_SECRET) as RefreshTokenPayload
      
      expect(payload.user_id).toBe(TEST_USER.id)
      expect(payload.is_admin).toBe(TEST_USER.is_admin)
      expect(payload.type).toBe('refresh')
      expect(is_token_expired(payload)).toBe(false)
    })
  })

  describe('Security Boundary Enforcement - Invariants', () => {
    it('should reject tokens created with different secrets', async () => {
      const token = await create_auth_token(TEST_USER, TEST_SECRET)
      const wrongSecret = 'wrong-secret-32-chars-minimum-len'
      
      await expect(verify_jwe_token(token, wrongSecret)).rejects.toThrow('Token verification failed')
    })

    it('should reject tampered tokens', async () => {
      const token = await create_auth_token(TEST_USER, TEST_SECRET)
      const tamperedToken = token.slice(0, -10) + 'tampered123'
      
      await expect(verify_jwe_token(tamperedToken, TEST_SECRET)).rejects.toThrow('Token verification failed')
    })

    it('should enforce token expiration with time manipulation', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2024-01-01T00:00:00Z'))
      
      const token = await create_auth_token(TEST_USER, TEST_SECRET)
      
      // Move time forward past token expiration (1 hour + buffer)
      vi.setSystemTime(new Date('2024-01-01T02:00:00Z'))
      
      await expect(verify_jwe_token(token, TEST_SECRET)).rejects.toThrow('Token verification failed')
      
      vi.useRealTimers()
    })
  })

  describe('Contract Tests - Security Scenarios', () => {
    // Table-driven tests for core security boundaries
    it.each([
      ['Valid auth token', TEST_SECRET, 'auth', true],
      ['Valid refresh token', TEST_SECRET, 'refresh', true],
      ['Invalid secret length', 'short', 'auth', false],
      ['Empty secret', '', 'auth', false],
    ])('should handle %s creation: %s', async (scenario, secret, tokenType, shouldSucceed) => {
      if (shouldSucceed) {
        if (tokenType === 'auth') {
          const token = await create_auth_token(TEST_USER, secret)
          const payload = await verify_jwe_token(token, secret)
          expect(payload.type).toBe('auth')
        } else {
          const token = await create_refresh_token(TEST_USER, secret)
          const payload = await verify_jwe_token(token, secret)
          expect(payload.type).toBe('refresh')
        }
      } else {
        if (tokenType === 'auth') {
          await expect(create_auth_token(TEST_USER, secret)).rejects.toThrow()
        } else {
          await expect(create_refresh_token(TEST_USER, secret)).rejects.toThrow()
        }
      }
    })
  })

  describe('Time-Based Security Tests', () => {
    it('should handle boundary cases for token expiration', () => {
      const now = Math.floor(Date.now() / 1000)
      
      // Exactly at expiration time
      const exactlyExpired: AuthTokenPayload = {
        user_id: '123',
        email: 'test@example.com',
        is_admin: false,
        type: 'auth',
        iat: now - 3600,
        exp: now, // Expires exactly now
        jti: 'test-id',
      }
      
      expect(is_token_expired(exactlyExpired)).toBe(true)
      
      // One second before expiration
      const almostExpired: AuthTokenPayload = {
        ...exactlyExpired,
        exp: now + 1, // Expires in 1 second
      }
      
      expect(is_token_expired(almostExpired)).toBe(false)
    })
  })
})