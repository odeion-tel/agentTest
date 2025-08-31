# API Specification

This is the API specification for the spec detailed in @.agent-os/specs/2025-08-31-authentication-system/spec.md

> Created: 2025-08-31
> Version: 1.0.0

## Technical Requirements

### Framework & Environment
- **Framework**: Hono.js v4+ on Cloudflare Workers with JSX SSR
- **Runtime**: Cloudflare Workers (V8 isolates)
- **Authentication**: JWE tokens with RS256 signing
- **Response Format**: HTML via JSX Server-Side Rendering (NO JSON APIs)
- **Validation**: Zod schemas for form validation
- **Database**: Cloudflare D1 (SQLite)

### Security Requirements
- Rate limiting per IP and user
- CSRF protection for forms
- Request sanitization and validation
- Secure error responses (HTML error pages)
- Token rotation and invalidation
- Password complexity enforcement

## Routes

### Authentication Routes

#### GET /app/login
**Purpose**: Display admin login form

**Route Handler**:
```typescript
app.get('/app/login', async (c) => {
  return c.html(<LoginPage />)
})
```

**Response**: HTML login form with CSRF token

---

#### POST /app/login
**Purpose**: Process admin login with email and password credentials

**Route Handler**:
```typescript
app.post('/app/login', rateLimiter(5, 300), csrfProtection, async (c) => {
  // Implementation
})
```

**Form Schema**:
```typescript
const LoginSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  password: z.string().min(8).max(128),
  rememberMe: z.boolean().optional().default(false),
  csrf_token: z.string().min(1)
})
```

**Response**:
- **302 Redirect**: Successful authentication → redirect to `/app/dashboard`
- **200 OK**: Login form with validation errors (HTML)
- **429 Too Many Requests**: Rate limit error page (HTML)

**Middleware**: `rateLimiter`, `csrfProtection`, `validateForm(LoginSchema)`

---

#### POST /app/logout
**Purpose**: Invalidate current session and tokens

**Route Handler**:
```typescript
app.post('/app/logout', authRequired, csrfProtection, async (c) => {
  // Implementation
})
```

**Form Data**:
- `csrf_token`: CSRF protection token

**Response**:
- **302 Redirect**: Successfully logged out → redirect to `/app/login`
- **401 Unauthorized**: Redirect to login page

**Middleware**: `authRequired`, `csrfProtection`, `tokenBlacklist`

---

#### POST /app/auth/refresh
**Purpose**: Background token refresh (HTMX endpoint)

**Route Handler**:
```typescript
app.post('/app/auth/refresh', rateLimiter(10, 300), async (c) => {
  // Implementation
})
```

**Headers**:
- `HX-Request`: HTMX identifier
- Cookie with refresh token

**Response**:
- **200 OK**: New auth cookie set, returns empty response
- **401 Unauthorized**: Returns HTMX redirect header to login
- **403 Forbidden**: Returns HTMX redirect header to login

**Middleware**: `rateLimiter`, `htmxOnly`

---

#### GET /app/forgot-password
**Purpose**: Display forgot password form

**Route Handler**:
```typescript
app.get('/app/forgot-password', async (c) => {
  return c.html(<ForgotPasswordPage />)
})
```

**Response**: HTML forgot password form with CSRF token

---

#### POST /app/forgot-password
**Purpose**: Process password reset request

**Route Handler**:
```typescript
app.post('/app/forgot-password', rateLimiter(3, 600), csrfProtection, async (c) => {
  // Implementation
})
```

**Form Schema**:
```typescript
const ForgotPasswordSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  csrf_token: z.string().min(1)
})
```

**Response**:
- **200 OK**: Success page (always returns success for security)
- **429 Too Many Requests**: Rate limit error page (HTML)

**Middleware**: `rateLimiter`, `csrfProtection`, `validateForm(ForgotPasswordSchema)`

---

#### GET /app/reset-password
**Purpose**: Display password reset form

**Route Handler**:
```typescript
app.get('/app/reset-password', async (c) => {
  const token = c.req.query('token')
  if (!token) return c.redirect('/app/forgot-password')
  return c.html(<ResetPasswordPage token={token} />)
})
```

