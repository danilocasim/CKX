# Copilot Instructions for CK-X Simulator

CK-X Simulator is a Kubernetes certification practice environment (CKAD, CKA, CKS) with web UI, VNC remote desktop, SSH terminal, and KIND cluster backend.

## Build & Run Commands

```bash
# Start all services (primary development method)
docker-compose up --build

# Start/rebuild specific service
docker-compose up --build <service-name>

# View logs / exec into container
docker-compose logs -f <service-name>
docker-compose exec <service-name> bash

# Local dev (requires Docker services for Redis, jumphost, k8s-api-server)
cd app && npm install && npm run dev
cd facilitator && npm install && npm run dev

# Linting
npx eslint facilitator/src --ext .js

# Lint single file
npx eslint facilitator/src/path/to/file.js
```

Services: `webapp`, `facilitator`, `remote-desktop`, `remote-terminal`, `jumphost`, `k8s-api-server`, `redis`, `postgres`, `nginx`

Access at http://localhost:30080 after startup.

## Architecture

Multi-container Docker Compose system with 9 services on bridge network `ckx-network`:

- **nginx** (port 30080) - Only externally exposed service; routes `/facilitator/*` → facilitator, else → webapp
- **webapp** (port 3000) - Express frontend with VNC/SSH proxying via xterm.js and Socket.io
- **facilitator** (port 3000) - Backend API for exam lifecycle, SSH execution, solution evaluation
- **jumphost** / **remote-terminal** (port 22) - SSH endpoints where validation/setup scripts run
- **remote-desktop** (port 6901) - VNC server for graphical access
- **k8s-api-server** (port 6443) - KIND Kubernetes cluster
- **redis** (port 6379) - Session/state store
- **postgres** (port 5432) - User authentication database

Shared volume `kube-config` passes cluster kubeconfig between jumphost and k8s-api-server.

### Request Flow

1. User → nginx:30080 → webapp or facilitator
2. Exam creation: facilitator → SSH to jumphost → k8s-api-server
3. Solution evaluation: facilitator runs validation scripts via SSH on jumphost

## Key Conventions

### Lab Structure

Labs live in `facilitator/assets/exams/<category>/<lab-id>/` with required files:
- `config.json` - Metadata (marks, worker nodes needed)
- `assessment.json` - Questions with verification steps
- `answers.md` - Solution documentation
- `scripts/setup/` - Environment preparation (run concurrently before exam)
- `scripts/validation/` - Solution verification (exit 0 = pass, non-zero = fail)

Register new labs in `facilitator/assets/exams/labs.json`. See `docs/how-to-add-new-labs.md` for full guide.

### Code Style

- Pure JavaScript with CommonJS modules (require/module.exports)
- Vanilla JS frontend (no React/Vue/TypeScript)
- Facilitator follows MVC pattern: `src/{controllers,services,routes,middleware}/`

## Key Files

- `facilitator/src/services/examService.js` - Core exam lifecycle logic
- `facilitator/src/services/jumphostService.js` - SSH execution and environment setup
- `facilitator/src/services/sessionOrchestrator.js` - Multi-session management
- `facilitator/src/utils/redisClient.js` - Redis state management
- `app/server.js` - Frontend server with VNC/SSH proxying
- `app/services/sshTerminalService.js` - xterm.js terminal backend

## API Endpoints

Facilitator API (accessed via `/facilitator` prefix through nginx):

- `GET/POST /api/v1/exams/` - List/create exams
- `GET /api/v1/exams/:examId/questions` - Get questions
- `POST /api/v1/exams/:examId/evaluate` - Evaluate solutions
- `POST /api/v1/sessions` - Create session
- `GET /api/v1/sessions/:id/status` - Get session status
- `POST /api/v1/execute` - Execute command on jumphost

### Development Notes

- Environment variables in docker-compose.yaml configure runtime behavior (SSH_HOST, REDIS_HOST, POSTGRES_*, JWT_*, etc.)
- Demo credentials in docker-compose.yaml are for local development only
- Facilitator SSHs into jumphost to run arbitrary scripts; exercise caution when modifying setup/validation scripts
- Use `/tmp/exam` for temporary files in labs; limit to 2 worker nodes max
