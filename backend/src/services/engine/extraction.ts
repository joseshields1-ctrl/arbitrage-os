import type { ConditionGrade, DealCategory, UnitBreakdown } from "../../models/dealV32";

export interface ExtractionInput {
  raw_text: string;
}

export interface ExtractionResult {
  unit_breakdown: Partial<UnitBreakdown> | null;
  condition_grade: ConditionGrade | null;
  category: DealCategory | null;
  units_locked_increment: number;
  defective_units_increment: number;
  data_confidence_delta: number;
  ambiguity_flags: string[];
  provider: "gemini" | "openai" | "heuristic";
}

interface LlmExtractionPayload {
  unit_breakdown?: Partial<UnitBreakdown> | null;
  condition_grade?: ConditionGrade | null;
  category?: DealCategory | null;
  ambiguity?: boolean;
  notes?: string[];
}

const CONDITION_KEYWORDS: Array<{ token: string; grade: ConditionGrade }> = [
  { token: "parts only", grade: "parts_only" },
  { token: "for parts", grade: "parts_only" },
  { token: "defective", grade: "defective" },
  { token: "non runner", grade: "defective" },
  { token: "non-running", grade: "defective" },
  { token: "excellent", grade: "excellent" },
  { token: "used good", grade: "used_good" },
  { token: "used functional", grade: "used_functional" },
  { token: "used cosmetic", grade: "used_cosmetic" },
];

const CATEGORY_KEYWORDS: Array<{ token: string; category: DealCategory }> = [
  { token: "police suv", category: "vehicle_police_fleet" },
  { token: "interceptor", category: "vehicle_police_fleet" },
  { token: "suv", category: "vehicle_suv" },
  { token: "motorcycle", category: "powersports" },
  { token: "atv", category: "powersports" },
  { token: "utv", category: "powersports" },
  { token: "laptop lot", category: "electronics_bulk" },
  { token: "tablet lot", category: "electronics_bulk" },
  { token: "bulk electronics", category: "electronics_bulk" },
  { token: "iphone", category: "electronics_individual" },
  { token: "ipad", category: "electronics_individual" },
  { token: "macbook", category: "electronics_individual" },
];

const LOCKED_KEYWORDS = ["activation locked", "icloud", "mdm locked", "frp lock"];
const DEFECTIVE_KEYWORDS = ["parts only", "cracked", "broken", "no power", "as-is"];

const parseInteger = (value: unknown): number | null => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return Math.max(0, Math.floor(parsed));
};

const getOpenAiExtraction = async (rawText: string): Promise<LlmExtractionPayload | null> => {
  if (!process.env.OPENAI_API_KEY) {
    return null;
  }
  try {
    const openaiModule = await import("openai");
    const OpenAI = openaiModule.default;
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      input: [
        {
          role: "system",
          content: [
            "Extract structured fields from a GovDeals listing description.",
            "Return ONLY JSON with keys: unit_breakdown, condition_grade, category, ambiguity, notes.",
            "unit_breakdown may include: units_total, units_working, units_minor_issue, units_defective, units_locked.",
            "category must be one of: vehicle_suv, vehicle_police_fleet, powersports, electronics_bulk, electronics_individual.",
            "condition_grade must be one of: excellent, used_good, used, used_cosmetic, used_functional, defective, parts_only.",
          ].join(" "),
        },
        {
          role: "user",
          content: rawText,
        },
      ],
    });
    const output = response.output_text?.trim();
    if (!output) {
      return null;
    }
    return JSON.parse(output) as LlmExtractionPayload;
  } catch {
    return null;
  }
};

const getGeminiExtraction = async (rawText: string): Promise<LlmExtractionPayload | null> => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }
  try {
    const prompt = [
      "Extract structured fields from this GovDeals description.",
      "Return strict JSON only with keys: unit_breakdown, condition_grade, category, ambiguity, notes.",
      "Valid category values: vehicle_suv, vehicle_police_fleet, powersports, electronics_bulk, electronics_individual.",
      "Valid condition_grade values: excellent, used_good, used, used_cosmetic, used_functional, defective, parts_only.",
      "unit_breakdown keys: units_total, units_working, units_minor_issue, units_defective, units_locked.",
      "",
      rawText,
    ].join("\n");
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(
        apiKey
      )}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1 },
        }),
      }
    );
    if (!response.ok) {
      return null;
    }
    const body = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = body.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!text) {
      return null;
    }
    return JSON.parse(text) as LlmExtractionPayload;
  } catch {
    return null;
  }
};

