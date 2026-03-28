import { LIQUIDATION_RULES } from "../../config/liquidationConfig";
import type { DealCategory } from "../../models/dealV32";

export interface LiquidationResult {
  warning: boolean;
  trigger: boolean;
  force_liquidation: boolean;
  recommended_action: string | null;
}

export const computeLiquidation = (
  category: DealCategory,
  daysInCurrentStage: number
): LiquidationResult => {
  const rule = LIQUIDATION_RULES[category];
  if (!rule) {
    return {
      warning: false,
      trigger: false,
      force_liquidation: false,
      recommended_action: null,
    };
  }

  const warning = daysInCurrentStage >= rule.warning_days;
  const trigger = daysInCurrentStage >= rule.trigger_days;

  return {
    warning,
    trigger,
    force_liquidation: trigger,
    recommended_action: trigger ? "FORCE_LIQUIDATION" : warning ? rule.recommended_action : null,
  };
};

