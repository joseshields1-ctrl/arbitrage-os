# arbitrage-os
cross-industry arbitrage engine for vehicles, electronics, and auction-based resale.

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
- Placeholder/null until completion inputs exist:
  - all postmortem fields are `null` when realized profit is unavailable

No analytics UI or additional persistence tables are added in Phase 1.2.
