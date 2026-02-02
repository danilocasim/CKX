# Phase 3: User Authentication & Accounts

**Document Type**: Implementation Record
**Status**: ✅ Complete
**Date**: 2026-02-02
**Author**: Danilo Jr. B. Casim
**Reviewed By**: Senior Software Engineer

---

## 1. Executive Summary

Phase 3 implements user authentication and account management for CKX. This enables user registration, login, JWT-based authentication, and exam history tracking. The foundation supports the upcoming payment integration in Phase 4.

**Goals**:
- User registration with email/password
- JWT-based authentication (access + refresh tokens)
- Exam attempt tracking linked to user accounts
- Protected routes for authenticated users
- Groundwork for mock vs full exam access control

**Implementation Status**:
- [x] PostgreSQL service in docker-compose (with migrations mount)
- [x] Database schema (users, exam_attempts, refresh_tokens tables)
- [x] Database client utility (`src/utils/db.js`)
- [x] Auth service (`src/services/authService.js`)
- [x] User service (`src/services/userService.js`)
- [x] Auth middleware (`src/middleware/authMiddleware.js`)
- [x] Auth validators (`src/middleware/authValidators.js`)
- [x] Auth controller (`src/controllers/authController.js`)
- [x] User controller (`src/controllers/userController.js`)
- [x] Auth routes (`src/routes/authRoutes.js`)
- [x] User routes (`src/routes/userRoutes.js`)
- [x] Config updated with JWT and DB settings
- [x] App.js updated to register routes and test DB connection
- [x] Sailor-client React UI integrated with facilitator API
- [x] Exam listing and start flow connected

---

## 2. Architecture Overview

### 2.1 Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Authentication Flow                                │
└─────────────────────────────────────────────────────────────────────────────┘

    Client                    Facilitator                    PostgreSQL
      │                           │                              │
      │  POST /auth/register      │                              │
      │ ─────────────────────────>│                              │
      │                           │  INSERT user                 │
      │                           │ ────────────────────────────>│
      │                           │<─────────────────────────────│
      │  { user, tokens }         │                              │
      │<──────────────────────────│                              │
      │                           │                              │
      │  POST /auth/login         │                              │
      │ ─────────────────────────>│                              │
      │                           │  SELECT user by email        │
      │                           │ ────────────────────────────>│
      │                           │<─────────────────────────────│
      │                           │  Verify password (bcrypt)    │
      │  { tokens }               │                              │
      │<──────────────────────────│                              │
      │                           │                              │
      │  GET /users/me            │                              │
      │  Authorization: Bearer... │                              │
      │ ─────────────────────────>│                              │
      │                           │  Verify JWT                  │
      │                           │  SELECT user by id           │
      │                           │ ────────────────────────────>│
      │  { user }                 │<─────────────────────────────│
      │<──────────────────────────│                              │
```

### 2.2 Token Strategy

| Token Type | Lifetime | Storage | Purpose |
|------------|----------|---------|---------|
| Access Token | 15 minutes | Memory/localStorage | API authentication |
| Refresh Token | 7 days | httpOnly cookie / localStorage | Get new access token |

**Security Decisions**:
- Passwords hashed with bcrypt (cost factor 12)
- Refresh tokens stored in Redis for revocation
- Access tokens are stateless (no server-side storage)
- JWT secret stored in environment variable

---

## 3. Database Schema

### 3.1 Users Table

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  display_name VARCHAR(100),
  email_verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
```

### 3.2 Exam Attempts Table

```sql
CREATE TABLE exam_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  ckx_session_id UUID NOT NULL,
  lab_id VARCHAR(50) NOT NULL,
  category VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'started',
  score INTEGER,
  max_score INTEGER,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  duration_minutes INTEGER
);

CREATE INDEX idx_exam_attempts_user_id ON exam_attempts(user_id);
CREATE INDEX idx_exam_attempts_status ON exam_attempts(status);
CREATE INDEX idx_exam_attempts_lab_id ON exam_attempts(lab_id);
```

### 3.3 Refresh Tokens Table

```sql
CREATE TABLE refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  revoked BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);
```

---

## 4. API Endpoints

### 4.1 Authentication Routes

| Method | Endpoint | Auth Required | Description |
|--------|----------|---------------|-------------|
| `POST` | `/api/v1/auth/register` | No | Create new account |
| `POST` | `/api/v1/auth/login` | No | Authenticate user |
| `POST` | `/api/v1/auth/refresh` | No* | Refresh access token |
| `POST` | `/api/v1/auth/logout` | Yes | Revoke refresh token |

*Requires valid refresh token

### 4.2 User Routes

| Method | Endpoint | Auth Required | Description |
|--------|----------|---------------|-------------|
| `GET` | `/api/v1/users/me` | Yes | Get current user profile |
| `PATCH` | `/api/v1/users/me` | Yes | Update user profile |
| `GET` | `/api/v1/users/me/exams` | Yes | Get exam history |
| `GET` | `/api/v1/users/me/exams/:id` | Yes | Get specific exam attempt |

---

## 5. Request/Response Examples

