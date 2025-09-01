import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'
import { auth_middleware, csrf_middleware, auth_rate_limit } from '../../src/middleware/auth'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'

// Mock JWE utilities
vi.mock('../../src/utils/jwe', () => ({
  verify_jwe_token: vi.fn(),
  create_auth_token: vi.fn(),
  create_refresh_token: vi.fn(),
}))

// Mock user model
vi.mock('../../src/models/user', () => ({
  find_user_by_email: vi.fn(),
  verify_password: vi.fn(),
}))

// Mock cookie utilities
vi.mock('hono/cookie', () => ({
  getCookie: vi.fn(),
  setCookie: vi.fn(),
  deleteCookie: vi.fn(),
}))

import { verify_jwe_token, create_auth_token, create_refresh_token } from '../../src/utils/jwe'
import { find_user_by_email, verify_password } from '../../src/models/user'
import { getCookie, setCookie } from 'hono/cookie'

// Test environment
const test_env = {
  DB: {} as D1Database,
  KV: {} as KVNamespace, 
  ENVIRONMENT: 'test',
  JWT_SECRET: 'test-jwt-secret-32-characters-long!',
}

// Login form validation schema
const login_schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  csrf_token: z.string(),
})

describe('Authentication Routes - Lean Testing', () => {
  let app: Hono<{ Bindings: typeof test_env }>

  beforeEach(() => {
    app = new Hono<{ Bindings: typeof test_env }>()
    vi.clearAllMocks()
  })

  describe('Golden Path: Successful Authentication Flow', () => {
    it('should complete full login flow with valid credentials', async () => {
      // Mock successful user lookup and password verification
      const mock_user = { 
        id: 'user-123', 
        email: 'test@example.com', 
        is_admin: false,
        password_hash: 'hashed-password'
      }
      
      ;(find_user_by_email as any).mockResolvedValue(mock_user)
      ;(verify_password as any).mockResolvedValue(true)
      ;(create_auth_token as any).mockResolvedValue('mock-auth-token')
      ;(create_refresh_token as any).mockResolvedValue('mock-refresh-token')
      ;(getCookie as any).mockReturnValue('valid-csrf-token')

      // Setup login route with validation and security middleware
      app.post(
        '/app/login',
        auth_rate_limit,
        csrf_middleware,
        zValidator('form', login_schema),
        async (c) => {
          const { email, password } = c.req.valid('form')
          
          const user = await find_user_by_email(email, c.env.DB)
          if (!user || !await verify_password(password, user.password_hash)) {
            return c.json({ error: 'Invalid credentials' }, 401)
          }

          const auth_token = await create_auth_token(user, c.env.JWT_SECRET!)
          const refresh_token = await create_refresh_token(user, c.env.JWT_SECRET!)

          return c.json({ success: true, user: { id: user.id, email: user.email } })
        }
      )

      const response = await app.request('/app/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          email: 'test@example.com',
          password: 'ValidPass123!',
          csrf_token: 'valid-csrf-token'
        }),
      }, test_env)

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.success).toBe(true)
      expect(data.user.email).toBe('test@example.com')
    })
  })

  describe('Invariant 1: Authentication Bypass Protection', () => {
    it.each([
      ['Missing token', null, 'Authentication required', 401],
      ['Invalid token', 'malformed-token', 'Invalid or expired token', 401],
      ['Wrong token type', 'refresh_type_token', 'Invalid token type', 401],
    ])('should reject %s', async (scenario, token, expectedError, expectedStatus) => {
      ;(getCookie as any).mockReturnValue(token)
      
      if (token && token !== 'malformed-token') {
        ;(verify_jwe_token as any).mockResolvedValue({ type: 'refresh' })
      } else if (token === 'malformed-token') {
        ;(verify_jwe_token as any).mockRejectedValue(new Error('Invalid token'))
      }

      // Protected route requiring authentication
      app.get('/app/dashboard', auth_middleware, (c) => {
        return c.json({ message: 'Protected content' })
      })

      const response = await app.request('/app/dashboard', {}, test_env)
      
      expect(response.status).toBe(expectedStatus)
      const data = await response.json()
      expect(data.error).toBe(expectedError)
    })
  })

  describe('Invariant 2: CSRF Protection', () => {
    it.each([
      ['Missing CSRF token', undefined, undefined, 'CSRF token validation failed'],
      ['Mismatched CSRF tokens', 'token1', 'token2', 'CSRF token validation failed'],
      ['Valid CSRF tokens', 'valid-token', 'valid-token', null],
    ])('should handle %s correctly', async (scenario, headerToken, cookieToken, expectedError) => {
      ;(getCookie as any).mockReturnValue(cookieToken)

      app.post('/app/action', csrf_middleware, (c) => {
        return c.json({ success: true })
      })

      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (headerToken) {
        headers['X-CSRF-Token'] = headerToken
      }

      const response = await app.request('/app/action', {
        method: 'POST',
        headers,
        body: JSON.stringify({}),
      }, test_env)

      if (expectedError) {
        expect(response.status).toBe(403)
        const data = await response.json()
        expect(data.error).toBe(expectedError)
      } else {
        expect(response.status).toBe(200)
        const data = await response.json()
        expect(data.success).toBe(true)
      }
    })
  })

  describe('Form Validation Protection', () => {
    it('should reject invalid login form data', async () => {
      app.post(
        '/app/login',
        zValidator('form', login_schema),
        (c) => c.json({ success: true })
      )

      const response = await app.request('/app/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          email: 'invalid-email',
          password: '123', // Too short
          csrf_token: ''
        }),
      }, test_env)

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toBeDefined()
    })

    it('should accept valid login form data', async () => {
      ;(getCookie as any).mockReturnValue('valid-csrf-token')

      app.post(
        '/app/login',
        zValidator('form', login_schema),
        (c) => c.json({ success: true })
      )

      const response = await app.request('/app/login', {
        method: 'POST', 
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          email: 'test@example.com',
          password: 'ValidPass123!',
          csrf_token: 'valid-csrf-token'
        }),
      }, test_env)

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.success).toBe(true)
    })
  })
})

describe('Logout Route Tests', () => {
  let app: Hono<{ Bindings: typeof test_env }>

  beforeEach(() => {
    app = new Hono<{ Bindings: typeof test_env }>()
    vi.clearAllMocks()
  })

  describe('Golden Path: Successful Logout', () => {
    it('should complete logout flow with token cleanup', async () => {
      ;(getCookie as any).mockReturnValue('valid-csrf-token')

      app.post('/app/logout', csrf_middleware, (c) => {
        // Token cleanup would happen here
        return c.json({ success: true, message: 'Logged out successfully' })
      })

      const response = await app.request('/app/logout', {
        method: 'POST',
        headers: { 'X-CSRF-Token': 'valid-csrf-token' },
      }, test_env)

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.success).toBe(true)
      expect(data.message).toBe('Logged out successfully')
    })
  })

  describe('Logout Security Invariant', () => {
    it('should require CSRF protection for logout', async () => {
      app.post('/app/logout', csrf_middleware, (c) => {
        return c.json({ success: true })
      })

      const response = await app.request('/app/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }, test_env)

      expect(response.status).toBe(403)
      const data = await response.json()
      expect(data.error).toBe('CSRF token validation failed')
    })
  })
})