import { Context } from 'hono'
import { getCookie } from 'hono/cookie'
import { verify_jwe_token, AuthTokenPayload, RefreshTokenPayload } from './jwe'
import { clear_all_auth_cookies, clear_auth_cookie, clear_csrf_cookie } from './cookies'
import { refresh_auth_tokens } from './token-refresh'
import type { Env } from '../index'

/**
 * Token expiration check result
 */
export interface TokenExpirationResult {
  auth_token_valid: boolean
  refresh_token_valid: boolean
  auth_expires_at?: number
  refresh_expires_at?: number
  needs_refresh: boolean
  needs_full_reauth: boolean
  action_taken?: 'none' | 'auto_refresh' | 'clear_expired' | 'clear_all'
}

/**
 * Check token expiration status and handle cleanup
 * @param c Hono context
 * @param auto_refresh Whether to automatically refresh near-expired tokens
 * @returns Promise<TokenExpirationResult> Expiration check result
 */
export async function check_and_handle_token_expiration(
  c: Context<{ Bindings: Env }>,
  auto_refresh: boolean = true
): Promise<TokenExpirationResult> {
  try {
    const auth_token = getCookie(c, 'auth_token')
    const refresh_token = getCookie(c, 'refresh_token')
    const secret = c.env.JWT_SECRET

    if (!secret) {
      return {
        auth_token_valid: false,
        refresh_token_valid: false,
        needs_refresh: false,
        needs_full_reauth: true,
        action_taken: 'none'
      }
    }

    let auth_payload: AuthTokenPayload | null = null
    let refresh_payload: RefreshTokenPayload | null = null
    let auth_token_valid = false
    let refresh_token_valid = false

    // Check auth token
    if (auth_token) {
      try {
        const payload = await verify_jwe_token(auth_token, secret)
        if (payload.type === 'auth') {
          auth_payload = payload as AuthTokenPayload
          auth_token_valid = true
        }
      } catch (error) {
        // Auth token invalid or expired
        console.log('Auth token expired or invalid:', error)
      }
    }

    // Check refresh token
    if (refresh_token) {
      try {
        const payload = await verify_jwe_token(refresh_token, secret)
        if (payload.type === 'refresh') {
          refresh_payload = payload as RefreshTokenPayload
          refresh_token_valid = true
        }
      } catch (error) {
        // Refresh token invalid or expired
        console.log('Refresh token expired or invalid:', error)
      }
    }

    // Determine expiration times
    const auth_expires_at = auth_payload?.exp
    const refresh_expires_at = refresh_payload?.exp

    // Check if auth token needs refresh (within 5 minutes of expiration)
    const now = Math.floor(Date.now() / 1000)
    const needs_refresh = auth_payload 
      ? (auth_payload.exp - now) <= 300 // 5 minutes
      : false

    // Determine action needed
    let action_taken: 'none' | 'auto_refresh' | 'clear_expired' | 'clear_all' = 'none'

    if (!auth_token_valid && !refresh_token_valid) {
      // Both tokens invalid/expired - clear all cookies
      clear_all_auth_cookies(c)
      action_taken = 'clear_all'
      
      return {
        auth_token_valid: false,
        refresh_token_valid: false,
        needs_refresh: false,
        needs_full_reauth: true,
        action_taken
      }
    }

    if (!auth_token_valid && refresh_token_valid) {
      // Auth token expired but refresh token valid
      if (auto_refresh) {
        // Attempt to refresh tokens
        const refresh_result = await refresh_auth_tokens(c)
        if (refresh_result.success) {
          action_taken = 'auto_refresh'
          console.log('Auto-refreshed expired auth token')
          
          return {
            auth_token_valid: true, // Now valid after refresh
            refresh_token_valid: true,
            needs_refresh: false,
            needs_full_reauth: false,
            action_taken
          }
        } else {
          // Refresh failed - clear all cookies
          clear_all_auth_cookies(c)
          action_taken = 'clear_all'
          
          return {
            auth_token_valid: false,
            refresh_token_valid: false,
            needs_refresh: false,
            needs_full_reauth: true,
            action_taken
          }
        }
      } else {
        // Don't auto-refresh, but indicate refresh is needed
        return {
          auth_token_valid: false,
          refresh_token_valid: true,
          auth_expires_at,
          refresh_expires_at,
          needs_refresh: true,
          needs_full_reauth: false,
          action_taken: 'none'
        }
      }
    }

    if (auth_token_valid && !refresh_token_valid) {
      // Auth token valid but refresh token expired
      // Clear only refresh token related cookies
      const { clear_refresh_cookie } = await import('./cookies')
      clear_refresh_cookie(c)
      action_taken = 'clear_expired'
      
      return {
        auth_token_valid: true,
        refresh_token_valid: false,
        auth_expires_at,
        refresh_expires_at,
        needs_refresh: false,
        needs_full_reauth: false,
        action_taken
      }
    }

    // Both tokens valid
    if (needs_refresh && auto_refresh) {
      // Auth token near expiration - proactively refresh
      const refresh_result = await refresh_auth_tokens(c)
      if (refresh_result.success) {
        action_taken = 'auto_refresh'
        console.log('Proactively refreshed near-expired auth token')
      }
    }

    return {
      auth_token_valid: true,
      refresh_token_valid: true,
      auth_expires_at,
      refresh_expires_at,
      needs_refresh,
      needs_full_reauth: false,
      action_taken
    }

  } catch (error) {
    console.error('Token expiration check error:', error)
    
    // On error, clear all cookies for security
    clear_all_auth_cookies(c)
    
    return {
      auth_token_valid: false,
      refresh_token_valid: false,
      needs_refresh: false,
      needs_full_reauth: true,
      action_taken: 'clear_all'
    }
  }
}

