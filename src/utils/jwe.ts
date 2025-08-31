import { EncryptJWT, jwtDecrypt, generateKeyPair } from 'jose'
import { z } from 'zod'

// JWE token payload schemas
export const auth_token_payload_schema = z.object({
  sub: z.string().uuid(), // User ID
  email: z.string().email(),
  role: z.enum(['admin', 'user']),
  type: z.literal('auth'),
  iat: z.number(),
  exp: z.number(),
  jti: z.string().uuid(),
})

export const refresh_token_payload_schema = z.object({
  sub: z.string().uuid(), // User ID
  role: z.enum(['admin', 'user']),
  type: z.literal('refresh'),
  iat: z.number(),
  exp: z.number(),
  jti: z.string().uuid(),
})

export type AuthTokenPayload = z.infer<typeof auth_token_payload_schema>
export type RefreshTokenPayload = z.infer<typeof refresh_token_payload_schema>

// JWE algorithms
const JWE_ALG = 'RSA-OAEP-256'
const JWE_ENC = 'A256GCM'

/**
 * Generate RSA key pair for JWE encryption/decryption
 * @returns Promise<{publicKey: KeyLike, privateKey: KeyLike}>
 */
export async function generate_jwe_keypair() {
  return await generateKeyPair(JWE_ALG, { modulusLength: 2048 })
}

/**
 * Get or create JWE keys from environment
 * For production, keys should be stored in Cloudflare Workers KV
 * @param env Worker environment bindings
 * @returns Promise<{publicKey: KeyLike, privateKey: KeyLike}>
 */
export async function get_jwe_keys(env: any) {
  // In development, generate keys on demand
  // In production, retrieve from KV store with rotation support
  if (env.ENVIRONMENT === 'development') {
    return await generate_jwe_keypair()
  }
  
  // Production implementation would retrieve from KV
  // This is a simplified version for now
  const stored_keys = await env.KV?.get('jwe_keys')
  if (stored_keys) {
    // In real implementation, this would import the stored keys
    // For now, fall back to generating new ones
    return await generate_jwe_keypair()
  }
  
  // Generate new keys and store them
  const keys = await generate_jwe_keypair()
  // In real implementation, export and store keys in KV
  // await env.KV?.put('jwe_keys', JSON.stringify(exported_keys))
  
  return keys
}

/**
 * Create a stateless JWE auth token
 * @param user_id User UUID
 * @param email User email
 * @param role User role
 * @param public_key JWE public key
 * @returns Promise<string> JWE token
 */
export async function create_auth_token(
  user_id: string,
  email: string,
  role: 'admin' | 'user',
  public_key: any
): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const payload: AuthTokenPayload = {
    sub: user_id,
    email,
    role,
    type: 'auth',
    iat: now,
    exp: now + (60 * 60), // 1 hour
    jti: crypto.randomUUID(),
  }

  // Validate payload structure
  auth_token_payload_schema.parse(payload)

  return await new EncryptJWT(payload)
    .setProtectedHeader({ alg: JWE_ALG, enc: JWE_ENC })
    .setIssuedAt()
    .setExpirationTime('1h')
    .encrypt(public_key)
}

/**
 * Create a stateless JWE refresh token
 * @param user_id User UUID
 * @param role User role
 * @param public_key JWE public key
 * @returns Promise<string> JWE token
 */
export async function create_refresh_token(
  user_id: string,
  role: 'admin' | 'user',
  public_key: any
): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const payload: RefreshTokenPayload = {
    sub: user_id,
    role,
    type: 'refresh',
    iat: now,
    exp: now + (3 * 24 * 60 * 60), // 3 days
    jti: crypto.randomUUID(),
  }

  // Validate payload structure
  refresh_token_payload_schema.parse(payload)

  return await new EncryptJWT(payload)
    .setProtectedHeader({ alg: JWE_ALG, enc: JWE_ENC })
    .setIssuedAt()
    .setExpirationTime('3d')
    .encrypt(public_key)
}

/**
 * Verify and decrypt a JWE token (stateless)
 * @param token JWE token string
 * @param private_key JWE private key
 * @returns Promise<AuthTokenPayload | RefreshTokenPayload> Decrypted payload
 */
export async function verify_jwe_token(
  token: string,
  private_key: any
): Promise<AuthTokenPayload | RefreshTokenPayload> {
  try {
    const { payload } = await jwtDecrypt(token, private_key)
    
    // Determine token type and validate accordingly
    const token_type = payload.type
    
    if (token_type === 'auth') {
      return auth_token_payload_schema.parse(payload)
    } else if (token_type === 'refresh') {
      return refresh_token_payload_schema.parse(payload)
    } else {
      throw new Error('Invalid token type')
    }
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