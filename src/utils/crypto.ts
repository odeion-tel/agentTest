/**
 * Cryptographic utilities for secure token generation and hashing
 */

/**
 * Generate a cryptographically secure random token
 * @param length Token length in bytes (default 32)
 * @returns Base64url encoded token
 */
export function generateSecureToken(length = 32): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Hash a token using SHA-256 for secure storage
 * @param token The token to hash
 * @returns SHA-256 hash as hex string
 */
export async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Verify a token against its hash
 * @param token The token to verify
 * @param hash The stored hash to compare against
 * @returns True if the token matches the hash
 */
export async function verifyToken(token: string, hash: string): Promise<boolean> {
  const tokenHash = await hashToken(token);
  return tokenHash === hash;
}