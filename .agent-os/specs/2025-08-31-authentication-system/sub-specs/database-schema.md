# Database Schema

This is the database schema implementation for the spec detailed in @.agent-os/specs/2025-08-31-authentication-system/spec.md

> Created: 2025-08-31
> Version: 1.0.0

## Schema Changes

### Core Tables

#### Users Table
```sql
-- Drizzle ORM Schema Definition
export const users = sqliteTable('users', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  email: text('email').notNull().unique(),
  hashedPassword: text('hashed_password').notNull(),
  isAdmin: integer('is_admin', { mode: 'boolean' }).default(false).notNull(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).default(false).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
  lastLoginAt: integer('last_login_at', { mode: 'timestamp' }),
}, (table) => ({
  emailIdx: uniqueIndex('users_email_idx').on(table.email),
  createdAtIdx: index('users_created_at_idx').on(table.createdAt),
}));
```

#### User Sessions Table
```sql
-- REMOVED: JWE tokens are stateless, no session tracking needed
-- Sessions are managed entirely through JWE tokens with embedded expiration
// export const userSessions = sqliteTable('user_sessions', { ... });
```

**Note**: User sessions table is removed because JWE tokens are stateless. All session information (user ID, expiration, role) is encoded directly in the JWE token itself. No database lookups needed for token validation.
```

#### Password Reset Tokens Table
```sql
-- Email verification and password reset tokens
export const passwordResetTokens = sqliteTable('password_reset_tokens', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(), // Hashed token for security
  tokenType: text('token_type').notNull(), // 'password_reset' | 'email_verification'
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  usedAt: integer('used_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
}, (table) => ({
  tokenIdx: uniqueIndex('reset_tokens_token_idx').on(table.token),
  userIdTypeIdx: index('reset_tokens_user_type_idx').on(table.userId, table.tokenType),
  expiresAtIdx: index('reset_tokens_expires_at_idx').on(table.expiresAt),
  activeTokensIdx: index('reset_tokens_active_idx').on(table.expiresAt, table.usedAt),
}));
```

### Cloudflare D1 Specific Considerations

#### Connection Configuration
```typescript
// Drizzle D1 configuration
import { drizzle } from 'drizzle-orm/d1';
import type { DrizzleD1Database } from 'drizzle-orm/d1';

export type Database = DrizzleD1Database<typeof schema>;

export function createDatabase(d1: D1Database): Database {
  return drizzle(d1, { schema });
}
```

#### Performance Indexes
- **Login Performance**: Email lookup index for fast authentication
- **Password Reset**: Unique indexes on reset token fields for fast lookups
- **Cleanup Queries**: Indexes on timestamp fields for efficient token cleanup

#### Data Integrity Constraints
- Foreign key cascade deletes for user cleanup
- Unique constraints on email and token fields
- Boolean fields with explicit defaults
- Timestamp fields for audit trails

## Migrations

### Migration 0001: Initial Authentication Schema
```sql
-- Create users table
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  hashed_password TEXT NOT NULL,
  is_admin INTEGER DEFAULT 0 NOT NULL,
  email_verified INTEGER DEFAULT 0 NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_login_at INTEGER
);

-- Create indexes for users
CREATE UNIQUE INDEX users_email_idx ON users(email);
CREATE INDEX users_created_at_idx ON users(created_at);

-- user_sessions table REMOVED for stateless JWE implementation
-- No session tracking in database - all handled by JWE tokens

-- Create password_reset_tokens table
CREATE TABLE password_reset_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  token_type TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  created_at INTEGER NOT NULL
);

-- Create indexes for password_reset_tokens
CREATE UNIQUE INDEX reset_tokens_token_idx ON password_reset_tokens(token);
CREATE INDEX reset_tokens_user_type_idx ON password_reset_tokens(user_id, token_type);
CREATE INDEX reset_tokens_expires_at_idx ON password_reset_tokens(expires_at);
CREATE INDEX reset_tokens_active_idx ON password_reset_tokens(expires_at, used_at);
```

### Migration 0002: Create Initial Admin User
```typescript
// Drizzle migration script
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';

export async function createInitialAdmin(db: Database) {
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@yourdomain.com';
  const adminPassword = process.env.ADMIN_PASSWORD || 'TempPassword123!';
  
  // Check if admin already exists
  const existingAdmin = await db
    .select()
    .from(users)
    .where(eq(users.email, adminEmail))
    .get();
    
  if (!existingAdmin) {
    const hashedPassword = await bcrypt.hash(adminPassword, 12);
    
    await db.insert(users).values({
      email: adminEmail,
      hashedPassword,
      isAdmin: true,
      emailVerified: true,
    });
    
    console.log(`Initial admin user created: ${adminEmail}`);
  }
}
```

### Token Cleanup Migration
```typescript
// Scheduled cleanup for expired password reset tokens only
// No session cleanup needed - JWE tokens are stateless
export async function cleanupExpiredData(db: Database) {
  const now = new Date();
    
  // Remove used or expired reset tokens
  await db
    .delete(passwordResetTokens)
    .where(
      or(
        lt(passwordResetTokens.expiresAt, now),
        isNotNull(passwordResetTokens.usedAt)
      )
    );
}
```

### OWASP Password Requirements Validation
```typescript
// Password validation helper
export function validatePassword(password: string): boolean {
  const requirements = {
    minLength: password.length >= 12,
    hasUppercase: /[A-Z]/.test(password),
    hasLowercase: /[a-z]/.test(password),
    hasNumbers: /\d/.test(password),
    hasSpecialChars: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password),
  };
  
  return Object.values(requirements).every(Boolean);
}
```

### Token Security Implementation
```typescript
// Secure token hashing for sessions
import { createHash } from 'crypto';

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// Stateless JWE token creation with embedded expiration
export function createStatelessTokenPair(userId: string, userRole: string) {
  const now = Math.floor(Date.now() / 1000);
  
  const authPayload = {
    sub: userId,
    role: userRole,
    iat: now,
    exp: now + (60 * 60), // 1 hour
    type: 'auth'
  };
  
  const refreshPayload = {
    sub: userId,
    role: userRole,
    iat: now,
    exp: now + (3 * 24 * 60 * 60), // 3 days
    type: 'refresh'
  };
  
  return { authPayload, refreshPayload };
}
```