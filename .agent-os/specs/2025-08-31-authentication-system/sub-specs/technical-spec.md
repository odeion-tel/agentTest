# Technical Specification

This is the technical specification for the spec detailed in @.agent-os/specs/2025-08-31-authentication-system/spec.md

> Created: 2025-08-31
> Version: 1.0.0

## Technical Requirements

### Authentication Token System

**JWE Token Implementation (Stateless):**
- Use `jose` library for JWE token creation and verification
- Access tokens: 1-hour expiration, containing user ID, email, and role
- Refresh tokens: 3-day expiration, containing user ID and role only
- Algorithm: A256GCM for content encryption, RSA-OAEP-256 for key encryption
- Key rotation: Store encryption keys in Cloudflare Workers KV with versioning
- **Stateless Design**: All session data embedded in token, no database lookups
- Token payload structure:
  ```json
  {
    "sub": "user_id",
    "email": "user@example.com", 
    "role": "admin",
    "iat": 1693440000,
    "exp": 1693443600,
    "type": "auth",
    "jti": "unique_token_id"
  }
  ```

**Password Security (OWASP Compliant):**
- Minimum 8 characters, maximum 128 characters
- Must contain: 1 uppercase, 1 lowercase, 1 number, 1 special character
- Password strength validation using zxcvbn library
- Argon2id hashing with the following parameters:
  - Memory cost: 65536 KB (64 MB)
  - Time cost: 3 iterations
  - Parallelism: 4 threads
  - Salt length: 32 bytes (cryptographically random)

**Cookie Security Configuration:**
- HttpOnly: true (prevent XSS access)
- Secure: true (HTTPS only)
- SameSite: 'Lax' (CSRF protection while allowing navigation)
- Domain: production domain only (no subdomain sharing)
- Path: '/' for auth cookies, '/app' for session cookies
- Cookie names: `auth_token` (access), `refresh_token` (refresh)

### Cloudflare Workers Stateless Authentication

**Stateless Session Management:**
- **NO database session storage** - JWE tokens contain all session data
- Session state embedded directly in JWE payload
- Token validation through JWE verification only
- No database lookups required for authentication
- **Logout Implementation**: Token blacklist using Cloudflare KV (optional)

**Token Lifecycle:**
- Create JWE token on login with all user data embedded
- Token carries its own expiration - no database expiry checks
- Token refresh generates new token with fresh expiration
- Logout can optionally add token JTI to KV blacklist
- No session cleanup needed - tokens expire naturally

### Email Verification System

**Email Service Integration:**
- Use Cloudflare Workers with Mailgun API for email delivery
- Verification token: 24-hour expiration, single-use
- Email template stored in Workers KV
- Verification link format: `https://domain.com/verify?token=<jwt_token>`
- Rate limiting: 3 verification emails per 24-hour period per email

**Database Schema for Verification:**
```sql
CREATE TABLE email_verifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at DATETIME NOT NULL,
  verified_at DATETIME,
  attempts INTEGER DEFAULT 0
);
```

### Route Protection System

**Protected Routes:**
- All `/app/*` paths require valid authentication
- Middleware implementation in Hono:
  ```typescript
  const authMiddleware = async (c: Context, next: Next) => {
    const token = getCookie(c, 'auth_token')
    if (!token || !await verifyJWE(token)) {
      return c.redirect('/login')
    }
    await next()
  }
  ```

**Authorization Levels:**
- Public: `/`, `/login`, `/register`, `/verify`
- Authenticated: `/app/*`, `/settings`, `/logout`
- Admin: `/admin/*` (future implementation)

### Security Headers and CORS

**Security Headers (all responses):**
```typescript
c.header('X-Content-Type-Options', 'nosniff')
c.header('X-Frame-Options', 'DENY')
c.header('X-XSS-Protection', '1; mode=block')
c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
c.header('Referrer-Policy', 'strict-origin-when-cross-origin')
c.header('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'")
```

**CORS Configuration:**
- Allowed origins: Production domain only
- Credentials: true (for cookies)
- Methods: GET, POST, PUT, DELETE, OPTIONS
- Headers: Content-Type, Authorization, X-Requested-With

### Stateless Token Refresh Mechanism

**Refresh Flow:**
1. Client detects expired access token (401 response)
2. Automatically attempt refresh using refresh token
3. If refresh successful, retry original request
4. If refresh fails, redirect to login

**Stateless Refresh Token Validation:**
- Verify JWE signature and expiration ONLY
- **No database session checks** - token is self-contained
- Generate new access token with embedded user data
- Optional: Rotate refresh token for enhanced security
- Optional: Check KV blacklist if logout tracking enabled

### Rate Limiting and Abuse Prevention

**Login Attempts:**
- 5 failed attempts per IP per 15 minutes
- 10 failed attempts per email per hour
- Exponential backoff: 1s, 2s, 4s, 8s, 16s delays

**Registration:**
- 3 registrations per IP per hour
- Email domain validation against disposable email providers

**Implementation using Cloudflare Workers KV:**
```typescript
const rateLimitKey = `ratelimit:${ip}:${action}`
const attempts = await env.KV.get(rateLimitKey)
if (attempts && parseInt(attempts) >= limit) {
  return c.json({ error: 'Rate limit exceeded' }, 429)
}
```

## Approach

**Development Phases:**
1. **Foundation** (Week 1): Core stateless JWE implementation, password hashing, basic middleware
2. **Authentication Flow** (Week 2): Login/logout endpoints, stateless token management
3. **Security Hardening** (Week 3): Rate limiting, security headers, password reset flow
4. **Route Protection** (Week 4): Middleware integration, error handling, testing

**Testing Strategy:**
- Unit tests for all cryptographic functions
- Integration tests for authentication flows
- Security testing with OWASP ZAP
- Load testing for rate limiting mechanisms

**Error Handling:**
- Consistent error response format
- Secure error messages (no information leakage)
- Comprehensive logging for security events
- Graceful degradation for external service failures

## External Dependencies

**Required New Dependencies:**
- `jose` (^4.15.4) - JWE/JWT implementation
- `argon2` (^0.30.3) - Password hashing (use wasm version for Workers)
- `zxcvbn` (^4.4.2) - Password strength validation

**Cloudflare Services:**
- **Cloudflare D1** - User and session storage (existing)
- **Cloudflare Workers KV** - Rate limiting, key storage, email templates
- **Cloudflare Workers** - Runtime environment (existing)

**External APIs:**
- **Mailgun API** - Email delivery service
  - Account setup required
  - API key storage in Workers secrets
  - Domain verification for sending emails

**Optional Enhancements:**
- **Turnstile** - CAPTCHA for registration/login forms
- **Cloudflare Access** - Additional enterprise security layer
- **Sentry** - Error tracking and monitoring

**Browser Compatibility:**
- Modern browsers supporting Web Crypto API
- Graceful fallback for older browsers (redirect to upgrade page)
- Progressive enhancement for JavaScript-disabled users