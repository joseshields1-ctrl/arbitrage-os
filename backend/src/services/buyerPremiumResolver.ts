import {
  PlatformBuyerPremiumConfig,
  SourcePlatform,
  buyerPremiumConfig,
} from "../config/buyerPremiumConfig";

export interface BuyerPremiumResolution {
  buyer_premium_pct: number;
  buyer_premium_overridden: boolean;
}

const resolveFromConfig = (
  config: PlatformBuyerPremiumConfig | undefined,
  acquisitionState?: string
): number => {
  if (!config) {
    return 0;
  }

  if (acquisitionState) {
    const stateKey = acquisitionState.trim().toUpperCase();
    const stateSpecific = config.by_state[stateKey];
    if (typeof stateSpecific === "number") {
      return stateSpecific;
    }
  }

  if (typeof config.default_pct === "number") {
    return config.default_pct;
  }

  return 0;
};

export const resolveBuyerPremium = (
  sourcePlatform: SourcePlatform,
  acquisitionState: string,
  manualOverride?: number
): BuyerPremiumResolution => {
  if (typeof manualOverride === "number") {
    return {
      // buyer_premium_pct is a whole percent number (10 = 10%).
      buyer_premium_pct: manualOverride,
      buyer_premium_overridden: true,
    };
  }

  const config = buyerPremiumConfig[sourcePlatform];
  const resolved = resolveFromConfig(config, acquisitionState);

  return {
    // buyer_premium_pct is a whole percent number (10 = 10%).
    buyer_premium_pct: resolved,
    buyer_premium_overridden: false,
  };
};
