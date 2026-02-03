# CKX Multi-Session Architecture Plan

**Document Type**: Technical Implementation Plan  
**Status**: Active  
**Last Updated**: 2026-02-03  
**Author**: Danilo Jr. B. Casim  
**Reviewed By**: Senior Software Engineer

---

## Executive Summary

This document outlines the complete technical roadmap for transforming CKX from a single-user exam simulator into a scalable multi-user SaaS platform. The plan is divided into sequential phases, each building upon the previous.

**Current Status**: Phases 0–5 complete. Single CKX frontend with auth, payment, and exam session. Ready for Phase 6.

**Architecture Decision**: One exam per user at a time. Each user receives an isolated environment (Kubernetes cluster, terminal, desktop). This mirrors real certification exams and optimizes resource utilization.

---

## Phase Overview

| Phase | Name                           | Status      | Description                                         |
| ----- | ------------------------------ | ----------- | --------------------------------------------------- |
| 0     | Analysis & Documentation       | ✅ Complete | Architecture review, constraint mapping             |
| 1     | Session Isolation Foundation   | ✅ Complete | Redis namespacing, port allocation, session paths   |
| 1.5   | Session Management Integration | ✅ Complete | Port allocator + exam lifecycle, session limits     |
| 2     | Session Management API         | ✅ Complete | REST API for session operations                     |
| 3     | User Authentication            | ✅ Complete | PostgreSQL, JWT, user accounts, CKX auth protection |
| 3.5   | Exam Content Restructuring     | ✅ Complete | Mock exams, type/isFree, access control             |
| 4     | Payment MVP                    | ✅ Complete | Stripe, access passes, countdown timer              |
| 5     | Auth & Payment in CKX          | ✅ Complete | Login, register, dashboard, pricing in CKX only     |
| 6     | Production Deployment          | 🔄 **Next** | AWS infrastructure, CI/CD                           |
| 7     | Scaling & Performance          | ⏳ Pending  | Cluster pooling, auto-scaling                       |
| 8     | Enterprise Features            | ⏳ Pending  | SSO, teams, LMS integration                         |

---

## Phases (Linear)

### Phase 0: Analysis & Documentation ✅

- [x] Single-session constraint analysis
- [x] Architecture enforcement points documented
- [x] Resource requirements calculated
- [x] Refactoring risk assessment

---

### Phase 1: Session Isolation Foundation ✅

- [x] Session identity system (UUID per exam)
- [x] Redis key namespacing (`exam:{sessionId}:*`)
- [x] Removed global exam lock
- [x] Port allocation service
- [x] Session-specific asset paths (`/tmp/exam-assets-{examId}`)

---

### Phase 1.5: Session Management Integration ✅

- [x] Port allocator integrated with exam creation/cleanup
- [x] Session capacity limits (MAX_CONCURRENT_SESSIONS)
- [x] VNC restart conditional logic (first session only)
- [x] Session registration in Redis

---

### Phase 2: Session Management API ✅

- [x] Session controller with CRUD operations
- [x] Joi validation middleware
- [x] Routes registered (`/api/v1/sessions/*`)
- [x] OpenAPI 3.0 specification

**Endpoints**:

```
GET    /api/v1/sessions              → List active sessions
GET    /api/v1/sessions/stats        → Get statistics
GET    /api/v1/sessions/:id          → Get session metadata
GET    /api/v1/sessions/:id/status   → Get session status
GET    /api/v1/sessions/:id/routing  → Get routing info
GET    /api/v1/sessions/:id/ports    → Get allocated ports
DELETE /api/v1/sessions/:id          → Terminate session
```

---

### Phase 3: User Authentication & Accounts ✅

**Goal**: User registration, authentication, exam history. CKX webapp protected; login/register in CKX.

