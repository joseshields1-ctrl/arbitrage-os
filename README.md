# arbitrage-os
cross-industry arbitrage engine for vehicles, electronics, and auction-based resale.

## Production connectivity (backend + frontend)

Production frontend and backend are deployed as separate services. Frontend must use an explicit backend base URL; do not rely on same-origin `/api` unless backend is hosted on the same origin.

### Recommended backend host

Use **Render Web Service** (Docker) with a **persistent disk** for SQLite.

Why this path:

- It runs the current Node + Express backend without code redesign.
- It supports long-running web services and environment configuration cleanly.
- It supports persisted storage for SQLite via disk mount.

### SQLite deployment limitation and safe workaround

Limitation:

- SQLite is a local file database. On serverless/stateless platforms (or services without persisted writable volume), the DB file is ephemeral and can reset between deployments or restarts.

Safe workaround now:

- Use a persistent disk and set `SQLITE_DB_PATH` to a path on that disk (for example `/var/data/arbitrage-os.db`).

### Files added for deployment

- `backend/Dockerfile`
- `backend/.dockerignore`
- `render.yaml` (Render Blueprint)
- `backend/.env.example`
- `backend/README.md`
- `frontend/.env.production.example`

### Backend deployment steps (Render)

1. Push this branch.
2. In Render, create Blueprint from repo root (`render.yaml`) or create a Docker web service manually from `backend/`.
3. Ensure env vars:
   - `PORT=3000`
   - `NODE_ENV=production`
   - `SQLITE_DB_PATH=/var/data/arbitrage-os.db`
   - `CORS_ALLOWED_ORIGINS=https://<your-frontend-domain>`
   - `OPENAI_API_KEY=<optional>`
4. Deploy and note backend URL (example: `https://<service>.onrender.com`).
5. Verify backend:
   - `GET <backend-url>/health`
   - `GET <backend-url>/api/dashboard`
   - `POST <backend-url>/api/deals/preview`
   - `GET <backend-url>/api/dashboard/operator-summary`
   - `POST <backend-url>/api/assistant/query`

### Frontend production env

Set:

- `VITE_API_BASE_URL=https://<backend-url>`

Important:

- `frontend/src/api.ts` now throws an explicit runtime error in production if `VITE_API_BASE_URL` is missing to avoid silent same-origin `/api` 404 behavior.

## Backend deal validation and completion flow (Phase 1.2)

### Preview a raw deal payload (no persistence)

Use preview to run real/raw input through the enrichment engine without inserting rows:

```bash
curl -s -X POST http://localhost:3000/api/deals/preview \
  -H "Content-Type: application/json" \
  --data '{
    "label":"Preview Deal",
    "category":"vehicle_suv",
    "source_platform":"facebook",
    "acquisition_state":"FL",
    "status":"sourced",
    "financials":{
      "acquisition_cost":12000,
      "buyer_premium_pct":0.05,
      "tax_rate":0.06,
      "transport_cost_actual":0,
      "repair_cost":400,
      "prep_cost":200,
      "estimated_market_value":17000
    },
    "metadata":{
      "condition_grade":"used_good",
      "condition_notes":"Clean title and minor wear.",
      "transport_type":"local_pickup",
      "presentation_quality":"high"
    }
  }'
```

`POST /test-enrich` accepts the same payload and returns the same enriched contract shape.

### Create a persisted deal

```bash
curl -s -X POST http://localhost:3000/api/deals \
  -H "Content-Type: application/json" \
  --data '{ ...same payload shape as preview... }'
```

### Complete a deal properly

`PATCH /api/deals/:id/stage` now enforces sequential stage transitions only and requires completion data when moving to `completed`.

Example (from `sold` -> `completed`):

```bash
curl -s -X PATCH http://localhost:3000/api/deals/<deal_id>/stage \
  -H "Content-Type: application/json" \
  --data '{
    "stage":"completed",
    "completion_data":{
      "sale_price_actual":17500,
      "completion_date":"2026-03-29T00:00:00.000Z"
    }
  }'
```

## Required validation rules

- `label`, `acquisition_state`, `metadata.condition_notes`, and `metadata.presentation_quality` are required non-empty strings.
- `financials.acquisition_cost` and `financials.estimated_market_value` are required numeric values (`>= 0`).
- Optional numeric inputs must be valid finite numbers when provided and `>= 0`.
- If `status = completed` in create/preview payload:
  - `completion_date` is required (valid ISO timestamp)
  - `financials.sale_price_actual` is required (`>= 0`)
- For stage transitions:
  - only direct next-stage transitions are allowed
  - no same-stage transitions
  - no skipping forward/backward
  - `stage_updated_at` is updated on every valid transition
  - transition to `completed` requires `completion_data.sale_price_actual` and ISO `completion_date`
  - `completion_data` is rejected for non-`completed` transitions

## Postmortem readiness notes

Postmortem output is computed in-engine when `realized_profit` exists (completed + `sale_price_actual`):

- Computed now:
  - `postmortem.profit_delta`
  - `postmortem.variance_pct`
  - `postmortem.revenue_variance`
  - `postmortem.profit_drift_flag` (`HIGH_NEGATIVE`, `NEGATIVE`, `STABLE`, `POSITIVE`)
  - `postmortem.cost_overrun_flag` (true when actual cost basis > projected baseline by >10%)
  - `postmortem.drift_sources` (attribution list)
- Placeholder/null until completion inputs exist:
  - all postmortem fields are `null` when realized profit is unavailable
  - `postmortem.postmortem_incomplete` is `true` when completed output cannot fully compute drift
  - warning `POSTMORTEM_INCOMPLETE` is emitted for completed deals without computable postmortem

### Drift warnings and confidence interaction

- `PROFIT_DRIFT_HIGH` when `postmortem.profit_drift_flag = HIGH_NEGATIVE`
- `COST_OVERRUN` when `postmortem.cost_overrun_flag = true`
- `ESTIMATION_FAILURE` when negative drift occurred with multiple estimated cost inputs
- If drift is strongly negative and there are multiple estimated inputs, `calculations.data_confidence` is reduced further in enrichment output.

No analytics UI or additional persistence tables are added in Phase 1.2.

## Operator layer payloads (Phase 1.4)

### Alerts array on enriched deals

Each enriched deal now includes:

- `alerts: Array<{ code, severity, message }>`

Alert codes:

- `FORCE_LIQUIDATION`
- `STAGE_CRITICAL`
- `TITLE_DELAY`
- `PROFIT_DRIFT_HIGH`
- `COST_OVERRUN`
- `ESTIMATION_FAILURE`
- `POSTMORTEM_INCOMPLETE`
- `LOW_DATA_CONFIDENCE`

`warnings` continues to include transport/source warnings and now also includes alert codes for simple UI display.

### Daily operator summary

New endpoint:

- `GET /api/dashboard/operator-summary`

Payload includes:

- `active_deals_count`
- `completed_deals_count`
- `projected_profit_total`
- `realized_profit_total`
- `critical_alert_count`
- `deals_requiring_action_today`
- `top_risk_deals`
- `top_profit_drift_deals`

### Assistant-readiness context object

Each enriched deal now includes:

- `assistant_context.current_deal`
- `assistant_context.calculations`
- `assistant_context.engine`
- `assistant_context.warnings`
- `assistant_context.postmortem`
- `assistant_context.recommendation_summary`

### Operator validation route

New route for inspection/testing:

- `GET /test-operator`

Returns:

- `alerts_preview`
- `operator_summary`
- `assistant_context_preview`