### 5.1 Register

**Request:**
```bash
curl -X POST http://localhost:30080/facilitator/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "securePassword123",
    "displayName": "John Doe"
  }'
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "email": "user@example.com",
      "displayName": "John Doe",
      "createdAt": "2026-02-02T10:00:00.000Z"
    },
    "tokens": {
      "accessToken": "eyJhbGciOiJIUzI1NiIs...",
      "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
      "expiresIn": 900
    }
  }
}
```

### 5.2 Login

**Request:**
```bash
curl -X POST http://localhost:30080/facilitator/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "securePassword123"
  }'
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "email": "user@example.com",
      "displayName": "John Doe"
    },
    "tokens": {
      "accessToken": "eyJhbGciOiJIUzI1NiIs...",
      "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
      "expiresIn": 900
    }
  }
}
```

### 5.3 Refresh Token

**Request:**
```bash
curl -X POST http://localhost:30080/facilitator/api/v1/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
  }'
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "expiresIn": 900
  }
}
```

### 5.4 Get Current User

**Request:**
```bash
curl http://localhost:30080/facilitator/api/v1/users/me \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "user@example.com",
    "displayName": "John Doe",
    "emailVerified": false,
    "createdAt": "2026-02-02T10:00:00.000Z"
  }
}
```

### 5.5 Get Exam History

**Request:**
```bash
curl http://localhost:30080/facilitator/api/v1/users/me/exams \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "count": 3,
    "exams": [
      {
        "id": "a1b2c3d4-...",
        "labId": "ckad-001",
        "category": "CKAD",
        "status": "completed",
        "score": 85,
        "maxScore": 100,
        "startedAt": "2026-02-01T14:00:00.000Z",
        "completedAt": "2026-02-01T16:00:00.000Z",
        "durationMinutes": 120
      }
    ]
  }
}
```

---

## 6. File Structure

### 6.1 New Files Created

```
facilitator/
├── migrations/
│   └── 001_init.sql              # All tables: users, refresh_tokens, exam_attempts
├── src/
│   ├── controllers/
│   │   ├── authController.js     # Auth request handlers
│   │   └── userController.js     # User request handlers
│   ├── middleware/
│   │   ├── authMiddleware.js     # JWT validation (authenticate, optionalAuth)
│   │   └── authValidators.js     # Joi schemas for auth endpoints
│   ├── routes/
│   │   ├── authRoutes.js         # /api/v1/auth/*
│   │   └── userRoutes.js         # /api/v1/users/*
│   ├── services/
│   │   ├── authService.js        # Auth business logic (register, login, refresh, logout)
│   │   └── userService.js        # User/exam attempt logic
│   └── utils/
│       └── db.js                 # PostgreSQL pool client
```

### 6.2 Modified Files

| File | Changes |
|------|---------|
| `docker-compose.yaml` | PostgreSQL service already configured with migrations mount |
| `facilitator/package.json` | Added `pg`, `bcrypt`, `jsonwebtoken` dependencies |
| `facilitator/src/app.js` | Import and register auth/user routes, test DB connection on startup |
| `facilitator/src/config/index.js` | Added `db`, `jwt`, and `bcrypt` configuration sections |

---

## 7. Configuration

### 7.1 Environment Variables

```bash
# PostgreSQL
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
POSTGRES_DB=ckx
POSTGRES_USER=ckx
POSTGRES_PASSWORD=your-secure-password

# JWT
JWT_SECRET=your-jwt-secret-key-min-32-chars
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# Bcrypt
BCRYPT_ROUNDS=12
```

### 7.2 Docker Compose Addition

```yaml
postgres:
  image: postgres:15-alpine
  hostname: postgres
  environment:
    POSTGRES_DB: ${POSTGRES_DB:-ckx}
    POSTGRES_USER: ${POSTGRES_USER:-ckx}
    POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-ckx-dev-password}
  volumes:
    - postgres_data:/var/lib/postgresql/data
    - ./facilitator/migrations:/docker-entrypoint-initdb.d:ro
  expose:
    - "5432"
  networks:
    - ckx-network
  healthcheck:
    test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-ckx}"]
    interval: 10s
    timeout: 5s
    retries: 5
  deploy:
    resources:
      limits:
        cpus: "0.5"
        memory: 512M
      reservations:
        cpus: "0.2"
        memory: 256M
```

---

## 8. Security Considerations

### 8.1 Password Security

- Minimum 8 characters
- Hashed with bcrypt (cost factor 12)
- Never stored in plaintext
- Never returned in API responses

### 8.2 Token Security

- Access tokens: Short-lived (15 min), stateless
- Refresh tokens: Stored hashed in DB, can be revoked
- All tokens signed with HS256
- Secrets loaded from environment variables

### 8.3 Rate Limiting (Future Phase)

Authentication endpoints should be rate-limited:
- `/auth/login`: 5 attempts per minute per IP
- `/auth/register`: 3 attempts per minute per IP
- `/auth/refresh`: 10 attempts per minute per user

---

## 9. Integration with Exam Service

### 9.1 Exam Attempt Tracking

