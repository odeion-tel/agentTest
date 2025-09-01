import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'
import { setCookie } from 'hono/cookie'
import { create_auth_token, create_refresh_token, type TokenUserData } from '../../src/utils/jwe'
import { auth_middleware, admin_middleware, refresh_middleware } from '../../src/middleware/auth'

describe('Authentication Flow Integration', () => {
  const TEST_SECRET = 'test-secret-32-chars-minimum-length'
  const TEST_USER: TokenUserData = {
    id: 'user_123',
    email: 'test@example.com',
    is_admin: false,
  }
  const ADMIN_USER: TokenUserData = {
    id: 'admin_456', 
    email: 'admin@example.com',
    is_admin: true,
  }

  let app: Hono

  beforeEach(() => {
    app = new Hono()
    vi.useRealTimers()
  })

  describe('End-to-End Authentication Flow - Golden Path', () => {
    it('should complete full auth flow: token creation → middleware validation → protected access', async () => {
      // Data layer: Create real token with real user data
      const authToken = await create_auth_token(TEST_USER, TEST_SECRET)
      expect(authToken).toBeTypeOf('string')
      expect(authToken.split('.')).toHaveLength(5) // JWE format
      
      // Setup protected route with auth middleware
      app.use('/protected/*', auth_middleware)
      app.get('/protected/data', (c) => {
        const user = c.get('user')
        return c.json({ message: 'success', user_id: user.user_id })
      })

      // Test request with real token
      const request = new Request('http://localhost/protected/data', {
        headers: { Cookie: `auth_token=${authToken}` }
      })
      
      const env = { JWT_SECRET: TEST_SECRET }
      const response = await app.fetch(request, env)
      const data = await response.json()
      
      expect(response.status).toBe(200)
      expect(data.message).toBe('success')
      expect(data.user_id).toBe(TEST_USER.id)
    })
  })

  describe('Database Integration Resilience - Invariant 1', () => {
    it('should work when JWT_SECRET is available', async () => {
      const authToken = await create_auth_token(TEST_USER, TEST_SECRET)
      
      app.use('/test/*', auth_middleware)
      app.get('/test/endpoint', (c) => c.json({ status: 'ok' }))

      const request = new Request('http://localhost/test/endpoint', {
        headers: { Cookie: `auth_token=${authToken}` }
      })
      
      const response = await app.fetch(request, { JWT_SECRET: TEST_SECRET })
      
      expect(response.status).toBe(200)
    })

    it('should fail gracefully when JWT_SECRET is missing', async () => {
      const authToken = await create_auth_token(TEST_USER, TEST_SECRET)
      
      app.use('/test/*', auth_middleware)
      app.get('/test/endpoint', (c) => c.json({ status: 'ok' }))

      const request = new Request('http://localhost/test/endpoint', {
        headers: { Cookie: `auth_token=${authToken}` }
      })
      
      const response = await app.fetch(request, {}) // No JWT_SECRET
      
      expect(response.status).toBe(500)
    })
  })

  describe('Token-Middleware Coordination - Invariant 2', () => {
    it('should process real JWE tokens correctly in middleware chain', async () => {
      const adminToken = await create_auth_token(ADMIN_USER, TEST_SECRET)
      
      app.use('/admin/*', auth_middleware)
      app.use('/admin/*', admin_middleware)
      app.get('/admin/panel', (c) => {
        const user = c.get('user')
        const isAdmin = c.get('is_admin')
        return c.json({ user_id: user.user_id, is_admin: isAdmin })
      })

      const request = new Request('http://localhost/admin/panel', {
        headers: { Cookie: `auth_token=${adminToken}` }
      })
      
      const response = await app.fetch(request, { JWT_SECRET: TEST_SECRET })
      const data = await response.json()
      
      expect(response.status).toBe(200)
      expect(data.user_id).toBe(ADMIN_USER.id)
      expect(data.is_admin).toBe(true)
    })

    it('should reject refresh tokens in auth middleware', async () => {
      const refreshToken = await create_refresh_token(TEST_USER, TEST_SECRET)
      
      app.use('/protected/*', auth_middleware)
      app.get('/protected/data', (c) => c.json({ status: 'ok' }))

      const request = new Request('http://localhost/protected/data', {
        headers: { Cookie: `auth_token=${refreshToken}` } // Wrong token type
      })
      
      const response = await app.fetch(request, { JWT_SECRET: TEST_SECRET })
      
      expect(response.status).toBe(401)
    })

    it('should validate refresh tokens in refresh middleware', async () => {
      const refreshToken = await create_refresh_token(TEST_USER, TEST_SECRET)
      
      app.use('/refresh/*', refresh_middleware)
      app.get('/refresh/tokens', (c) => {
        const refreshUser = c.get('refresh_user')
        return c.json({ user_id: refreshUser.user_id })
      })

      const request = new Request('http://localhost/refresh/tokens', {
        headers: { Cookie: `refresh_token=${refreshToken}` }
      })
      
      const response = await app.fetch(request, { JWT_SECRET: TEST_SECRET })
      const data = await response.json()
      
      expect(response.status).toBe(200)
      expect(data.user_id).toBe(TEST_USER.id)
    })
  })

  describe('Contract Tests - Critical Integration Scenarios', () => {
    // Table-driven tests for real token + real middleware scenarios
    it.each([
      ['Valid auth flow', 'auth', 'auth_middleware', 200],
      ['Valid refresh flow', 'refresh', 'refresh_middleware', 200], 
      ['Wrong token type', 'refresh', 'auth_middleware', 401],
      ['Missing token', null, 'auth_middleware', 401],
    ])('should handle %s correctly', async (scenario, tokenType, middlewareType, expectedStatus) => {
      let token: string | null = null
      
      if (tokenType === 'auth') {
        token = await create_auth_token(TEST_USER, TEST_SECRET)
      } else if (tokenType === 'refresh') {
        token = await create_refresh_token(TEST_USER, TEST_SECRET)
      }

      if (middlewareType === 'auth_middleware') {
        app.use('/test/*', auth_middleware)
      } else {
        app.use('/test/*', refresh_middleware)
      }
      
      app.get('/test/endpoint', (c) => c.json({ status: 'ok' }))

      const headers: Record<string, string> = {}
      if (token) {
        const cookieName = middlewareType === 'auth_middleware' ? 'auth_token' : 'refresh_token'
        headers.Cookie = `${cookieName}=${token}`
      }

      const request = new Request('http://localhost/test/endpoint', { headers })
      const response = await app.fetch(request, { JWT_SECRET: TEST_SECRET })
      
      expect(response.status).toBe(expectedStatus)
    })
  })
})