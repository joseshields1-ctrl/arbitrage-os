import { DealCategory, TransportType } from "../models/deal";

export interface CategoryProfile {
  label: string;
  avg_roi: number;
  avg_days_to_sell: number;
  avg_margin_pct: number;
  default_transport_type: TransportType;
  channel_fit: string[];
  risk: "low" | "medium" | "high";
}

export const categoryProfiles: Record<DealCategory, CategoryProfile> = {
  vehicle_suv: {
    label: "Vehicle - SUV",
    avg_roi: 18,
    avg_days_to_sell: 35,
    avg_margin_pct: 15,
    default_transport_type: "auto_transport",
    channel_fit: ["retail_lot", "marketplace", "auction_relist"],
    risk: "medium",
  },
  vehicle_police_fleet: {
    label: "Vehicle - Police Fleet",
    avg_roi: 22,
    avg_days_to_sell: 42,
    avg_margin_pct: 17,
    default_transport_type: "auto_transport",
    channel_fit: ["auction_relist", "fleet_buyer", "retail_lot"],
    risk: "high",
  },
  powersports: {
    label: "Powersports",
    avg_roi: 20,
    avg_days_to_sell: 28,
    avg_margin_pct: 16,
    default_transport_type: "freight",
    channel_fit: ["marketplace", "dealer_network"],
    risk: "medium",
  },
  electronics_bulk: {
    label: "Electronics - Bulk",
    avg_roi: 25,
    avg_days_to_sell: 21,
    avg_margin_pct: 19,
    default_transport_type: "freight",
    channel_fit: ["wholesale", "liquidation", "marketplace"],
    risk: "high",
  },
  electronics_individual: {
    label: "Electronics - Individual",
    avg_roi: 30,
    avg_days_to_sell: 14,
    avg_margin_pct: 22,
    default_transport_type: "parcel",
    channel_fit: ["marketplace", "direct_to_consumer"],
    risk: "medium",
  },
};