**Query Parameters**: `token` - Password reset token from email

**Response**: HTML password reset form with CSRF token

---

#### POST /app/reset-password
**Purpose**: Process password reset with token

**Route Handler**:
```typescript
app.post('/app/reset-password', rateLimiter(5, 300), csrfProtection, async (c) => {
  // Implementation
})
```

**Form Schema**:
```typescript
const ResetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(12).max(128)
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, 
           "Password must contain uppercase, lowercase, number, and special character"),
  confirmPassword: z.string(),
  csrf_token: z.string().min(1)
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"]
})
```

**Response**:
- **302 Redirect**: Password successfully reset → redirect to `/app/login`
- **200 OK**: Reset form with validation errors (HTML)
- **410 Gone**: Token expired error page (HTML)

**Middleware**: `rateLimiter`, `csrfProtection`, `validateForm(ResetPasswordSchema)`

---

### Admin Management Routes

#### GET /app/dashboard
**Purpose**: Display admin dashboard (auth required)

**Route Handler**:
```typescript
app.get('/app/dashboard', authRequired, async (c) => {
  const user = c.get('user')
  return c.html(<DashboardPage user={user} />)
})
```

**Response**: HTML admin dashboard with user profile

**Middleware**: `authRequired`

---

#### GET /app/admin/users
**Purpose**: Display admin user management page (admin only)

**Route Handler**:
```typescript
app.get('/app/admin/users', authRequired, adminOnly, async (c) => {
  // Get query params for pagination/filtering
  const query = c.req.query()
  const users = await getUserList(query)
  return c.html(<AdminUsersPage users={users} query={query} />)
})
```

**Query Parameters**:
```typescript
const ListUsersQuery = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  role: z.enum(['admin', 'moderator']).optional(),
  search: z.string().optional(),
  sortBy: z.enum(['email', 'createdAt', 'lastLoginAt']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc')
})
```

**Response**: HTML user management page with pagination

**Middleware**: `authRequired`, `adminOnly`, `validateQuery(ListUsersQuery)`

---

#### GET /app/admin/users/new
**Purpose**: Display create new admin user form (admin only)

**Route Handler**:
```typescript
app.get('/app/admin/users/new', authRequired, adminOnly, async (c) => {
  return c.html(<CreateUserPage />)
})
```

**Response**: HTML create user form with CSRF token

**Middleware**: `authRequired`, `adminOnly`

---

#### POST /app/admin/users
**Purpose**: Process new admin user creation (admin only)

**Route Handler**:
```typescript
app.post('/app/admin/users', authRequired, adminOnly, csrfProtection, async (c) => {
  // Implementation
})
```

**Form Schema**:
```typescript
const CreateUserSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  password: z.string().min(12).max(128)
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/),
  role: z.enum(['admin', 'moderator']).default('moderator'),
  sendWelcomeEmail: z.boolean().optional().default(true),
  csrf_token: z.string().min(1)
})
```

**Response**:
- **302 Redirect**: User successfully created → redirect to `/app/admin/users`
- **200 OK**: Create form with validation errors (HTML)
- **409 Conflict**: Email exists error page (HTML)

**Middleware**: `authRequired`, `adminOnly`, `csrfProtection`, `validateForm(CreateUserSchema)`

## JSX Components

### Authentication Pages

#### Login Page (`components/auth/LoginPage.tsx`)
```typescript
import { FC } from 'hono/jsx'

interface LoginPageProps {
  errors?: Record<string, string>
  csrfToken: string
}

export const LoginPage: FC<LoginPageProps> = ({ errors, csrfToken }) => {
  return (
    <html>
      <head>
        <title>Admin Login</title>
        <link rel="stylesheet" href="/static/admin.css" />
      </head>
      <body>
        <div class="login-container">
          <h1>Admin Login</h1>
          <form method="POST" action="/app/login">
            <input type="hidden" name="csrf_token" value={csrfToken} />
            
            <div class="form-group">
              <label for="email">Email</label>
              <input 
                type="email" 
                id="email" 
                name="email" 
                required 
                class={errors?.email ? 'error' : ''}
              />
              {errors?.email && <span class="error-message">{errors.email}</span>}
            </div>
            
            <div class="form-group">
              <label for="password">Password</label>
              <input 
                type="password" 
                id="password" 
                name="password" 
                required 
                class={errors?.password ? 'error' : ''}
              />
              {errors?.password && <span class="error-message">{errors.password}</span>}
            </div>
            
            <div class="form-group">
              <label>
                <input type="checkbox" name="rememberMe" />
                Remember me
              </label>
            </div>
            
            <button type="submit">Login</button>
          </form>
          
          <a href="/app/forgot-password">Forgot password?</a>
        </div>
      </body>
    </html>
  )
}
```

