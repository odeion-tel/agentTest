import { Context } from 'hono'
import { getCookie } from 'hono/cookie'
import { clear_all_auth_cookies } from './cookies'
import { verify_jwe_token } from './jwe'
import type { Env } from '../index'

/**
 * Logout result interface
 */
export interface LogoutResult {
  success: boolean
  message: string
  error?: string
}

/**
 * Perform complete user logout
 * - Clears all authentication cookies
 * - Validates tokens before logout (optional security check)
 * - Returns success status
 * 
 * @param c Hono context
 * @param validate_tokens Whether to validate tokens before logout (default: false)
 * @returns Promise<LogoutResult> Logout operation result
 */
export async function logout_user(
  c: Context<{ Bindings: Env }>, 
  validate_tokens: boolean = false
): Promise<LogoutResult> {
  try {
    let had_valid_tokens = false

    if (validate_tokens) {
      // Optional: validate tokens before logout for security logging
      const auth_token = getCookie(c, 'auth_token')
      const refresh_token = getCookie(c, 'refresh_token')
      const secret = c.env.JWT_SECRET

      if (secret && (auth_token || refresh_token)) {
        if (auth_token) {
          try {
            const auth_payload = await verify_jwe_token(auth_token, secret)
            if (auth_payload.type === 'auth') {
              had_valid_tokens = true
              console.log(`User ${auth_payload.user_id} logging out`)
            }
          } catch (error) {
            // Invalid auth token, continue with logout
            console.warn('Invalid auth token during logout:', error)
          }
        }

        if (refresh_token && !had_valid_tokens) {
          try {
            const refresh_payload = await verify_jwe_token(refresh_token, secret)
            if (refresh_payload.type === 'refresh') {
              had_valid_tokens = true
              console.log(`User ${refresh_payload.user_id} logging out (refresh token only)`)
            }
          } catch (error) {
            // Invalid refresh token, continue with logout
            console.warn('Invalid refresh token during logout:', error)
          }
        }
      }
    }

    // Clear all authentication cookies
    clear_all_auth_cookies(c)

    return {
      success: true,
      message: had_valid_tokens 
        ? 'Successfully logged out'
        : 'Logout completed (no valid session found)'
    }

  } catch (error) {
    console.error('Logout error:', error)
    
    // Even if there's an error, still try to clear cookies
    try {
      clear_all_auth_cookies(c)
    } catch (cookie_error) {
      console.error('Failed to clear cookies during logout:', cookie_error)
    }

    return {
      success: false,
      message: 'Logout completed with errors',
      error: error instanceof Error ? error.message : 'Unknown logout error'
    }
  }
}

/**
 * Handle logout endpoint
 * @param c Hono context
 * @returns Response JSON response with logout result
 */
export async function handle_logout(c: Context<{ Bindings: Env }>) {
  const logout_result = await logout_user(c, true) // Validate tokens for security logging
  
  if (logout_result.success) {
    return c.json({
      success: true,
      message: logout_result.message
    })
  } else {
    return c.json({
      success: false,
      message: logout_result.message,
      error: logout_result.error
    }, 500)
  }
}

/**
 * Force logout utility for admin actions or security incidents
 * Immediately clears all cookies without validation
 * @param c Hono context
 * @returns Promise<LogoutResult> Force logout result
 */
export async function force_logout(c: Context<{ Bindings: Env }>): Promise<LogoutResult> {
  try {
    clear_all_auth_cookies(c)
    
    return {
      success: true,
      message: 'Force logout completed'
    }
  } catch (error) {
    console.error('Force logout error:', error)
    return {
      success: false,
      message: 'Force logout failed',
      error: error instanceof Error ? error.message : 'Unknown force logout error'
    }
  }
}

/**
 * Check if user has any active tokens (for logout page display)
 * @param c Hono context
 * @returns Promise<boolean> True if user has active tokens
 */
export async function has_active_session(c: Context<{ Bindings: Env }>): Promise<boolean> {
  try {
    const auth_token = getCookie(c, 'auth_token')
    const refresh_token = getCookie(c, 'refresh_token')
    const secret = c.env.JWT_SECRET

    if (!secret || (!auth_token && !refresh_token)) {
      return false
    }

    // Check if any token is valid
    if (auth_token) {
      try {
        const payload = await verify_jwe_token(auth_token, secret)
        if (payload.type === 'auth') {
          return true
        }
      } catch (error) {
        // Auth token invalid, check refresh token
      }
    }

    if (refresh_token) {
      try {
        const payload = await verify_jwe_token(refresh_token, secret)
        if (payload.type === 'refresh') {
          return true
        }
      } catch (error) {
        // Refresh token also invalid
      }
    }

    return false
  } catch (error) {
    console.error('Error checking active session:', error)
    return false
  }
}

/**
 * Logout all sessions for a specific user (admin function)
 * This is a placeholder for future implementation when we add session tracking
 * Currently, JWE tokens are stateless, so we can only clear current session
 * @param c Hono context
 * @param user_id User ID to logout all sessions for
 * @returns Promise<LogoutResult> Global logout result
 */
export async function logout_all_sessions(
  c: Context<{ Bindings: Env }>, 
  user_id: string
): Promise<LogoutResult> {
  try {
    // For stateless JWE tokens, we can only clear the current session
    // In a full implementation, this would:
    // 1. Add all active session tokens to a blacklist in KV storage
    // 2. Update user record to force re-authentication
    // 3. Clear current session cookies

    clear_all_auth_cookies(c)
    
    console.log(`Global logout requested for user ${user_id}`)
    
    return {
      success: true,
      message: `Logged out current session for user ${user_id}. Note: Stateless tokens in other sessions will remain valid until expiration.`
    }
  } catch (error) {
    console.error('Global logout error:', error)
    return {
      success: false,
      message: 'Global logout failed',
      error: error instanceof Error ? error.message : 'Unknown global logout error'
    }
  }
}

/**
 * Cleanup expired cookies utility
 * Removes cookies that are no longer valid
 * @param c Hono context
 * @returns Promise<void>
 */
export async function cleanup_expired_cookies(c: Context<{ Bindings: Env }>): Promise<void> {
  try {
    const auth_token = getCookie(c, 'auth_token')
    const refresh_token = getCookie(c, 'refresh_token')
    const secret = c.env.JWT_SECRET

    if (!secret) {
      return
    }

    let should_clear_auth = false
    let should_clear_refresh = false

    // Check auth token
    if (auth_token) {
      try {
        await verify_jwe_token(auth_token, secret)
      } catch (error) {
        should_clear_auth = true
      }
    }

    // Check refresh token
    if (refresh_token) {
      try {
        await verify_jwe_token(refresh_token, secret)
      } catch (error) {
        should_clear_refresh = true
      }
    }

    // Clear expired cookies
    if (should_clear_auth || should_clear_refresh) {
      if (should_clear_auth && should_clear_refresh) {
        // Both tokens expired, clear everything
        clear_all_auth_cookies(c)
      } else if (should_clear_auth) {
        // Only auth token expired, clear just that
        const { clear_auth_cookie, clear_csrf_cookie } = await import('./cookies')
        clear_auth_cookie(c)
        clear_csrf_cookie(c) // CSRF token is tied to auth token
      } else if (should_clear_refresh) {
        // Only refresh token expired, clear just that
        const { clear_refresh_cookie } = await import('./cookies')
        clear_refresh_cookie(c)
      }
    }
  } catch (error) {
    console.error('Cookie cleanup error:', error)
  }
}