import { Context } from 'hono'
import { getCookie } from 'hono/cookie'
import { verify_jwe_token, create_auth_token, create_refresh_token, RefreshTokenPayload, TokenUserData } from './jwe'
import { set_auth_cookie_secure, set_refresh_cookie_secure, clear_all_auth_cookies } from './cookies'
import { create_database } from '../db/connection'
import { users } from '../db/schema'
import { eq } from 'drizzle-orm'
import type { Env } from '../index'

/**
 * Token refresh result interface
 */
export interface TokenRefreshResult {
  success: boolean
  new_auth_token?: string
  new_refresh_token?: string
  error?: string
}

/**
 * Refresh authentication tokens using a valid refresh token
 * @param c Hono context
 * @returns Promise<TokenRefreshResult> Refresh operation result
 */
export async function refresh_auth_tokens(c: Context<{ Bindings: Env }>): Promise<TokenRefreshResult> {
  try {
    // Get refresh token from cookie
    const refresh_token = getCookie(c, 'refresh_token')
    if (!refresh_token) {
      return { success: false, error: 'No refresh token provided' }
    }

    // Verify refresh token
    const secret = c.env.JWT_SECRET
    if (!secret) {
      return { success: false, error: 'Server configuration error' }
    }

    let refresh_payload: RefreshTokenPayload
    try {
      const payload = await verify_jwe_token(refresh_token, secret)
      if (payload.type !== 'refresh') {
        return { success: false, error: 'Invalid token type' }
      }
      refresh_payload = payload as RefreshTokenPayload
    } catch (error) {
      return { success: false, error: 'Invalid or expired refresh token' }
    }

    // Get user data from database to ensure user still exists and is active
    const db = create_database(c.env.DB)
    const user_records = await db
      .select()
      .from(users)
      .where(eq(users.id, refresh_payload.user_id))
      .limit(1)

    if (!user_records || user_records.length === 0) {
      // User no longer exists, clear cookies
      clear_all_auth_cookies(c)
      return { success: false, error: 'User account not found' }
    }

    const user_record = user_records[0]
    
    // Create user data object for new tokens
    const user_data: TokenUserData = {
      id: user_record.id,
      email: user_record.email,
      is_admin: Boolean(user_record.is_admin)
    }

    // Generate new tokens
    const new_auth_token = await create_auth_token(user_data, secret)
    const new_refresh_token = await create_refresh_token(user_data, secret)

    // Set new cookies
    set_auth_cookie_secure(c, new_auth_token)
    set_refresh_cookie_secure(c, new_refresh_token)

    return {
      success: true,
      new_auth_token,
      new_refresh_token
    }

  } catch (error) {
    console.error('Token refresh error:', error)
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Token refresh failed'
    }
  }
}

/**
 * Check if auth token is near expiration (within 5 minutes)
 * @param c Hono context
 * @returns Promise<boolean> True if token needs refresh
 */
export async function should_refresh_token(c: Context<{ Bindings: Env }>): Promise<boolean> {
  try {
    const auth_token = getCookie(c, 'auth_token')
    if (!auth_token) {
      return false
    }

    const secret = c.env.JWT_SECRET
    if (!secret) {
      return false
    }

    const payload = await verify_jwe_token(auth_token, secret)
    if (payload.type !== 'auth') {
      return false
    }

    // Check if token expires within 5 minutes (300 seconds)
    const now = Math.floor(Date.now() / 1000)
    const time_until_expiry = payload.exp - now
    
    return time_until_expiry <= 300 // 5 minutes
  } catch (error) {
    // If token verification fails, it should be refreshed
    return true
  }
}

/**
 * Automatic token refresh middleware
 * Automatically refreshes auth tokens if they're near expiration
 */
export async function auto_refresh_middleware(c: Context<{ Bindings: Env }>, next: () => Promise<void>) {
  try {
    // Check if token needs refresh
    const needs_refresh = await should_refresh_token(c)
    
    if (needs_refresh) {
      const refresh_result = await refresh_auth_tokens(c)
      
      if (refresh_result.success) {
        console.log('Auto-refreshed tokens for user')
      } else {
        console.warn('Auto-refresh failed:', refresh_result.error)
        // Don't block the request, let it proceed and handle auth failure normally
      }
    }

    await next()
  } catch (error) {
    console.error('Auto-refresh middleware error:', error)
    await next() // Continue with request even if refresh fails
  }
}

/**
 * Manual token refresh endpoint handler
 * @param c Hono context
 * @returns Response JSON response with refresh result
 */
export async function handle_token_refresh(c: Context<{ Bindings: Env }>) {
  const refresh_result = await refresh_auth_tokens(c)
  
  if (refresh_result.success) {
    return c.json({
      success: true,
      message: 'Tokens refreshed successfully'
    })
  } else {
    return c.json({
      success: false,
      error: refresh_result.error
    }, 401)
  }
}

/**
 * Check token validity and refresh status
 * @param c Hono context
 * @returns Object with token status information
 */
export async function get_token_status(c: Context<{ Bindings: Env }>) {
  try {
    const auth_token = getCookie(c, 'auth_token')
    const refresh_token = getCookie(c, 'refresh_token')
    const secret = c.env.JWT_SECRET

    if (!secret) {
      return { 
        auth_valid: false, 
        refresh_valid: false, 
        error: 'Server configuration error' 
      }
    }

    let auth_valid = false
    let auth_expires_at: number | null = null
    let should_refresh = false

    // Check auth token
    if (auth_token) {
      try {
        const auth_payload = await verify_jwe_token(auth_token, secret)
        if (auth_payload.type === 'auth') {
          auth_valid = true
          auth_expires_at = auth_payload.exp
          should_refresh = await should_refresh_token(c)
        }
      } catch (error) {
        // Auth token invalid
        auth_valid = false
      }
    }

    let refresh_valid = false
    let refresh_expires_at: number | null = null

    // Check refresh token
    if (refresh_token) {
      try {
        const refresh_payload = await verify_jwe_token(refresh_token, secret)
        if (refresh_payload.type === 'refresh') {
          refresh_valid = true
          refresh_expires_at = refresh_payload.exp
        }
      } catch (error) {
        // Refresh token invalid
        refresh_valid = false
      }
    }

    return {
      auth_valid,
      refresh_valid,
      should_refresh,
      auth_expires_at,
      refresh_expires_at,
      can_refresh: refresh_valid && !auth_valid // Can refresh if refresh token valid but auth token invalid
    }

  } catch (error) {
    return { 
      auth_valid: false, 
      refresh_valid: false, 
      error: error instanceof Error ? error.message : 'Token status check failed' 
    }
  }
}