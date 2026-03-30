import {
  AiRecommendation,
  DealCategory,
  OperatorDecisionRecord,
  DealRow,
  DEAL_LIFECYCLE_STAGES,
  DealStatus,
  DealStageInput,
  FinancialInput,
  FinancialRow,
  MetadataInput,
  MetadataRow,
  PrepMetrics,
  SourcePlatform,
  TitleStatus,
  UnitBreakdown,
} from "../models/dealV32";
import { db } from "../db/sqlite";
import { categoryProfiles } from "../config/categoryProfiles";
import { enrichDeal } from "./engine/enrichDeal";

export interface CreateDealInput {
  label: string;
  category: DealCategory;
  source_platform: SourcePlatform;
  acquisition_state: string;
  seller_type?: "government" | "commercial" | "unknown";
  status?: DealStatus;
  stage_updated_at?: string;
  discovered_date?: string | null;
  purchase_date?: string | null;
  listing_date?: string | null;
  sale_date?: string | null;
  completion_date?: string | null;
  unit_count?: number | null;
  unit_breakdown?: UnitBreakdown | null;
  prep_metrics?: PrepMetrics | null;
  financials: FinancialInput;
  metadata: MetadataInput;
}

export interface CompleteDealInput {
  sale_price_actual: number;
  completion_date?: string;
}

export interface DealDecisionInput {
  decision: "approved" | "rejected";
  reason: string;
}

export type DealView = ReturnType<typeof enrichDeal>;

export interface DashboardView {
  active_deals: number;
  completed_deals: number;
  realized_profit_total: number;
  projected_profit_total: number;
  burn_list: Array<{
    id: string;
    label: string;
    days_in_stage: number;
    projected_profit: number;
    recommended_action: ReturnType<typeof enrichDeal>["engine"]["recommended_action"];
  }>;
  aging_alerts: Array<{
    id: string;
    label: string;
    status: DealStatus;
    days_in_stage: number;
  }>;
}

export interface OperatorDailySummary {
  active_deals_count: number;
  completed_deals_count: number;
  projected_profit_total: number;
  realized_profit_total: number;
  critical_alert_count: number;
  deals_requiring_action_today: number;
  top_risk_deals: Array<{
    id: string;
    label: string;
    status: DealStatus;
    data_confidence: number;
    projected_profit: number;
    realized_profit: number | null;
    recommended_action: ReturnType<typeof enrichDeal>["engine"]["recommended_action"];
    alerts: ReturnType<typeof enrichDeal>["alerts"];
    operator_recommendation: string;
  }>;
  top_profit_drift_deals: Array<{
    id: string;
    label: string;
    variance_pct: number;
    profit_delta: number;
    drift_sources: ReturnType<typeof enrichDeal>["engine"]["postmortem"]["drift_sources"];
  }>;
}

const nowIso = (): string => new Date().toISOString();
const normalizeNullableDate = (value?: string | null): string | null => value ?? null;
const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const stageSequence = [...DEAL_LIFECYCLE_STAGES];
const validSourcePlatforms = new Set<SourcePlatform>([
  "govdeals",
  "publicsurplus",
  "ebay",
  "facebook",
  "other",
]);
const validSellerTypes = new Set<DealRow["seller_type"]>(["government", "commercial", "unknown"]);
const validConditionGrades = new Set<MetadataRow["condition_grade"]>([
  "excellent",
  "used_good",
  "used",
  "used_cosmetic",
  "used_functional",
  "defective",
  "parts_only",
]);
const validTransportTypes = new Set<MetadataRow["transport_type"]>([
  "auto_transport",
  "freight",
  "parcel",
  "local_pickup",
  "none",
]);
const validTitleStatuses = new Set<TitleStatus>(["on_site", "delayed", "unknown"]);

