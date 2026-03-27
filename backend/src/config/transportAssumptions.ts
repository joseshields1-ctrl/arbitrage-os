import { TransportType } from "../models/deal";

export interface TransportAssumption {
  rate_structure: "per_mile" | "per_pound" | "flat_per_item";
  min_flat: number;
  notes: string;
}

type SupportedTransportAssumption = Extract<
  TransportType,
  "auto_transport" | "freight" | "parcel"
>;

export const transportAssumptions: Record<
  SupportedTransportAssumption,
  TransportAssumption
> = {
  auto_transport: {
    rate_structure: "per_mile",
    min_flat: 300,
    notes: "Use for drivable vehicles and powersports moved by carrier.",
  },
  freight: {
    rate_structure: "per_pound",
    min_flat: 175,
    notes: "Use for palletized or LTL shipments; rates vary by zone/class.",
  },
  parcel: {
    rate_structure: "flat_per_item",
    min_flat: 12,
    notes: "Use for boxed small items; carrier surcharges may apply.",
  },
};
