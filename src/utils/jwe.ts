import { EncryptJWT, jwtDecrypt } from 'jose'
import { z } from 'zod'

// User data interface for token creation
export interface TokenUserData {
  id: string
  email: string
  is_admin: boolean
}

// JWE token payload schemas
export const auth_token_payload_schema = z.object({
  user_id: z.string(),
  email: z.string().email(), 
  is_admin: z.boolean(),
  type: z.literal('auth'),
  iat: z.number(),
  exp: z.number(),
  jti: z.string(),
})

export const refresh_token_payload_schema = z.object({
  user_id: z.string(),
  is_admin: z.boolean(),
  type: z.literal('refresh'),
  iat: z.number(),
  exp: z.number(),
  jti: z.string(),
})

export type AuthTokenPayload = z.infer<typeof auth_token_payload_schema>
export type RefreshTokenPayload = z.infer<typeof refresh_token_payload_schema>

// JWE algorithms - using symmetric encryption for simplicity in testing
const JWE_ALG = 'dir'
const JWE_ENC = 'A256GCM'

/**
 * Generate a symmetric key from secret for JWE encryption/decryption
 * @param secret JWT secret string (minimum 32 characters)
 * @returns Promise<CryptoKey> Symmetric key for JWE operations
 */
export async function generate_jwe_key(secret: string): Promise<CryptoKey> {
  if (!secret || secret.length < 32) {
    throw new Error('JWT secret must be at least 32 characters long')
  }
  
  // Create symmetric key from secret
  const encoder = new TextEncoder()
  const keyData = encoder.encode(secret.padEnd(32, '0').slice(0, 32))
  
  return await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

/**
 * Create a stateless JWE auth token with embedded user data
 * @param user User data object
 * @param secret JWT secret string
 * @returns Promise<string> JWE token
 */
export async function create_auth_token(
  user: TokenUserData,
  secret: string
): Promise<string> {
  const key = await generate_jwe_key(secret)
  const now = Math.floor(Date.now() / 1000)
  
  const payload: AuthTokenPayload = {
    user_id: user.id,
    email: user.email,
    is_admin: user.is_admin,
    type: 'auth',
    iat: now,
    exp: now + (60 * 60), // 1 hour
    jti: crypto.randomUUID(),
  }

  // Validate payload structure
  auth_token_payload_schema.parse(payload)

  return await new EncryptJWT(payload)
    .setProtectedHeader({ alg: JWE_ALG, enc: JWE_ENC })
    .setIssuedAt(payload.iat)
    .setExpirationTime(payload.exp)
    .encrypt(key)
}

/**
 * Create a stateless JWE refresh token with embedded user data
 * @param user User data object
 * @param secret JWT secret string
 * @returns Promise<string> JWE token
 */
export async function create_refresh_token(
  user: TokenUserData,
  secret: string
): Promise<string> {
  const key = await generate_jwe_key(secret)
  const now = Math.floor(Date.now() / 1000)
  
  const payload: RefreshTokenPayload = {
    user_id: user.id,
    is_admin: user.is_admin,
    type: 'refresh',
    iat: now,
    exp: now + (3 * 24 * 60 * 60), // 3 days
    jti: crypto.randomUUID(),
  }

  // Validate payload structure
  refresh_token_payload_schema.parse(payload)

  return await new EncryptJWT(payload)
    .setProtectedHeader({ alg: JWE_ALG, enc: JWE_ENC })
    .setIssuedAt(payload.iat)
    .setExpirationTime(payload.exp)
    .encrypt(key)
}

/**
 * Verify and decrypt a JWE token (stateless)
 * @param token JWE token string
 * @param secret JWT secret string
 * @returns Promise<AuthTokenPayload | RefreshTokenPayload> Decrypted payload
 */
export async function verify_jwe_token(
  token: string,
  secret: string
): Promise<AuthTokenPayload | RefreshTokenPayload> {
  try {
    const key = await generate_jwe_key(secret)
    const { payload } = await jwtDecrypt(token, key)
    
    // Determine token type and validate accordingly
    const token_type = payload.type
    
    let parsed_payload: AuthTokenPayload | RefreshTokenPayload
    
    if (token_type === 'auth') {
      parsed_payload = auth_token_payload_schema.parse(payload)
    } else if (token_type === 'refresh') {
      parsed_payload = refresh_token_payload_schema.parse(payload)
    } else {
      throw new Error('Invalid token type')
    }
    
    // Check if token is expired
    if (is_token_expired(parsed_payload)) {
      throw new Error('Token has expired')
    }
    
    return parsed_payload
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`Invalid token payload: ${error.issues.map(i => i.message).join(', ')}`)
    }
    throw new Error(`Token verification failed: ${error}`)
  }
}

/**
 * Check if token is expired
 * @param payload Token payload
 * @returns boolean True if token is expired
 */
export function is_token_expired(payload: AuthTokenPayload | RefreshTokenPayload): boolean {
  const now = Math.floor(Date.now() / 1000)
  return payload.exp <= now
}

/**
 * Extract token payload without verification (for debugging only)
 * WARNING: This should never be used for authentication decisions
 * @param token JWE token string
 * @returns any Unverified payload (for debugging only)
 */
export function extract_token_payload_unsafe(token: string): any {
  try {
    // This is a simplified extraction for debugging
    // In reality, JWE tokens are encrypted and can't be decoded without the private key
    // This function is more conceptual for testing purposes
    const parts = token.split('.')
    if (parts.length === 5) {
      // JWE format has 5 parts, but payload is encrypted
      // For actual implementation, this would require decryption
      return { message: 'JWE payload is encrypted and cannot be extracted without private key' }
    }
    throw new Error('Invalid JWE format')
  } catch (error) {
    return { error: 'Cannot extract JWE payload without decryption' }
  }
}