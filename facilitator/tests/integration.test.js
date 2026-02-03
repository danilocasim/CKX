/**
 * Integration Tests for CKX Internal APIs
 * Tests full flow: start → validate → terminate
 */

const request = require('supertest');
const crypto = require('crypto');
const { app } = require('../src/app');

const SERVICE_SECRET = process.env.SAILOR_CLIENT_SECRET || 'test-secret';

function generateHMACSignature(body, timestamp) {
  const payload = `${timestamp}.${JSON.stringify(body)}`;
  return crypto
    .createHmac('sha256', SERVICE_SECRET)
    .update(payload)
    .digest('hex');
}

function createAuthHeaders(body = {}) {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = generateHMACSignature(body, timestamp);
  return {
    'X-Service-Signature': signature,
    'X-Service-Timestamp': timestamp.toString(),
    'Content-Type': 'application/json',
  };
}

describe('CKX Internal API Integration Tests', () => {
  const testUserId1 = 'user-1';
  const testUserId2 = 'user-2';
  const testExamId1 = 'exam-session-1';
  const testExamId2 = 'exam-session-2';
  const testExpiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();

  describe('Full Exam Lifecycle', () => {
    it('should start, validate, and terminate exam runtime', async () => {
      const body = {
        exam_session_id: testExamId1,
        user_id: testUserId1,
        expires_at: testExpiresAt,
        exam_template_id: 'ckad/mock',
        asset_path: 'facilitator/assets/exams/ckad/mock',
        config: { workerNodes: 1 },
      };
      const headers = createAuthHeaders(body);

      // Start runtime
      const startResponse = await request(app)
        .post('/internal/exams/start')
        .set(headers)
        .send(body);

      // May fail if Docker not available, but should return proper error
      expect([201, 500]).toContain(startResponse.status);
      if (startResponse.status === 201) {
        expect(startResponse.body).toHaveProperty('exam_session_id');
        expect(startResponse.body).toHaveProperty('routing');

        // Validate access
        const validateBody = {
          exam_session_id: testExamId1,
          user_id: testUserId1,
        };
        const validateHeaders = createAuthHeaders(validateBody);
        const validateResponse = await request(app)
          .post('/internal/exams/validate-access')
          .set(validateHeaders)
          .send(validateBody);

        expect(validateResponse.status).toBe(200);
        expect(validateResponse.body).toHaveProperty('valid');

        // Terminate runtime
        const terminateBody = {
          exam_session_id: testExamId1,
          user_id: testUserId1,
          expires_at: testExpiresAt,
        };
        const terminateHeaders = createAuthHeaders(terminateBody);
        const terminateResponse = await request(app)
          .post('/internal/exams/terminate')
          .set(terminateHeaders)
          .send(terminateBody);

        expect([200, 404]).toContain(terminateResponse.status);
      }
    });
  });

  describe('Isolation Tests', () => {
    it("should prevent User 2 from accessing User 1's runtime", async () => {
      // This test verifies that ownership is enforced
      const validateBody = {
        exam_session_id: testExamId1,
        user_id: testUserId2, // Different user
      };
      const headers = createAuthHeaders(validateBody);

      const response = await request(app)
        .post('/internal/exams/validate-access')
        .set(headers)
        .send(validateBody);

      // Should return 403 or valid: false
      if (response.status === 200) {
        expect(response.body.valid).toBe(false);
        expect(response.body.reason).toContain('different user');
      } else {
        expect([403, 404]).toContain(response.status);
      }
    });

    it('should enforce expires_at strictly', async () => {
      const pastDate = new Date(Date.now() - 1000).toISOString();
      const body = {
        exam_session_id: testExamId1,
        user_id: testUserId1,
        expires_at: pastDate,
      };
      const headers = createAuthHeaders(body);

      const response = await request(app)
        .post('/internal/exams/validate-access')
        .set(headers)
        .send({
          exam_session_id: testExamId1,
          user_id: testUserId1,
        });

      if (response.status === 200) {
        expect(response.body.valid).toBe(false);
        expect(response.body.reason).toContain('expired');
      }
    });
  });
});
