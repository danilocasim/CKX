/**
 * CKX Execution Engine Client
 *
 * Handles all service-to-service communication with CKX internal APIs.
 * Uses HMAC signature authentication.
 */

const crypto = require('crypto');
const axios = require('axios');
const config = require('../config');
const logger = require('../utils/logger');

const CKX_BASE_URL = config.ckx.url;
const SERVICE_SECRET = config.ckx.serviceSecret;

/**
 * Generate HMAC signature for service authentication
 * Format: HMAC-SHA256(timestamp + "." + JSON.stringify(body), SERVICE_SECRET)
 */
function generateHMACSignature(body, timestamp) {
  if (!SERVICE_SECRET) {
    logger.error(
      'SERVICE_SECRET is not configured - service authentication will fail'
    );
    throw new Error('Service authentication secret not configured');
  }

  const bodyString = body ? JSON.stringify(body) : '{}';
  const payload = `${timestamp}.${bodyString}`;
  const signature = crypto
    .createHmac('sha256', SERVICE_SECRET)
    .update(payload)
    .digest('hex');

  logger.debug('Generated HMAC signature', {
    timestamp,
    payloadLength: payload.length,
    signatureLength: signature.length,
  });

  return signature;
}

/**
 * Make authenticated request to CKX
 */
async function request(method, path, data = null) {
  const url = `${CKX_BASE_URL}${path}`;
  const timestamp = Math.floor(Date.now() / 1000);
  const body = data ? JSON.stringify(data) : '{}';
  const signature = generateHMACSignature(data || {}, timestamp);

  const headers = {
    'Content-Type': 'application/json',
    'X-Service-Signature': signature,
    'X-Service-Timestamp': timestamp.toString(),
  };

  try {
    if (!SERVICE_SECRET) {
      logger.error(
        'SERVICE_SECRET not configured - cannot authenticate with CKX'
      );
      return {
        success: false,
        error: 'Service authentication not configured',
        status: 500,
      };
    }

    logger.debug('Calling CKX internal API', {
      method,
      path,
      timestamp,
      hasData: !!data,
    });

    const response = await axios({
      method,
      url,
      data: method !== 'GET' ? data || undefined : undefined,
      params: method === 'GET' ? undefined : undefined, // GET params are in path
      headers,
      timeout: 30000,
      validateStatus: () => true, // Don't throw on any status
    });

    if (response.status >= 200 && response.status < 300) {
      logger.debug('CKX API call successful', {
        method,
        path,
        status: response.status,
      });
      return {
        success: true,
        data: response.data,
        status: response.status,
      };
    }

    // Handle error responses
    const errorMessage =
      response.data?.message ||
      response.data?.error ||
      `HTTP ${response.status}`;

    logger.warn('CKX API call returned error status', {
      method,
      path,
      status: response.status,
      error: errorMessage,
      details: response.data?.details,
    });

    return {
      success: false,
      error: errorMessage,
      status: response.status,
      data: response.data,
    };
  } catch (error) {
    // Network errors, timeouts, etc.
    logger.error('CKX API call failed (network/request error)', {
      method,
      path,
      error: error.message,
      code: error.code,
      status: error.response?.status,
      data: error.response?.data,
    });

    return {
      success: false,
      error: error.response?.data?.message || error.message || 'Network error',
      status: error.response?.status || 500,
      data: error.response?.data,
    };
  }
}

/**
 * Start exam runtime in CKX
 */
async function startExamRuntime(
  examSessionId,
  userId,
  expiresAt,
  examTemplateId,
  assetPath,
  examConfig
) {
  return request('POST', '/internal/exams/start', {
    exam_session_id: examSessionId,
    user_id: userId,
    expires_at: expiresAt,
    exam_template_id: examTemplateId,
    asset_path: assetPath,
    config: examConfig,
  });
}

/**
 * Terminate exam runtime in CKX
 */
async function terminateExamRuntime(examSessionId, userId, expiresAt) {
  return request('POST', '/internal/exams/terminate', {
    exam_session_id: examSessionId,
    user_id: userId,
    expires_at: expiresAt,
  });
}

/**
 * Get runtime routing (VNC/SSH endpoints)
 */
async function getRuntimeRouting(examSessionId, userId) {
  const path = `/internal/runtime/routing?exam_session_id=${encodeURIComponent(
    examSessionId
  )}&user_id=${encodeURIComponent(userId)}`;
  return request('GET', path);
}

/**
 * Validate access to exam session
 */
async function validateAccess(examSessionId, userId) {
  return request('POST', '/internal/exams/validate-access', {
    exam_session_id: examSessionId,
    user_id: userId,
  });
}

/**
 * Evaluate exam solutions
 */
async function evaluateExam(examSessionId, userId, expiresAt, answers) {
  return request('POST', '/internal/exams/evaluate', {
    exam_session_id: examSessionId,
    user_id: userId,
    expires_at: expiresAt,
    answers,
  });
}

/**
 * Get runtime status
 */
async function getRuntimeStatus(examSessionId, userId) {
  const path = `/internal/exams/${encodeURIComponent(
    examSessionId
  )}/status?user_id=${encodeURIComponent(userId)}`;
  return request('GET', path);
}

module.exports = {
  startExamRuntime,
  terminateExamRuntime,
  getRuntimeRouting,
  validateAccess,
  evaluateExam,
  getRuntimeStatus,
};
