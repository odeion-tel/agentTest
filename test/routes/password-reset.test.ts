import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { unstable_dev } from 'wrangler';
import type { UnstableDevWorker } from 'wrangler';

declare module 'vitest' {
  export interface TestContext {
    worker: UnstableDevWorker;
    db: D1Database;
  }
}

describe('Password Reset Flow', () => {
  let worker: UnstableDevWorker;

  beforeEach(async () => {
    worker = await unstable_dev('src/index.ts', {
      experimental: { disableExperimentalWarning: true },
      vars: {
        JWT_SECRET: 'test-secret-key',
        MAILGUN_API_KEY: 'test-mailgun-key',
        MAILGUN_DOMAIN: 'test.example.com',
        FROM_EMAIL: 'noreply@test.example.com',
      },
    });
  });

  afterEach(async () => {
    await worker.stop();
  });

  describe('POST /app/forgot-password', () => {
    it('should send password reset email for valid email', async () => {
      const response = await worker.fetch('/app/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'test@example.com' }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.message).toBe('If the email exists, a reset link has been sent');
    });

    it('should return same message for non-existent email (security)', async () => {
      const response = await worker.fetch('/app/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'nonexistent@example.com' }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.message).toBe('If the email exists, a reset link has been sent');
    });

    it('should validate email format', async () => {
      const response = await worker.fetch('/app/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'invalid-email' }),
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Valid email is required');
    });

    it('should enforce rate limiting', async () => {
      const email = 'test@example.com';
      
      for (let i = 0; i < 4; i++) {
        await worker.fetch('/app/forgot-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });
      }

      const response = await worker.fetch('/app/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      expect(response.status).toBe(429);
    });
  });

  describe('GET /app/reset-password', () => {
    it('should validate reset token', async () => {
      const response = await worker.fetch('/app/reset-password?token=valid-token');
      expect(response.status).toBe(200);
    });

    it('should reject invalid token', async () => {
      const response = await worker.fetch('/app/reset-password?token=invalid-token');
      expect(response.status).toBe(400);
    });

    it('should reject expired token', async () => {
      const response = await worker.fetch('/app/reset-password?token=expired-token');
      expect(response.status).toBe(400);
    });

    it('should require token parameter', async () => {
      const response = await worker.fetch('/app/reset-password');
      expect(response.status).toBe(400);
    });
  });

  describe('POST /app/reset-password', () => {
    it('should reset password with valid token', async () => {
      const response = await worker.fetch('/app/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: 'valid-reset-token',
          password: 'NewSecurePass123!',
          confirmPassword: 'NewSecurePass123!',
        }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.message).toBe('Password has been reset successfully');
    });

    it('should validate password requirements', async () => {
      const response = await worker.fetch('/app/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: 'valid-reset-token',
          password: 'weak',
          confirmPassword: 'weak',
        }),
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('Password must be at least 12 characters');
    });

    it('should require password confirmation', async () => {
      const response = await worker.fetch('/app/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: 'valid-reset-token',
          password: 'NewSecurePass123!',
          confirmPassword: 'DifferentPassword123!',
        }),
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Passwords do not match');
    });

    it('should reject invalid token', async () => {
      const response = await worker.fetch('/app/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: 'invalid-token',
          password: 'NewSecurePass123!',
          confirmPassword: 'NewSecurePass123!',
        }),
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Invalid or expired reset token');
    });

    it('should reject expired token', async () => {
      const response = await worker.fetch('/app/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: 'expired-token',
          password: 'NewSecurePass123!',
          confirmPassword: 'NewSecurePass123!',
        }),
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Invalid or expired reset token');
    });
  });
});