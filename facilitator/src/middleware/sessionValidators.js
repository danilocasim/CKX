/**
 * Session Validators
 *
 * Joi validation middleware for session API endpoints.
 */

const Joi = require('joi');
const logger = require('../utils/logger');

/**
 * Session ID schema - UUID format
 */
const sessionIdSchema = Joi.string()
  .pattern(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i)
  .required()
  .messages({
    'string.pattern.base': 'sessionId must be a valid UUID',
    'any.required': 'sessionId is required'
  });

/**
 * Create session request schema
 */
const createSessionSchema = Joi.object({
  sessionId: sessionIdSchema,
  options: Joi.object({
    labId: Joi.string().optional(),
    userId: Joi.string().optional(),
    metadata: Joi.object().optional()
  }).optional()
});

/**
 * Validate create session request
 */
const validateCreateSession = (req, res, next) => {
  const { error, value } = createSessionSchema.validate(req.body, { abortEarly: false });

  if (error) {
    const messages = error.details.map(d => d.message);
    logger.warn('Invalid create session request', { errors: messages });
    return res.status(400).json({
      success: false,
      error: 'Validation Error',
      message: messages.join(', ')
    });
  }

  req.body = value;
  next();
};

/**
 * Validate session ID parameter
 */
const validateSessionId = (req, res, next) => {
  const { sessionId } = req.params;

  const { error } = sessionIdSchema.validate(sessionId);

  if (error) {
    logger.warn('Invalid session ID', { sessionId, error: error.message });
    return res.status(400).json({
      success: false,
      error: 'Validation Error',
      message: 'sessionId must be a valid UUID'
    });
  }

  next();
};

module.exports = {
  validateCreateSession,
  validateSessionId
};
