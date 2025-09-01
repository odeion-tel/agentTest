import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { setCookie, getCookie, deleteCookie } from 'hono/cookie'
import { auth_rate_limit, csrf_middleware, auth_middleware, optional_auth_middleware } from '../middleware/auth'
import { create_auth_token, create_refresh_token } from '../utils/jwe'
import { find_user_by_email, update_user_password } from '../models/user'
import { hash_password, verify_password } from '../utils/password'
import { generateSecureToken, hashToken } from '../utils/crypto'
import { sendPasswordResetEmail, isValidEmail } from '../utils/email'
import { LoginPage } from '../components/LoginPage'
import { ForgotPasswordPage } from '../components/ForgotPasswordPage'
import { ResetPasswordPage } from '../components/ResetPasswordPage'
import type { Env } from '../index'

// Create authentication router
const auth = new Hono<{ Bindings: Env }>()

// Login form validation schema (OWASP compliant)
const login_schema = z.object({
  email: z.string()
    .email('Please enter a valid email address')
    .max(254, 'Email address is too long'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must not exceed 128 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[!@#$%^&*(),.?\":{}|<>]/, 'Password must contain at least one special character'),
  csrf_token: z.string().min(1, 'CSRF token is required'),
  redirect_to: z.string().optional(),
})

/**
 * Generate CSRF token for forms
 */
function generate_csrf_token(): string {
  return crypto.randomUUID()
}

// Password reset request schema
const forgot_password_schema = z.object({
  email: z.string()
    .email('Please enter a valid email address')
    .max(254, 'Email address is too long'),
  csrf_token: z.string().min(1, 'CSRF token is required'),
})

// Password reset completion schema
const reset_password_schema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  password: z.string()
    .min(12, 'Password must be at least 12 characters')
    .max(128, 'Password must not exceed 128 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[!@#$%^&*(),.?":{}|<>]/, 'Password must contain at least one special character'),
  confirmPassword: z.string().min(1, 'Please confirm your password'),
  csrf_token: z.string().min(1, 'CSRF token is required'),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
})

/**
 * GET /app/login - Display login page
 */
auth.get('/login', async (c) => {
  // Check if user is already authenticated
  const auth_token = getCookie(c, 'auth_token')
  if (auth_token) {
    try {
      // If token is valid, redirect to dashboard
      const redirect_to = c.req.query('redirect_to') || '/app/dashboard'
      return c.redirect(redirect_to)
    } catch (error) {
      // Invalid token, continue with login page
    }
  }

  // Generate CSRF token
  const csrf_token = generate_csrf_token()
  
  // Set CSRF token in cookie (HttpOnly for security)
  setCookie(c, 'csrf_token', csrf_token, {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    maxAge: 3600, // 1 hour
    path: '/',
  })

  const error = c.req.query('error')
  const message = c.req.query('message')
  const redirect_to = c.req.query('redirect_to')

  return c.html(
    <LoginPage 
      error={error}
      message={message}
      csrf_token={csrf_token} 
      redirect_to={redirect_to} 
    />
  )
})

/**
 * POST /app/login - Process login form
 */
auth.post(
  '/login',
  auth_rate_limit, // Rate limiting: 5 attempts per 5 minutes
  csrf_middleware, // CSRF protection
  zValidator('form', login_schema), // Form validation
  async (c) => {
    try {
      const { email, password, redirect_to } = c.req.valid('form')
      
      // Find user by email
      const user = await find_user_by_email(email, c.env.DB)
      if (!user) {
        return c.redirect(`/app/login?error=${encodeURIComponent('Invalid email or password')}`)
      }

      // Verify password
      const is_valid_password = await verify_password(password, user.password_hash)
      if (!is_valid_password) {
        return c.redirect(`/app/login?error=${encodeURIComponent('Invalid email or password')}`)
      }

      // Create JWT secret check
      const jwt_secret = c.env.JWT_SECRET
      if (!jwt_secret) {
        console.error('JWT_SECRET not configured')
        return c.redirect(`/app/login?error=${encodeURIComponent('Server configuration error')}`)
      }

      // Create tokens
      const user_data = {
        id: user.id,
        email: user.email,
        is_admin: user.is_admin,
      }

      const auth_token = await create_auth_token(user_data, jwt_secret)
      const refresh_token = await create_refresh_token(user_data, jwt_secret)

      // Set secure cookies
      setCookie(c, 'auth_token', auth_token, {
        httpOnly: true,
        secure: true,
        sameSite: 'Lax',
        maxAge: 3600, // 1 hour (matches token expiration)
        path: '/',
      })

      setCookie(c, 'refresh_token', refresh_token, {
        httpOnly: true,
        secure: true,
        sameSite: 'Lax',
        maxAge: 3 * 24 * 3600, // 3 days (matches token expiration)
        path: '/',
      })

      // Clear CSRF token cookie (no longer needed)
      deleteCookie(c, 'csrf_token')

      // Redirect to dashboard or requested page
      const destination = redirect_to || '/app/dashboard'
      return c.redirect(destination)

    } catch (error) {
      console.error('Login error:', error)
      return c.redirect(`/app/login?error=${encodeURIComponent('An error occurred during login')}`)
    }
  }
)

/**
 * GET /app/logout - Display logout confirmation (optional)
 * Can be skipped in favor of direct POST logout
 */
auth.get('/logout', auth_middleware, async (c) => {
  const user = c.get('user')
  const csrf_token = generate_csrf_token()
  
  // Set CSRF token in cookie for logout form
  setCookie(c, 'csrf_token', csrf_token, {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax', 
    maxAge: 3600, // 1 hour
    path: '/',
  })

  return c.html(
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Logout - Conversionware</title>
        <script src="https://cdn.tailwindcss.com"></script>
      </head>
      <body class="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
        <div class="sm:mx-auto sm:w-full sm:max-w-md">
          <div class="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
            <div class="text-center">
              <h2 class="text-2xl font-bold text-gray-900 mb-4">
                Confirm Logout
              </h2>
              <p class="text-gray-600 mb-6">
                Are you sure you want to log out of your account ({user.email})?
              </p>
              
              <div class="flex space-x-4">
                <form method="post" action="/app/logout" class="flex-1">
                  <input type="hidden" name="csrf_token" value={csrf_token} />
                  <button
                    type="submit"
                    class="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                  >
                    Yes, Log Out
                  </button>
                </form>
                
                <a
                  href="/app/dashboard"
                  class="flex-1 flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                  Cancel
                </a>
              </div>
            </div>
          </div>
        </div>
      </body>
    </html>
  )
})

/**
 * POST /app/logout - Process logout and clean up tokens
 */
auth.post(
  '/logout',
  auth_middleware, // Require authentication
  csrf_middleware, // CSRF protection
  async (c) => {
    try {
      // Get current user for logging
      const user = c.get('user')
      
      // Clear authentication cookies
      deleteCookie(c, 'auth_token', { path: '/' })
      deleteCookie(c, 'refresh_token', { path: '/' })
      deleteCookie(c, 'csrf_token', { path: '/' })

      // Optional: Add token to blacklist in KV store for enhanced security
      // This is optional since JWE tokens are stateless and will expire naturally
      // Uncomment if blacklist functionality is needed:
      /*
      try {
        const auth_token = getCookie(c, 'auth_token')
        if (auth_token && c.env.KV) {
          // Extract JTI from token and add to blacklist
          const payload = await verify_jwe_token(auth_token, c.env.JWT_SECRET!)
          await c.env.KV.put(`blacklist:${payload.jti}`, 'true', {
            expirationTtl: payload.exp - Math.floor(Date.now() / 1000) // TTL until token would naturally expire
          })
        }
      } catch (error) {
        // Continue logout even if blacklist fails
        console.warn('Failed to add token to blacklist:', error)
      }
      */

      console.log(`User ${user.email} (${user.user_id}) logged out successfully`)
      
      // Redirect to login page with success message
      return c.redirect('/app/login?message=You have been logged out successfully')

    } catch (error) {
      console.error('Logout error:', error)
      
      // Clear cookies even if there's an error
      deleteCookie(c, 'auth_token', { path: '/' })
      deleteCookie(c, 'refresh_token', { path: '/' })
      deleteCookie(c, 'csrf_token', { path: '/' })
      
      return c.redirect('/app/login?error=An error occurred during logout')
    }
  }
)

/**
 * GET /app/auth/status - Check authentication status (API endpoint)
 * Returns current user information if authenticated
 */
auth.get('/status', optional_auth_middleware, async (c) => {
  const user = c.get('user')
  
  if (user) {
    return c.json({
      authenticated: true,
      user: {
        id: user.user_id,
        email: user.email,
        is_admin: user.is_admin,
      }
    })
  } else {
    return c.json({
      authenticated: false,
      user: null
    })
  }
})

/**
 * GET /app/dashboard - Protected dashboard page (example)
 */
auth.get('/dashboard', auth_middleware, async (c) => {
  const user = c.get('user')
  
  return c.html(
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Dashboard - Conversionware</title>
        <script src="https://cdn.tailwindcss.com"></script>
      </head>
      <body class="min-h-screen bg-gray-50">
        <div class="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
          <div class="px-4 py-6 sm:px-0">
            <div class="bg-white overflow-hidden shadow rounded-lg">
              <div class="px-4 py-5 sm:p-6">
                <h1 class="text-2xl font-bold text-gray-900 mb-4">
                  Welcome to Conversionware Dashboard
                </h1>
                <p class="text-gray-600 mb-6">
                  Hello, {user.email}! You are successfully authenticated.
                </p>
                
                <div class="border-t border-gray-200 pt-6">
                  <dl class="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2">
                    <div>
                      <dt class="text-sm font-medium text-gray-500">User ID</dt>
                      <dd class="mt-1 text-sm text-gray-900">{user.user_id}</dd>
                    </div>
                    <div>
                      <dt class="text-sm font-medium text-gray-500">Email</dt>
                      <dd class="mt-1 text-sm text-gray-900">{user.email}</dd>
                    </div>
                    <div>
                      <dt class="text-sm font-medium text-gray-500">Admin Status</dt>
                      <dd class="mt-1 text-sm text-gray-900">
                        {user.is_admin ? 'Administrator' : 'Standard User'}
                      </dd>
                    </div>
                  </dl>
                </div>
                
                <div class="mt-6">
                  <a
                    href="/app/logout"
                    class="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                  >
                    Logout
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </body>
    </html>
  )
})

/**
 * GET /app/forgot-password - Display forgot password form
 */
auth.get('/forgot-password', async (c) => {
  // Check if user is already authenticated
  const auth_token = getCookie(c, 'auth_token')
  if (auth_token) {
    try {
      // If token is valid, redirect to dashboard
      return c.redirect('/app/dashboard')
    } catch (error) {
      // Invalid token, continue with forgot password page
    }
  }

  // Generate CSRF token
  const csrf_token = generate_csrf_token()
  
  // Set CSRF token in cookie
  setCookie(c, 'csrf_token', csrf_token, {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    maxAge: 3600, // 1 hour
    path: '/',
  })

  const error = c.req.query('error')
  const message = c.req.query('message')

  return c.html(
    <ForgotPasswordPage 
      error={error}
      message={message}
      csrf_token={csrf_token} 
    />
  )
})

/**
 * POST /app/forgot-password - Process password reset request
 */
auth.post(
  '/forgot-password',
  auth_rate_limit, // Rate limiting: 3 attempts per 24 hours per email
  csrf_middleware, // CSRF protection
  zValidator('form', forgot_password_schema), // Form validation
  async (c) => {
    try {
      const { email } = c.req.valid('form')
      
      // Find user by email
      const user = await find_user_by_email(email, c.env.DB)
      
      // Always return success message for security (don't reveal if email exists)
      if (!user) {
        return c.redirect('/app/forgot-password?message=If the email exists, a reset link has been sent')
      }

      // Generate secure reset token
      const reset_token = generateSecureToken(32)
      const token_hash = await hashToken(reset_token)
      
      // Set token expiration to 24 hours from now
      const expires_at = new Date(Date.now() + 24 * 60 * 60 * 1000)
      
      // Store token in database
      await c.env.DB.prepare(`
        INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
        VALUES (?, ?, ?)
      `).bind(user.id, token_hash, expires_at.getTime()).run()

      // Send reset email
      const email_config = {
        apiKey: c.env.MAILGUN_API_KEY,
        domain: c.env.MAILGUN_DOMAIN,
        fromEmail: c.env.FROM_EMAIL,
      }
      
      const email_result = await sendPasswordResetEmail(user.email, reset_token, email_config)
      
      if (!email_result.success) {
        console.error('Failed to send password reset email:', email_result.message)
        // Don't reveal email sending failure to user for security
      }

      return c.redirect('/app/forgot-password?message=If the email exists, a reset link has been sent')

    } catch (error) {
      console.error('Password reset request error:', error)
      return c.redirect('/app/forgot-password?error=An error occurred processing your request')
    }
  }
)

/**
 * GET /app/reset-password - Display reset password form
 */
auth.get('/reset-password', async (c) => {
  const token = c.req.query('token')
  
  if (!token) {
    return c.html(
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>Invalid Reset Link - Conversionware</title>
          <script src="https://cdn.tailwindcss.com"></script>
        </head>
        <body class="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
          <div class="sm:mx-auto sm:w-full sm:max-w-md">
            <div class="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10 text-center">
              <div class="error-message">
                <strong>Invalid Reset Link</strong>
                <p class="mt-2">This password reset link is invalid or has expired.</p>
              </div>
              <a href="/app/forgot-password" class="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700">
                Request New Reset Link
              </a>
            </div>
          </div>
        </body>
      </html>
    )
  }

  // Validate token
  const token_hash = await hashToken(token)
  const token_record = await c.env.DB.prepare(`
    SELECT user_id, expires_at, used_at
    FROM password_reset_tokens
    WHERE token_hash = ?
  `).bind(token_hash).first()

  if (!token_record) {
    return c.html(
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>Invalid Reset Link - Conversionware</title>
          <script src="https://cdn.tailwindcss.com"></script>
        </head>
        <body class="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
          <div class="sm:mx-auto sm:w-full sm:max-w-md">
            <div class="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10 text-center">
              <div class="error-message">
                <strong>Invalid Reset Link</strong>
                <p class="mt-2">This password reset link is invalid or has expired.</p>
              </div>
              <a href="/app/forgot-password" class="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700">
                Request New Reset Link
              </a>
            </div>
          </div>
        </body>
      </html>
    )
  }

  const expires_at = new Date(token_record.expires_at)
  if (expires_at < new Date()) {
    return c.html(
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>Expired Reset Link - Conversionware</title>
          <script src="https://cdn.tailwindcss.com"></script>
        </head>
        <body class="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
          <div class="sm:mx-auto sm:w-full sm:max-w-md">
            <div class="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10 text-center">
              <div class="error-message">
                <strong>Expired Reset Link</strong>
                <p class="mt-2">This password reset link has expired.</p>
              </div>
              <a href="/app/forgot-password" class="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700">
                Request New Reset Link
              </a>
            </div>
          </div>
        </body>
      </html>
    )
  }

  if (token_record.used_at) {
    return c.html(
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>Used Reset Link - Conversionware</title>
          <script src="https://cdn.tailwindcss.com"></script>
        </head>
        <body class="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
          <div class="sm:mx-auto sm:w-full sm:max-w-md">
            <div class="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10 text-center">
              <div class="error-message">
                <strong>Used Reset Link</strong>
                <p class="mt-2">This password reset link has already been used.</p>
              </div>
              <a href="/app/forgot-password" class="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700">
                Request New Reset Link
              </a>
            </div>
          </div>
        </body>
      </html>
    )
  }

  // Generate CSRF token
  const csrf_token = generate_csrf_token()
  
  // Set CSRF token in cookie
  setCookie(c, 'csrf_token', csrf_token, {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    maxAge: 3600, // 1 hour
    path: '/',
  })

  const error = c.req.query('error')
  const message = c.req.query('message')

  return c.html(
    <ResetPasswordPage 
      error={error}
      message={message}
      csrf_token={csrf_token}
      token={token}
    />
  )
})

/**
 * POST /app/reset-password - Process password reset completion
 */
auth.post(
  '/reset-password',
  auth_rate_limit, // Rate limiting
  csrf_middleware, // CSRF protection
  zValidator('form', reset_password_schema), // Form validation
  async (c) => {
    try {
      const { token, password } = c.req.valid('form')
      
      // Validate token again
      const token_hash = await hashToken(token)
      const token_record = await c.env.DB.prepare(`
        SELECT id, user_id, expires_at, used_at
        FROM password_reset_tokens
        WHERE token_hash = ?
      `).bind(token_hash).first()

      if (!token_record) {
        return c.redirect('/app/reset-password?token=' + token + '&error=Invalid reset token')
      }

      const expires_at = new Date(token_record.expires_at)
      if (expires_at < new Date()) {
        return c.redirect('/app/reset-password?token=' + token + '&error=Reset token has expired')
      }

      if (token_record.used_at) {
        return c.redirect('/app/reset-password?token=' + token + '&error=Reset token has already been used')
      }

      // Update user password
      const hashed_password = await hashPassword(password)
      await update_user_password(token_record.user_id, hashed_password, c.env.DB)

      // Mark token as used
      await c.env.DB.prepare(`
        UPDATE password_reset_tokens
        SET used_at = ?
        WHERE id = ?
      `).bind(new Date().getTime(), token_record.id).run()

      // Clear any existing authentication cookies
      deleteCookie(c, 'auth_token', { path: '/' })
      deleteCookie(c, 'refresh_token', { path: '/' })

      return c.redirect('/app/login?message=Password has been reset successfully. Please sign in with your new password.')

    } catch (error) {
      console.error('Password reset completion error:', error)
      return c.redirect('/app/reset-password?token=' + c.req.valid('form').token + '&error=An error occurred processing your request')
    }
  }
)

export { auth }