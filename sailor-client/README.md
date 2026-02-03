# Sailor-Client (Control Plane)

Sailor-Client is the control plane service for CKX, handling all business logic, authentication, payments, and user management.

## Responsibilities

- **Authentication**: User login, registration, token management
- **Payments**: Stripe integration for access passes
- **Business Logic**: Exam session creation, user dashboard, time tracking
- **CKX Communication**: Service-to-service calls to CKX internal APIs

## Architecture

```
Browser → Sailor-Client → CKX Internal APIs
```

Sailor-Client owns:

- `users` table
- `exam_sessions` table
- `access_passes` table
- `refresh_tokens` table

CKX owns:

- `runtime_sessions` table
- Docker containers
- Kubernetes namespaces

## Installation

```bash
npm install
```

## Configuration

Set environment variables:

```bash
PORT=4000
POSTGRES_HOST=postgres
POSTGRES_DB=ckx
POSTGRES_USER=ckx
POSTGRES_PASSWORD=ckx-dev-password
JWT_SECRET=your-jwt-secret
CKX_URL=http://facilitator:3000
CKX_SERVICE_SECRET=your-service-secret
STRIPE_SECRET_KEY=sk_...
STRIPE_PUBLISHABLE_KEY=pk_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

## Running

```bash
# Development
npm run dev

# Production
npm start
```

## Docker Build

The Dockerfile uses `npm install` instead of `npm ci` because package-lock.json may not exist initially.

To build:

```bash
docker-compose build sailor-client
```

## API Endpoints

### Authentication

- `POST /api/v1/auth/register` - Register new user
- `POST /api/v1/auth/login` - Login user
- `POST /api/v1/auth/refresh` - Refresh access token
- `POST /api/v1/auth/logout` - Logout user

### Exams

- `GET /api/v1/exams/labs` - Get available labs
- `POST /api/v1/exams` - Create exam session (calls CKX `/internal/exams/start`)
- `GET /api/v1/exams/current` - Get current active exam
- `POST /api/v1/exams/:examId/terminate` - Terminate exam (calls CKX `/internal/exams/terminate`)

## Service-to-Service Authentication

Sailor-Client authenticates with CKX using HMAC signatures:

```javascript
const timestamp = Math.floor(Date.now() / 1000);
const payload = `${timestamp}.${JSON.stringify(body)}`;
const signature = crypto
  .createHmac('sha256', SERVICE_SECRET)
  .update(payload)
  .digest('hex');

// Headers:
// X-Service-Signature: <signature>
// X-Service-Timestamp: <timestamp>
```

## Testing

```bash
npm test
```

## See Also

- `docs/ARCHITECTURE_REFACTOR.md` - Full architecture documentation
- `docs/DEPRECATED_APIS.md` - Migration guide from CKX public APIs