const ensureNonEmptyString = (value: unknown, fieldName: string): string => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${fieldName} is required`);
  }
  return value.trim();
};

const parseNumericInput = (
  value: unknown,
  fieldName: string,
  options?: { required?: boolean; min?: number }
): number | null => {
  if (value === null || value === undefined) {
    if (options?.required) {
      throw new Error(`${fieldName} is required`);
    }
    return null;
  }
  const parsed = Number(value);
  if (!isFiniteNumber(parsed)) {
    throw new Error(`${fieldName} must be a valid number`);
  }
  if (options?.min !== undefined && parsed < options.min) {
    throw new Error(`${fieldName} must be >= ${options.min}`);
  }
  return parsed;
};

const ensureDecision = (value: unknown): "approved" | "rejected" => {
  if (value === "approved" || value === "rejected") {
    return value;
  }
  throw new Error("decision must be either approved or rejected");
};

const ensureIsoDate = (value: string, fieldName: string): void => {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    throw new Error(`${fieldName} must be a valid ISO timestamp`);
  }
};

const validateOptionalIsoDate = (value: string | null | undefined, fieldName: string): void => {
  if (value === null || value === undefined) {
    return;
  }
  ensureIsoDate(value, fieldName);
};

const validateCreateOrPreviewInput = (input: CreateDealInput): void => {
  if (!input || typeof input !== "object") {
    throw new Error("Invalid payload");
  }
  if (!input.financials || typeof input.financials !== "object") {
    throw new Error("financials is required");
  }
  if (!input.metadata || typeof input.metadata !== "object") {
    throw new Error("metadata is required");
  }
  if (!Object.prototype.hasOwnProperty.call(categoryProfiles, input.category)) {
    throw new Error("category is invalid");
  }
  if (!validSourcePlatforms.has(input.source_platform)) {
    throw new Error("source_platform is invalid");
  }
  if (input.seller_type !== undefined && !validSellerTypes.has(input.seller_type)) {
    throw new Error("seller_type is invalid");
  }
  if (!validConditionGrades.has(input.metadata.condition_grade)) {
    throw new Error("metadata.condition_grade is invalid");
  }
  if (
    input.metadata.transport_type !== undefined &&
    !validTransportTypes.has(input.metadata.transport_type)
  ) {
    throw new Error("metadata.transport_type is invalid");
  }
  if (
    input.metadata.title_status !== undefined &&
    !validTitleStatuses.has(input.metadata.title_status)
  ) {
    throw new Error("metadata.title_status is invalid");
  }

  ensureNonEmptyString(input.label, "label");
  ensureNonEmptyString(input.acquisition_state, "acquisition_state");
  ensureNonEmptyString(input.metadata.condition_notes, "metadata.condition_notes");
  ensureNonEmptyString(input.metadata.presentation_quality, "metadata.presentation_quality");

  parseNumericInput(input.financials.acquisition_cost, "financials.acquisition_cost", {
    required: true,
    min: 0,
  });
  parseNumericInput(input.financials.estimated_market_value, "financials.estimated_market_value", {
    required: true,
    min: 0,
  });
  parseNumericInput(input.financials.buyer_premium_pct, "financials.buyer_premium_pct", {
    min: 0,
  });
  parseNumericInput(input.financials.transport_cost_actual, "financials.transport_cost_actual", {
    min: 0,
  });
  parseNumericInput(input.financials.transport_cost_estimated, "financials.transport_cost_estimated", {
    min: 0,
  });
  parseNumericInput(input.financials.repair_cost, "financials.repair_cost", { min: 0 });
  parseNumericInput(input.financials.prep_cost, "financials.prep_cost", { min: 0 });
  parseNumericInput(input.financials.tax_rate, "financials.tax_rate", { min: 0 });
  parseNumericInput(input.financials.sale_price_actual, "financials.sale_price_actual", { min: 0 });

  validateOptionalIsoDate(input.stage_updated_at, "stage_updated_at");
  validateOptionalIsoDate(input.discovered_date, "discovered_date");
  validateOptionalIsoDate(input.purchase_date, "purchase_date");
  validateOptionalIsoDate(input.listing_date, "listing_date");
  validateOptionalIsoDate(input.sale_date, "sale_date");
  validateOptionalIsoDate(input.completion_date, "completion_date");
  validateOptionalIsoDate(input.metadata.removal_deadline, "metadata.removal_deadline");

  const status: DealStatus = input.status ?? "sourced";
  if (!stageSequence.includes(status)) {
    throw new Error("status is invalid");
  }
  if (status === "completed") {
    if (!input.completion_date) {
      throw new Error("completion_date is required when status is completed");
    }
    const salePriceActual = parseNumericInput(
      input.financials.sale_price_actual,
      "financials.sale_price_actual",
      { required: true, min: 0 }
    );
    if (salePriceActual === null) {
      throw new Error("financials.sale_price_actual is required when status is completed");
    }
  }
};

const assertValidStageTransition = (currentStage: DealStatus, nextStage: DealStageInput): void => {
  const currentIndex = stageSequence.indexOf(currentStage);
  const nextIndex = stageSequence.indexOf(nextStage);

  if (currentIndex < 0 || nextIndex < 0) {
    throw new Error("Invalid stage transition");
  }
  if (currentIndex === nextIndex) {
    throw new Error(`Invalid stage transition: deal is already in ${currentStage}`);
  }
  if (nextIndex !== currentIndex + 1) {
    const allowed = stageSequence[currentIndex + 1];
    throw new Error(
      `Invalid stage transition: ${currentStage} -> ${nextStage}. Allowed next stage: ${allowed}`
    );
  }
};

const normalizeOptionalCount = (value?: number | null): number | null => {
  if (value === null || value === undefined) {
    return null;
  }
  const normalized = Math.max(0, Math.floor(Number(value)));
  return normalized > 0 ? normalized : null;
};
const normalizePrepMetricsInput = (value?: PrepMetrics | null): PrepMetrics | null => {
  if (!value) {
    return null;
  }
  return {
    total_units: Math.max(0, Math.floor(Number(value.total_units ?? 0))),
    working_units: Math.max(0, Math.floor(Number(value.working_units ?? 0))),
    cosmetic_units: Math.max(0, Math.floor(Number(value.cosmetic_units ?? 0))),
    functional_units: Math.max(0, Math.floor(Number(value.functional_units ?? 0))),
    defective_units: Math.max(0, Math.floor(Number(value.defective_units ?? 0))),
    locked_units: Math.max(0, Math.floor(Number(value.locked_units ?? 0))),
    total_prep_time_minutes: Math.max(0, Number(value.total_prep_time_minutes ?? 0)),
  };
};
const parseUnitBreakdown = (value: unknown): UnitBreakdown | null => {
  if (!value) {
    return null;
  }

  let parsedValue: unknown = value;
  if (typeof value === "string") {
    try {
      parsedValue = JSON.parse(value);
    } catch {
      return null;
    }
  }

  if (typeof parsedValue !== "object" || parsedValue === null) {
    return null;
  }

  const breakdown = parsedValue as Record<string, unknown>;
  const toNonNegativeInteger = (raw: unknown): number =>
    Math.max(0, Math.floor(Number(raw ?? 0)));

  return {
    units_total: toNonNegativeInteger(breakdown.units_total),
    units_working: toNonNegativeInteger(breakdown.units_working),
    units_minor_issue: toNonNegativeInteger(breakdown.units_minor_issue),
    units_defective: toNonNegativeInteger(breakdown.units_defective),
    units_locked: toNonNegativeInteger(breakdown.units_locked),
  };
};
const parsePrepMetrics = (value: unknown): PrepMetrics | null => {
  if (!value) {
    return null;
  }

  let parsedValue: unknown = value;
  if (typeof value === "string") {
    try {
      parsedValue = JSON.parse(value);
    } catch {
      return null;
    }
  }

  if (typeof parsedValue !== "object" || parsedValue === null) {
    return null;
  }

  const metrics = parsedValue as Record<string, unknown>;
  const toNonNegativeInteger = (raw: unknown): number =>
    Math.max(0, Math.floor(Number(raw ?? 0)));
  const toNonNegativeNumber = (raw: unknown): number =>
    Math.max(0, Number(raw ?? 0));

  return {
    total_units: toNonNegativeInteger(metrics.total_units),
    working_units: toNonNegativeInteger(metrics.working_units),
    cosmetic_units: toNonNegativeInteger(metrics.cosmetic_units),
    functional_units: toNonNegativeInteger(metrics.functional_units),
    defective_units: toNonNegativeInteger(metrics.defective_units),
    locked_units: toNonNegativeInteger(metrics.locked_units),
    total_prep_time_minutes: toNonNegativeNumber(metrics.total_prep_time_minutes),
  };
};

const mapDealRow = (row: Record<string, unknown>): DealRow => ({
  id: String(row.id),
  label: String(row.label),
  category: row.category as DealCategory,
  source_platform: row.source_platform as SourcePlatform,
  acquisition_state: String(row.acquisition_state),
  status: row.status as DealStatus,
  stage_updated_at: String(row.stage_updated_at),
  discovered_date: (row.discovered_date as string | null) ?? null,
  purchase_date: (row.purchase_date as string | null) ?? null,
  listing_date: (row.listing_date as string | null) ?? null,
  sale_date: (row.sale_date as string | null) ?? null,
  completion_date: (row.completion_date as string | null) ?? null,
  seller_type: (row.seller_type as DealRow["seller_type"]) ?? "unknown",
  unit_count: normalizeOptionalCount(row.unit_count as number | null | undefined),
  unit_breakdown: parseUnitBreakdown(row.unit_breakdown),
  prep_metrics: parsePrepMetrics(row.prep_metrics),
});

const mapFinancialRow = (row: Record<string, unknown>): FinancialRow => ({
  deal_id: String(row.deal_id),
  acquisition_cost: Number(row.acquisition_cost),
  buyer_premium_pct: Number(row.buyer_premium_pct),
  buyer_premium_overridden: Boolean(Number(row.buyer_premium_overridden ?? 0)),
  tax_rate: (row.tax_rate as number | null) ?? null,
  tax: (row.tax as number | null) ?? null,
  transport_cost_actual: (row.transport_cost_actual as number | null) ?? null,
  transport_cost_estimated: (row.transport_cost_estimated as number | null) ?? null,
  repair_cost: (row.repair_cost as number | null) ?? null,
  prep_cost: (row.prep_cost as number | null) ?? null,
  estimated_market_value: Number(row.estimated_market_value),
  sale_price_actual: (row.sale_price_actual as number | null) ?? null,
  projected_profit: Number(row.projected_profit),
  realized_profit:
    row.realized_profit === null || row.realized_profit === undefined
      ? null
      : Number(row.realized_profit),
});

const mapMetadataRow = (row: Record<string, unknown>): MetadataRow => ({
  deal_id: String(row.deal_id),
  condition_grade: row.condition_grade as MetadataRow["condition_grade"],
  condition_notes: String(row.condition_notes),
  transport_type: row.transport_type as MetadataRow["transport_type"],
  presentation_quality: row.presentation_quality as MetadataRow["presentation_quality"],
  seller_type: (row.seller_type as MetadataRow["seller_type"]) ?? "unknown",
  removal_deadline: (row.removal_deadline as string | null) ?? null,
  title_status: (row.title_status as TitleStatus) ?? "unknown",
});

const parseAiRecommendationSnapshot = (value: unknown): AiRecommendation => {
  const fallback: AiRecommendation = {
    suggested_action: "investigate",
    confidence: 0,
    reasoning: "Snapshot unavailable.",
    key_factors: [],
  };
  if (typeof value !== "string" || value.trim().length === 0) {
    return fallback;
  }
  try {
    const parsed = JSON.parse(value) as Partial<AiRecommendation>;
    const suggestedAction =
      parsed.suggested_action === "buy" ||
      parsed.suggested_action === "pass" ||
      parsed.suggested_action === "investigate"
        ? parsed.suggested_action
        : fallback.suggested_action;
    const confidence =
      typeof parsed.confidence === "number" && Number.isFinite(parsed.confidence)
        ? Math.max(0, Math.min(100, Math.round(parsed.confidence)))
        : fallback.confidence;
    const reasoning =
      typeof parsed.reasoning === "string" && parsed.reasoning.trim().length > 0
        ? parsed.reasoning
        : fallback.reasoning;
    const keyFactors = Array.isArray(parsed.key_factors)
      ? parsed.key_factors.filter((item): item is string => typeof item === "string")
      : fallback.key_factors;
    return {
      suggested_action: suggestedAction,
      confidence,
      reasoning,
      key_factors: keyFactors,
    };
  } catch {
    return fallback;
  }
};

export const listOperatorDecisionsByDealId = (dealId: string): OperatorDecisionRecord[] => {
  const rows = db
    .prepare(
      `SELECT id, deal_id, decision, reason, decided_at, ai_recommendation_snapshot
       FROM operator_decisions
       WHERE deal_id = ?
       ORDER BY datetime(decided_at) DESC`
    )
    .all(dealId) as Array<Record<string, unknown>>;
  return rows.map((row) => ({
    id: String(row.id),
    deal_id: String(row.deal_id),
    decision: row.decision === "approved" ? "approved" : "rejected",
    reason: String(row.reason ?? ""),
    decided_at: String(row.decided_at),
    ai_recommendation_snapshot: parseAiRecommendationSnapshot(row.ai_recommendation_snapshot),
  }));
};

const computeAndPersistFinancials = (dealId: string): void => {
  const joined = db
    .prepare(
      `SELECT
        d.id AS deal_id,
        d.label,
        d.category,
        d.source_platform,
        d.acquisition_state,
        d.status,
        d.stage_updated_at,
        d.discovered_date,
        d.purchase_date,
        d.listing_date,
        d.sale_date,
        d.completion_date,
        d.seller_type,
        d.unit_count,
        d.unit_breakdown,
        d.prep_metrics,
        f.acquisition_cost,
        f.buyer_premium_pct,
        f.buyer_premium_overridden,
        f.tax_rate,
        f.tax,
        f.transport_cost_actual,
        f.transport_cost_estimated,
        f.repair_cost,
        f.prep_cost,
        f.estimated_market_value,
        f.sale_price_actual,
        m.condition_grade,
        m.condition_notes,
        m.transport_type,
        m.presentation_quality,
        m.removal_deadline,
        m.title_status
       FROM deals d
       JOIN financials f ON f.deal_id = d.id
       JOIN metadata m ON m.deal_id = d.id
       WHERE d.id = ?`
    )
    .get(dealId) as Record<string, unknown> | undefined;

  if (!joined) {
    return;
  }

  const enriched = enrichDeal({
    deal: {
      id: String(joined.deal_id),
      label: String(joined.label),
      category: joined.category as DealCategory,
      source_platform: joined.source_platform as SourcePlatform,
      acquisition_state: String(joined.acquisition_state),
      status: joined.status as DealStatus,
      stage_updated_at: String(joined.stage_updated_at),
      discovered_date: (joined.discovered_date as string | null) ?? null,
      purchase_date: (joined.purchase_date as string | null) ?? null,
      listing_date: (joined.listing_date as string | null) ?? null,
      sale_date: (joined.sale_date as string | null) ?? null,
      completion_date: (joined.completion_date as string | null) ?? null,
      seller_type: (joined.seller_type as DealRow["seller_type"]) ?? "unknown",
      unit_count: normalizeOptionalCount(joined.unit_count as number | null | undefined),
      unit_breakdown: parseUnitBreakdown(joined.unit_breakdown),
      prep_metrics: parsePrepMetrics(joined.prep_metrics),
    },
    financials: {
      deal_id: String(joined.deal_id),
      acquisition_cost: Number(joined.acquisition_cost),
      buyer_premium_pct: Number(joined.buyer_premium_pct),
      buyer_premium_overridden: Boolean(Number(joined.buyer_premium_overridden ?? 0)),
      tax_rate: (joined.tax_rate as number | null) ?? null,
      tax: (joined.tax as number | null) ?? null,
      transport_cost_actual: (joined.transport_cost_actual as number | null) ?? null,
      transport_cost_estimated: (joined.transport_cost_estimated as number | null) ?? null,
      repair_cost: (joined.repair_cost as number | null) ?? null,
      prep_cost: (joined.prep_cost as number | null) ?? null,
      estimated_market_value: Number(joined.estimated_market_value),
      sale_price_actual: (joined.sale_price_actual as number | null) ?? null,
      projected_profit: 0,
      realized_profit: null,
    },
    metadata: {
      deal_id: String(joined.deal_id),
      condition_grade: joined.condition_grade as MetadataRow["condition_grade"],
      condition_notes: String(joined.condition_notes ?? ""),
      transport_type: joined.transport_type as MetadataRow["transport_type"],
      presentation_quality: String(joined.presentation_quality ?? "standard"),
      seller_type: (joined.seller_type as MetadataRow["seller_type"]) ?? "unknown",
      removal_deadline: (joined.removal_deadline as string | null) ?? null,
      title_status: (joined.title_status as TitleStatus) ?? "unknown",
    },
  });

  db.prepare(
    `UPDATE financials
     SET buyer_premium_pct = ?, buyer_premium_overridden = ?, tax_rate = ?, tax = ?,
         projected_profit = ?, realized_profit = ?
     WHERE deal_id = ?`
  ).run(
    enriched.financials.buyer_premium_pct,
    enriched.financials.buyer_premium_overridden ? 1 : 0,
    enriched.financials.tax_rate,
    enriched.financials.tax,
    enriched.financials.projected_profit,
    enriched.financials.realized_profit ?? null,
    dealId
  );
};

const buildEnrichedDealView = (
  deal: DealRow,
  financials: FinancialRow,
  metadata: MetadataRow
): DealView => {
  const operatorDecisionHistory = listOperatorDecisionsByDealId(deal.id);
  return enrichDeal({
    deal,
    financials,
    metadata,
    operator_decision_history: operatorDecisionHistory,
  });
};

interface PreparedDealRows {
  deal: DealRow;
  financials: FinancialRow;
  metadata: MetadataRow;
}

const buildPreparedDealRows = (input: CreateDealInput, id: string): PreparedDealRows => {
  validateCreateOrPreviewInput(input);

  const stageUpdatedAt = input.stage_updated_at ?? nowIso();
  const status: DealStatus = input.status ?? "sourced";
  const discoveredDate = normalizeNullableDate(input.discovered_date);
  const purchaseDate = normalizeNullableDate(input.purchase_date);
  const listingDate = normalizeNullableDate(input.listing_date);
  const saleDate = normalizeNullableDate(input.sale_date);
  const completionDate = normalizeNullableDate(input.completion_date);
  const normalizedUnitCount = normalizeOptionalCount(input.unit_count);
  const prepMetrics = normalizePrepMetricsInput(input.prep_metrics);
  // V3.3 unit rule: prep_metrics presence takes priority and unit_count is ignored.
  const resolvedUnitCount = input.prep_metrics ? null : normalizedUnitCount;
  const defaultTransportType = categoryProfiles[input.category].default_transport_type;
  const resolvedTransportType =
    input.metadata.transport_type ?? (defaultTransportType as MetadataRow["transport_type"]);
  const inferredSellerType: DealRow["seller_type"] =
    input.source_platform === "govdeals" || input.source_platform === "publicsurplus"
      ? "government"
      : "unknown";
  const sellerType: DealRow["seller_type"] =
    input.seller_type ?? input.metadata.seller_type ?? inferredSellerType;

  return {
    deal: {
      id,
      label: input.label,
      category: input.category,
      source_platform: input.source_platform,
      acquisition_state: input.acquisition_state.toUpperCase(),
      status,
      stage_updated_at: stageUpdatedAt,
      discovered_date: discoveredDate,
      purchase_date: purchaseDate,
      listing_date: listingDate,
      sale_date: saleDate,
      completion_date: completionDate,
      seller_type: sellerType,
      unit_count: resolvedUnitCount,
      unit_breakdown: input.unit_breakdown ?? null,
      prep_metrics: prepMetrics,
    },
    financials: {
      deal_id: id,
      acquisition_cost: input.financials.acquisition_cost,
      buyer_premium_pct: input.financials.buyer_premium_pct ?? 0,
      buyer_premium_overridden:
        Boolean(input.financials.buyer_premium_overridden) &&
        input.financials.buyer_premium_pct !== undefined,
      tax_rate: input.financials.tax_rate ?? null,
      tax: null,
      transport_cost_actual: input.financials.transport_cost_actual ?? null,
      transport_cost_estimated: input.financials.transport_cost_estimated ?? null,
      repair_cost: input.financials.repair_cost ?? null,
      prep_cost: input.financials.prep_cost ?? null,
      estimated_market_value: input.financials.estimated_market_value,
      sale_price_actual: input.financials.sale_price_actual ?? null,
      projected_profit: 0,
      realized_profit: null,
    },
    metadata: {
      deal_id: id,
      condition_grade: input.metadata.condition_grade,
      condition_notes: input.metadata.condition_notes,
      transport_type: resolvedTransportType,
      presentation_quality: input.metadata.presentation_quality,
      seller_type: sellerType,
      removal_deadline: normalizeNullableDate(input.metadata.removal_deadline),
      title_status: input.metadata.title_status ?? "unknown",
    },
  };
};

const getDealViewById = (dealId: string): DealView | null => {
  const joinedRows = db
    .prepare(
      `SELECT
        d.id,
        d.label,
        d.category,
        d.source_platform,
        d.acquisition_state,
        d.status,
        d.stage_updated_at,
        d.discovered_date,
        d.purchase_date,
        d.listing_date,
        d.sale_date,
        d.completion_date,
        d.seller_type,
        d.unit_count,
        d.unit_breakdown,
        d.prep_metrics,
        f.deal_id AS f_deal_id,
        f.acquisition_cost,
        f.buyer_premium_pct,
        f.buyer_premium_overridden,
        f.tax_rate,
        f.tax,
        f.transport_cost_actual,
        f.transport_cost_estimated,
        f.repair_cost,
        f.prep_cost,
        f.estimated_market_value,
        f.sale_price_actual,
        f.projected_profit,
        f.realized_profit,
        m.deal_id AS m_deal_id,
        m.condition_grade,
        m.condition_notes,
        m.transport_type,
        m.presentation_quality,
        m.removal_deadline,
        m.title_status
       FROM deals d
       JOIN financials f ON f.deal_id = d.id
       JOIN metadata m ON m.deal_id = d.id
       WHERE d.id = ?`
    )
    .get(dealId) as Record<string, unknown> | undefined;

  if (!joinedRows) {
    return null;
  }

  const deal = mapDealRow(joinedRows);
  const financials = mapFinancialRow({
    deal_id: joinedRows.f_deal_id,
    acquisition_cost: Number(joinedRows.acquisition_cost),
    buyer_premium_pct: joinedRows.buyer_premium_pct,
    buyer_premium_overridden: joinedRows.buyer_premium_overridden,
    tax_rate: joinedRows.tax_rate,
    tax: joinedRows.tax,
    transport_cost_actual: joinedRows.transport_cost_actual,
    transport_cost_estimated: joinedRows.transport_cost_estimated,
    repair_cost: joinedRows.repair_cost,
    prep_cost: joinedRows.prep_cost,
    estimated_market_value: joinedRows.estimated_market_value,
    sale_price_actual: joinedRows.sale_price_actual,
    projected_profit: joinedRows.projected_profit,
    realized_profit: joinedRows.realized_profit,
  });
  const metadata = mapMetadataRow({
    deal_id: joinedRows.m_deal_id,
    condition_grade: joinedRows.condition_grade,
    condition_notes: joinedRows.condition_notes,
    transport_type: joinedRows.transport_type,
    presentation_quality: joinedRows.presentation_quality,
    seller_type: joinedRows.seller_type,
    removal_deadline: joinedRows.removal_deadline,
    title_status: joinedRows.title_status,
  });
  return buildEnrichedDealView(deal, financials, metadata);
};

export const createDeal = (input: CreateDealInput): DealView => {
  const id = crypto.randomUUID();
  const prepared = buildPreparedDealRows(input, id);

  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO deals (
        id, label, category, source_platform, acquisition_state, status, stage_updated_at,
        discovered_date, purchase_date, listing_date, sale_date, completion_date, seller_type, unit_count,
        unit_breakdown, prep_metrics
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      prepared.deal.id,
      prepared.deal.label,
      prepared.deal.category,
      prepared.deal.source_platform,
      prepared.deal.acquisition_state,
      prepared.deal.status,
      prepared.deal.stage_updated_at,
      prepared.deal.discovered_date,
      prepared.deal.purchase_date,
      prepared.deal.listing_date,
      prepared.deal.sale_date,
      prepared.deal.completion_date,
      prepared.deal.seller_type,
      prepared.deal.unit_count,
      prepared.deal.unit_breakdown ? JSON.stringify(prepared.deal.unit_breakdown) : null,
      prepared.deal.prep_metrics ? JSON.stringify(prepared.deal.prep_metrics) : null
    );

    db.prepare(
      `INSERT INTO financials (
        deal_id, acquisition_cost, buyer_premium_pct, buyer_premium_overridden, tax_rate, tax,
        transport_cost_actual,
        transport_cost_estimated, repair_cost, prep_cost, estimated_market_value, sale_price_actual,
        projected_profit, realized_profit
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL)`
    ).run(
      prepared.financials.deal_id,
      prepared.financials.acquisition_cost,
      prepared.financials.buyer_premium_pct,
      prepared.financials.buyer_premium_overridden ? 1 : 0,
      prepared.financials.tax_rate,
      null,
      prepared.financials.transport_cost_actual,
      prepared.financials.transport_cost_estimated,
      prepared.financials.repair_cost,
      prepared.financials.prep_cost,
      prepared.financials.estimated_market_value,
      prepared.financials.sale_price_actual
    );

    db.prepare(
      `INSERT INTO metadata (
        deal_id, condition_grade, condition_notes, transport_type, presentation_quality,
        removal_deadline, title_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      prepared.metadata.deal_id,
      prepared.metadata.condition_grade,
      prepared.metadata.condition_notes,
      prepared.metadata.transport_type,
      prepared.metadata.presentation_quality,
      prepared.metadata.removal_deadline,
      prepared.metadata.title_status
    );
  });

  tx();
  computeAndPersistFinancials(id);

  const created = getDealViewById(id);
  if (!created) {
    throw new Error("Failed to create deal");
  }
  return created;
};

