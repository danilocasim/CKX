/**
 * Session Routes
 *
 * API endpoints for session management.
 * Provides RESTful session lifecycle operations.
 *
 * Endpoints:
 *   POST   /api/v1/sessions              - Create session
 *   GET    /api/v1/sessions              - List sessions
 *   GET    /api/v1/sessions/stats        - Get statistics
 *   GET    /api/v1/sessions/:id          - Get session metadata
 *   GET    /api/v1/sessions/:id/status   - Get session status
 *   GET    /api/v1/sessions/:id/routing  - Get routing info
 *   GET    /api/v1/sessions/:id/ports    - Get allocated ports
 *   POST   /api/v1/sessions/:id/activate - Activate session
 *   DELETE /api/v1/sessions/:id          - Terminate session
 */

const express = require('express');
const sessionController = require('../controllers/sessionController');
const { validateCreateSession, validateSessionId } = require('../middleware/sessionValidators');

const router = express.Router();

// Session lifecycle endpoints
router.post('/', validateCreateSession, sessionController.createSession);
router.get('/', sessionController.listSessions);
router.get('/stats', sessionController.getStats);
router.delete('/all', sessionController.terminateAllSessions);
router.get('/:sessionId', validateSessionId, sessionController.getSession);
router.get('/:sessionId/status', validateSessionId, sessionController.getSessionStatus);
router.get('/:sessionId/routing', validateSessionId, sessionController.getSessionRouting);
router.get('/:sessionId/ports', validateSessionId, sessionController.getSessionPorts);
router.post('/:sessionId/activate', validateSessionId, sessionController.activateSession);
router.delete('/:sessionId', validateSessionId, sessionController.terminateSession);

module.exports = router;
