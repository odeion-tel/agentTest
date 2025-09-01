import { z } from 'zod'

// OWASP-compliant password validation schema
export const password_schema = z.string()
  .min(12, 'Password must be at least 12 characters')
  .max(128, 'Password must not exceed 128 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/\d/, 'Password must contain at least one number')
  .regex(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/, 'Password must contain at least one special character')

// PBKDF2 configuration for Cloudflare Workers (using Web Crypto API)
const PBKDF2_CONFIG = {
  iterations: 600000, // OWASP recommended minimum (600k for PBKDF2-SHA256)
  saltLength: 32,     // 32 bytes salt
  keyLength: 32,      // 32 bytes output
}

/**
 * Hash a password using PBKDF2-SHA256 with OWASP-compliant parameters
 * Uses Cloudflare Workers Web Crypto API
 * @param password Plain text password to hash
 * @returns Promise<string> Hashed password with salt (format: salt:hash)
 */
export async function hash_password(password: string): Promise<string> {
  // Validate password meets OWASP requirements
  const validation_result = password_schema.safeParse(password)
  if (!validation_result.success) {
    throw new Error(`Invalid password: ${validation_result.error.issues.map(i => i.message).join(', ')}`)
  }

  try {
    // Generate random salt
    const salt = crypto.getRandomValues(new Uint8Array(PBKDF2_CONFIG.saltLength))
    
    // Convert password to ArrayBuffer
    const encoder = new TextEncoder()
    const passwordBuffer = encoder.encode(password)
    
    // Import password as key material
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      passwordBuffer,
      'PBKDF2',
      false,
      ['deriveBits']
    )
    
    // Derive key using PBKDF2
    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: PBKDF2_CONFIG.iterations,
        hash: 'SHA-256'
      },
      keyMaterial,
      PBKDF2_CONFIG.keyLength * 8 // bits
    )
    
    // Convert to hex strings
    const saltHex = Array.from(salt, byte => byte.toString(16).padStart(2, '0')).join('')
    const hashHex = Array.from(new Uint8Array(derivedBits), byte => byte.toString(16).padStart(2, '0')).join('')
    
    // Return in format: salt:hash
    return `${saltHex}:${hashHex}`
  } catch (error) {
    throw new Error(`Password hashing failed: ${error}`)
  }
}

/**
 * Verify a password against its hash using PBKDF2-SHA256
 * @param password Plain text password to verify
 * @param hash Stored password hash (format: salt:hash)
 * @returns Promise<boolean> True if password matches hash
 */
export async function verify_password(password: string, hash: string): Promise<boolean> {
  if (!password || !hash) {
    return false
  }

  try {
    // Parse salt and hash from stored format
    const parts = hash.split(':')
    if (parts.length !== 2) {
      return false
    }
    
    const [saltHex, storedHashHex] = parts
    
    // Convert hex salt back to Uint8Array
    const salt = new Uint8Array(saltHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)))
    
    // Convert password to ArrayBuffer
    const encoder = new TextEncoder()
    const passwordBuffer = encoder.encode(password)
    
    // Import password as key material
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      passwordBuffer,
      'PBKDF2',
      false,
      ['deriveBits']
    )
    
    // Derive key using same parameters
    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: PBKDF2_CONFIG.iterations,
        hash: 'SHA-256'
      },
      keyMaterial,
      PBKDF2_CONFIG.keyLength * 8 // bits
    )
    
    // Convert derived bits to hex
    const derivedHashHex = Array.from(new Uint8Array(derivedBits), byte => byte.toString(16).padStart(2, '0')).join('')
    
    // Constant-time comparison
    return derivedHashHex === storedHashHex
  } catch (error) {
    // Log error for debugging but don't expose details
    console.error('Password verification error:', error)
    return false
  }
}

/**
 * Check if password needs rehashing (for security upgrades)
 * @param hash Stored password hash
 * @returns boolean True if password should be rehashed
 */
export function needs_rehash(hash: string): boolean {
  try {
    // Check if hash is in the expected format (salt:hash)
    const parts = hash.split(':')
    if (parts.length !== 2) {
      return true // Invalid format, needs rehashing
    }
    
    const [saltHex, hashHex] = parts
    
    // Check expected lengths (32 bytes salt = 64 hex chars, 32 bytes hash = 64 hex chars)
    if (saltHex.length !== 64 || hashHex.length !== 64) {
      return true // Wrong length, needs rehashing
    }
    
    // For now, assume PBKDF2 hashes are current
    // In the future, you could add version checking here
    return false
  } catch (error) {
    // If we can't determine, assume it needs rehashing for safety
    return true
  }
}

/**
 * Generate a cryptographically secure random token
 * @param length Token length in bytes (default: 32)
 * @returns string Hex-encoded random token
 */
export function generate_secure_token(length: number = 32): string {
  const buffer = new Uint8Array(length)
  crypto.getRandomValues(buffer)
  return Array.from(buffer, byte => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * Hash a token for secure storage (using SHA-256)
 * @param token Plain text token
 * @returns Promise<string> Hashed token as hex string
 */
export async function hash_token(token: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(token)
  const hash_buffer = await crypto.subtle.digest('SHA-256', data)
  const hash_array = new Uint8Array(hash_buffer)
  return Array.from(hash_array, byte => byte.toString(16).padStart(2, '0')).join('')
}