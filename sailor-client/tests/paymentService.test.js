/**
 * Payment Service Tests
 */

const paymentService = require('../src/services/paymentService');
const config = require('../src/config');

// Mock Stripe
jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    checkout: {
      sessions: {
        create: jest.fn(),
        retrieve: jest.fn(),
      },
    },
    webhooks: {
      constructEvent: jest.fn(),
    },
  }));
});

describe('PaymentService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getCheckoutSession', () => {
    it('should retrieve checkout session successfully', async () => {
      const mockSession = {
        id: 'cs_test_123',
        payment_status: 'paid',
        status: 'complete',
        amount_total: 2000,
        currency: 'usd',
        customer_email: 'test@example.com',
        metadata: {
          userId: 'user-123',
        },
      };

      const stripe = require('stripe');
      const stripeInstance = stripe();
      stripeInstance.checkout.sessions.retrieve.mockResolvedValue(mockSession);

      const session = await paymentService.getCheckoutSession('cs_test_123');

      expect(session).toEqual(mockSession);
      expect(stripeInstance.checkout.sessions.retrieve).toHaveBeenCalledWith(
        'cs_test_123',
        { expand: ['payment_intent'] }
      );
    });

    it('should throw error if Stripe is not configured', async () => {
      const originalStripe = config.stripe.secretKey;
      config.stripe.secretKey = null;

      await expect(
        paymentService.getCheckoutSession('cs_test_123')
      ).rejects.toThrow('Stripe is not configured');

      config.stripe.secretKey = originalStripe;
    });

    it('should handle Stripe API errors', async () => {
      const stripe = require('stripe');
      const stripeInstance = stripe();
      const error = new Error('Session not found');
      error.type = 'StripeInvalidRequestError';
      stripeInstance.checkout.sessions.retrieve.mockRejectedValue(error);

      await expect(
        paymentService.getCheckoutSession('invalid_session')
      ).rejects.toThrow('Session not found');
    });
  });

  describe('createCheckoutSession', () => {
    it('should create checkout session successfully', async () => {
      const mockSession = {
        id: 'cs_test_123',
        url: 'https://checkout.stripe.com/test',
      };

      const stripe = require('stripe');
      const stripeInstance = stripe();
      stripeInstance.checkout.sessions.create.mockResolvedValue(mockSession);

      // Mock accessService
      jest.mock('../src/services/accessService', () => ({
        getPassType: jest.fn().mockResolvedValue({
          id: 'pass-1',
          name: '24 Hour Pass',
          duration_hours: 24,
          price_cents: 2000,
        }),
        createAccessPass: jest.fn().mockResolvedValue({}),
      }));

      const result = await paymentService.createCheckoutSession(
        'user-123',
        'pass-1',
        'test@example.com'
      );

      expect(result.sessionId).toBe('cs_test_123');
      expect(result.url).toBe('https://checkout.stripe.com/test');
    });
  });
});
