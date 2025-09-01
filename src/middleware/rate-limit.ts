import type { Context, Next } from 'hono';
import type { Env } from '../index';

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyGenerator?: (c: Context) => string;
}

const defaultRateLimitConfig: RateLimitConfig = {
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 100,
};

/**
 * Rate limiting middleware
 * Uses Cloudflare Workers KV for distributed rate limiting
 */
export function rate_limit_middleware(config: Partial<RateLimitConfig> = {}) {
  const finalConfig = { ...defaultRateLimitConfig, ...config };
  
  return async (c: Context<{ Bindings: Env }>, next: Next) => {
    const kv = c.env.RATE_LIMIT_KV;
    if (!kv) {
      // If KV is not configured, skip rate limiting
      await next();
      return;
    }
    
    const keyGenerator = finalConfig.keyGenerator || ((c) => {
      // Use IP address as default key
      const ip = c.req.header('cf-connecting-ip') || 
                c.req.header('x-forwarded-for') || 
                c.req.header('x-real-ip') || 
                'unknown';
      return `rate_limit:${c.req.url}:${ip}`;
    });
    
    const key = keyGenerator(c);
    const now = Date.now();
    
    try {
      // Get current rate limit data
      const stored = await kv.get(key);
      let entry: RateLimitEntry;
      
      if (stored) {
        entry = JSON.parse(stored);
        
        // Reset if window has passed
        if (now > entry.resetTime) {
          entry = { count: 1, resetTime: now + finalConfig.windowMs };
        } else {
          entry.count++;
        }
      } else {
        entry = { count: 1, resetTime: now + finalConfig.windowMs };
      }
      
      // Check if limit exceeded
      if (entry.count > finalConfig.maxRequests) {
        const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
        return new Response('Too Many Requests', {
          status: 429,
          headers: {
            'Retry-After': retryAfter.toString(),
            'X-RateLimit-Limit': finalConfig.maxRequests.toString(),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': new Date(entry.resetTime).toISOString(),
          }
        });
      }
      
      // Store updated count
      await kv.put(key, JSON.stringify(entry), {
        expirationTtl: Math.ceil(finalConfig.windowMs / 1000)
      });
      
      // Add rate limit headers to response
      c.header('X-RateLimit-Limit', finalConfig.maxRequests.toString());
      c.header('X-RateLimit-Remaining', (finalConfig.maxRequests - entry.count).toString());
      c.header('X-RateLimit-Reset', new Date(entry.resetTime).toISOString());
      
      await next();
      
    } catch (error) {
      console.error('Rate limit error:', error);
      // On KV errors, allow the request to proceed
      await next();
    }
  };
}

/**
 * Specific rate limit configurations for different endpoints
 */
export const authRateLimit = rate_limit_middleware({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 5,
  keyGenerator: (c) => {
    const ip = c.req.header('cf-connecting-ip') || 
              c.req.header('x-forwarded-for') || 
              c.req.header('x-real-ip') || 
              'unknown';
    return `auth_rate_limit:${ip}`;
  }
});

export const passwordResetRateLimit = rate_limit_middleware({
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  maxRequests: 3,
  keyGenerator: (c) => {
    const ip = c.req.header('cf-connecting-ip') || 
              c.req.header('x-forwarded-for') || 
              c.req.header('x-real-ip') || 
              'unknown';
    return `password_reset_rate_limit:${ip}`;
  }
});

export const adminRateLimit = rate_limit_middleware({
  windowMs: 5 * 60 * 1000, // 5 minutes
  maxRequests: 20,
  keyGenerator: (c) => {
    const user = c.get('user');
    if (user) {
      return `admin_rate_limit:${user.user_id}`;
    }
    const ip = c.req.header('cf-connecting-ip') || 
              c.req.header('x-forwarded-for') || 
              c.req.header('x-real-ip') || 
              'unknown';
    return `admin_rate_limit:${ip}`;
  }
});

/**
 * Rate limit for API endpoints
 */
export const apiRateLimit = rate_limit_middleware({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 60,
});

/**
 * Strict rate limit for sensitive operations
 */
export const strictRateLimit = rate_limit_middleware({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 10,
});