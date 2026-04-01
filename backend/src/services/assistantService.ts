import type { EnrichedDeal } from "./engine/enrichDeal";
import { getDealById } from "./dealService";

export interface AssistantQueryInput {
  deal_id?: string;
  assistant_context?: EnrichedDeal["assistant_context"];
  question: string;
}

export interface AssistantQueryResponse {
  response: string;
  key_points: string[];
  risk_level: "low" | "medium" | "high";
  suggested_action: string;
}

const resolveSuggestedAction = (context: EnrichedDeal["assistant_context"]): string => {
  const recommendation = context.ai_recommendation;
  if (
    recommendation &&
    (recommendation.suggested_action === "buy" ||
      recommendation.suggested_action === "pass" ||
      recommendation.suggested_action === "investigate")
  ) {
    return recommendation.suggested_action;
  }
  const engineAction = context.engine?.recommended_action;
  if (
    engineAction === "pass" ||
    engineAction === "do_not_acquire" ||
    engineAction === "liquidate_now" ||
    engineAction === "reduce_price"
  ) {
    return "pass";
  }
  if (engineAction === "review_only") {
    return "investigate";
  }
  return "investigate";
};

const resolveWarnings = (context: EnrichedDeal["assistant_context"]): string[] =>
  Array.isArray(context.warnings) ? context.warnings : [];

const resolveNumber = (value: unknown, fallback = 0): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const ensureQuestion = (value: unknown): string => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error("question is required");
  }
  return value.trim();
};

const ensureAssistantContext = (
  input: AssistantQueryInput
): EnrichedDeal["assistant_context"] => {
  if (input.assistant_context) {
    return input.assistant_context;
  }
  if (!input.deal_id) {
    throw new Error("Provide either deal_id or assistant_context");
  }
  const deal = getDealById(input.deal_id);
  if (!deal) {
    throw new Error("Deal not found");
  }
  return deal.assistant_context;
};

const resolveRiskLevel = (context: EnrichedDeal["assistant_context"]): "low" | "medium" | "high" => {
  const warnings = resolveWarnings(context);
  const dataConfidence = resolveNumber(context.calculations?.data_confidence, 0);
  const projectedProfit = resolveNumber(context.calculations?.projected_profit, 0);
  const criticalAlerts = warnings.filter((item) =>
    ["FORCE_LIQUIDATION", "STAGE_CRITICAL", "PROFIT_DRIFT_HIGH"].includes(item)
  ).length;
  if (criticalAlerts > 0 || dataConfidence <= 50) {
    return "high";
  }
  if (dataConfidence <= 70 || projectedProfit < 0) {
    return "medium";
  }
  return "low";
};

const buildRecommendationExplanation = (
  context: EnrichedDeal["assistant_context"],
  suggestedAction: string
): string => {
  const warnings = resolveWarnings(context);
  const alerts = warnings.length > 0 ? warnings.join(", ") : "none";
  const tax = resolveNumber(context.engine?.cost_basis?.cost_basis_breakdown?.tax, 0);
  const transport = resolveNumber(context.engine?.cost_basis?.cost_basis_breakdown?.transport, 0);
  const totalCostBasis = resolveNumber(context.calculations?.total_cost_basis, 0);
  const projectedProfit = resolveNumber(context.calculations?.projected_profit, 0);
  const dataConfidence = resolveNumber(context.calculations?.data_confidence, 0);
  const marginDragPct =
    totalCostBasis > 0 ? Math.round(((tax + transport) / totalCostBasis) * 100) : 0;
  const bidCapHint =
    suggestedAction === "pass"
      ? "Bid cap guidance: only continue if acquisition terms improve."
      : "Bid cap guidance: keep bid limits conservative until risks are reduced.";
  return [
    `Recommendation: ${suggestedAction}.`,
    `Projected profit is ${projectedProfit.toFixed(2)}.`,
    `Tax and transport impact is ${marginDragPct}% of current cost basis.`,
    `Data confidence is ${dataConfidence}.`,
    `Active alerts: ${alerts}.`,
    bidCapHint,
  ].join(" ");
};