export const previewDeal = (input: CreateDealInput): DealView => {
  const id = `preview-${crypto.randomUUID()}`;
  const prepared = buildPreparedDealRows(input, id);
  return buildEnrichedDealView(prepared.deal, prepared.financials, prepared.metadata);
};

export const listDeals = (): DealView[] => {
  const dealIds = db
    .prepare(`SELECT id FROM deals ORDER BY datetime(stage_updated_at) DESC`)
    .all() as Array<{ id: string }>;

  return dealIds
    .map((row) => {
      computeAndPersistFinancials(row.id);
      return getDealViewById(row.id);
    })
    .filter((deal): deal is DealView => deal !== null);
};

const stageDateFieldMap: Record<
  DealStageInput,
  keyof Pick<
    DealRow,
    "discovered_date" | "purchase_date" | "listing_date" | "sale_date" | "completion_date"
  >
> = {
  sourced: "discovered_date",
  acquired: "purchase_date",
  prep: "purchase_date",
  listed: "listing_date",
  sold: "sale_date",
  completed: "completion_date",
};

export const updateDealStage = (
  dealId: string,
  nextStage: DealStageInput,
  completionInput?: CompleteDealInput
): DealView | null => {
  const existing = db
    .prepare(
      `SELECT d.id, d.status, d.completion_date, f.sale_price_actual
       FROM deals d
       JOIN financials f ON f.deal_id = d.id
       WHERE d.id = ?`
    )
    .get(dealId) as
    | {
        id: string;
        status: DealStatus;
        completion_date: string | null;
        sale_price_actual: number | null;
      }
    | undefined;

  if (!existing) {
    return null;
  }

  if (nextStage === "completed") {
    if (existing.status !== "sold") {
      throw new Error("Invalid stage transition: completed is only allowed from sold");
    }
  } else {
    assertValidStageTransition(existing.status, nextStage);
  }
  if (nextStage !== "completed" && completionInput) {
    throw new Error("completion_data is only allowed when transitioning to completed");
  }
  let nextCompletionDate: string | null = null;
  if (nextStage === "completed") {
    if (!completionInput) {
      throw new Error(
        "completion_data is required when transitioning to completed (sale_price_actual required)"
      );
    }
    const parsedSalePrice = parseNumericInput(
      completionInput.sale_price_actual,
      "financials.sale_price_actual",
      { required: true, min: 0 }
    );
    if (parsedSalePrice === null) {
      throw new Error("financials.sale_price_actual is required when transitioning to completed");
    }
    if (!completionInput.completion_date) {
      throw new Error("completion_data.completion_date is required when transitioning to completed");
    }
    validateOptionalIsoDate(completionInput.completion_date, "completion_date");
    nextCompletionDate = completionInput.completion_date;
  }

  const now = nowIso();
  const stageDateField = stageDateFieldMap[nextStage];

  db.transaction(() => {
    db.prepare(`UPDATE deals SET status = ?, stage_updated_at = ? WHERE id = ?`).run(
      nextStage,
      now,
      dealId
    );

    db.prepare(
      `UPDATE deals SET ${stageDateField} = COALESCE(${stageDateField}, ?) WHERE id = ?`
    ).run(now, dealId);

    if (nextStage === "completed" && completionInput) {
      db.prepare(`UPDATE financials SET sale_price_actual = ? WHERE deal_id = ?`).run(
        completionInput.sale_price_actual,
        dealId
      );
      db.prepare(`UPDATE deals SET completion_date = ? WHERE id = ?`).run(nextCompletionDate, dealId);
    }
  })();

  computeAndPersistFinancials(dealId);
  return getDealViewById(dealId);
};

