import { Context } from 'hono'
import { setCookie, deleteCookie } from 'hono/cookie'
import type { Env } from '../index'

// Cookie configuration interface
interface CookieOptions {
  httpOnly?: boolean
  secure?: boolean
  sameSite?: 'strict' | 'lax' | 'none'
  maxAge?: number
  path?: string
  domain?: string
}

// Default secure cookie configuration
const DEFAULT_COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: true, // Always use HTTPS in production
  sameSite: 'lax',
  path: '/'
}

/**
 * Set auth token in secure HttpOnly cookie
 * @param c Hono context
 * @param token JWE auth token
 */
export function set_auth_cookie(c: Context<{ Bindings: Env }>, token: string): void {
  setCookie(c, 'auth_token', token, {
    ...DEFAULT_COOKIE_OPTIONS,
    maxAge: 60 * 60, // 1 hour (matches token expiration)
  })
}

/**
 * Set refresh token in secure HttpOnly cookie
 * @param c Hono context
 * @param token JWE refresh token
 */
export function set_refresh_cookie(c: Context<{ Bindings: Env }>, token: string): void {
  setCookie(c, 'refresh_token', token, {
    ...DEFAULT_COOKIE_OPTIONS,
    maxAge: 3 * 24 * 60 * 60, // 3 days (matches token expiration)
  })
}

/**
 * Set CSRF token in secure cookie (not HttpOnly for client-side access)
 * @param c Hono context
 * @param token CSRF token string
 */
export function set_csrf_cookie(c: Context<{ Bindings: Env }>, token: string): void {
  setCookie(c, 'csrf_token', token, {
    httpOnly: false, // Client needs to read this for CSRF protection
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24, // 24 hours
  })
}

/**
 * Clear auth token cookie (logout)
 * @param c Hono context
 */
export function clear_auth_cookie(c: Context<{ Bindings: Env }>): void {
  deleteCookie(c, 'auth_token', {
    path: '/',
    secure: true,
    sameSite: 'lax'
  })
}

/**
 * Clear refresh token cookie (logout)
 * @param c Hono context
 */
export function clear_refresh_cookie(c: Context<{ Bindings: Env }>): void {
  deleteCookie(c, 'refresh_token', {
    path: '/',
    secure: true,
    sameSite: 'lax'
  })
}

/**
 * Clear CSRF token cookie
 * @param c Hono context
 */
export function clear_csrf_cookie(c: Context<{ Bindings: Env }>): void {
  deleteCookie(c, 'csrf_token', {
    path: '/',
    secure: true,
    sameSite: 'lax'
  })
}

/**
 * Clear all authentication-related cookies (complete logout)
 * @param c Hono context
 */
export function clear_all_auth_cookies(c: Context<{ Bindings: Env }>): void {
  clear_auth_cookie(c)
  clear_refresh_cookie(c)
  clear_csrf_cookie(c)
}

/**
 * Generate a secure CSRF token
 * @returns Promise<string> Random CSRF token
 */
export async function generate_csrf_token(): Promise<string> {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  
  // Convert to base64url for safe URL usage
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

/**
 * Set authentication cookies after successful login
 * @param c Hono context
 * @param auth_token JWE auth token
 * @param refresh_token JWE refresh token
 */
export async function set_login_cookies(
  c: Context<{ Bindings: Env }>, 
  auth_token: string, 
  refresh_token: string
): Promise<void> {
  // Set authentication tokens
  set_auth_cookie(c, auth_token)
  set_refresh_cookie(c, refresh_token)
  
  // Generate and set CSRF token
  const csrf_token = await generate_csrf_token()
  set_csrf_cookie(c, csrf_token)
}

/**
 * Check if cookies are secure based on environment
 * In development, allow non-secure cookies for testing
 * @param env Environment bindings
 * @returns boolean Whether cookies should be secure
 */
export function should_use_secure_cookies(env: Env): boolean {
  return env.ENVIRONMENT !== 'development'
}

/**
 * Get cookie options based on environment
 * @param env Environment bindings
 * @param maxAge Cookie max age in seconds
 * @returns CookieOptions Configuration for cookies
 */
export function get_cookie_options(env: Env, maxAge?: number): CookieOptions {
  return {
    ...DEFAULT_COOKIE_OPTIONS,
    secure: should_use_secure_cookies(env),
    maxAge
  }
}

/**
 * Set auth token with environment-aware security
 * @param c Hono context
 * @param token JWE auth token
 */
export function set_auth_cookie_secure(c: Context<{ Bindings: Env }>, token: string): void {
  const options = get_cookie_options(c.env, 60 * 60) // 1 hour
  setCookie(c, 'auth_token', token, options)
}

/**
 * Set refresh token with environment-aware security
 * @param c Hono context
 * @param token JWE refresh token
 */
export function set_refresh_cookie_secure(c: Context<{ Bindings: Env }>, token: string): void {
  const options = get_cookie_options(c.env, 3 * 24 * 60 * 60) // 3 days
  setCookie(c, 'refresh_token', token, options)
}