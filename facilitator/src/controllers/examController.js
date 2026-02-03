const logger = require('../utils/logger');
const examService = require('../services/examService');
const fs = require('fs');
const path = require('path');
const redisClient = require('../utils/redisClient');
const MetricService = require('../services/metricService');

/**
 * Get list of available labs
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function getLabsList(req, res) {
  try {
    const labsPath = path.join(__dirname, '../../assets/exams/labs.json');
    const labsData = JSON.parse(fs.readFileSync(labsPath, 'utf8'));

    const { type, category } = req.query;
    const isAuthenticated = !!req.userId;

    // Transform labs for client
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

    // Filter by type if specified
    if (type) {
      labs = labs.filter((lab) => lab.type === type);
    }

    // Filter by category if specified
    if (category) {
      labs = labs.filter(
        (lab) => lab.category.toLowerCase() === category.toLowerCase()
      );
    }

    // Unauthenticated users only see mock exams
    if (!isAuthenticated) {
      labs = labs.filter((lab) => lab.type === 'mock');
    }

    return res.json({ success: true, labs });
  } catch (error) {
    logger.error('Failed to get labs list', { error: error.message });
    return res.status(500).json({
      success: false,
      error: 'Failed to load labs',
      message: error.message,
    });
  }
}

/**
 * Create a new exam
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function createExam(req, res) {
  logger.info('Received request to create a new exam', { examData: req.body });

  let examData = req.body;

  // If only labId is provided, look up the full lab data from labs.json
  if (examData.labId && !examData.assetPath) {
    try {
      const labsPath = path.join(__dirname, '../../assets/exams/labs.json');
      const labsData = JSON.parse(fs.readFileSync(labsPath, 'utf8'));
      const lab = labsData.labs.find((l) => l.id === examData.labId);

      if (!lab) {
        return res.status(404).json({
          error: 'Lab not found',
          message: `Lab with id "${examData.labId}" not found`,
        });
      }

      // DEPRECATED: This endpoint is kept for backward compatibility only
      // Sailor-Client handles access validation and calls CKX /internal/exams/start
      // CKX no longer validates payments or access passes

      // Merge lab data with request data
      examData = {
        ...lab,
        ...examData,
        examType: lab.type || 'full',
      };
    } catch (error) {
      logger.error('Failed to load lab data', { error: error.message });
      return res.status(500).json({
        error: 'Failed to load lab',
        message: error.message,
      });
    }
  }

  examData.userId = req.userId != null ? req.userId : null;

  // Session lifecycle: started_at, expires_at, total_allocated_seconds (mock = 2h)
  if (!examData.startedAt) examData.startedAt = new Date().toISOString();
  if (!examData.expiresAt) {
    const twoHoursLater = new Date(Date.now() + 2 * 60 * 60 * 1000);
    examData.expiresAt = twoHoursLater.toISOString();
  }
  if (examData.totalAllocatedSeconds == null) {
    const start = new Date(examData.startedAt).getTime();
    const end = new Date(examData.expiresAt).getTime();
    examData.totalAllocatedSeconds = Math.max(
      0,
      Math.floor((end - start) / 1000)
    );
  }

  const result = await examService.createExam(examData);

  if (!result.success) {
    if (result.error === 'Exam already exists') {
      return res.status(409).json({
        error: result.error,
        message: result.message,
        currentExamId: result.currentExamId,
      });
    }

    // Handle other errors
    return res.status(500).json({
      error: result.error,
      message: result.message,
    });
  }

  return res.status(201).json(result.data);
}

/**
 * Get the current exam
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function getCurrentExam(req, res) {
  const userId = req.userId != null ? req.userId : null;
  logger.info('Received request to get current exam', {
    userId: userId ? 'present' : 'anonymous',
  });

  const result = await examService.getCurrentExam(userId);

  if (!result.success) {
    if (result.error === 'Not Found') {
      return res.status(404).json({ message: result.message });
    }
    return res.status(500).json({
      error: result.error,
      message: result.message,
    });
  }

  return res.status(200).json(result.data);
}

/**
 * Get exam assets
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function getExamAssets(req, res) {
  const examId = req.params.examId;

  logger.info('Received request to get exam assets', { examId });

  try {
    // Check if exam exists
    const examInfo = await redisClient.getExamInfo(examId);

    if (!examInfo) {
      logger.error(`Exam not found with ID: ${examId}`);
      return res.status(404).json({
        error: 'Not Found',
        message: 'Exam not found',
      });
    }

    // Get asset path from exam info
    const assetPath = examInfo.assetPath;
    if (!assetPath) {
      logger.error(`Asset path not found for exam: ${examId}`);
      return res.status(500).json({
        error: 'Configuration Error',
        message: 'Exam asset path not defined',
      });
    }

    // Construct the path to the assets.zip file (actually a tar archive)
    const assetsZipPath = path.join(process.cwd(), assetPath, 'assets.tar.gz');

    if (!fs.existsSync(assetsZipPath)) {
      logger.error(`Assets file not found at path: ${assetsZipPath}`);
      return res.status(500).json({
        error: 'File Not Found',
        message: 'Exam assets file not found',
      });
    }

    logger.info(
      `Sending assets file for exam ${examId} from path ${assetsZipPath}`
    );

    // Set the content type for tar.gz file and send it
    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="assets-${examId}.tar.gz"`
    );
    return res.sendFile(assetsZipPath);
  } catch (error) {
    logger.error('Error retrieving exam assets', { error: error.message });
    return res.status(500).json({
      error: 'Failed to retrieve exam assets',
      message: error.message,
    });
  }
}

/**
 * Get exam questions
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function getExamQuestions(req, res) {
  const examId = req.params.examId;

  logger.info('Received request to get exam questions', { examId });

  const result = await examService.getExamQuestions(examId);

  if (!result.success) {
    if (result.error === 'Not Found') {
      return res.status(404).json({ error: 'Exam not found' });
    }
    return res.status(500).json({
      error: result.error,
      message: result.message,
    });
  }

  return res.status(200).json(result.data);
}

/**
 * Evaluate an exam
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function evaluateExam(req, res) {
  const examId = req.params.examId;

  logger.info('Received request to evaluate exam', { examId, data: req.body });

  const result = await examService.evaluateExam(examId, req.body);

  if (!result.success) {
    return res.status(500).json({
      error: result.error,
      message: result.message,
    });
  }

  return res.status(200).json(result.data);
}

/**
 * End an exam
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function endExam(req, res) {
  const examId = req.params.examId;
  const userId = req.userId != null ? req.userId : null;

  logger.info('Received request to end exam', { examId });

  const result = await examService.endExam(examId, userId);

  if (!result.success) {
    return res.status(500).json({
      error: result.error,
      message: result.message,
    });
  }

  return res.status(200).json(result.data);
}

/**
 * Get exam answers
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function getExamAnswers(req, res) {
  const examId = req.params.examId;
  const examInfo = req.examInfo; // Set by requireExamOwnership (fetch by examId+userId)

  logger.info('Received request to get exam answers', { examId });

  try {
    if (!examInfo) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Exam not found',
      });
    }

    // Get answers path directly from the exam info config
    if (!examInfo.config || !examInfo.config.answers) {
      logger.error(`Answers path not found in config for exam: ${examId}`);
      return res.status(500).json({
        error: 'Configuration Error',
        message: 'Answers path not defined in exam configuration',
      });
    }

    const answersFilePath = examInfo.config.answers;
    const fullAnswersPath = path.join(process.cwd(), answersFilePath);

    if (!fs.existsSync(fullAnswersPath)) {
      logger.error(`Answers file not found at path: ${fullAnswersPath}`);
      return res.status(500).json({
        error: 'File Not Found',
        message: 'Exam answers file not found',
      });
    }

    logger.info(
      `Sending answers file for exam ${examId} from path ${fullAnswersPath}`
    );

    // Send the file directly instead of a JSON response
    return res.sendFile(fullAnswersPath);
  } catch (error) {
    logger.error('Error retrieving exam answers', { error: error.message });
    return res.status(500).json({
      error: 'Failed to retrieve exam answers',
      message: error.message,
    });
  }
}

/**
 * Get exam status
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function getExamStatus(req, res) {
  const examId = req.params.examId;
  const examInfo = req.examInfo; // Set by requireExamOwnership middleware (validated ownership)

  logger.info('Received request to get exam status', {
    examId,
    userId: req.userId,
  });

  try {
    // Use examInfo from middleware (already validated ownership)
    if (!examInfo) {
      logger.error(
        `Exam not found with ID: ${examId} (ownership check failed)`
      );
      return res.status(404).json({
        error: 'Not Found',
        message: 'Exam not found',
      });
    }

    // Get exam status from redis
    const examStatus = await redisClient.getExamStatus(examId);

    // Return the exam status and any additional info
    return res.status(200).json({
      id: examId,
      status: examStatus || 'UNKNOWN',
      warmUpTimeInSeconds: examInfo.warmUpTimeInSeconds || 30,
      message:
        examStatus === 'READY'
          ? 'Exam environment is ready'
          : 'Exam environment is being prepared',
    });
  } catch (error) {
    logger.error('Error retrieving exam status', {
      error: error.message,
      examId,
    });
    return res.status(500).json({
      error: 'Failed to retrieve exam status',
      message: error.message,
    });
  }
}

/**
 * Get exam result
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function getExamResult(req, res) {
  const examId = req.params.examId;

  logger.info('Received request to get exam result', { examId });

  const result = await examService.getExamResult(examId);

  if (!result.success) {
    // Handle the case when result isn't found
    if (result.error === 'Not Found') {
      return res.status(404).json({
        error: result.error,
        message: result.message,
      });
    }

    // Handle other errors
    return res.status(500).json({
      error: result.error,
      message: result.message,
    });
  }

  return res.status(200).json(result);
}

/**
 * Update exam events
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function updateExamEvents(req, res) {
  const examId = req.params.examId;
  const { events } = req.body;

  logger.info('Received request to update exam events', { examId, events });

  try {
    // Get the current exam info
    const examInfo = await redisClient.getExamInfo(examId);

    if (!examInfo) {
      logger.error(`Exam not found with ID: ${examId}`);
      return res.status(404).json({
        error: 'Not Found',
        message: 'Exam not found',
      });
    }

    // Update the events in the exam info
    if (!examInfo.events) {
      examInfo.events = {};
    }

    // Merge the events from the request with existing events
    examInfo.events = {
      ...examInfo.events,
      ...events,
    };

    // send metrics to metric server
    MetricService.sendMetrics(examId, {
      event: {
        ...examInfo.events,
      },
    });

    // Update the exam info in Redis
    await redisClient.updateExamInfo(examId, examInfo);

    // Return success response with the same structure as other endpoints
    return res.status(200).json({
      success: true,
      data: {
        id: examId,
        message: 'Exam events updated successfully',
      },
    });
  } catch (error) {
    logger.error('Error updating exam events', { error: error.message });
    return res.status(500).json({
      success: false,
      error: 'Failed to update exam events',
      message: error.message,
    });
  }
}

/**
 * Submit feedback metrics for an exam
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function submitMetrics(req, res) {
  const examId = req.params.examId;
  const feedbackData = req.body;

  logger.info('Received feedback metrics submission', {
    examId,
    type: feedbackData.type,
  });

  try {
    // Send the feedback data to the metric service
    const result = await MetricService.sendMetrics(examId, {
      event: { ...feedbackData },
    });

    return res.status(200).json({
      success: true,
      message: 'Feedback submitted successfully',
    });
  } catch (error) {
    logger.error('Error submitting feedback metrics', { error: error.message });
    return res.status(500).json({
      error: 'Failed to submit feedback',
      message: error.message,
    });
  }
}

module.exports = {
  getLabsList,
  createExam,
  getCurrentExam,
  getExamAssets,
  getExamQuestions,
  evaluateExam,
  endExam,
  getExamAnswers,
  getExamStatus,
  getExamResult,
  updateExamEvents,
  submitMetrics,
};
