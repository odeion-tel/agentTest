import { sqliteTable, text, integer, uniqueIndex, index } from 'drizzle-orm/sqlite-core'

// Users table for admin authentication
export const users = sqliteTable('users', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  email: text('email').notNull().unique(),
  password_hash: text('password_hash').notNull(),
  is_admin: integer('is_admin', { mode: 'boolean' }).default(true).notNull(),
  created_at: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
  updated_at: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
}, (table) => ({
  email_idx: uniqueIndex('users_email_idx').on(table.email),
  created_at_idx: index('users_created_at_idx').on(table.created_at),
}))

// Password reset tokens table
export const password_reset_tokens = sqliteTable('password_reset_tokens', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  user_id: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  token_hash: text('token_hash').notNull().unique(),
  expires_at: integer('expires_at', { mode: 'timestamp' }).notNull(),
  used_at: integer('used_at', { mode: 'timestamp' }),
  created_at: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
}, (table) => ({
  token_hash_idx: uniqueIndex('password_reset_tokens_token_hash_idx').on(table.token_hash),
  user_id_idx: index('password_reset_tokens_user_id_idx').on(table.user_id),
  expires_at_idx: index('password_reset_tokens_expires_at_idx').on(table.expires_at),
}))

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type PasswordResetToken = typeof password_reset_tokens.$inferSelect
export type NewPasswordResetToken = typeof password_reset_tokens.$inferInsert