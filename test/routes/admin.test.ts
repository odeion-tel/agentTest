import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { unstable_dev } from 'wrangler';
import type { UnstableDevWorker } from 'wrangler';
import { create_database } from '../src/db/connection';

declare module 'vitest' {
  export interface TestContext {
    worker: UnstableDevWorker;
    db: D1Database;
  }
}

describe('Admin User Management', () => {
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

  describe('Admin Authorization', () => {
    it('should block non-admin users from accessing admin routes', async () => {
      // Create regular user session
      const loginResponse = await worker.fetch('/app/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'regular@example.com',
          password: 'TestPass123!',
          csrf_token: 'test-csrf-token'
        }),
      });

      expect(loginResponse.status).toBe(302); // Redirect after login

      // Try to access admin dashboard
      const adminResponse = await worker.fetch('/admin/users');
      expect(adminResponse.status).toBe(403);
    });

    it('should allow admin users to access admin routes', async () => {
      // Create admin user session
      const loginResponse = await worker.fetch('/app/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'admin@example.com',
          password: 'TestPass123!',
          csrf_token: 'test-csrf-token'
        }),
      });

      expect(loginResponse.status).toBe(302);

      // Access admin dashboard
      const adminResponse = await worker.fetch('/admin/users');
      expect(adminResponse.status).toBe(200);
    });
  });

  describe('User Management', () => {
    it('should list users for admin', async () => {
      const response = await worker.fetch('/admin/users');
      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(Array.isArray(data.users)).toBe(true);
      expect(data.total).toBeDefined();
    });

    it('should create new user', async () => {
      const response = await worker.fetch('/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'newuser@example.com',
          password: 'NewUserPass123!',
          is_admin: false,
          csrf_token: 'test-csrf-token'
        }),
      });

      expect(response.status).toBe(201);
      const user = await response.json();
      expect(user.email).toBe('newuser@example.com');
      expect(user.is_admin).toBe(false);
    });

    it('should update user', async () => {
      const response = await worker.fetch('/admin/users/test-user-id', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'updated@example.com',
          is_admin: true,
          csrf_token: 'test-csrf-token'
        }),
      });

      expect(response.status).toBe(200);
      const user = await response.json();
      expect(user.email).toBe('updated@example.com');
      expect(user.is_admin).toBe(true);
    });

    it('should disable user', async () => {
      const response = await worker.fetch('/admin/users/test-user-id/disable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csrf_token: 'test-csrf-token' }),
      });

      expect(response.status).toBe(200);
      const result = await response.json();
      expect(result.success).toBe(true);
    });

    it('should enable user', async () => {
      const response = await worker.fetch('/admin/users/test-user-id/enable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csrf_token: 'test-csrf-token' }),
      });

      expect(response.status).toBe(200);
      const result = await response.json();
      expect(result.success).toBe(true);
    });
  });

  describe('Security Features', () => {
    it('should enforce rate limiting on admin routes', async () => {
      // Make multiple rapid requests
      for (let i = 0; i < 15; i++) {
        await worker.fetch('/admin/users');
      }

      const response = await worker.fetch('/admin/users');
      expect(response.status).toBe(429); // Rate limited
    });

    it('should enforce CSRF protection on admin forms', async () => {
      const response = await worker.fetch('/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'newuser@example.com',
          password: 'NewUserPass123!',
          is_admin: false,
          // Missing csrf_token
        }),
      });

      expect(response.status).toBe(400);
    });
  });

  describe('Audit Logging', () => {
    it('should log admin actions', async () => {
      const response = await worker.fetch('/admin/audit-logs');
      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(Array.isArray(data.audit_logs)).toBe(true);
      expect(data.audit_logs[0]).toHaveProperty('user_id');
      expect(data.audit_logs[0]).toHaveProperty('action');
      expect(data.audit_logs[0]).toHaveProperty('timestamp');
    });
  });
});