# Phase 2: CKX Session Management API

**Document Type**: Implementation Record
**Status**: Completed
**Date**: 2026-02-02
**Author**: Danilo Jr. B. Casim

---

## 1. Executive Summary

Phase 2 exposes a RESTful API for session lifecycle management. This API enables programmatic control over exam sessions, providing the foundation for multi-user support and future integrations.

**Completed**:
- [x] Session controller with all CRUD operations
- [x] Request validation with Joi schemas
- [x] Session routes registered in app.js
- [x] Port allocator initialization on startup
- [x] OpenAPI 3.0 specification
- [x] State machine for session lifecycle

---

## 2. API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/sessions` | Create session |
| `GET` | `/api/v1/sessions` | List sessions (with optional state filter) |
| `GET` | `/api/v1/sessions/stats` | Get statistics |
| `GET` | `/api/v1/sessions/:id` | Get session metadata |
| `GET` | `/api/v1/sessions/:id/status` | Get session status |
| `GET` | `/api/v1/sessions/:id/routing` | Get routing info |
| `GET` | `/api/v1/sessions/:id/ports` | Get allocated ports |
| `POST` | `/api/v1/sessions/:id/activate` | Activate session |
| `DELETE` | `/api/v1/sessions/:id` | Terminate session |

---

## 3. Session State Machine

```
INITIALIZING → ALLOCATING_PORTS → CONFIGURING → READY → ACTIVE → TERMINATING → TERMINATED
     ↓              ↓                 ↓            ↓        ↓           ↓
   FAILED        FAILED            FAILED      FAILED   FAILED      FAILED
```

### State Descriptions

| State | Description |
|-------|-------------|
| `INITIALIZING` | Session creation started |
| `ALLOCATING_PORTS` | Reserving ports from pool |
| `SPAWNING_CONTAINERS` | Creating containers (ISOLATED mode only) |
| `CONFIGURING` | Applying session configuration |
| `READY` | Session ready for use |
| `ACTIVE` | Session in active use |
| `TERMINATING` | Cleanup in progress |
| `TERMINATED` | Session ended, resources released |
| `FAILED` | Error occurred |

---

## 4. Files Created/Modified

### New Files

| File | Purpose |
|------|---------|
| `facilitator/src/controllers/sessionController.js` | HTTP request handlers |
| `facilitator/src/middleware/sessionValidators.js` | Joi validation |
| `docs/api/session-api.yaml` | OpenAPI 3.0 specification |
| `docs/plan/PHASE2_SESSION_API.md` | This document |

### Modified Files

| File | Change |
|------|--------|
| `facilitator/src/routes/sessionRoutes.js` | Refactored to use controller |
| `facilitator/src/app.js` | Registered session routes, initialize port allocator |

---

## 5. Request/Response Examples

### Create Session

**Request:**
```bash
curl -X POST http://localhost:30080/facilitator/api/v1/sessions \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "550e8400-e29b-41d4-a716-446655440000",
    "options": { "labId": "ckad-pod-design" }
  }'
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "sessionId": "550e8400-e29b-41d4-a716-446655440000",
    "state": "READY",
    "mode": "SHARED",
    "ports": {
      "vnc": 6901,
      "sshTerminal": 2201,
      "sshJumphost": 2301,
      "k8sApi": 6443
    },
    "createdAt": "2026-02-02T07:50:00.000Z"
  }
}
```

### List Sessions

**Request:**
```bash
curl http://localhost:30080/facilitator/api/v1/sessions?state=ACTIVE
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "count": 2,
    "sessions": [
      {
        "sessionId": "550e8400-e29b-41d4-a716-446655440000",
        "state": "ACTIVE",
        "mode": "SHARED",
        "createdAt": "2026-02-02T07:50:00.000Z",
        "updatedAt": "2026-02-02T07:55:00.000Z"
      }
    ]
  }
}
```

### Get Session Status

**Request:**
```bash
curl http://localhost:30080/facilitator/api/v1/sessions/550e8400-e29b-41d4-a716-446655440000/status
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "sessionId": "550e8400-e29b-41d4-a716-446655440000",
    "state": "ACTIVE",
    "createdAt": "2026-02-02T07:50:00.000Z",
    "updatedAt": "2026-02-02T07:55:00.000Z",
    "activatedAt": "2026-02-02T07:52:00.000Z",
    "terminatedAt": null,
    "error": null
  }
}
```

### Get Statistics

**Request:**
```bash
curl http://localhost:30080/facilitator/api/v1/sessions/stats
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "mode": "SHARED",
    "totalSessions": 5,
    "sessionsByState": {
      "READY": 2,
      "ACTIVE": 3
    },
    "ports": {
      "VNC": { "allocated": 5, "available": 94, "total": 99, "range": "6901-6999" },
      "SSH_TERMINAL": { "allocated": 5, "available": 94, "total": 99, "range": "2201-2299" },
      "SSH_JUMPHOST": { "allocated": 5, "available": 94, "total": 99, "range": "2301-2399" },
      "K8S_API": { "allocated": 5, "available": 95, "total": 100, "range": "6443-6542" }
    },
    "maxSessions": 99
  }
}
```

### Terminate Session

**Request:**
```bash
curl -X DELETE http://localhost:30080/facilitator/api/v1/sessions/550e8400-e29b-41d4-a716-446655440000
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "sessionId": "550e8400-e29b-41d4-a716-446655440000",
    "message": "Session terminated successfully"
  }
}
```

---

## 6. Validation

All endpoints validate:
- **sessionId**: Must be valid UUID format
- **state filter**: Must be valid session state
- **options**: Optional object with labId, userId, metadata

Invalid requests return 400 with descriptive error messages.

---

## 7. Integration with Exam Lifecycle

The Session API works alongside the existing Exam API:

1. **Exam Creation** (`POST /api/v1/exams`) internally calls session initialization
2. **Exam Termination** (`DELETE /api/v1/exams/:id`) calls session termination
3. **Session API** provides direct access for administrative purposes

The exam lifecycle flow:
```
Create Exam → Session Initialized → Ports Allocated → Environment Prepared → Ready
    ↓                                                                           ↓
End Exam ← Environment Cleanup ← Ports Released ← Session Terminated ← [User works]
```

---

## 8. OpenAPI Specification

Full API documentation available at: `docs/api/session-api.yaml`

View with Swagger UI:
```bash
# Using Docker
docker run -p 8080:8080 -e SWAGGER_JSON=/api/session-api.yaml \
  -v $(pwd)/docs/api:/api swaggerapi/swagger-ui

# Or use online editor
# https://editor.swagger.io (paste the YAML content)
```

---

## 9. Next Steps (Phase 3+)

1. **User Authentication** - Add user identity to sessions
2. **Session Persistence** - Survive facilitator restarts
3. **Admin Dashboard** - Web UI for session management
4. **Rate Limiting** - Prevent session exhaustion attacks
5. **Webhooks** - Notify external systems of state changes