const buildHeuristicAdvice = (
  context: EnrichedDeal["assistant_context"],
  question: string
): AssistantQueryResponse => {
  const warnings = resolveWarnings(context);
  const keyPoints: string[] = [];
  const projected = resolveNumber(context.calculations?.projected_profit, 0);
  const realized =
    typeof context.calculations?.realized_profit === "number" &&
    Number.isFinite(context.calculations.realized_profit)
      ? context.calculations.realized_profit
      : null;
  const dataConfidence = resolveNumber(context.calculations?.data_confidence, 0);
  const alerts = warnings;

  keyPoints.push(`Projected profit: ${projected.toFixed(2)}`);
  keyPoints.push(
    realized === null ? "Realized profit: unavailable" : `Realized profit: ${realized.toFixed(2)}`
  );
  keyPoints.push(`Data confidence: ${dataConfidence}`);
  if (alerts.length > 0) {
    keyPoints.push(`Flags: ${alerts.join(", ")}`);
  }

  const riskLevel = resolveRiskLevel(context);
  const suggestedAction = resolveSuggestedAction(context);
  const recommendationExplanation = buildRecommendationExplanation(context, suggestedAction);
  const latestDecision =
    Array.isArray(context.operator_decision_history) && context.operator_decision_history.length > 0
      ? context.operator_decision_history[0]
      : null;
  const response = [
    "Advisory analysis based only on provided deal context.",
    `Question: ${question}`,
    recommendationExplanation,
    context.recommendation_summary ?? "No recommendation summary was provided.",
    `Risk level: ${riskLevel}. Suggested action: ${suggestedAction}.`,
    latestDecision?.decision === "rejected"
      ? "You previously rejected this recommendation. Please capture your operator reasoning for continuous improvement."
      : "",
  ].join(" ");

  return {
    response,
    key_points: keyPoints,
    risk_level: riskLevel,
    suggested_action: suggestedAction,
  };
};

const getOpenAIClient = async (): Promise<{
  responses: {
    create: (input: {
      model: string;
      input: Array<{ role: "system" | "user"; content: string }>;
    }) => Promise<{ output_text?: string }>;
  };
} | null> => {
  if (!process.env.OPENAI_API_KEY) {
    return null;
  }
  const openaiModule = await import("openai");
  const OpenAI = openaiModule.default;
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
};

const buildSystemPrompt = (context: EnrichedDeal["assistant_context"]): string => {
  return [
    "You are an embedded operator assistant for Arbitrage OS.",
    "Advisory-only mode: do not execute actions, do not modify deals, do not change scores, do not override backend logic.",
    "Use ONLY the provided context. If data is missing, explicitly say it is missing.",
    "Your task: explain deal performance, identify risks, and recommend next actions for operator review.",
    "Always explain WHY the recommendation is buy/pass/investigate by referencing alerts, projected profit, and data confidence.",
    "If latest operator decision is rejected, ask for operator reasoning.",
    "Respond with concise operational guidance.",
    "",
    "Context JSON:",
    JSON.stringify(context),
  ].join("\n");
};

const buildOpenAIAdvice = async (
  context: EnrichedDeal["assistant_context"],
  question: string
): Promise<AssistantQueryResponse | null> => {
  const client = await getOpenAIClient();
  if (!client) {
    return null;
  }

  const openaiResponse = await client.responses.create({
    model: "gpt-4.1-mini",
    input: [
      {
        role: "system",
        content: buildSystemPrompt(context),
      },
      {
        role: "user",
        content: question,
      },
    ],
  });

  const responseText = openaiResponse.output_text?.trim() || "No assistant response generated.";
  const riskLevel = resolveRiskLevel(context);
  const warnings = resolveWarnings(context);
  const suggestedAction = resolveSuggestedAction(context);
  const recommendationExplanation = buildRecommendationExplanation(context, suggestedAction);
  const projectedProfit = resolveNumber(context.calculations?.projected_profit, 0);
  const dataConfidence = resolveNumber(context.calculations?.data_confidence, 0);

  return {
    response: `${recommendationExplanation} ${responseText}`.trim(),
    key_points: [
      `Projected profit: ${projectedProfit.toFixed(2)}`,
      `Data confidence: ${dataConfidence}`,
      `Warnings: ${warnings.join(", ") || "none"}`,
    ],
    risk_level: riskLevel,
    suggested_action: suggestedAction,
  };
};

export const runAssistantQuery = async (rawInput: unknown): Promise<AssistantQueryResponse> => {
  if (!rawInput || typeof rawInput !== "object") {
    throw new Error("Invalid assistant query payload");
  }
  const input = rawInput as AssistantQueryInput;
  const question = ensureQuestion(input.question);
  const context = ensureAssistantContext(input);

  const openaiAdvice = await buildOpenAIAdvice(context, question);
  if (openaiAdvice) {
    return openaiAdvice;
  }

  return buildHeuristicAdvice(context, question);
};

export const queryOperatorAssistant = async (
  input: AssistantQueryInput
): Promise<AssistantQueryResponse> => runAssistantQuery(input);
