# AGENTS.md

## Cursor Cloud specific instructions

### Architecture

This is a TypeScript monorepo with two services:

- **Backend** (`/backend`): Express 5 API with SQLite (via `better-sqlite3`). Runs on port 3000.
- **Frontend** (`/frontend`): Vite + React 19 SPA. Runs on port 5173 and proxies `/api` requests to `localhost:3000`.

### Running services

Start both in parallel (order doesn't matter, but backend should be up before using the frontend):

```bash
cd /workspace/backend && npm run dev   # tsx watch, port 3000
cd /workspace/frontend && npm run dev  # vite dev, port 5173
```

The backend auto-creates its SQLite database at `./data/arbitrage-os.db` on first request. No migrations or seeding steps required.

### Lint and type-check

- **Frontend lint:** `cd /workspace/frontend && npm run lint` (ESLint; note: there are pre-existing lint errors in the repo)
- **Backend type-check:** `cd /workspace/backend && npx tsc --noEmit`
- **Frontend type-check:** `cd /workspace/frontend && npx tsc -b`

### Build

- **Backend build:** `cd /workspace/backend && npm run build` (outputs to `dist/`)
- **Frontend build:** `cd /workspace/frontend && npm run build` (runs tsc + vite build)

### Key API endpoints for testing

- `GET /health` — health check
- `GET /api/dashboard` — dashboard summary
- `GET /api/dashboard/operator-summary` — operator summary
- `POST /api/deals` — create a deal (see README.md for payload examples)
- `POST /api/deals/preview` — preview enrichment without persisting
- `POST /api/assistant/query` — AI assistant (falls back to heuristic mock if no `OPENAI_API_KEY`)

### Environment variables

`OPENAI_API_KEY` is optional. Without it, the assistant endpoint returns heuristic-based responses. No other secrets are required for local development.

### Node.js version

The project requires Node.js >= 20.19.0. The Dockerfile uses `node:20-slim`.
