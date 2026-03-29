import { Router } from "express";
import { enrichDeal } from "../services/engine/enrichDeal";
import type { DealRow, FinancialRow, MetadataRow } from "../models/dealV32";

const testEngineValidationRouter = Router();

const daysAgoIso = (days: number): string =>
  new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

interface ValidationScenario {
  name: string;
  context: {
    description: string;
    mileage?: number;
  };
  deal: DealRow;
  financials: FinancialRow;
  metadata: MetadataRow;
}

const scenarios: ValidationScenario[] = [
  {
    name: "A) Police Fleet Vehicle - 2018 Tahoe PPV",
    context: {
      description:
        "Auction police fleet SUV with moderate reconditioning and estimated transport.",
      mileage: 118420,
    },
    deal: {
      id: "validation-police-fleet-tahoe",
      label: "2018 Tahoe PPV Fleet Unit",
      category: "vehicle_police_fleet",
      source_platform: "govdeals",
      acquisition_state: "TX",
      status: "acquired",
      stage_updated_at: daysAgoIso(12),
      discovered_date: daysAgoIso(20),
      purchase_date: daysAgoIso(12),
      listing_date: null,
      sale_date: null,
      completion_date: null,
      unit_count: null,
      unit_breakdown: null,
      prep_metrics: null,
    },
    financials: {
      deal_id: "validation-police-fleet-tahoe",
      acquisition_cost: 18500,
      buyer_premium_pct: 0,
      buyer_premium_overridden: false,
      tax_rate: 0.0825,
      tax: null,
      transport_cost_actual: null,
      transport_cost_estimated: 700,
      repair_cost: 2200,
      prep_cost: 450,
      estimated_market_value: 26500,
      sale_price_actual: null,
      projected_profit: 0,
      realized_profit: null,
    },
    metadata: {
      deal_id: "validation-police-fleet-tahoe",
      condition_grade: "used_functional",
      condition_notes:
        "Fleet service history present. Idle hours elevated. Interior wear and push-bar removal needed.",
      transport_type: "auto_transport",
      presentation_quality: "standard",
    },
  },
  {
    name: "B) Retail Vehicle - Clean Title SUV",
    context: {
      description:
        "Lower-risk retail SUV, local pickup, cleaner condition, completed with settled sale.",
      mileage: 74200,
    },
    deal: {
      id: "validation-retail-vehicle-clean-title",
      label: "2019 Retail SUV Clean Title",
      category: "vehicle_suv",
      source_platform: "facebook",
      acquisition_state: "FL",
      status: "completed",
      stage_updated_at: daysAgoIso(2),
      discovered_date: daysAgoIso(24),
      purchase_date: daysAgoIso(18),
      listing_date: daysAgoIso(9),
      sale_date: daysAgoIso(2),
      completion_date: daysAgoIso(2),
      unit_count: null,
      unit_breakdown: null,
      prep_metrics: null,
    },
    financials: {
      deal_id: "validation-retail-vehicle-clean-title",
      acquisition_cost: 14200,
      buyer_premium_pct: 0,
      buyer_premium_overridden: false,
      tax_rate: 0.0625,
      tax: null,
      transport_cost_actual: 0,
      transport_cost_estimated: null,
      repair_cost: 400,
      prep_cost: 350,
      estimated_market_value: 19800,
      sale_price_actual: 20150,
      projected_profit: 0,
      realized_profit: null,
    },
    metadata: {
      deal_id: "validation-retail-vehicle-clean-title",
      condition_grade: "used_good",
      condition_notes:
        "Clean title, no warning lights, minor bumper scuffs, full interior detail completed.",
      transport_type: "local_pickup",
      presentation_quality: "high",
    },
  },
  {
    name: "C) Bulk Electronics Lot - Mixed iPads",
    context: {
      description:
        "Bulk iPad lot with mixed quality, high locked ratio, and prolonged stage age.",
    },
    deal: {
      id: "validation-bulk-electronics-ipads",
      label: "53x iPad Mixed Grade Lot",
      category: "electronics_bulk",
      source_platform: "ebay",
      acquisition_state: "CA",
      status: "sourced",
      stage_updated_at: daysAgoIso(45),
      discovered_date: daysAgoIso(45),
      purchase_date: null,
      listing_date: null,
      sale_date: null,
      completion_date: null,
      unit_count: 53,
      unit_breakdown: {
        units_total: 53,
        units_working: 38,
        units_minor_issue: 10,
        units_defective: 5,
        units_locked: 14,
      },
      prep_metrics: {
        total_units: 53,
        working_units: 38,
        cosmetic_units: 10,
        functional_units: 30,
        defective_units: 5,
        locked_units: 14,
        total_prep_time_minutes: 530,
      },
    },
    financials: {
      deal_id: "validation-bulk-electronics-ipads",
      acquisition_cost: 24000,
      buyer_premium_pct: 0,
      buyer_premium_overridden: false,
      tax_rate: null,
      tax: null,
      transport_cost_actual: 980,
      transport_cost_estimated: null,
      repair_cost: null,
      prep_cost: 1600,
      estimated_market_value: 35500,
      sale_price_actual: null,
      projected_profit: 0,
      realized_profit: null,
    },
    metadata: {
      deal_id: "validation-bulk-electronics-ipads",
      condition_grade: "used_cosmetic",
      condition_notes:
        "Mixed lot with cosmetic wear and MDM/lock risk. Functional variance across batch.",
      transport_type: "freight",
      presentation_quality: "standard",
    },
  },
];

testEngineValidationRouter.get("/", (_req, res) => {
  const results = scenarios.map((scenario) => {
    const enriched = enrichDeal({
      deal: scenario.deal,
      financials: scenario.financials,
      metadata: scenario.metadata,
    });

    return {
      scenario: scenario.name,
      input: {
        context: scenario.context,
        deal: scenario.deal,
        financials: scenario.financials,
        metadata: scenario.metadata,
      },
      output: {
        enriched,
        validation_summary: {
          total_cost_basis: enriched.calculations.total_cost_basis,
          cost_basis_breakdown: enriched.engine.cost_basis.cost_basis_breakdown,
          estimated_inputs: enriched.engine.cost_basis.estimated_inputs,
          projected_profit: enriched.calculations.projected_profit,
          realized_profit: enriched.calculations.realized_profit,
          acquisition_score: enriched.engine.scoring.acquisition_score,
          exit_score: enriched.engine.scoring.exit_score,
          classification: enriched.engine.scoring.classification,
          data_confidence: enriched.calculations.data_confidence,
          days_in_current_stage: enriched.calculations.days_in_current_stage,
          stage_alert: enriched.calculations.stage_alert,
          force_liquidation: enriched.engine.liquidation.force_liquidation,
          recommended_action: enriched.engine.recommended_action,
          warning_flags: enriched.warnings,
        },
      },
    };
  });

  res.json({
    generated_at: new Date().toISOString(),
    scenarios: results,
  });
});

export default testEngineValidationRouter;
