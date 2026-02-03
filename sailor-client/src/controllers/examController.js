/**
 * Exam Controller
 * Business logic endpoints - calls CKX internal APIs
 */

const examSessionService = require('../services/examSessionService');
const accessService = require('../services/accessService');
const logger = require('../utils/logger');
const fs = require('fs');
const path = require('path');

/**
 * Get available labs
 */
async function getLabsList(req, res) {
  try {
    // Load labs.json
    // In Docker, facilitator assets are mounted at /app/facilitator/assets
    const labsPath = fs.existsSync('/app/facilitator/assets/exams/labs.json')
      ? '/app/facilitator/assets/exams/labs.json'
      : path.join(__dirname, '../../facilitator/assets/exams/labs.json');
    const labsData = JSON.parse(fs.readFileSync(labsPath, 'utf8'));
    const isAuthenticated = !!req.userId;

    let labs = labsData.labs.map((lab) => ({
      id: lab.id,
      name: lab.name,
      category: lab.category,
      description: lab.description,
      difficulty: lab.difficulty,
      duration: lab.examDurationInMinutes || 120,
      type: lab.type || 'full',
      isFree: lab.isFree || false,
    }));

    if (!isAuthenticated) {
      labs = labs.filter((lab) => lab.type === 'mock');
    }

    res.json({ success: true, labs });
  } catch (error) {
    logger.error('Failed to get labs list', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to load labs',
      message: error.message,
    });
  }
}

/**
 * Create exam session
 * Validates payment/access, creates exam_session record, and calls CKX to start runtime
 */
async function createExam(req, res) {
  const startTime = Date.now();
  let examSessionId = null;

  try {
    const { labId } = req.body;
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Authentication required to create exam',
      });
    }

    if (!labId) {
      logger.warn('Exam creation failed: labId missing', { userId });
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'labId is required',
      });
    }

    // Load lab to determine type
    // In Docker, facilitator assets are mounted at /app/facilitator/assets
    const labsPath = fs.existsSync('/app/facilitator/assets/exams/labs.json')
      ? '/app/facilitator/assets/exams/labs.json'
      : path.join(__dirname, '../../facilitator/assets/exams/labs.json');

    let labsData;
    try {
      labsData = JSON.parse(fs.readFileSync(labsPath, 'utf8'));
    } catch (fileError) {
      logger.error('Failed to load labs.json', {
        error: fileError.message,
        path: labsPath,
        userId,
      });
      return res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: 'Failed to load exam catalog',
      });
    }

    const lab = labsData.labs.find((l) => l.id === labId);

    if (!lab) {
      logger.warn('Exam creation failed: lab not found', { labId, userId });
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: `Lab "${labId}" not found`,
      });
    }

    const examType = lab.isFree || lab.type === 'mock' ? 'mock' : 'full';

    // Check access for full exams
    if (examType === 'full') {
      logger.debug('Checking access for full exam', { userId, labId });
      let access;
      try {
        access = await accessService.checkUserAccess(userId);
      } catch (accessError) {
        logger.error('Access check failed', {
          error: accessError.message,
          userId,
          labId,
        });
        return res.status(500).json({
          success: false,
          error: 'Internal Server Error',
          message: 'Failed to verify access',
        });
      }

      if (!access.hasValidPass) {
        logger.info('Exam creation denied: no valid access pass', {
          userId,
          labId,
          hasPendingPass: access.hasPendingPass,
        });
        return res.status(403).json({
          success: false,
          error: 'Access Required',
          message: 'An active access pass is required for full exams.',
          data: {
            hasPendingPass: access.hasPendingPass,
            pricingUrl: '/pricing',
          },
        });
      }

      logger.debug('Access verified for full exam', {
        userId,
        labId,
        passType: access.passType,
        hoursRemaining: access.hoursRemaining,
      });
    }

    // Create exam session (includes CKX runtime creation)
    logger.info('Creating exam session', {
      userId,
      labId,
      examType,
    });

    let result;
    try {
      result = await examSessionService.createExamSession(
        userId,
        labId,
        examType
      );
      examSessionId = result.exam_session_id;
    } catch (sessionError) {
      logger.error('Exam session creation failed', {
        error: sessionError.message,
        stack: sessionError.stack,
        userId,
        labId,
        examType,
        statusCode: sessionError.statusCode,
      });

      if (sessionError.statusCode === 409) {
        // User already has active session
        return res.status(409).json({
          success: false,
          error: 'Exam Already Exists',
          message: sessionError.message,
          currentExamId: sessionError.currentExamId,
        });
      }

      // Check if it's a CKX runtime error
      if (sessionError.message.includes('Failed to start exam runtime')) {
        return res.status(503).json({
          success: false,
          error: 'Runtime Unavailable',
          message:
            'Could not start isolated exam environment. Please try again or contact support.',
          details: sessionError.message,
        });
      }

      return res.status(sessionError.statusCode || 500).json({
        success: false,
        error: 'Failed to Create Exam',
        message: sessionError.message,
      });
    }

    const duration = Date.now() - startTime;
    logger.info('Exam session created successfully', {
      userId,
      examSessionId: result.exam_session_id,
      labId,
      examType,
      duration,
    });

    res.status(201).json({
      success: true,
      data: {
        id: result.exam_session_id,
        status: result.status,
        routing: result.routing,
        ports: result.ports,
      },
    });
  } catch (error) {
    logger.error('Unexpected error creating exam session', {
      error: error.message,
      stack: error.stack,
      userId: req.userId,
      examSessionId,
    });

    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'An unexpected error occurred while creating the exam',
    });
  }
}

/**
 * Get current active exam
 * Returns null if no active exam exists (not an error)
 */
async function getCurrentExam(req, res) {
  try {
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Authentication required',
      });
    }

    const sessions = await examSessionService.getActiveExamSessions(userId);

    if (sessions.length === 0) {
      // Return null data, not 404 - this is expected when user has no active exam
      return res.json({
        success: true,
        data: null,
      });
    }

    // Return the most recent active session
    const session = sessions[0];

    logger.debug('Current exam session retrieved', {
      userId,
      examSessionId: session.id,
      labId: session.lab_id,
      status: session.status,
    });

    res.json({
      success: true,
      data: {
        id: session.id,
        lab_id: session.lab_id,
        exam_type: session.exam_type,
        status: session.status,
        started_at: session.started_at,
        expires_at: session.expires_at,
      },
    });
  } catch (error) {
    logger.error('Failed to get current exam', {
      error: error.message,
      stack: error.stack,
      userId: req.userId,
    });
    res.status(500).json({
      success: false,
      error: 'Failed to get current exam',
      message: error.message,
    });
  }
}

/**
 * Terminate exam session
 */
async function terminateExam(req, res) {
  try {
    const { examId } = req.params;
    const userId = req.userId;

    await examSessionService.terminateExamSession(examId, userId);

    res.json({
      success: true,
      message: 'Exam session terminated',
    });
  } catch (error) {
    logger.error('Failed to terminate exam session', { error: error.message });
    res.status(error.statusCode || 500).json({
      success: false,
      error: 'Failed to terminate exam',
      message: error.message,
    });
  }
}

module.exports = {
  getLabsList,
  createExam,
  getCurrentExam,
  terminateExam,
};
