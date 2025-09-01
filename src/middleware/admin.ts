import { getCookie } from 'hono/cookie';
import type { Context, Next } from 'hono';
import type { Env } from '../index';

/**
 * Admin authorization middleware
 * Requires authenticated user with admin role
 */
export async function admin_middleware(c: Context<{ Bindings: Env }>, next: Next) {
  try {
    // Get auth token
    const auth_token = getCookie(c, 'auth_token');
    if (!auth_token) {
      return c.html(
        '<html lang="en"><head><title>Access Denied</title></head><body><h1>Access Denied</h1><p>You must be logged in to access this page.</p><a href="/app/login">Login</a></body></html>',
        403
      );
    }

    // Verify token and extract user data
    const { verify_jwe_token } = await import('../utils/jwe');
    const jwt_secret = c.env.JWT_SECRET;
    if (!jwt_secret) {
      return c.html(
        '<html lang="en"><head><title>Server Error</title></head><body><h1>Server Configuration Error</h1></body></html>',
        500
      );
    }

    const user_data = await verify_jwe_token(auth_token, jwt_secret);
    
    // Check if user has admin role
    if (!user_data.is_admin) {
      return c.html(
        '<html lang="en"><head><title>Access Denied</title></head><body><h1>Access Denied</h1><p>You do not have permission to access this page.</p><a href="/app/dashboard">Back to Dashboard</a></body></html>',
        403
      );
    }

    // Store user data in context for downstream use
    c.set('user', user_data);
    
    await next();
  } catch (error) {
    console.error('Admin middleware error:', error);
    return c.html(
      '<html lang="en"><head><title>Access Denied</title></head><body><h1>Access Denied</h1><p>Invalid authentication token.</p><a href="/app/login">Login</a></body></html>',
      403
    );
  }
}

/**
 * Optional admin middleware - allows both admin and non-admin users
 * Sets user context but doesn't block access based on role
 */
export async function optional_admin_middleware(c: Context<{ Bindings: Env }>, next: Next) {
  try {
    const auth_token = getCookie(c, 'auth_token');
    if (auth_token) {
      const { verify_jwe_token } = await import('../utils/jwe');
      const jwt_secret = c.env.JWT_SECRET;
      
      if (jwt_secret) {
        const user_data = await verify_jwe_token(auth_token, jwt_secret);
        c.set('user', user_data);
      }
    }
    
    await next();
  } catch (error) {
    // Ignore errors and continue without user context
    await next();
  }
}