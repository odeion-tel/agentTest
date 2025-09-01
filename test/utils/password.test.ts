import { describe, it, expect } from 'vitest'
import { 
  hash_password, 
  verify_password, 
  needs_rehash, 
  generate_secure_token,
  hash_token,
  password_schema 
} from '../../src/utils/password'

describe('Password Utilities', () => {
  describe('OWASP Password Validation', () => {
    it('should accept valid OWASP-compliant passwords', () => {
      const valid_passwords = [
        'MySecure123!',
        'AnotherGoodPassword2@',
        'SuperLongPasswordWithSpecialChars123!@#',
        '1234567890Aa!', // Minimum valid length
      ]

      valid_passwords.forEach(password => {
        expect(password_schema.safeParse(password).success).toBe(true)
      })
    })

    it('should reject passwords that are too short', () => {
      const short_passwords = [
        'Short1!',      // 7 chars
        'Test123!',     // 8 chars
        'MyPass1!',     // 9 chars
        'Password1!',   // 11 chars
      ]

      short_passwords.forEach(password => {
        const result = password_schema.safeParse(password)
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.issues[0].message).toContain('at least 12 characters')
        }
      })
    })

    it('should reject passwords that are too long', () => {
      const long_password = 'A'.repeat(129) + 'a1!' // 132 chars total (over 128)
      
      const result = password_schema.safeParse(long_password)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues.some(issue => issue.message.includes('not exceed 128 characters'))).toBe(true)
      }
    })

    it('should reject passwords missing uppercase letters', () => {
      const no_uppercase = 'mysecurepassword123!'
      
      const result = password_schema.safeParse(no_uppercase)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues.some(issue => issue.message.includes('uppercase'))).toBe(true)
      }
    })

    it('should reject passwords missing lowercase letters', () => {
      const no_lowercase = 'MYSECUREPASSWORD123!'
      
      const result = password_schema.safeParse(no_lowercase)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues.some(issue => issue.message.includes('lowercase'))).toBe(true)
      }
    })

    it('should reject passwords missing numbers', () => {
      const no_numbers = 'MySecurePassword!'
      
      const result = password_schema.safeParse(no_numbers)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues.some(issue => issue.message.includes('number'))).toBe(true)
      }
    })

    it('should reject passwords missing special characters', () => {
      const no_special = 'MySecurePassword123'
      
      const result = password_schema.safeParse(no_special)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues.some(issue => issue.message.includes('special character'))).toBe(true)
      }
    })
  })

  describe('Password Hashing', () => {
    it('should hash valid passwords successfully', async () => {
      const password = 'ValidPassword123!'
      const hash = await hash_password(password)
      
      expect(hash).toBeDefined()
      expect(hash).not.toBe(password)
      expect(hash.length).toBe(129) // 64 (salt) + 1 (:) + 64 (hash) = 129 chars
      expect(hash.includes(':')).toBe(true)
      expect(hash.split(':').length).toBe(2)
    })

    it('should produce different hashes for same password (salt)', async () => {
      const password = 'SamePassword123!'
      const hash1 = await hash_password(password)
      const hash2 = await hash_password(password)
      
      expect(hash1).not.toBe(hash2)
    })

    it('should reject invalid passwords during hashing', async () => {
      const invalid_passwords = [
        'short',           // Too short
        'nouppercase123!', // No uppercase
        'NOLOWERCASE123!', // No lowercase
        'NoNumbers!',      // No numbers
        'NoSpecialChars123', // No special chars
      ]

      for (const password of invalid_passwords) {
        await expect(hash_password(password)).rejects.toThrow('Invalid password')
      }
    })
  })

  describe('Password Verification', () => {
    it('should verify correct passwords', async () => {
      const password = 'CorrectPassword123!'
      const hash = await hash_password(password)
      
      const is_valid = await verify_password(password, hash)
      expect(is_valid).toBe(true)
    })

    it('should reject incorrect passwords', async () => {
      const correct_password = 'CorrectPassword123!'
      const wrong_password = 'WrongPassword123!'
      const hash = await hash_password(correct_password)
      
      const is_valid = await verify_password(wrong_password, hash)
      expect(is_valid).toBe(false)
    })

    it('should handle empty or null inputs safely', async () => {
      const hash = await hash_password('ValidPassword123!')
      
      expect(await verify_password('', hash)).toBe(false)
      expect(await verify_password('ValidPassword123!', '')).toBe(false)
    })

    it('should handle malformed hashes gracefully', async () => {
      const password = 'ValidPassword123!'
      const malformed_hash = 'not-a-valid-argon2-hash'
      
      const is_valid = await verify_password(password, malformed_hash)
      expect(is_valid).toBe(false)
    })
  })

  describe('Hash Upgrade Detection', () => {
    it('should detect when rehashing is needed', async () => {
      // Create a hash with wrong format
      const weak_hash = 'invalid-hash-format'
      
      expect(needs_rehash(weak_hash)).toBe(true)
    })

    it('should handle malformed hashes safely', () => {
      const malformed_hash = 'not-a-valid-hash'
      
      expect(needs_rehash(malformed_hash)).toBe(true)
    })
  })

  describe('Secure Token Generation', () => {
    it('should generate tokens of correct length', () => {
      const token16 = generate_secure_token(16)
      const token32 = generate_secure_token(32)
      const token64 = generate_secure_token(64)
      
      expect(token16).toHaveLength(32) // 16 bytes = 32 hex chars
      expect(token32).toHaveLength(64) // 32 bytes = 64 hex chars
      expect(token64).toHaveLength(128) // 64 bytes = 128 hex chars
    })

    it('should generate unique tokens', () => {
      const tokens = new Set()
      
      // Generate 100 tokens and verify uniqueness
      for (let i = 0; i < 100; i++) {
        const token = generate_secure_token()
        expect(tokens.has(token)).toBe(false)
        tokens.add(token)
      }
    })

    it('should generate hex-only characters', () => {
      const token = generate_secure_token()
      expect(token).toMatch(/^[0-9a-f]+$/)
    })

    it('should use default length of 32 bytes', () => {
      const token = generate_secure_token()
      expect(token).toHaveLength(64) // 32 bytes = 64 hex chars
    })
  })

  describe('Token Hashing', () => {
    it('should hash tokens consistently', async () => {
      const token = 'test-token-123'
      const hash1 = await hash_token(token)
      const hash2 = await hash_token(token)
      
      expect(hash1).toBe(hash2)
      expect(hash1).toHaveLength(64) // SHA-256 = 64 hex chars
      expect(hash1).toMatch(/^[0-9a-f]+$/)
    })

    it('should produce different hashes for different tokens', async () => {
      const token1 = 'token-1'
      const token2 = 'token-2'
      
      const hash1 = await hash_token(token1)
      const hash2 = await hash_token(token2)
      
      expect(hash1).not.toBe(hash2)
    })

    it('should handle empty tokens', async () => {
      const hash = await hash_token('')
      expect(hash).toBeDefined()
      expect(hash).toHaveLength(64)
    })
  })
})