#### Dashboard Page (`components/admin/DashboardPage.tsx`)
```typescript
import { FC } from 'hono/jsx'
import { User } from '../types/auth'

interface DashboardPageProps {
  user: User
}

export const DashboardPage: FC<DashboardPageProps> = ({ user }) => {
  return (
    <html>
      <head>
        <title>Admin Dashboard</title>
        <script src="https://unpkg.com/htmx.org@1.9.10"></script>
        <script src="https://unpkg.com/alpinejs@3.x.x/dist/cdn.min.js"></script>
      </head>
      <body>
        <nav class="admin-nav">
          <h1>Domain Manager Admin</h1>
          <div class="user-info">
            <span>Welcome, {user.email}</span>
            <form method="POST" action="/app/logout" style="display: inline">
              <input type="hidden" name="csrf_token" value="{csrfToken}" />
              <button type="submit">Logout</button>
            </form>
          </div>
        </nav>
        
        <main class="dashboard-content">
          <h2>Dashboard</h2>
          <div class="dashboard-cards">
            <div class="card">
              <h3>Users</h3>
              <p>Manage admin users</p>
              <a href="/app/admin/users">Manage Users</a>
            </div>
          </div>
        </main>
        
        {/* Auto-refresh auth token via HTMX */}
        <div 
          hx-post="/app/auth/refresh" 
          hx-trigger="every 50m"
          hx-swap="none"
        ></div>
      </body>
    </html>
  )
}
```

### Middleware Implementation

#### Authentication Middleware (`auth.middleware.ts`)
```typescript
import { createMiddleware } from 'hono/factory'
import { verify } from 'hono/jwt'

export const authRequired = createMiddleware(async (c, next) => {
  const token = c.req.cookie('auth_token')
  
  if (!token) {
    return c.redirect('/app/login')
  }
  
  try {
    const payload = await verify(token, c.env.JWT_SECRET)
    c.set('user', payload)
    await next()
  } catch (error) {
    return c.redirect('/app/login')
  }
})

export const adminOnly = createMiddleware(async (c, next) => {
  const user = c.get('user')
  
  if (user?.role !== 'admin') {
    return c.html(<ErrorPage message="Admin access required" />, 403)
  }
  
  await next()
})
```

#### Rate Limiting Middleware (`rate-limit.middleware.ts`)
```typescript
import { createMiddleware } from 'hono/factory'

export const rateLimiter = (requests: number, windowMs: number) => {
  return createMiddleware(async (c, next) => {
    const ip = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'unknown'
    const key = `rate_limit:${ip}:${c.req.path}`
    
    // Implementation using Cloudflare KV or Durable Objects
    // for distributed rate limiting
    
    await next()
  })
}
```

