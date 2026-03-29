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
  const criticalAlerts = context.warnings.filter((item) =>
    ["FORCE_LIQUIDATION", "STAGE_CRITICAL", "PROFIT_DRIFT_HIGH"].includes(item)
  ).length;
  if (criticalAlerts > 0 || context.calculations.data_confidence <= 50) {
    return "high";
  }
  if (context.calculations.data_confidence <= 70 || context.calculations.projected_profit < 0) {
    return "medium";
  }
  return "low";
};

const buildRecommendationExplanation = (
  context: EnrichedDeal["assistant_context"],
  suggestedAction: string
): string => {
  const alerts = context.warnings.length > 0 ? context.warnings.join(", ") : "none";
  return [
    `Recommendation: ${suggestedAction}.`,
    `Projected profit is ${context.calculations.projected_profit.toFixed(2)}.`,
    `Data confidence is ${context.calculations.data_confidence}.`,
    `Active alerts: ${alerts}.`,
  ].join(" ");
};

const buildHeuristicAdvice = (
  context: EnrichedDeal["assistant_context"],
  question: string
): AssistantQueryResponse => {
  const keyPoints: string[] = [];
  const projected = context.calculations.projected_profit;
  const realized = context.calculations.realized_profit;
  const alerts = context.warnings;

  keyPoints.push(`Projected profit: ${projected.toFixed(2)}`);
  keyPoints.push(
    realized === null ? "Realized profit: unavailable" : `Realized profit: ${realized.toFixed(2)}`
  );
  keyPoints.push(`Data confidence: ${context.calculations.data_confidence}`);
  if (alerts.length > 0) {
    keyPoints.push(`Flags: ${alerts.join(", ")}`);
  }

  const riskLevel = resolveRiskLevel(context);
  const suggestedAction = context.ai_recommendation.suggested_action;
  const recommendationExplanation = buildRecommendationExplanation(context, suggestedAction);
  const latestDecision = context.operator_decision_history[0] ?? null;
  const response = [
    "Advisory analysis based only on provided deal context.",
    `Question: ${question}`,
    recommendationExplanation,
    context.recommendation_summary,
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
  const suggestedAction = context.ai_recommendation.suggested_action;
  const recommendationExplanation = buildRecommendationExplanation(context, suggestedAction);

  return {
    response: `${recommendationExplanation} ${responseText}`.trim(),
    key_points: [
      `Projected profit: ${context.calculations.projected_profit.toFixed(2)}`,
      `Data confidence: ${context.calculations.data_confidence}`,
      `Warnings: ${context.warnings.join(", ") || "none"}`,
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
