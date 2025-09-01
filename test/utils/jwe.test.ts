import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  generate_jwe_key,
  create_auth_token,
  create_refresh_token,
  verify_jwe_token,
  is_token_expired,
  extract_token_payload_unsafe,
  type TokenUserData,
  type AuthTokenPayload,
  type RefreshTokenPayload,
} from '../../src/utils/jwe'

describe('JWE Token System', () => {
  const TEST_SECRET = 'test-secret-32-chars-minimum-length'
  const SHORT_SECRET = 'short'
  const WRONG_SECRET = 'wrong-secret-32-chars-minimum-len'
  
  const mockUser: TokenUserData = {
    id: '123',
    email: 'test@example.com',
    is_admin: false,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('generate_jwe_key - Key Security', () => {
    it('should generate key from valid secret', async () => {
      const key = await generate_jwe_key(TEST_SECRET)
      
      expect(key).toBeInstanceOf(CryptoKey)
      expect(key.type).toBe('secret')
      expect(key.algorithm.name).toBe('AES-GCM')
    })

    it('should reject short secrets', async () => {
      await expect(generate_jwe_key(SHORT_SECRET)).rejects.toThrow('JWT secret must be at least 32 characters long')
    })

    it('should reject empty/null secrets', async () => {
      await expect(generate_jwe_key('')).rejects.toThrow('JWT secret must be at least 32 characters long')
    })
  })

  // Token creation/verification covered by token-lifecycle.test.ts - removed to avoid redundancy

  // Contract tests and expiration validation covered by token-lifecycle.test.ts - removed to avoid redundancy

  describe('extract_token_payload_unsafe - Debug Utility', () => {
    it('should indicate JWE encryption for valid tokens', async () => {
      const token = await create_auth_token(mockUser, TEST_SECRET)
      const result = extract_token_payload_unsafe(token)
      
      expect(result.message).toContain('JWE payload is encrypted')
    })

    it('should handle invalid token format', () => {
      const invalidToken = 'invalid.token.format'
      const result = extract_token_payload_unsafe(invalidToken)
      
      expect(result.error).toContain('Cannot extract JWE payload')
    })
  })
})