- [x] PostgreSQL service with migrations
- [x] User registration and login (JWT: access + refresh tokens)
- [x] Protected API routes (authenticate, optionalAuth)
- [x] CKX webapp auth protection (redirect to /login if unauthenticated)
- [x] Login, register, and session handling in CKX

**Token strategy**: Access token 15 min; refresh token 7 days. Passwords hashed with bcrypt. Facilitator expects `Authorization: Bearer`; CKX sends Bearer on all facilitator API calls when logged in (via `Auth.fetch()`).

---

### Phase 3.5: Exam Content Restructuring ✅

**Goal**: Mock exams for free trial; type/isFree on labs; access control by exam type.

- [x] Labs.json updated with `type` and `isFree` for all exams
- [x] Mock exams: CKAD, CKA, CKS, Docker, Helm (5/5/3/3/3 questions, 30/30/20/15/15 min)
- [x] API filters by `type` and `category`
- [x] optionalAuth middleware; unauthenticated users see only mock exams; full exams require auth + access pass

---

### Phase 4: Payment Integration ✅

**Goal**: Time-based access passes (one-time payment, not subscription).

- [x] Stripe checkout (one-time payments)
- [x] Access passes schema (access_passes, pass_types)
- [x] Access service (checkUserAccess, activatePass, getUserPasses)
- [x] Billing controller and routes
- [x] requireFullAccess (exam creation), requireSessionAccess (during exam)
- [x] Pricing page and payment success page in CKX
- [x] Stripe config validation at startup

**Pricing model**:

| Plan          | Price  | Duration        |
| ------------- | ------ | --------------- |
| Free Trial    | $0     | Mock exams only |
| 38 Hours Pass | $4.99  | 38 hours        |
| 1 Week Pass   | $19.99 | 7 days          |
| 2 Weeks Pass  | $29.99 | 14 days         |

**Security**: Server validates access on every request; client countdown is cosmetic.

**Key endpoints**:

```
GET    /api/v1/access/status     GET    /api/v1/access/passes
POST   /api/v1/access/activate/:id
GET    /api/v1/billing/plans     POST   /api/v1/billing/checkout
POST   /api/v1/billing/webhook
```

---

### Phase 5: Auth & Payment in CKX ✅

**Goal**: Single CKX frontend for login, register, dashboard, pricing, and exam. All auth and payment UI in CKX.

- [x] `auth.js` (token storage, login/register/logout/refresh, `Auth.fetch()` with Bearer and 401 refresh)
- [x] Login and register pages; after login, redirect via `/auth/set-cookie?token=...` to set `ckx_token` cookie
- [x] Dashboard (user, access status, exam history, links to pricing and exam)
- [x] Navigation component (`nav.js`) on all pages (index, pricing, exam, results, dashboard)
- [x] All facilitator API calls from CKX use Bearer when user is logged in (index.js, exam-api.js, results.js, pricing.js, dashboard.js)
- [x] Webapp allowlists `/login`, `/register`, `/payment/success`, `/auth/set-cookie`; `/logout` clears cookie and redirects to `/login`

**Result**: One app (CKX) for exam session, auth, and payment. No separate frontend.

---

### Phase 6: Production Deployment ⏳

**Goal**: Deploy to AWS with production-grade infrastructure.

**Depends on**: Phase 5 complete ✅

**Planned**:

- Route 53 → CloudFront → ALB (WebSocket enabled)
- Web app and Facilitator on ECS; CKX workers (EC2) in Auto Scaling Group
- RDS PostgreSQL, ElastiCache Redis, S3 for assets
- Terraform (VPC, ECS, RDS, Elasticache, EC2 workers); staging and production
- CI/CD (e.g. GitHub Actions: build, migrate, deploy, health check)
- SSL/TLS, monitoring, alerting, database backups

**Cost estimate (10 concurrent users)**: ~$445/month (EC2, RDS, Redis, ALB, ECS).

**Exit criteria**:

