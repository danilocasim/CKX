# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CK-X Simulator is a Kubernetes certification practice environment providing exam-like experience for CKAD, CKA, CKS, and Docker/Helm certifications. It's a Docker-based application with a web interface, VNC remote desktop, SSH terminal access, and a KIND Kubernetes cluster backend.

## Build and Run Commands

```bash
# Start all services
docker-compose up --build

# Rebuild and start specific service
docker-compose up --build <service-name>

# View logs
docker-compose logs -f <service-name>

# Access container shell
docker-compose exec <service-name> bash
```

Services: `webapp`, `facilitator`, `remote-desktop`, `remote-terminal`, `jumphost`, `k8s-api-server`, `redis`, `nginx`

Access the application at http://localhost:30080 after startup.

### Local Development (without Docker)

```bash
# Webapp (app/)
cd app && npm install && npm run dev

# Facilitator (facilitator/)
cd facilitator && npm install && npm run dev
```

Note: Local development requires external services (Redis, jumphost, k8s-api-server) to be running.

### Linting

```bash
# Facilitator (no npm script configured)
npx eslint facilitator/src --ext .js
```

### Testing

No automated test suite is configured. When tests are added, run per-package: `cd facilitator && npm test`

## Architecture

The system runs 8 containerized services orchestrated via Docker Compose:

- **webapp** (port 3000) - Express.js web frontend (serves exam UI, VNC proxy, SSH terminal via xterm.js/Socket.io)
- **facilitator** (port 3000) - Backend API for exam management, SSH execution, and solution evaluation
- **remote-desktop** (port 6901) - Ubuntu VNC server for graphical access
- **remote-terminal** / **jumphost** (port 22) - SSH access points for candidates
- **k8s-api-server** (port 6443) - KIND Kubernetes cluster
- **redis** (port 6379) - Session and state management
- **nginx** (port 30080) - Reverse proxy (only externally exposed service)

All services communicate internally via bridge network `ckx-network`. A shared volume `kube-config` passes cluster kubeconfig between jumphost and k8s-api-server.

### Request Flow

1. User accesses http://localhost:30080 → nginx
2. nginx routes `/facilitator/*` → facilitator:3000, everything else → webapp:3000
3. Exam creation: webapp → facilitator → jumphost (SSH) → k8s-api-server
4. Solution evaluation: facilitator runs validation scripts via SSH on jumphost

## Key Directories

- `facilitator/src/` - Backend API (MVC pattern: controllers/, services/, routes/, middleware/)
- `facilitator/assets/exams/` - Lab content organized by category (ckad/, cka/, cks/, other/)
- `facilitator/assets/exams/labs.json` - Lab registry with metadata
- `app/` - Web frontend (Express server with VNC/SSH proxying)
- `app/public/` - Static HTML pages and client-side JavaScript
- `app/services/` - SSH terminal and VNC proxy services

## Key Files

- `facilitator/src/services/examService.js` - Core exam lifecycle logic
- `facilitator/src/services/jumphostService.js` - SSH execution and environment setup
- `facilitator/src/services/sessionOrchestrator.js` - Multi-session management
- `facilitator/src/utils/redisClient.js` - Redis state management
- `app/server.js` - Frontend server with VNC/SSH proxying
- `app/services/sshTerminalService.js` - xterm.js terminal backend

## Lab Structure

Each lab in `facilitator/assets/exams/<category>/<lab-id>/` contains:
- `config.json` - Metadata (marks, scores, worker nodes needed)
- `assessment.json` - Questions with verification steps
- `answers.md` - Solution documentation
- `scripts/setup/` - Environment preparation scripts (run before exam)
- `scripts/validation/` - Solution verification scripts (exit 0 = pass)

## API Endpoints

Facilitator service (internal port 3000, accessed via `/facilitator` prefix through nginx):

### Exam Management
- `GET /api/v1/exams/` - List exams
- `POST /api/v1/exams/` - Create new exam
- `GET /api/v1/exams/current` - Active exam
- `GET /api/v1/exams/:examId/questions` - Get questions
- `POST /api/v1/exams/:examId/evaluate` - Evaluate solutions
- `POST /api/v1/exams/:examId/end` - End exam

### Session Management
- `POST /api/v1/sessions` - Create session
- `GET /api/v1/sessions` - List sessions
- `GET /api/v1/sessions/stats` - Get statistics
- `GET /api/v1/sessions/:id` - Get session metadata
- `GET /api/v1/sessions/:id/status` - Get session status
- `GET /api/v1/sessions/:id/routing` - Get routing info
- `GET /api/v1/sessions/:id/ports` - Get allocated ports
- `POST /api/v1/sessions/:id/activate` - Activate session
- `DELETE /api/v1/sessions/:id` - Terminate session

### SSH Execution
- `POST /api/v1/execute` - Execute command on jumphost

## Adding New Labs

Refer to `docs/how-to-add-new-labs.md` for the complete guide. Key requirements:
- Create directory structure under `facilitator/assets/exams/<category>/<lab-id>/`
- Add entry to `facilitator/assets/exams/labs.json`
- Include setup scripts, validation scripts, assessment.json, and answers.md
- Validation scripts must return exit code 0 for pass, non-zero for fail
- All setup scripts run simultaneously; ensure questions are independent
- Use `/tmp/exam` for temporary files; limit to 2 worker nodes max
- No direct SSH to cluster nodes (restricts some lab types)

## Development Notes

- Pure JavaScript codebase (no TypeScript)
- CommonJS module pattern (require/module.exports)
- Vanilla JavaScript frontend (no React/Vue)
- Default credentials in docker-compose.yaml are for demo purposes only
- Environment variables configure SSH_HOST, REDIS_HOST, PORT, and other runtime behavior
