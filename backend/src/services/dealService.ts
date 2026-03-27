import {
  DealCategory,
  DealRow,
  DealStatus,
  DealStageInput,
  FinancialInput,
  FinancialRow,
  MetadataInput,
  MetadataRow,
  SourcePlatform,
  UnitBreakdown,
} from "../models/dealV32";
import { db } from "../db/sqlite";
import {
  calculateDealMetrics,
  calculateDaysInStage,
  hasTransportCategoryMismatch,
  isAgingAlert,
} from "./dealCalculations";
import { categoryProfiles } from "../config/categoryProfiles";

export interface CreateDealInput {
  label: string;
  category: DealCategory;
  source_platform: SourcePlatform;
  acquisition_state: string;
  status?: DealStatus;
  stage_updated_at?: string;
  discovered_date?: string | null;
  purchase_date?: string | null;
  listing_date?: string | null;
  sale_date?: string | null;
  completion_date?: string | null;
  unit_breakdown?: UnitBreakdown | null;
  financials: FinancialInput;
  metadata: MetadataInput;
}

export interface DealView {
  deal: DealRow;
  financials: FinancialRow;
  metadata: MetadataRow;
  warnings: string[];
  calculations: {
    total_cost_basis: number;
    projected_profit: number;
    realized_profit: number;
    days_in_stage: number;
  };
}

export interface DashboardView {
  active_deals: number;
  completed_deals: number;
  realized_profit_total: number;
  projected_profit_total: number;
  aging_alerts: Array<{
    id: string;
    label: string;
    status: DealStatus;
    days_in_stage: number;
  }>;
}

const nowIso = (): string => new Date().toISOString();
const normalizeNullableDate = (value?: string | null): string | null => value ?? null;
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
const getDealWarnings = (deal: DealRow, metadata: MetadataRow): string[] => {
  const warnings: string[] = [];
  if (hasTransportCategoryMismatch(deal.category, metadata.transport_type)) {
    warnings.push(
      "Potential transport mismatch: electronics_bulk usually fits local_pickup or freight."
    );
  }
  return warnings;
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
  unit_breakdown: parseUnitBreakdown(row.unit_breakdown),
});

const mapFinancialRow = (row: Record<string, unknown>): FinancialRow => ({
  deal_id: String(row.deal_id),
  acquisition_cost: Number(row.acquisition_cost),
  buyer_premium_pct: Number(row.buyer_premium_pct),
  transport_cost_actual: (row.transport_cost_actual as number | null) ?? null,
  transport_cost_estimated: (row.transport_cost_estimated as number | null) ?? null,
  repair_cost: (row.repair_cost as number | null) ?? null,
  prep_cost: (row.prep_cost as number | null) ?? null,
  estimated_market_value: Number(row.estimated_market_value),
  projected_profit: Number(row.projected_profit),
  realized_profit: Number(row.realized_profit),
});

const mapMetadataRow = (row: Record<string, unknown>): MetadataRow => ({
  deal_id: String(row.deal_id),
  condition_grade: row.condition_grade as MetadataRow["condition_grade"],
  condition_notes: String(row.condition_notes),
  transport_type: row.transport_type as MetadataRow["transport_type"],
  presentation_quality: row.presentation_quality as MetadataRow["presentation_quality"],
});

const computeAndPersistFinancials = (dealId: string): void => {
  const joined = db
    .prepare(
      `SELECT
        d.id AS deal_id,
        d.status,
        d.stage_updated_at,
        f.acquisition_cost,
        f.buyer_premium_pct,
        f.transport_cost_actual,
        f.transport_cost_estimated,
        f.repair_cost,
        f.prep_cost,
        f.estimated_market_value,
        m.transport_type
       FROM deals d
       JOIN financials f ON f.deal_id = d.id
       JOIN metadata m ON m.deal_id = d.id
       WHERE d.id = ?`
    )
    .get(dealId) as Record<string, unknown> | undefined;

  if (!joined) {
    return;
  }

  const metrics = calculateDealMetrics({
    status: joined.status as DealStatus,
    stage_updated_at: String(joined.stage_updated_at),
    acquisition_cost: Number(joined.acquisition_cost),
    buyer_premium_pct: Number(joined.buyer_premium_pct),
    category: joined.category as DealCategory,
    transport_type: joined.transport_type as MetadataRow["transport_type"],
    transport_cost_actual: (joined.transport_cost_actual as number | null) ?? null,
    transport_cost_estimated: (joined.transport_cost_estimated as number | null) ?? null,
    repair_cost: (joined.repair_cost as number | null) ?? null,
    prep_cost: (joined.prep_cost as number | null) ?? null,
    estimated_market_value: Number(joined.estimated_market_value),
  });

  db.prepare(
    `UPDATE financials
     SET projected_profit = ?, realized_profit = ?
     WHERE deal_id = ?`
  ).run(metrics.projected_profit, metrics.realized_profit, dealId);
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
        d.unit_breakdown,
        f.deal_id AS f_deal_id,
        f.acquisition_cost,
        f.buyer_premium_pct,
        f.transport_cost_actual,
        f.transport_cost_estimated,
        f.repair_cost,
        f.prep_cost,
        f.estimated_market_value,
        f.projected_profit,
        f.realized_profit,
        m.deal_id AS m_deal_id,
        m.condition_grade,
        m.condition_notes,
        m.transport_type,
        m.presentation_quality
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
    acquisition_cost: joinedRows.acquisition_cost,
    buyer_premium_pct: joinedRows.buyer_premium_pct,
    transport_cost_actual: joinedRows.transport_cost_actual,
    transport_cost_estimated: joinedRows.transport_cost_estimated,
    repair_cost: joinedRows.repair_cost,
    prep_cost: joinedRows.prep_cost,
    estimated_market_value: joinedRows.estimated_market_value,
    projected_profit: joinedRows.projected_profit,
    realized_profit: joinedRows.realized_profit,
  });
  const metadata = mapMetadataRow({
    deal_id: joinedRows.m_deal_id,
    condition_grade: joinedRows.condition_grade,
    condition_notes: joinedRows.condition_notes,
    transport_type: joinedRows.transport_type,
    presentation_quality: joinedRows.presentation_quality,
  });

  const recalculated = calculateDealMetrics({
    status: deal.status,
    stage_updated_at: deal.stage_updated_at,
    acquisition_cost: financials.acquisition_cost,
    buyer_premium_pct: financials.buyer_premium_pct,
    category: deal.category,
    transport_type: metadata.transport_type,
    transport_cost_actual: financials.transport_cost_actual,
    transport_cost_estimated: financials.transport_cost_estimated,
    repair_cost: financials.repair_cost,
    prep_cost: financials.prep_cost,
    estimated_market_value: financials.estimated_market_value,
  });
  const warnings = getDealWarnings(deal, metadata);

  return {
    deal,
    financials: {
      ...financials,
      projected_profit: recalculated.projected_profit,
      realized_profit: recalculated.realized_profit,
    },
    metadata,
    warnings,
    calculations: {
      total_cost_basis: recalculated.total_cost_basis,
      projected_profit: recalculated.projected_profit,
      realized_profit: recalculated.realized_profit,
      days_in_stage: recalculated.days_in_stage,
    },
  };
};

