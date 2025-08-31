import { defineConfig } from 'vitest/config'
import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config'

export default defineWorkersConfig({
  test: {
    globals: true,
    pool: '@cloudflare/vitest-pool-workers',
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.toml' },
        miniflare: {
          // Enable compatibility flags for crypto operations
          compatibilityFlags: ['nodejs_compat'],
          // In-memory SQLite for D1 testing
          d1Databases: {
            DB: 'conversionware-test-db'
          }
        },
      },
    },
  },
})