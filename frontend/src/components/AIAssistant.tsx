import { useState } from "react";
import { queryAssistant } from "../api";
import type { AssistantQueryResponse } from "../types";

interface AIAssistantProps {
  selectedDealContext: {
    deal_id?: string | null;
    listing_id?: string | null;
    snapshot?: {
      selected_deal: {
        listing_id: string | null;
        title: string | null;
        current_bid: number | null;
        auction_end: string | null;
        location: string | null;
        seller_agency: string | null;
        description: string | null;
        buyer_premium_pct: number | null;
        estimated_resale_value: number | null;
        estimated_transport: number | null;
        estimated_repair: number | null;
        risk_flags: string[];
        missing_fields: string[];
      };
    };
    has_usable_context: boolean;
  } | null;
}

const QUICK_PROMPTS = ["Explain this deal", "Why is this risky?", "What data is missing?"] as const;

export default function AIAssistant({ selectedDealContext }: AIAssistantProps) {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<AssistantQueryResponse | null>(null);

  const hasUsableContext = Boolean(selectedDealContext?.has_usable_context);

  const onSubmit = async () => {
    const trimmed = question.trim();
    if (!trimmed) {
      return;
    }
    if (!selectedDealContext) {
      setError("No selected deal context.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const selectedDeal = selectedDealContext.snapshot?.selected_deal;
      const payload = {
        mode: selectedDealContext.deal_id ? ("persisted_deal" as const) : ("preview_opportunity" as const),
        deal_id: selectedDealContext.deal_id ?? undefined,
        listing_id: selectedDealContext.listing_id ?? undefined,
        snapshot: selectedDeal
          ? {
              opportunity: {
                id: selectedDealContext.listing_id ?? selectedDealContext.deal_id ?? "preview-opportunity",
                listing_id: selectedDeal.listing_id,
                title: selectedDeal.title,
                current_bid: selectedDeal.current_bid,
                auction_end: selectedDeal.auction_end,
                location: selectedDeal.location,
                seller_agency: selectedDeal.seller_agency,
                description: selectedDeal.description,
                buyer_premium_pct: selectedDeal.buyer_premium_pct,
                estimated_resale_value: selectedDeal.estimated_resale_value,
                estimated_transport_override: selectedDeal.estimated_transport,
                estimated_repair_cost: selectedDeal.estimated_repair,
                import_missing_fields: selectedDeal.missing_fields,
              },
            }
          : selectedDealContext.snapshot ?? undefined,
        question: trimmed,
      };
      const result = await queryAssistant(payload);
      setResponse(result);
      if (!result.ok) {
        setError(result.reason ?? "Assistant unavailable.");
      }
    } catch (submitError) {
      void submitError;
      setError("Assistant is unavailable right now. Please try again.");
      setResponse({
        ok: false,
        state: "api_failure",
        answer: null,
        reason: "Assistant is unavailable right now. Please try again.",
        missing_fields: [],
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="panel">
      <h3>AI Assistant</h3>
      {!selectedDealContext ? <p className="warning-text">No selected deal context.</p> : null}
      {!hasUsableContext && selectedDealContext ? (
        <p className="warning-text">Assistant disabled: selected record has missing critical context.</p>
      ) : null}

      <div className="entry-actions">
        {QUICK_PROMPTS.map((prompt) => (
          <button
            key={prompt}
            type="button"
            className="ghost-button"
            disabled={!hasUsableContext || loading}
            onClick={() => setQuestion(prompt)}
          >
            {prompt}
          </button>
        ))}
      </div>

      <label>
        Ask about selected deal
        <textarea
          rows={3}
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          disabled={!hasUsableContext || loading}
        />
      </label>

      <div className="entry-actions">
        <button
          type="button"
          className="primary-button"
          disabled={!hasUsableContext || loading || !question.trim()}
          onClick={() => void onSubmit()}
        >
          {loading ? "Asking..." : "Ask Assistant"}
        </button>
      </div>

      {error ? <p className="warning-text">{error}</p> : null}

      {response ? (
        <div className="preview-box">
          <p>
            <strong>State:</strong> {response.state}
          </p>
          {response.answer ? (
            <p>
              <strong>Answer:</strong> {response.answer}
            </p>
          ) : null}
          {response.reason ? (
            <p>
              <strong>Reason:</strong> {response.reason}
            </p>
          ) : null}
          {response.missing_fields.length > 0 ? (
            <p>
              <strong>Missing:</strong> {response.missing_fields.join(", ")}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