#### Form Validation Middleware (`validation.middleware.ts`)
```typescript
import { createMiddleware } from 'hono/factory'
import { z } from 'zod'

export const validateForm = (schema: z.ZodSchema, redirectPath?: string) => {
  return createMiddleware(async (c, next) => {
    try {
      const formData = await c.req.formData()
      const data = Object.fromEntries(formData.entries())
      const validatedData = schema.parse(data)
      c.set('validatedData', validatedData)
      await next()
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errors = error.errors.reduce((acc, err) => {
          acc[err.path[0]] = err.message
          return acc
        }, {} as Record<string, string>)
        
        // Re-render form with errors
        const currentPath = c.req.path
        if (currentPath.includes('/login')) {
          return c.html(<LoginPage errors={errors} csrfToken={generateCSRF()} />)
        }
        // Add other form error handling as needed
        
        return c.html(<ErrorPage message="Validation failed" errors={errors} />, 400)
      }
      throw error
    }
  })
}

export const validateQuery = (schema: z.ZodSchema) => {
  return createMiddleware(async (c, next) => {
    try {
      const query = c.req.query()
      const validatedQuery = schema.parse(query)
      c.set('validatedQuery', validatedQuery)
      await next()
    } catch (error) {
      if (error instanceof z.ZodError) {
        return c.html(<ErrorPage message="Invalid request parameters" />, 400)
      }
      throw error
    }
  })
}
```

### Error Handling

#### Global Error Handler
```typescript
app.onError((err, c) => {
  console.error('Application Error:', err)
  
  if (err instanceof z.ZodError) {
    return c.html(<ErrorPage message="Validation failed" errors={err.errors} />, 400)
  }
  
  // Don't leak internal errors in production
  const isDev = c.env.ENVIRONMENT === 'development'
  
  return c.html(<ErrorPage message={isDev ? err.message : 'Internal server error'} />, 500)
})
```

#### CSRF Protection Middleware
```typescript
import { createMiddleware } from 'hono/factory'

export const csrfProtection = createMiddleware(async (c, next) => {
  if (c.req.method === 'POST') {
    const formData = await c.req.formData()
    const csrfToken = formData.get('csrf_token') as string
    const sessionToken = c.req.cookie('csrf_token')
    
    if (!csrfToken || !sessionToken || csrfToken !== sessionToken) {
      return c.html(<ErrorPage message="Invalid request" />, 403)
    }
  }
  
  await next()
})

export const generateCSRF = () => {
  return crypto.randomUUID()
}
```

### Stateless Session Management

#### Stateless Cookie-Based Authentication
```typescript
// Set stateless authentication cookies - no database session tracking
const setAuthCookies = (c: Context, accessToken: string, refreshToken: string) => {
  // Stateless auth token containing all user data
  c.cookie('auth_token', accessToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    maxAge: 3600 // 1 hour - embedded in JWE token
  })
  
  // Stateless refresh token containing user ID and role only
  c.cookie('refresh_token', refreshToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    maxAge: 259200 // 3 days - embedded in JWE token
  })
  
  // CSRF protection token
  c.cookie('csrf_token', generateCSRF(), {
    httpOnly: false, // Accessible to JS for CSRF protection
    secure: true,
    sameSite: 'Lax',
    maxAge: 3600
  })
}

// Stateless token validation - no database lookups
const validateStatelessToken = async (token: string, c: Context) => {
  try {
    // Verify JWE token signature and expiration
    const payload = await jweVerify(token, await getJWEKey(c.env))
    
    // Optional: Check token blacklist for logout (if implemented)
    const jti = payload.jti
    const isBlacklisted = await c.env.KV.get(`blacklist:${jti}`)
    if (isBlacklisted) {
      throw new Error('Token is blacklisted')
    }
    
    return payload
  } catch (error) {
    throw new Error('Invalid token')
  }
}
```

### Database Integration
```typescript
// Using Cloudflare D1 with Hono
export interface Env {
  DB: D1Database
  JWT_SECRET: string
  ENVIRONMENT: string
}

// In route handlers
const user = await c.env.DB.prepare(
  'SELECT * FROM admin_users WHERE email = ?'
).bind(email).first()
```

### Stateless Token Management
- **Access Token**: 1 hour expiration, stored in httpOnly cookie, **all session data embedded**
- **Refresh Token**: 3 days expiration, stored in httpOnly cookie, **contains user ID and role**
- **CSRF Token**: 1 hour expiration, accessible to JavaScript for form protection
- **Password Reset Token**: 1 hour expiration, single-use, stored hashed in database
- **JWE Encryption**: All tokens encrypted with A256GCM using Cloudflare Workers Crypto API
- **No Database Sessions**: Token validation through JWE verification only
- **Optional Blacklist**: Use Cloudflare KV for logout token blacklisting