export type SourcePlatform =
  | "govdeals"
  | "publicsurplus"
  | "ebay"
  | "facebook"
  | "other";

export interface PlatformBuyerPremiumConfig {
  // Decimal values (0.10 = 10%, 0.125 = 12.5%).
  default_pct: number;
  by_state: Record<string, number>;
}

export type BuyerPremiumConfig = Record<SourcePlatform, PlatformBuyerPremiumConfig>;

export const buyerPremiumConfig: BuyerPremiumConfig = {
  govdeals: {
    default_pct: 0.125,
    by_state: {
      TX: 0.1,
      CA: 0.12,
      FL: 0.125,
      NY: 0.13,
    },
  },
  publicsurplus: {
    default_pct: 0.1,
    by_state: {
      TX: 0.09,
      CA: 0.1,
      WA: 0.1,
      AZ: 0.095,
    },
  },
  ebay: {
    default_pct: 0,
    by_state: {},
  },
  facebook: {
    default_pct: 0,
    by_state: {},
  },
  other: {
    default_pct: 0,
    by_state: {},
  },
};
