/**
 * Exam Controller Tests
 */

const examController = require('../src/controllers/examController');
const examSessionService = require('../src/services/examSessionService');
const accessService = require('../src/services/accessService');

// Mock dependencies
jest.mock('../src/services/examSessionService');
jest.mock('../src/services/accessService');
jest.mock('fs');
jest.mock('../src/utils/logger');

describe('ExamController', () => {
  let req, res;

  beforeEach(() => {
    jest.clearAllMocks();

    req = {
      userId: 'user-123',
      body: {},
      params: {},
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
  });

  describe('getCurrentExam', () => {
    it('should return null when no active exam exists', async () => {
      examSessionService.getActiveExamSessions.mockResolvedValue([]);

      await examController.getCurrentExam(req, res);

      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: null,
      });
    });

    it('should return active exam session', async () => {
      const mockSession = {
        id: 'exam-123',
        lab_id: 'ckad-001',
        exam_type: 'full',
        status: 'active',
        started_at: new Date(),
        expires_at: new Date(Date.now() + 3600000),
      };

      examSessionService.getActiveExamSessions.mockResolvedValue([mockSession]);

      await examController.getCurrentExam(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          id: mockSession.id,
          lab_id: mockSession.lab_id,
          exam_type: mockSession.exam_type,
          status: mockSession.status,
          started_at: mockSession.started_at,
          expires_at: mockSession.expires_at,
        },
      });
    });

    it('should return 401 when user is not authenticated', async () => {
      req.userId = null;

      await examController.getCurrentExam(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Unauthorized',
        message: 'Authentication required',
      });
    });
  });

  describe('createExam', () => {
    it('should create exam session successfully', async () => {
      req.body = { labId: 'ckad-001' };

      // Mock lab data
      const fs = require('fs');
      fs.existsSync = jest.fn().mockReturnValue(true);
      fs.readFileSync = jest.fn().mockReturnValue(
        JSON.stringify({
          labs: [
            {
              id: 'ckad-001',
              name: 'CKAD Lab',
              category: 'ckad',
              isFree: false,
              type: 'full',
            },
          ],
        })
      );

      accessService.checkUserAccess.mockResolvedValue({
        hasValidPass: true,
        passType: '24h',
        hoursRemaining: 20,
      });

      examSessionService.createExamSession.mockResolvedValue({
        exam_session_id: 'exam-123',
        status: 'active',
        routing: { vnc: {}, ssh: {} },
        ports: {},
      });

      await examController.createExam(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          id: 'exam-123',
          status: 'active',
          routing: { vnc: {}, ssh: {} },
          ports: {},
        },
      });
    });

    it('should return 403 when user lacks access pass for full exam', async () => {
      req.body = { labId: 'ckad-001' };

      const fs = require('fs');
      fs.existsSync = jest.fn().mockReturnValue(true);
      fs.readFileSync = jest.fn().mockReturnValue(
        JSON.stringify({
          labs: [
            {
              id: 'ckad-001',
              name: 'CKAD Lab',
              category: 'ckad',
              isFree: false,
              type: 'full',
            },
          ],
        })
      );

      accessService.checkUserAccess.mockResolvedValue({
        hasValidPass: false,
        hasPendingPass: false,
      });

      await examController.createExam(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Access Required',
        message: 'An active access pass is required for full exams.',
        data: {
          hasPendingPass: false,
          pricingUrl: '/pricing',
        },
      });
    });

    it('should return 409 when user already has active exam', async () => {
      req.body = { labId: 'ckad-001' };

      const fs = require('fs');
      fs.existsSync = jest.fn().mockReturnValue(true);
      fs.readFileSync = jest.fn().mockReturnValue(
        JSON.stringify({
          labs: [
            {
              id: 'ckad-001',
              name: 'CKAD Lab',
              category: 'ckad',
              isFree: false,
              type: 'full',
            },
          ],
        })
      );

      accessService.checkUserAccess.mockResolvedValue({
        hasValidPass: true,
      });

      const error = new Error('User already has an active exam session');
      error.statusCode = 409;
      error.currentExamId = 'existing-exam-123';
      examSessionService.createExamSession.mockRejectedValue(error);

      await examController.createExam(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Exam Already Exists',
        message: error.message,
        currentExamId: 'existing-exam-123',
      });
    });
  });
});
