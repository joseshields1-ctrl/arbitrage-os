import { LIQUIDATION_RULES } from "../../config/liquidationConfig";
import type { DealCategory } from "../../models/dealV32";

export interface LiquidationResult {
  warning: boolean;
  trigger: boolean;
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
      recommended_action: null,
    };
  }

  const warning = daysInCurrentStage >= rule.warning_days;
  const trigger = daysInCurrentStage >= rule.trigger_days;

  return {
    warning,
    trigger,
    recommended_action: warning ? rule.recommended_action : null,
  };
};