export const getDashboard = (): DashboardView => {
  const deals = listDeals();
  const activeDeals = deals.filter((item) => item.deal.status !== "completed");
  const completedDeals = deals.filter((item) => item.deal.status === "completed");

  const realizedProfitTotal = completedDeals.reduce(
    (sum, item) => sum + (item.calculations.realized_profit ?? 0),
    0
  );
  const projectedProfitTotal = activeDeals.reduce(
    (sum, item) => sum + item.calculations.projected_profit,
    0
  );

  const agingAlerts = deals
    .filter((item) => item.calculations.stage_alert !== "OK")
    .map((item) => ({
      id: item.deal.id,
      label: item.deal.label,
      status: item.deal.status,
      days_in_stage: item.calculations.days_in_stage,
    }));

  const burnList = activeDeals
    .filter((item) => {
      const isVehicleCategory =
        item.deal.category === "vehicle_suv" ||
        item.deal.category === "vehicle_police_fleet" ||
        item.deal.category === "powersports";
      const isElectronicsCategory =
        item.deal.category === "electronics_bulk" || item.deal.category === "electronics_individual";
      if (isVehicleCategory) {
        return item.calculations.days_in_current_stage > 14;
      }
      if (isElectronicsCategory) {
        return item.calculations.days_in_current_stage > 7;
      }
      return false;
    })
    .map((item) => ({
      id: item.deal.id,
      label: item.deal.label,
      days_in_stage: item.calculations.days_in_current_stage,
      projected_profit: item.calculations.projected_profit,
      recommended_action: item.engine.recommended_action,
    }))
    .sort((a, b) => b.days_in_stage - a.days_in_stage);

  return {
    active_deals: activeDeals.length,
    completed_deals: completedDeals.length,
    realized_profit_total: realizedProfitTotal,
    projected_profit_total: projectedProfitTotal,
    burn_list: burnList,
    aging_alerts: agingAlerts,
  };
};

