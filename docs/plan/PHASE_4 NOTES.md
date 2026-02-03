# Stripe Payment Configuration Guide

Based on the codebase analysis, here's how to configure Stripe payments.

---

## Required Environment Variables

Set these in your `.env` file or `docker-compose.yaml`:

ENV VARIABLES:

- STRIPE_SECRET_KEY=sk_test_your_secret_key_here
- STRIPE_PUBLISHABLE_KEY=pk_test_your_publishable_key_here
- STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here
- APP_URL=http://localhost:30080

Notes:

- Stripe API keys are from https://dashboard.stripe.com/apikeys
- Webhook secret is from https://dashboard.stripe.com/webhooks

---

## Setup Steps

### 1. Get API Keys

- Go to https://dashboard.stripe.com/apikeys
- Copy the Secret key (sk*test*...)
- Copy the Publishable key (pk*test*...)

### 2. Configure Webhook

- Go to https://dashboard.stripe.com/webhooks
- Add endpoint:
  http://your-domain/facilitator/api/v1/billing/webhook
- Select events:
  - checkout.session.completed
  - checkout.session.async_payment_succeeded
  - checkout.session.async_payment_failed
- Copy the Signing secret (whsec\_...)

### 3. Local Development (Stripe CLI)

Command:
stripe listen --forward-to localhost:30080/facilitator/api/v1/billing/webhook

---

## Available Access Passes

- 38_hours
  - Duration: 38 hours
  - Price: $4.99

- 1_week
  - Duration: 7 days
  - Price: $19.99

- 2_weeks
  - Duration: 14 days
  - Price: $29.99

---

## Test Payment

Stripe test card:

- Card Number: 4242 4242 4242 4242
- Expiry: Any future date
- CVC: Any value

---

## Key Files Reference

- Config: facilitator/src/config/index.js
- Stripe Service: facilitator/src/services/stripeService.js
- Billing Routes: facilitator/src/routes/billingRoutes.js
- Pricing Page (React): sailor-client/client/src/pages/Pricing.jsx
- Full documentation: docs/plan/PHASE4_PAYMENT_MVP.md

---

## Notes

- After completing this configuration, Stripe payments are expected to work end-to-end from facilitator to @sailor-client.
- This section is intentionally documented inside PHASE4_PAYMENT_MVP.md as the single source of truth.
- Do not modify unless payment architecture changes.
