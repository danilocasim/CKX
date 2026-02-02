# Copilot instructions for CK-X Simulator

Purpose

Brief guidance for Copilot sessions: how to build, run, lint, where key architecture lives, and repository-specific conventions that matter across files.

Build, run, test, and lint commands

- Docker Compose (primary dev/run):
  - Start all services: docker-compose up --build
  - Start a single service: docker-compose up --build <service-name>
  - View logs: docker-compose logs -f <service-name>
  - Exec into a container: docker-compose exec <service-name> bash

- Local development (without Docker):
  - Webapp: cd app && npm install && npm run dev
  - Facilitator: cd facilitator && npm install && npm run dev

- Linting:
  - Facilitator has ESLint as a devDependency but no npm script; run manually from repo root or service dir: npx eslint facilitator/src --ext .js

- Testing:
  - No automated test suite is configured in this repository at present.
  - When tests are added, run per-package: cd facilitator && npm test.
  - To run a single test when a test runner is present, use the runner's filtering options (for example: npm test -- -t "test name" for Jest-style runners).

High-level architecture (big picture)

- The application is a multi-container Docker Compose system providing a realistic Kubernetes exam simulator.
- Services (key ones):
  - nginx: reverse proxy (exposed on host port 30080).
  - webapp: Express frontend, VNC/SSH proxying (internal port 3000).
  - facilitator: Backend API for exam lifecycle, SSH orchestration and evaluation (internal port 3000).
  - jumphost / remote-terminal: SSH endpoints where facilitator runs validation and setup scripts.
  - remote-desktop: VNC server used by the web UI for graphical access.
  - k8s-api-server: a KIND-based in-container Kubernetes API server for labs.
  - redis: session/state store used by facilitator.
- Networking and volumes:
  - All services use the bridge network `ckx-network`.
  - A shared volume kube-config is used to pass cluster kubeconfig between jumphost and k8s-api-server.
- Request flow (core):
  1. User → nginx (host:30080)
  2. nginx routes `/facilitator/*` → facilitator and everything else → webapp
  3. webapp creates exams via facilitator → facilitator uses SSH to jumphost → jumphost talks to k8s-api-server
  4. facilitator runs validation scripts on jumphost to grade answers

Key repository conventions (non-obvious patterns)

- Lab layout and validation:
  - Labs live under: facilitator/assets/exams/<category>/<lab-id>/
  - Each lab must include: config.json, assessment.json, answers.md, scripts/setup/, scripts/validation/
  - Validation scripts must return exit code 0 to indicate pass; facilitator runs them on the jumphost and treats non-zero as failure.
  - Setup scripts are run before the exam and may run concurrently; avoid cross-question side effects.
  - Labs registry: facilitator/assets/exams/labs.json indexes available labs and metadata.

- Runtime & config:
  - Environment variables (docker-compose and service package.jsons) configure SSH_HOST, REDIS_HOST, PORT, and other runtime behavior; prefer editing docker-compose or passing env files for local runs.
  - Facilitator uses CommonJS (require/module.exports) and standard Express routing; services are in facilitator/src/ (controllers/, services/, routes/, middleware/).

- Developer workflows:
  - For rapid dev, use npm run dev (nodemon) in app/ and facilitator/.
  - There are no automated CI test/lint hooks configured in the repo; local linting and tests must be run manually as needed.

- Security notes (important to know but not prescriptive):
  - docker-compose.yaml contains demo credentials and some empty passwords (used for local/demo only). Do not assume they are secure for production.
  - Facilitator is designed to SSH into jumphost to run arbitrary scripts; exercise caution when modifying validation or setup scripts.

Files and docs to consult

- CLAUDE.md — contains an extensive guide tailored for Claude/Copilot usage and a deeper breakdown of architecture, lab structure, and dev commands. Consult it first for context.
- README.md — high-level project overview and install scripts.
- docker-compose.yaml — definitive runtime composition, ports, env vars, and volumes.
- facilitator/assets/exams/ — lab content and examples (use it to add new labs).

AI assistant configs discovered

- CLAUDE.md found at repository root — includes tailored guidance; incorporated above.
- No other assistant config files (.cursorrules, AGENTS.md, .windsurfrules, CONVENTIONS.md, .clinerules, etc.) were found.

Notes for Copilot sessions

- Prefer reading CLAUDE.md and docker-compose.yaml when determining runtime behavior or debugging cross-service issues.
- When asked to add or modify labs, ensure validation scripts follow the exit-code convention and update facilitator/assets/exams/labs.json.
- For changes that affect orchestration, update docker-compose.yaml and verify services still communicate via `ckx-network` and kube-config volume.

You are a senior software engineer.

General Rules:

- Follow existing architecture and code style
- Prefer simple, explicit solutions
- Avoid premature abstractions
- Do not introduce new libraries unless necessary
- Minimize changes; keep diffs small

Behavior:

- Implement directly
- No tutorials or explanations
- No markdown
- Code first, comments only if needed
- Handle edge cases and errors

Scope:

- Do not refactor unrelated code
- Do not rename unless required
