import { getCookie } from 'hono/cookie';
import type { Context, Next } from 'hono';
import type { Env } from '../index';

/**
 * CSRF protection middleware
 * Validates CSRF tokens for POST requests
 */
export async function csrf_middleware(c: Context<{ Bindings: Env }>, next: Next) {
  if (c.req.method === 'POST') {
    try {
      const contentType = c.req.header('content-type') || '';
      
      let token: string | null = null;
      
      // Handle different content types
      if (contentType.includes('application/json')) {
        const body = await c.req.json();
        token = body.csrf_token;
      } else if (contentType.includes('application/x-www-form-urlencoded') || 
                 contentType.includes('multipart/form-data')) {
        const formData = await c.req.formData();
        token = formData.get('csrf_token') as string;
      }
      
      const cookieToken = getCookie(c, 'csrf_token');
      
      if (!token || !cookieToken || token !== cookieToken) {
        return c.json({ error: 'Invalid CSRF token' }, 400);
      }
    } catch (error) {
      return c.json({ error: 'Invalid request format' }, 400);
    }
  }
  
  await next();
}

/**
 * Generate and set CSRF token in cookie
 */
export async function generateCSRFToken(c: Context<{ Bindings: Env }>) {
  const token = crypto.randomUUID();
  setCookie(c, 'csrf_token', token, {
    httpOnly: true,
    secure: true,
    sameSite: 'Strict',
    maxAge: 60 * 60, // 1 hour
  });
  return token;
}