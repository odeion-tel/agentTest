import { createMiddleware } from 'hono/factory'
import { getCookie } from 'hono/cookie'
import { verify_jwe_token, AuthTokenPayload, RefreshTokenPayload } from '../utils/jwe'
import type { Env } from '../index'

// Extend the Hono context to include user data
declare module 'hono' {
  interface ContextVariableMap {
    user: AuthTokenPayload
    is_admin: boolean
    refresh_user: RefreshTokenPayload
    token_expiration_result: any
  }
}

/**
 * Authentication middleware for protected routes
 * Validates JWE tokens from cookies and sets user context
 */
export const auth_middleware = createMiddleware<{ Bindings: Env }>(async (c, next) => {
  try {
    // Get auth token from cookie
    const auth_token = getCookie(c, 'auth_token')
    
    if (!auth_token) {
      return c.json({ error: 'Authentication required' }, 401)
    }

    // Verify the token
    const secret = c.env.JWT_SECRET
    if (!secret) {
      console.error('JWT_SECRET not configured')
      return c.json({ error: 'Server configuration error' }, 500)
    }

    const payload = await verify_jwe_token(auth_token, secret)
    
    // Ensure it's an auth token (not refresh token)
    if (payload.type !== 'auth') {
      return c.json({ error: 'Invalid token type' }, 401)
    }

    const auth_payload = payload as AuthTokenPayload

    // Set user context for downstream handlers
    c.set('user', auth_payload)
    c.set('is_admin', auth_payload.is_admin)

    await next()
  } catch (error) {
    // Token verification failed
    console.error('Auth middleware error:', error)
    return c.json({ error: 'Invalid or expired token' }, 401)
  }
})

/**
 * Admin-only middleware for admin routes
 * Must be used after auth_middleware
 */
export const admin_middleware = createMiddleware<{ Bindings: Env }>(async (c, next) => {
  const is_admin = c.get('is_admin')
  
  if (!is_admin) {
    return c.json({ error: 'Admin access required' }, 403)
  }

  await next()
})

/**
 * Refresh token middleware for token refresh endpoints
 * Validates refresh tokens from cookies
 */
export const refresh_middleware = createMiddleware<{ Bindings: Env }>(async (c, next) => {
  try {
    // Get refresh token from cookie
    const refresh_token = getCookie(c, 'refresh_token')
    
    if (!refresh_token) {
      return c.json({ error: 'Refresh token required' }, 401)
    }

    // Verify the token
    const secret = c.env.JWT_SECRET
    if (!secret) {
      console.error('JWT_SECRET not configured')
      return c.json({ error: 'Server configuration error' }, 500)
    }

    const payload = await verify_jwe_token(refresh_token, secret)
    
    // Ensure it's a refresh token (not auth token)
    if (payload.type !== 'refresh') {
      return c.json({ error: 'Invalid token type' }, 401)
    }

    const refresh_payload = payload as RefreshTokenPayload

    // Set refresh token context for downstream handlers
    c.set('refresh_user', refresh_payload)

    await next()
  } catch (error) {
    // Token verification failed
    console.error('Refresh middleware error:', error)
    return c.json({ error: 'Invalid or expired refresh token' }, 401)
  }
})

/**
 * Optional authentication middleware for public routes with optional user context
 * Sets user context if valid token exists, but doesn't reject if missing
 */
export const optional_auth_middleware = createMiddleware<{ Bindings: Env }>(async (c, next) => {
  try {
    // Get auth token from cookie
    const auth_token = getCookie(c, 'auth_token')
    
    if (auth_token) {
      const secret = c.env.JWT_SECRET
      if (secret) {
        try {
          const payload = await verify_jwe_token(auth_token, secret)
          
          if (payload.type === 'auth') {
            const auth_payload = payload as AuthTokenPayload
            c.set('user', auth_payload)
            c.set('is_admin', auth_payload.is_admin)
          }
        } catch (error) {
          // Ignore token validation errors in optional auth
          console.warn('Optional auth token validation failed:', error)
        }
      }
    }

    await next()
  } catch (error) {
    // Continue even if optional auth fails
    console.warn('Optional auth middleware error:', error)
    await next()
  }
})

/**
 * CSRF protection middleware
 * Validates CSRF tokens for state-changing operations
 */
export const csrf_middleware = createMiddleware<{ Bindings: Env }>(async (c, next) => {
  const method = c.req.method
  
  // Only check CSRF for state-changing methods
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
    const csrf_token_header = c.req.header('X-CSRF-Token')
    const csrf_token_body = await c.req.parseBody().then(body => body?.csrf_token as string).catch(() => null)
    const csrf_token_cookie = getCookie(c, 'csrf_token')
    
    const provided_token = csrf_token_header || csrf_token_body
    
    if (!provided_token || !csrf_token_cookie || provided_token !== csrf_token_cookie) {
      return c.json({ error: 'CSRF token validation failed' }, 403)
    }
  }

  await next()
})

/**
 * Rate limiting middleware
 * Simple in-memory rate limiting (in production, use Cloudflare Rate Limiting)
 */
const rate_limit_store = new Map<string, { count: number; reset: number }>()

export const rate_limit_middleware = (max_requests: number, window_seconds: number) => {
  return createMiddleware<{ Bindings: Env }>(async (c, next) => {
    const client_ip = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'unknown'
    const now = Date.now()
    const window_ms = window_seconds * 1000
    
    const key = `rate_limit:${client_ip}`
    const current = rate_limit_store.get(key)
    
    if (!current || now > current.reset) {
      // Reset window
      rate_limit_store.set(key, { count: 1, reset: now + window_ms })
    } else {
      // Check if limit exceeded
      if (current.count >= max_requests) {
        return c.json({ 
          error: 'Rate limit exceeded',
          retry_after: Math.ceil((current.reset - now) / 1000)
        }, 429)
      }
      
      // Increment counter
      current.count++
    }

    await next()
  })
}

// Common rate limiting configurations
export const auth_rate_limit = rate_limit_middleware(5, 300) // 5 attempts per 5 minutes
export const api_rate_limit = rate_limit_middleware(100, 60) // 100 requests per minute