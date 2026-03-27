export type SourcePlatform =
  | "govdeals"
  | "publicsurplus"
  | "ebay"
  | "facebook"
  | "other";

export interface PlatformBuyerPremiumConfig {
  // Whole percent values (10 = 10%, 12.5 = 12.5%)
  default_pct: number;
  by_state: Record<string, number>;
}

export type BuyerPremiumConfig = Record<SourcePlatform, PlatformBuyerPremiumConfig>;

export const buyerPremiumConfig: BuyerPremiumConfig = {
  govdeals: {
    default_pct: 12.5,
    by_state: {
      TX: 10,
      CA: 12,
      FL: 12.5,
      NY: 13,
    },
  },
  publicsurplus: {
    default_pct: 10,
    by_state: {
      TX: 9,
      CA: 10,
      WA: 10,
      AZ: 9.5,
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