- [ ] Terraform provisions all resources
- [ ] CI/CD deploys on push to main
- [ ] SSL/TLS configured
- [ ] Monitoring and alerting in place
- [ ] Database backups configured

---

### Phase 7: Scaling & Performance ⏳

**Goal**: Support 100+ concurrent users; exam start &lt; 10 seconds.

**Depends on**: Phase 6 complete

**Planned**: Cluster pooling (pre-warm clusters); EC2 Auto Scaling on active session count; target &lt; 10 s exam start.

**Exit criteria**:

- [ ] Cluster pool (e.g. 3+ warm clusters)
- [ ] Exam start time &lt; 10 seconds
- [ ] Auto-scaling responds within ~5 minutes
- [ ] System handles 100 concurrent users

---

### Phase 8: Enterprise Features ⏳

**Goal**: SSO, teams, LMS integration for enterprise.

**Depends on**: Phase 7 complete, B2B demand validated

**Planned**: Organizations and members tables; SAML 2.0 / OAuth 2.0 SSO; LTI 1.3 (Canvas, Moodle, Blackboard).

**Exit criteria**:

- [ ] Organizations can invite members
- [ ] Admin dashboard for team usage
- [ ] SSO login with test IdP
- [ ] LTI integration tested with Canvas

---

## Technical Reference

### Resource Requirements Per Session

| Service         | CPU (limit) | Memory (limit) |
| --------------- | ----------- | -------------- |
| k8s-api-server  | 2.0         | 4 GB           |
| remote-desktop  | 1.0         | 1 GB           |
| jumphost        | 1.0         | 512 MB         |
| remote-terminal | 0.5         | 512 MB         |
| **Total**       | **4.5**     | **6 GB**       |

### Scalability Matrix

| Concurrent Users | Infrastructure       | Monthly Cost |
| ---------------- | -------------------- | ------------ |
| 10               | Single large VM      | ~$450        |
| 50               | VM cluster (3 nodes) | ~$2,000      |
| 100              | Auto-scaling cluster | ~$4,000      |
| 500              | Multi-region cluster | ~$20,000     |

### Technology Stack

| Component  | Technology          | Phase |
| ---------- | ------------------- | ----- |
| Database   | PostgreSQL 15       | 3     |
| Auth       | JWT (jsonwebtoken)  | 3     |
| Payments   | Stripe              | 4     |
| IaC        | Terraform           | 6     |
| CI/CD      | GitHub Actions      | 6     |
| Monitoring | CloudWatch + Sentry | 6     |
| Metrics    | Prometheus          | 7     |

---

## Risk Assessment

| Risk                                | Impact | Likelihood | Mitigation                         |
| ----------------------------------- | ------ | ---------- | ---------------------------------- |
| K3d startup time affects UX         | High   | High       | Cluster pooling (Phase 7)          |
| Infrastructure costs exceed revenue | High   | Medium     | Usage limits, efficient scaling    |
| Security vulnerability              | High   | Low        | Regular audits, dependency updates |
| Stripe integration complexity       | Medium | Medium     | Use Stripe hosted checkout         |
| Database scaling                    | Medium | Low        | Read replicas, connection pooling  |

---

## Decision Log

| Date       | Decision                                 | Rationale                                                     |
| ---------- | ---------------------------------------- | ------------------------------------------------------------- |
| 2026-02-02 | One exam per user                        | Mirrors real exams, saves resources                           |
| 2026-02-02 | PostgreSQL over MongoDB                  | Relational data, ACID compliance                              |
| 2026-02-02 | Stripe for payments                      | Developer-friendly, handles complexity                        |
| 2026-02-02 | AWS over GCP/Azure                       | Docker-in-Docker support on EC2                               |
| 2026-02-02 | Shared containers (Phases 1–5)           | Simpler architecture for &lt;100 users                        |
| 2026-02-03 | Single CKX frontend for auth and payment | One app for exam session, login, register, dashboard, pricing |

---

_Last updated: 2026-02-03_