When a user creates an exam, record the attempt:

```javascript
// In examService.js
async function createExam(examData, userId = null) {
  const examId = uuidv4();

  // ... existing exam creation logic ...

  // Track exam attempt if user is authenticated
  if (userId) {
    await db.query(`
      INSERT INTO exam_attempts (user_id, ckx_session_id, lab_id, category, status)
      VALUES ($1, $2, $3, $4, 'started')
    `, [userId, examId, labId, category]);
  }

  return { id: examId, ... };
}
```

### 9.2 Exam Completion Recording

When an exam ends or is evaluated, update the attempt:

```javascript
// In examService.js
async function endExam(examId, userId = null) {
  // ... existing cleanup logic ...

  // Update exam attempt if user is authenticated
  if (userId) {
    await db.query(`
      UPDATE exam_attempts
      SET status = 'completed',
          completed_at = NOW(),
          duration_minutes = EXTRACT(EPOCH FROM (NOW() - started_at)) / 60
      WHERE ckx_session_id = $1 AND user_id = $2
    `, [examId, userId]);
  }
}

async function recordExamScore(examId, userId, score, maxScore) {
  await db.query(`
    UPDATE exam_attempts
    SET score = $1, max_score = $2
    WHERE ckx_session_id = $3 AND user_id = $4
  `, [score, maxScore, examId, userId]);
}
```

---

## 10. Testing Checklist

### 10.1 Registration

- [ ] User can register with email/password
- [ ] Duplicate email returns 409 Conflict
- [ ] Weak password returns 400 Bad Request
- [ ] Returns user object and tokens

### 10.2 Login

- [ ] Valid credentials return tokens
- [ ] Invalid email returns 401 Unauthorized
- [ ] Invalid password returns 401 Unauthorized
- [ ] Returns user object and tokens

### 10.3 Token Refresh

- [ ] Valid refresh token returns new access token
- [ ] Expired refresh token returns 401
- [ ] Revoked refresh token returns 401

### 10.4 Protected Routes

- [ ] Missing token returns 401
- [ ] Invalid token returns 401
- [ ] Expired token returns 401
- [ ] Valid token allows access

### 10.5 User Profile

- [ ] Can get own profile
- [ ] Can update display name
- [ ] Cannot update email (immutable for now)

### 10.6 Exam History

- [ ] Returns list of user's exam attempts
- [ ] Includes score, status, duration
- [ ] Sorted by most recent first

---

## 11. Manual Verification

```bash
# Start services
docker-compose up -d

# Wait for PostgreSQL
docker-compose logs -f postgres

# Register a user
curl -X POST http://localhost:30080/facilitator/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "password": "TestPass123", "displayName": "Test User"}'

# Login
curl -X POST http://localhost:30080/facilitator/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "password": "TestPass123"}'

# Get profile (use token from login response)
curl http://localhost:30080/facilitator/api/v1/users/me \
  -H "Authorization: Bearer <access_token>"

# Create exam (authenticated)
curl -X POST http://localhost:30080/facilitator/api/v1/exams \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <access_token>" \
  -d '{"labId": "ckad-001"}'

# Get exam history
curl http://localhost:30080/facilitator/api/v1/users/me/exams \
  -H "Authorization: Bearer <access_token>"
```

---

## 12. Exit Criteria

- [x] PostgreSQL service running in docker-compose
- [x] Database migrations create all tables (users, refresh_tokens, exam_attempts)
- [x] User can register with email/password
- [x] User can login and receive JWT tokens
- [x] Refresh token can generate new access token
- [x] Protected routes require valid token
- [x] User can view their profile
- [x] User can view their exam history
- [x] Sailor-client UI integrated with facilitator auth API
- [x] Exam listing endpoint added (`GET /api/v1/exams/labs`)
- [x] Exam start flow works from sailor-client (opens in new tab)
- [ ] Integration: Exam attempts are linked to user accounts (requires examService.js update)

**Note**: The exam attempt tracking integration with examService.js is deferred to Phase 3.5 when exam types are restructured. The userService already provides `createExamAttempt()` and `updateExamAttempt()` methods for this integration.

---

## 13. Sailor-Client Integration

The `sailor-client/` directory contains a React frontend that connects to the facilitator API:

### Running the Client

```bash
cd sailor-client
npm install
npm run dev
```

Access at **http://localhost:3001**

### Features
- User registration and login
- Dashboard with exam statistics
- Exam browser with category grouping
- Start exam (opens CKX exam interface in new tab)

### Architecture
- React + Vite + Tailwind CSS
- Proxies `/api/*` to `http://localhost:30080/facilitator/api/*`
- Uses facilitator's auth endpoints (no separate backend)

---

## 14. Next Steps (Phase 3.5+)

1. **Phase 3.5: Exam Types** - Add mock/full exam distinction
2. **Phase 4: Payments** - Stripe integration for access passes
3. **Email Verification** - Verify user email addresses
4. **Password Reset** - Forgot password flow
5. **OAuth Providers** - Google, GitHub login

---

_Document generated as part of Phase 3 implementation. Started: 2026-02-02._