const getHeuristicExtraction = (rawText: string): LlmExtractionPayload => {
  const normalized = rawText.toLowerCase();
  const category = CATEGORY_KEYWORDS.find((entry) => normalized.includes(entry.token))?.category ?? null;
  const matchedCondition = CONDITION_KEYWORDS.filter((entry) => normalized.includes(entry.token));
  const condition_grade = matchedCondition[0]?.grade ?? null;
  const ambiguity = matchedCondition.length > 1;

  const quantityMatch = normalized.match(/(?:qty|quantity|units?)\s*[:\-]?\s*(\d{1,4})/i);
  const unitsTotal = quantityMatch?.[1] ? Number(quantityMatch[1]) : null;

  const unitsLocked = LOCKED_KEYWORDS.some((token) => normalized.includes(token)) ? 1 : 0;
  const unitsDefective = DEFECTIVE_KEYWORDS.some((token) => normalized.includes(token)) ? 1 : 0;
  const unit_breakdown: Partial<UnitBreakdown> | null =
    unitsTotal !== null || unitsLocked > 0 || unitsDefective > 0
      ? {
          units_total: unitsTotal ?? undefined,
          units_locked: unitsLocked > 0 ? unitsLocked : undefined,
          units_defective: unitsDefective > 0 ? unitsDefective : undefined,
        }
      : null;

  return {
    unit_breakdown,
    condition_grade,
    category,
    ambiguity,
    notes: ambiguity ? ["Multiple conflicting condition phrases detected."] : [],
  };
};

const normalizeResult = (
  provider: ExtractionResult["provider"],
  payload: LlmExtractionPayload,
  rawText: string
): ExtractionResult => {
  const normalized = rawText.toLowerCase();
  const lockedKeywordHits = LOCKED_KEYWORDS.filter((token) => normalized.includes(token)).length;
  const defectiveKeywordHits = DEFECTIVE_KEYWORDS.filter((token) => normalized.includes(token)).length;
  const payloadUnitsLocked = parseInteger(payload.unit_breakdown?.units_locked) ?? 0;
  const payloadUnitsDefective = parseInteger(payload.unit_breakdown?.units_defective) ?? 0;
  const units_locked_increment = Math.max(payloadUnitsLocked, lockedKeywordHits > 0 ? 1 : 0);
  const defective_units_increment = Math.max(payloadUnitsDefective, defectiveKeywordHits > 0 ? 1 : 0);

  const ambiguityFlags = [...(payload.notes ?? [])];
  if (payload.ambiguity) {
    ambiguityFlags.push("LLM_AMBIGUITY_FLAG");
  }
  const data_confidence_delta = ambiguityFlags.length > 0 ? -20 : 0;

  return {
    unit_breakdown: payload.unit_breakdown ?? null,
    condition_grade: payload.condition_grade ?? null,
    category: payload.category ?? null,
    units_locked_increment,
    defective_units_increment,
    data_confidence_delta,
    ambiguity_flags: Array.from(new Set(ambiguityFlags)),
    provider,
  };
};

export const extractGovDealsFields = async (input: ExtractionInput): Promise<ExtractionResult> => {
  const rawText = input.raw_text.trim();
  if (!rawText) {
    return {
      unit_breakdown: null,
      condition_grade: null,
      category: null,
      units_locked_increment: 0,
      defective_units_increment: 0,
      data_confidence_delta: 0,
      ambiguity_flags: [],
      provider: "heuristic",
    };
  }

  const gemini = await getGeminiExtraction(rawText);
  if (gemini) {
    return normalizeResult("gemini", gemini, rawText);
  }

  const openai = await getOpenAiExtraction(rawText);
  if (openai) {
    return normalizeResult("openai", openai, rawText);
  }

  return normalizeResult("heuristic", getHeuristicExtraction(rawText), rawText);
};