/**
 * Middleware for automatic token expiration handling
 * This runs before protected routes to ensure tokens are valid
 */
export async function token_expiration_middleware(
  c: Context<{ Bindings: Env }>,
  next: () => Promise<void>
) {
  // Check and handle token expiration
  const expiration_result = await check_and_handle_token_expiration(c, true)
  
  // Add expiration info to context for downstream handlers
  c.set('token_expiration_result', expiration_result)
  
  // If action was taken, log it
  if (expiration_result.action_taken !== 'none') {
    console.log('Token expiration action taken:', expiration_result.action_taken)
  }

  await next()
}

/**
 * Check if user needs to re-authenticate
 * @param c Hono context
 * @returns Promise<boolean> True if user needs full re-authentication
 */
export async function needs_reauthentication(c: Context<{ Bindings: Env }>): Promise<boolean> {
  const expiration_result = await check_and_handle_token_expiration(c, false)
  return expiration_result.needs_full_reauth
}

/**
 * Get token expiration information for client-side handling
 * @param c Hono context
 * @returns Promise<object> Token expiration information
 */
export async function get_token_expiration_info(c: Context<{ Bindings: Env }>) {
  const expiration_result = await check_and_handle_token_expiration(c, false)
  
  return {
    authenticated: expiration_result.auth_token_valid,
    can_refresh: expiration_result.refresh_token_valid && !expiration_result.auth_token_valid,
    needs_login: expiration_result.needs_full_reauth,
    auth_expires_at: expiration_result.auth_expires_at,
    refresh_expires_at: expiration_result.refresh_expires_at,
    expires_in_seconds: expiration_result.auth_expires_at 
      ? Math.max(0, expiration_result.auth_expires_at - Math.floor(Date.now() / 1000))
      : null
  }
}

/**
 * Scheduled cleanup function for expired tokens (for future use)
 * This is a placeholder for when we implement token blacklisting
 * Currently not needed for stateless JWE tokens
 */
export async function cleanup_expired_tokens() {
  // For stateless JWE tokens, this is not needed as tokens expire naturally
  // In a session-based system, this would clean up expired session records
  // If we add token blacklisting in the future, this would clean up old blacklist entries
  
  console.log('Token cleanup scheduled task - no action needed for stateless tokens')
}

/**
 * Force token expiration for security incidents
 * @param c Hono context
 * @param reason Reason for forced expiration
 */
export async function force_token_expiration(
  c: Context<{ Bindings: Env }>,
  reason: string = 'Security incident'
) {
  console.log(`Force token expiration: ${reason}`)
  
  // Clear all authentication cookies immediately
  clear_all_auth_cookies(c)
  
  // Log the forced expiration
  const auth_token = getCookie(c, 'auth_token')
  if (auth_token) {
    try {
      const secret = c.env.JWT_SECRET
      if (secret) {
        const payload = await verify_jwe_token(auth_token, secret)
        if (payload.type === 'auth') {
          console.log(`Forced expiration for user ${payload.user_id}: ${reason}`)
        }
      }
    } catch (error) {
      // Token already invalid, ignore
    }
  }
}

/**
 * Check if tokens will expire within a specified time
 * @param c Hono context
 * @param minutes Minutes to check ahead
 * @returns Promise<object> Expiration warning information
 */
export async function check_expiration_warning(
  c: Context<{ Bindings: Env }>,
  minutes: number = 10
): Promise<{
  auth_expires_soon: boolean
  refresh_expires_soon: boolean
  auth_expires_in_minutes: number | null
  refresh_expires_in_minutes: number | null
}> {
  try {
    const auth_token = getCookie(c, 'auth_token')
    const refresh_token = getCookie(c, 'refresh_token')
    const secret = c.env.JWT_SECRET
    const now = Math.floor(Date.now() / 1000)
    const warning_threshold = now + (minutes * 60)

    let auth_expires_soon = false
    let refresh_expires_soon = false
    let auth_expires_in_minutes: number | null = null
    let refresh_expires_in_minutes: number | null = null

    if (secret && auth_token) {
      try {
        const payload = await verify_jwe_token(auth_token, secret)
        if (payload.type === 'auth') {
          auth_expires_in_minutes = Math.max(0, Math.floor((payload.exp - now) / 60))
          auth_expires_soon = payload.exp <= warning_threshold
        }
      } catch (error) {
        // Auth token invalid
      }
    }

    if (secret && refresh_token) {
      try {
        const payload = await verify_jwe_token(refresh_token, secret)
        if (payload.type === 'refresh') {
          refresh_expires_in_minutes = Math.max(0, Math.floor((payload.exp - now) / 60))
          refresh_expires_soon = payload.exp <= warning_threshold
        }
      } catch (error) {
        // Refresh token invalid
      }
    }

    return {
      auth_expires_soon,
      refresh_expires_soon,
      auth_expires_in_minutes,
      refresh_expires_in_minutes
    }
  } catch (error) {
    console.error('Expiration warning check error:', error)
    return {
      auth_expires_soon: false,
      refresh_expires_soon: false,
      auth_expires_in_minutes: null,
      refresh_expires_in_minutes: null
    }
  }
}