export const createDeal = (input: CreateDealInput): DealView => {
  const id = crypto.randomUUID();
  const stageUpdatedAt = input.stage_updated_at ?? nowIso();
  const status: DealStatus = input.status ?? "sourced";
  const discoveredDate = normalizeNullableDate(input.discovered_date);
  const purchaseDate = normalizeNullableDate(input.purchase_date);
  const listingDate = normalizeNullableDate(input.listing_date);
  const saleDate = normalizeNullableDate(input.sale_date);
  const completionDate = normalizeNullableDate(input.completion_date);
  const defaultTransportType = categoryProfiles[input.category].default_transport_type;
  const resolvedTransportType =
    input.metadata.transport_type ?? (defaultTransportType as MetadataRow["transport_type"]);

  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO deals (
        id, label, category, source_platform, acquisition_state, status, stage_updated_at,
        discovered_date, purchase_date, listing_date, sale_date, completion_date, unit_breakdown
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      input.label,
      input.category,
      input.source_platform,
      input.acquisition_state.toUpperCase(),
      status,
      stageUpdatedAt,
      discoveredDate,
      purchaseDate,
      listingDate,
      saleDate,
      completionDate,
      input.unit_breakdown ? JSON.stringify(input.unit_breakdown) : null
    );

    db.prepare(
      `INSERT INTO financials (
        deal_id, acquisition_cost, buyer_premium_pct, transport_cost_actual,
        transport_cost_estimated, repair_cost, prep_cost, estimated_market_value,
        projected_profit, realized_profit
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0)`
    ).run(
      id,
      input.financials.acquisition_cost,
      input.financials.buyer_premium_pct ?? 0,
      input.financials.transport_cost_actual ?? null,
      input.financials.transport_cost_estimated ?? null,
      input.financials.repair_cost ?? null,
      input.financials.prep_cost ?? null,
      input.financials.estimated_market_value
    );

    db.prepare(
      `INSERT INTO metadata (
        deal_id, condition_grade, condition_notes, transport_type, presentation_quality
      ) VALUES (?, ?, ?, ?, ?)`
    ).run(
      id,
      input.metadata.condition_grade,
      input.metadata.condition_notes,
      resolvedTransportType,
      input.metadata.presentation_quality
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
  nextStage: DealStageInput
): DealView | null => {
  const existing = db.prepare(`SELECT id FROM deals WHERE id = ?`).get(dealId) as
    | { id: string }
    | undefined;

  if (!existing) {
    return null;
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
  })();

  computeAndPersistFinancials(dealId);
  return getDealViewById(dealId);
};

export const getDashboard = (): DashboardView => {
  const deals = listDeals();
  const activeDeals = deals.filter((item) => item.deal.status !== "completed");
  const completedDeals = deals.filter((item) => item.deal.status === "completed");

  const realizedProfitTotal = completedDeals.reduce(
    (sum, item) => sum + item.calculations.realized_profit,
    0
  );
  const projectedProfitTotal = activeDeals.reduce(
    (sum, item) => sum + item.calculations.projected_profit,
    0
  );

  const agingAlerts = deals
    .filter((item) => isAgingAlert(item.calculations.days_in_stage, item.deal.status))
    .map((item) => ({
      id: item.deal.id,
      label: item.deal.label,
      status: item.deal.status,
      days_in_stage: item.calculations.days_in_stage,
    }));

  return {
    active_deals: activeDeals.length,
    completed_deals: completedDeals.length,
    realized_profit_total: realizedProfitTotal,
    projected_profit_total: projectedProfitTotal,
    aging_alerts: agingAlerts,
  };
};

export const getDealStageAge = (dealId: string): number | null => {
  const row = db
    .prepare(`SELECT stage_updated_at FROM deals WHERE id = ?`)
    .get(dealId) as { stage_updated_at: string } | undefined;
  if (!row) {
    return null;
  }
  return calculateDaysInStage(row.stage_updated_at);
};
