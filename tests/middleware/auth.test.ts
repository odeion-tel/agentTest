import { describe, it, expect, beforeAll } from 'vitest'
import { Hono } from 'hono'
import { getCookie, setCookie } from 'hono/cookie'
import { create_auth_token, create_refresh_token, verify_jwe_token, TokenUserData } from '../../src/utils/jwe'
import type { Env } from '../../src/index'

// Mock environment for testing
const mockEnv: Env = {
  DB: {} as D1Database,
  KV: {} as KVNamespace,
  ENVIRONMENT: 'test',
  JWT_SECRET: 'test-secret-key-for-jwt-operations-minimum-32-characters-long'
}

// Mock user data for testing
const mockUser: TokenUserData = {
  id: 'user_123',
  email: 'test@example.com',
  is_admin: true
}

describe('Auth Middleware Tests', () => {
  let app: Hono<{ Bindings: Env }>
  let authToken: string
  let refreshToken: string

  beforeAll(async () => {
    app = new Hono<{ Bindings: Env }>()
    
    // Create test tokens
    authToken = await create_auth_token(mockUser, mockEnv.JWT_SECRET!)
    refreshToken = await create_refresh_token(mockUser, mockEnv.JWT_SECRET!)
  })

  describe('JWE Token Generation', () => {
    it('should create valid auth token with embedded user data', async () => {
      const token = await create_auth_token(mockUser, mockEnv.JWT_SECRET!)
      expect(token).toBeTruthy()
      expect(typeof token).toBe('string')
      expect(token.split('.')).toHaveLength(5) // JWE format: header.encrypted_key.iv.ciphertext.tag
    })

    it('should create valid refresh token with embedded user data', async () => {
      const token = await create_refresh_token(mockUser, mockEnv.JWT_SECRET!)
      expect(token).toBeTruthy()
      expect(typeof token).toBe('string')
      expect(token.split('.')).toHaveLength(5) // JWE format
    })

    it('should embed correct user data in auth token', async () => {
      const token = await create_auth_token(mockUser, mockEnv.JWT_SECRET!)
      const payload = await verify_jwe_token(token, mockEnv.JWT_SECRET!)
      
      expect(payload.user_id).toBe(mockUser.id)
      expect(payload.email).toBe(mockUser.email)
      expect(payload.is_admin).toBe(mockUser.is_admin)
      expect(payload.type).toBe('auth')
    })

    it('should embed correct user data in refresh token', async () => {
      const token = await create_refresh_token(mockUser, mockEnv.JWT_SECRET!)
      const payload = await verify_jwe_token(token, mockEnv.JWT_SECRET!)
      
      expect(payload.user_id).toBe(mockUser.id)
      expect(payload.is_admin).toBe(mockUser.is_admin)
      expect(payload.type).toBe('refresh')
      // Refresh tokens should NOT include email for security
      expect(payload).not.toHaveProperty('email')
    })
  })

  describe('JWE Token Validation', () => {
    it('should validate correct auth token', async () => {
      const payload = await verify_jwe_token(authToken, mockEnv.JWT_SECRET!)
      expect(payload).toBeTruthy()
      expect(payload.user_id).toBe(mockUser.id)
      expect(payload.type).toBe('auth')
    })

    it('should validate correct refresh token', async () => {
      const payload = await verify_jwe_token(refreshToken, mockEnv.JWT_SECRET!)
      expect(payload).toBeTruthy()
      expect(payload.user_id).toBe(mockUser.id)
      expect(payload.type).toBe('refresh')
    })

    it('should reject invalid token format', async () => {
      await expect(
        verify_jwe_token('invalid-token', mockEnv.JWT_SECRET!)
      ).rejects.toThrow()
    })

    it('should reject token with wrong secret', async () => {
      await expect(
        verify_jwe_token(authToken, 'wrong-secret-key-different-from-original')
      ).rejects.toThrow()
    })

    it('should reject empty token', async () => {
      await expect(
        verify_jwe_token('', mockEnv.JWT_SECRET!)
      ).rejects.toThrow()
    })
  })

  describe('Token Expiration', () => {
    it('should create auth token with 1 hour expiration', async () => {
      const token = await create_auth_token(mockUser, mockEnv.JWT_SECRET!)
      const payload = await verify_jwe_token(token, mockEnv.JWT_SECRET!)
      
      const now = Math.floor(Date.now() / 1000)
      const expectedExp = now + (60 * 60) // 1 hour
      
      // Allow 5 second tolerance for test execution time
      expect(payload.exp).toBeGreaterThanOrEqual(expectedExp - 5)
      expect(payload.exp).toBeLessThanOrEqual(expectedExp + 5)
    })

    it('should create refresh token with 3 day expiration', async () => {
      const token = await create_refresh_token(mockUser, mockEnv.JWT_SECRET!)
      const payload = await verify_jwe_token(token, mockEnv.JWT_SECRET!)
      
      const now = Math.floor(Date.now() / 1000)
      const expectedExp = now + (3 * 24 * 60 * 60) // 3 days
      
      // Allow 5 second tolerance for test execution time
      expect(payload.exp).toBeGreaterThanOrEqual(expectedExp - 5)
      expect(payload.exp).toBeLessThanOrEqual(expectedExp + 5)
    })

    it('should reject expired token', async () => {
      // Create a token with very short expiration (1 second ago)
      // by temporarily modifying the creation function
      const originalDateNow = Date.now
      const pastTime = Date.now() - 10000 // 10 seconds ago
      
      Date.now = () => pastTime
      
      try {
        const expiredToken = await create_auth_token(mockUser, mockEnv.JWT_SECRET!)
        
        // Restore original Date.now
        Date.now = originalDateNow
        
        // Now try to verify the expired token - this should fail
        await expect(
          verify_jwe_token(expiredToken, mockEnv.JWT_SECRET!)
        ).rejects.toThrow(/expired|exp/)
      } finally {
        // Ensure Date.now is always restored
        Date.now = originalDateNow
      }
    })
  })

  describe('Cookie Management', () => {
    it('should set auth token in HttpOnly cookie', async () => {
      const testApp = new Hono<{ Bindings: Env }>()
      
      testApp.get('/set-auth', async (c) => {
        setCookie(c, 'auth_token', authToken, {
          httpOnly: true,
          secure: true,
          sameSite: 'lax',
          maxAge: 60 * 60 // 1 hour
        })
        return c.text('Cookie set')
      })

      const req = new Request('http://localhost/set-auth')
      const res = await testApp.fetch(req, mockEnv)
      
      const setCookieHeader = res.headers.get('Set-Cookie')
      expect(setCookieHeader).toContain('auth_token=')
      expect(setCookieHeader).toContain('HttpOnly')
      expect(setCookieHeader).toContain('Secure')
      expect(setCookieHeader).toContain('SameSite=Lax')
    })

    it('should set refresh token in HttpOnly cookie', async () => {
      const testApp = new Hono<{ Bindings: Env }>()
      
      testApp.get('/set-refresh', async (c) => {
        setCookie(c, 'refresh_token', refreshToken, {
          httpOnly: true,
          secure: true,
          sameSite: 'lax',
          maxAge: 3 * 24 * 60 * 60 // 3 days
        })
        return c.text('Cookie set')
      })

      const req = new Request('http://localhost/set-refresh')
      const res = await testApp.fetch(req, mockEnv)
      
      const setCookieHeader = res.headers.get('Set-Cookie')
      expect(setCookieHeader).toContain('refresh_token=')
      expect(setCookieHeader).toContain('HttpOnly')
      expect(setCookieHeader).toContain('Secure')
      expect(setCookieHeader).toContain('SameSite=Lax')
    })
  })
})