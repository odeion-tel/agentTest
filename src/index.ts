import { Hono } from 'hono'
import { create_database } from './db/connection'
import { auth } from './routes/auth'
import admin from './routes/admin'

// Environment interface for Cloudflare Workers
export interface Env {
  DB: D1Database
  KV: KVNamespace
  RATE_LIMIT_KV: KVNamespace
  ENVIRONMENT: string
  JWT_SECRET?: string
  MAILGUN_API_KEY?: string
  MAILGUN_DOMAIN?: string
  FROM_EMAIL?: string
}

const app = new Hono<{ Bindings: Env }>()

// Health check endpoint
app.get('/', (c) => {
  return c.text('Conversionware Domain Manager - Authentication System')
})

// Database health check
app.get('/health', async (c) => {
  try {
    const db = create_database(c.env.DB)
    
    // Simple query to check database connection
    const result = await c.env.DB.prepare('SELECT 1 as health').first()
    
    return c.json({
      status: 'healthy',
      environment: c.env.ENVIRONMENT,
      database: result ? 'connected' : 'disconnected',
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    return c.json({
      status: 'unhealthy',
      environment: c.env.ENVIRONMENT,
      database: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    }, 503)
  }
})

// Mount auth routes
app.route('/app', auth)

// Mount admin routes
app.route('/admin', admin)

export default app