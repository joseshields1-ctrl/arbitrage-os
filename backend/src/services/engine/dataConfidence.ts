import type { ConditionGrade } from "../../models/dealV32";

export interface DataConfidenceInput {
  estimated_inputs: string[];
  repair_cost: number | null;
  condition_grade: ConditionGrade;
  condition_notes: string;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const roundScore = (value: number): number =>
  Math.round((value + Number.EPSILON) * 100) / 100;

export const computeDataConfidence = (input: DataConfidenceInput): number => {
  let score = 100;
  const estimatedInputs = new Set(input.estimated_inputs);

  if (estimatedInputs.has("transport_cost_estimated")) {
    score -= 20;
  }
  if (estimatedInputs.has("tax_rate") || estimatedInputs.has("tax_estimated")) {
    score -= 25;
  }
  if (input.repair_cost === null || input.repair_cost === undefined) {
    score -= 15;
  }

  const notes = input.condition_notes.trim().toLowerCase();
  const genericNotes = notes === "" || notes === "n/a" || notes === "na" || notes === "unknown";
  const lowClarityCondition =
    input.condition_grade === "used" ||
    input.condition_grade === "used_cosmetic" ||
    input.condition_grade === "used_functional";
  if (genericNotes || lowClarityCondition) {
    score -= 15;
  }

  return roundScore(clamp(score, 0, 100));
};
