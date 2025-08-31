import { describe, it, expect, beforeAll } from 'vitest'
import {
  generate_jwe_keypair,
  create_auth_token,
  create_refresh_token,
  verify_jwe_token,
  is_token_expired,
  auth_token_payload_schema,
  refresh_token_payload_schema,
  type AuthTokenPayload,
  type RefreshTokenPayload
} from '../../src/utils/jwe'

describe('JWE Token System', () => {
  let keys: { publicKey: any; privateKey: any }
  
  beforeAll(async () => {
    keys = await generate_jwe_keypair()
  })

  describe('Key Generation', () => {
    it('should generate RSA key pairs', async () => {
      const keypair = await generate_jwe_keypair()
      
      expect(keypair.publicKey).toBeDefined()
      expect(keypair.privateKey).toBeDefined()
      expect(keypair.publicKey).not.toBe(keypair.privateKey)
    })

    it('should generate different key pairs each time', async () => {
      const keypair1 = await generate_jwe_keypair()
      const keypair2 = await generate_jwe_keypair()
      
      expect(keypair1.publicKey).not.toBe(keypair2.publicKey)
      expect(keypair1.privateKey).not.toBe(keypair2.privateKey)
    })
  })

  describe('Auth Token Creation', () => {
    const test_user_id = crypto.randomUUID()
    const test_email = 'test@example.com'
    const test_role = 'admin' as const

    it('should create valid auth tokens', async () => {
      const token = await create_auth_token(
        test_user_id,
        test_email,
        test_role,
        keys.publicKey
      )
      
      expect(token).toBeDefined()
      expect(typeof token).toBe('string')
      expect(token.split('.').length).toBe(5) // JWE format
    })

    it('should create tokens with correct payload structure', async () => {
      const token = await create_auth_token(
        test_user_id,
        test_email,
        test_role,
        keys.publicKey
      )
      
      const payload = await verify_jwe_token(token, keys.privateKey) as AuthTokenPayload
      
      expect(payload.sub).toBe(test_user_id)
      expect(payload.email).toBe(test_email)
      expect(payload.role).toBe(test_role)
      expect(payload.type).toBe('auth')
      expect(payload.iat).toBeDefined()
      expect(payload.exp).toBeDefined()
      expect(payload.jti).toBeDefined()
      expect(payload.exp - payload.iat).toBe(60 * 60) // 1 hour
    })

    it('should create unique tokens for same user', async () => {
      const token1 = await create_auth_token(
        test_user_id,
        test_email,
        test_role,
        keys.publicKey
      )
      const token2 = await create_auth_token(
        test_user_id,
        test_email,
        test_role,
        keys.publicKey
      )
      
      expect(token1).not.toBe(token2)
      
      const payload1 = await verify_jwe_token(token1, keys.privateKey) as AuthTokenPayload
      const payload2 = await verify_jwe_token(token2, keys.privateKey) as AuthTokenPayload
      
      expect(payload1.jti).not.toBe(payload2.jti)
    })

    it('should validate user role enum', async () => {
      const valid_roles = ['admin', 'user'] as const
      
      for (const role of valid_roles) {
        const token = await create_auth_token(
          test_user_id,
          test_email,
          role,
          keys.publicKey
        )
        const payload = await verify_jwe_token(token, keys.privateKey) as AuthTokenPayload
        expect(payload.role).toBe(role)
      }
    })
  })

  describe('Refresh Token Creation', () => {
    const test_user_id = crypto.randomUUID()
    const test_role = 'admin' as const

    it('should create valid refresh tokens', async () => {
      const token = await create_refresh_token(
        test_user_id,
        test_role,
        keys.publicKey
      )
      
      expect(token).toBeDefined()
      expect(typeof token).toBe('string')
      expect(token.split('.').length).toBe(5) // JWE format
    })

    it('should create tokens with correct payload structure', async () => {
      const token = await create_refresh_token(
        test_user_id,
        test_role,
        keys.publicKey
      )
      
      const payload = await verify_jwe_token(token, keys.privateKey) as RefreshTokenPayload
      
      expect(payload.sub).toBe(test_user_id)
      expect(payload.role).toBe(test_role)
      expect(payload.type).toBe('refresh')
      expect(payload.iat).toBeDefined()
      expect(payload.exp).toBeDefined()
      expect(payload.jti).toBeDefined()
      expect(payload.exp - payload.iat).toBe(3 * 24 * 60 * 60) // 3 days
    })

    it('should not include email in refresh tokens', async () => {
      const token = await create_refresh_token(
        test_user_id,
        test_role,
        keys.publicKey
      )
      
      const payload = await verify_jwe_token(token, keys.privateKey) as RefreshTokenPayload
      
      expect('email' in payload).toBe(false)
    })
  })

  describe('Token Verification', () => {
    it('should verify valid auth tokens', async () => {
      const test_user_id = crypto.randomUUID()
      const test_email = 'verify@example.com'
      const token = await create_auth_token(
        test_user_id,
        test_email,
        'admin',
        keys.publicKey
      )
      
      const payload = await verify_jwe_token(token, keys.privateKey)
      
      expect(payload).toBeDefined()
      expect(payload.type).toBe('auth')
      expect((payload as AuthTokenPayload).email).toBe(test_email)
    })

    it('should verify valid refresh tokens', async () => {
      const test_user_id = crypto.randomUUID()
      const token = await create_refresh_token(
        test_user_id,
        'user',
        keys.publicKey
      )
      
      const payload = await verify_jwe_token(token, keys.privateKey)
      
      expect(payload).toBeDefined()
      expect(payload.type).toBe('refresh')
      expect(payload.sub).toBe(test_user_id)
    })

    it('should reject tokens signed with different keys', async () => {
      const other_keys = await generate_jwe_keypair()
      const test_user_id = crypto.randomUUID()
      
      const token = await create_auth_token(
        test_user_id,
        'test@example.com',
        'admin',
        keys.publicKey
      )
      
      await expect(
        verify_jwe_token(token, other_keys.privateKey)
      ).rejects.toThrow('Token verification failed')
    })

    it('should reject malformed tokens', async () => {
      const malformed_tokens = [
        'invalid.token.format',
        'not-a-token-at-all',
        '',
        'too.few.parts',
        'too.many.parts.in.this.token.format.here',
      ]
      
      for (const token of malformed_tokens) {
        await expect(
          verify_jwe_token(token, keys.privateKey)
        ).rejects.toThrow()
      }
    })

    it('should validate token payload schemas', async () => {
      // This test ensures that if somehow invalid data gets into the payload,
      // the schema validation catches it
      const valid_auth_payload = {
        sub: crypto.randomUUID(),
        email: 'test@example.com',
        role: 'admin',
        type: 'auth',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
        jti: crypto.randomUUID(),
      }
      
      expect(auth_token_payload_schema.safeParse(valid_auth_payload).success).toBe(true)
      
      const invalid_auth_payload = {
        ...valid_auth_payload,
        email: 'not-an-email', // Invalid email
      }
      
      expect(auth_token_payload_schema.safeParse(invalid_auth_payload).success).toBe(false)
    })
  })

  describe('Token Expiration', () => {
    it('should detect expired auth tokens', async () => {
      // Create a payload that's already expired
      const expired_payload: AuthTokenPayload = {
        sub: crypto.randomUUID(),
        email: 'expired@example.com',
        role: 'admin',
        type: 'auth',
        iat: Math.floor(Date.now() / 1000) - 7200, // 2 hours ago
        exp: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
        jti: crypto.randomUUID(),
      }
      
      expect(is_token_expired(expired_payload)).toBe(true)
    })

    it('should detect non-expired tokens', async () => {
      const valid_payload: AuthTokenPayload = {
        sub: crypto.randomUUID(),
        email: 'valid@example.com',
        role: 'admin',
        type: 'auth',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
        jti: crypto.randomUUID(),
      }
      
      expect(is_token_expired(valid_payload)).toBe(false)
    })

    it('should handle edge case of exact expiration time', async () => {
      const now = Math.floor(Date.now() / 1000)
      const edge_payload: RefreshTokenPayload = {
        sub: crypto.randomUUID(),
        role: 'user',
        type: 'refresh',
        iat: now - 100,
        exp: now, // Expires right now
        jti: crypto.randomUUID(),
      }
      
      expect(is_token_expired(edge_payload)).toBe(true)
    })
  })

  describe('Token Security', () => {
    it('should produce encrypted tokens that cannot be read without decryption', async () => {
      const test_user_id = crypto.randomUUID()
      const test_email = 'security@example.com'
      
      const token = await create_auth_token(
        test_user_id,
        test_email,
        'admin',
        keys.publicKey
      )
      
      // JWE tokens should not contain readable information
      expect(token.includes(test_email)).toBe(false)
      expect(token.includes(test_user_id)).toBe(false)
      expect(token.includes('admin')).toBe(false)
    })

    it('should require both public and private keys', async () => {
      const keypair1 = await generate_jwe_keypair()
      const keypair2 = await generate_jwe_keypair()
      
      const token = await create_auth_token(
        crypto.randomUUID(),
        'test@example.com',
        'admin',
        keypair1.publicKey
      )
      
      // Should work with matching private key
      await expect(
        verify_jwe_token(token, keypair1.privateKey)
      ).resolves.toBeDefined()
      
      // Should fail with non-matching private key
      await expect(
        verify_jwe_token(token, keypair2.privateKey)
      ).rejects.toThrow()
    })
  })
})