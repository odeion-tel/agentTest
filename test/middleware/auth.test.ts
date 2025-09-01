import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Context } from 'hono'
import { auth_middleware, admin_middleware, refresh_middleware, optional_auth_middleware, csrf_middleware } from '../../src/middleware/auth'
import * as jwe from '../../src/utils/jwe'

// Mock JWE utilities
vi.mock('../../src/utils/jwe', () => ({
  verify_jwe_token: vi.fn(),
}))

// Mock hono/cookie
vi.mock('hono/cookie', () => ({
  getCookie: vi.fn(),
}))

import { getCookie } from 'hono/cookie'
const mockGetCookie = vi.mocked(getCookie)
const mockVerifyJweToken = vi.mocked(jwe.verify_jwe_token)

// Mock context helper
const createMockContext = (env = { JWT_SECRET: 'test-secret-32-chars-minimum-length' }, method = 'GET') => {
  const mockContext = {
    req: {
      method,
      header: vi.fn(),
      parseBody: vi.fn().mockResolvedValue({}),
    },
    env,
    json: vi.fn().mockReturnValue('mock-response'),
    set: vi.fn(),
    get: vi.fn(),
  } as unknown as Context

  return mockContext
}

const mockNext = vi.fn()

describe('Authentication Middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('auth_middleware - Golden Path + Invariants', () => {
    it('should set user context for valid auth token', async () => {
      const mockPayload = {
        user_id: '123',
        email: 'test@example.com',
        is_admin: false,
        type: 'auth' as const,
        iat: Date.now(),
        exp: Date.now() + 3600000,
        jti: 'token-id',
      }
      mockGetCookie.mockReturnValue('valid-token')
      mockVerifyJweToken.mockResolvedValue(mockPayload)
      
      const context = createMockContext()
      
      await auth_middleware(context, mockNext)
      
      expect(context.set).toHaveBeenCalledWith('user', mockPayload)
      expect(context.set).toHaveBeenCalledWith('is_admin', false)
      expect(mockNext).toHaveBeenCalled()
    })

    // Table-driven contract tests
    it.each([
      ['Missing token', null, 'Authentication required', 401],
      ['Invalid token', 'malformed', 'Invalid or expired token', 401],
      ['Wrong token type', 'refresh_type', 'Invalid token type', 401],
    ])('should handle %s correctly', async (scenario, token, expectedError, expectedStatus) => {
      mockGetCookie.mockReturnValue(token)
      
      if (scenario === 'Invalid token') {
        mockVerifyJweToken.mockRejectedValue(new Error('Token verification failed'))
      } else if (scenario === 'Wrong token type') {
        mockVerifyJweToken.mockResolvedValue({ type: 'refresh' })
      }
      
      const context = createMockContext()
      
      await auth_middleware(context, mockNext)
      
      expect(context.json).toHaveBeenCalledWith({ error: expectedError }, expectedStatus)
      expect(mockNext).not.toHaveBeenCalled()
    })

    it('should return 500 when JWT_SECRET is missing', async () => {
      mockGetCookie.mockReturnValue('valid-token')
      const context = createMockContext({})
      
      await auth_middleware(context, mockNext)
      
      expect(context.json).toHaveBeenCalledWith({ error: 'Server configuration error' }, 500)
      expect(mockNext).not.toHaveBeenCalled()
    })
  })

  describe('admin_middleware - Access Control Invariant', () => {
    it('should allow admin users to proceed', async () => {
      const context = createMockContext()
      context.get = vi.fn().mockReturnValue(true)
      
      await admin_middleware(context, mockNext)
      
      expect(context.get).toHaveBeenCalledWith('is_admin')
      expect(mockNext).toHaveBeenCalled()
    })

    it('should reject non-admin users', async () => {
      const context = createMockContext()
      context.get = vi.fn().mockReturnValue(false)
      context.json = vi.fn().mockReturnValue('error-403')
      
      await admin_middleware(context, mockNext)
      
      expect(context.json).toHaveBeenCalledWith({ error: 'Admin access required' }, 403)
      expect(mockNext).not.toHaveBeenCalled()
    })
  })

  describe('refresh_middleware - Token Type Enforcement', () => {
    it('should accept valid refresh tokens', async () => {
      const mockPayload = {
        user_id: '123',
        is_admin: false,
        type: 'refresh' as const,
        iat: Date.now(),
        exp: Date.now() + 3600000,
        jti: 'refresh-token-id',
      }
      mockGetCookie.mockReturnValue('valid-refresh-token')
      mockVerifyJweToken.mockResolvedValue(mockPayload)
      
      const context = createMockContext()
      
      await refresh_middleware(context, mockNext)
      
      expect(context.set).toHaveBeenCalledWith('refresh_user', mockPayload)
      expect(mockNext).toHaveBeenCalled()
    })

    it('should reject auth tokens in refresh middleware', async () => {
      mockGetCookie.mockReturnValue('auth-token')
      mockVerifyJweToken.mockResolvedValue({ type: 'auth' })
      
      const context = createMockContext()
      
      await refresh_middleware(context, mockNext)
      
      expect(context.json).toHaveBeenCalledWith({ error: 'Invalid token type' }, 401)
      expect(mockNext).not.toHaveBeenCalled()
    })
  })

  describe('optional_auth_middleware - Graceful Degradation', () => {
    it('should continue without token', async () => {
      mockGetCookie.mockReturnValue(null)
      const context = createMockContext()
      
      await optional_auth_middleware(context, mockNext)
      
      expect(mockNext).toHaveBeenCalled()
      expect(context.set).not.toHaveBeenCalled()
    })

    it('should set context for valid token but continue on invalid', async () => {
      mockGetCookie.mockReturnValue('invalid-token')
      mockVerifyJweToken.mockRejectedValue(new Error('Invalid token'))
      
      const context = createMockContext()
      
      await optional_auth_middleware(context, mockNext)
      
      expect(mockNext).toHaveBeenCalled()
    })
  })

  describe('csrf_middleware - State-Change Protection', () => {
    it.each([
      ['POST', true],
      ['PUT', true], 
      ['DELETE', true],
      ['PATCH', true],
      ['GET', false],
      ['HEAD', false],
    ])('should %s require CSRF validation: %s', async (method, requiresCSRF) => {
      const context = createMockContext({}, method)
      
      if (requiresCSRF) {
        mockGetCookie.mockReturnValue(null)
        context.req.header = vi.fn().mockReturnValue(null)
        
        await csrf_middleware(context, mockNext)
        
        expect(context.json).toHaveBeenCalledWith({ error: 'CSRF token validation failed' }, 403)
        expect(mockNext).not.toHaveBeenCalled()
      } else {
        await csrf_middleware(context, mockNext)
        
        expect(mockNext).toHaveBeenCalled()
      }
    })
  })
})