const getRiskScore = (deal: DealView): number => {
  const criticalAlerts = deal.alerts.filter((alert) => alert.severity === "critical").length;
  const warningAlerts = deal.alerts.filter((alert) => alert.severity === "warning").length;
  const negativeProjectedPenalty = deal.calculations.projected_profit < 0 ? 12 : 0;
  const confidencePenalty = Math.max(0, 100 - deal.calculations.data_confidence) / 4;
  const liquidationPenalty = deal.engine.liquidation.force_liquidation ? 20 : 0;
  return (
    criticalAlerts * 100 +
    warningAlerts * 25 +
    negativeProjectedPenalty +
    confidencePenalty +
    liquidationPenalty
  );
};

export const getOperatorDailySummary = (): OperatorDailySummary => {
  const deals = listDeals();
  const activeDeals = deals.filter((item) => item.deal.status !== "completed");
  const completedDeals = deals.filter((item) => item.deal.status === "completed");

  const projectedProfitTotal = activeDeals.reduce(
    (sum, item) => sum + item.calculations.projected_profit,
    0
  );
  const realizedProfitTotal = completedDeals.reduce(
    (sum, item) => sum + (item.calculations.realized_profit ?? 0),
    0
  );

  const criticalAlertCount = deals.reduce(
    (sum, item) => sum + item.alerts.filter((alert) => alert.severity === "critical").length,
    0
  );
  const dealsRequiringActionToday = activeDeals.filter((item) => {
    const action = item.engine.recommended_action;
    return item.alerts.length > 0 || (action !== null && action !== "pass");
  }).length;

  const topRiskDeals = [...deals]
    .sort((a, b) => getRiskScore(b) - getRiskScore(a))
    .slice(0, 5)
    .map((item) => ({
      id: item.deal.id,
      label: item.deal.label,
      status: item.deal.status,
      data_confidence: item.calculations.data_confidence,
      projected_profit: item.calculations.projected_profit,
      realized_profit: item.calculations.realized_profit,
      recommended_action: item.engine.recommended_action,
      alerts: item.alerts,
      operator_recommendation: item.operator_recommendation,
    }));

  const topProfitDriftDeals = completedDeals
    .filter(
      (item) =>
        item.engine.postmortem.variance_pct !== null && item.engine.postmortem.profit_delta !== null
    )
    .sort((a, b) => a.engine.postmortem.variance_pct! - b.engine.postmortem.variance_pct!)
    .slice(0, 5)
    .map((item) => ({
      id: item.deal.id,
      label: item.deal.label,
      variance_pct: item.engine.postmortem.variance_pct!,
      profit_delta: item.engine.postmortem.profit_delta!,
      drift_sources: item.engine.postmortem.drift_sources,
    }));

  return {
    active_deals_count: activeDeals.length,
    completed_deals_count: completedDeals.length,
    projected_profit_total: projectedProfitTotal,
    realized_profit_total: realizedProfitTotal,
    critical_alert_count: criticalAlertCount,
    deals_requiring_action_today: dealsRequiringActionToday,
    top_risk_deals: topRiskDeals,
    top_profit_drift_deals: topProfitDriftDeals,
  };
};

export const getDealStageAge = (dealId: string): number | null => {
  const row = db
    .prepare(`SELECT id FROM deals WHERE id = ?`)
    .get(dealId) as { id: string } | undefined;
  if (!row) {
    return null;
  }
  const deal = getDealViewById(dealId);
  if (!deal) {
    return null;
  }
  return deal.calculations.days_in_current_stage;
};

export const getDealById = (dealId: string): DealView | null => {
  const row = db
    .prepare(`SELECT id FROM deals WHERE id = ?`)
    .get(dealId) as { id: string } | undefined;
  if (!row) {
    return null;
  }
  computeAndPersistFinancials(dealId);
  return getDealViewById(dealId);
};

export const recordDealDecision = (
  dealId: string,
  rawInput: unknown
): { deal: DealView; stored_decision: OperatorDecisionRecord } => {
  const existingDeal = getDealById(dealId);
  if (!existingDeal) {
    throw new Error("Deal not found");
  }
  if (!rawInput || typeof rawInput !== "object") {
    throw new Error("Invalid decision payload");
  }

  const input = rawInput as Partial<DealDecisionInput>;
  const decision = ensureDecision(input.decision);
  const reason = ensureNonEmptyString(input.reason, "reason");
  const decidedAt = nowIso();
  const decisionId = crypto.randomUUID();
  const aiRecommendationSnapshot = existingDeal.ai_recommendation;

  db.prepare(
    `INSERT INTO operator_decisions (
      id, deal_id, decision, reason, decided_at, ai_recommendation_snapshot
    ) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    decisionId,
    dealId,
    decision,
    reason,
    decidedAt,
    JSON.stringify(aiRecommendationSnapshot)
  );

  const updatedDeal = getDealById(dealId);
  if (!updatedDeal) {
    throw new Error("Deal not found");
  }

  return {
    deal: updatedDeal,
    stored_decision: {
      id: decisionId,
      deal_id: dealId,
      decision,
      reason,
      decided_at: decidedAt,
      ai_recommendation_snapshot: aiRecommendationSnapshot,
    },
  };
};
