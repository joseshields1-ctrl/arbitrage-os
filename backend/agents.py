from __future__ import annotations

from typing import List

from models import AgentAnalysis, ScrapeResult

try:
    from crewai import Agent, Crew, Process, Task

    CREWAI_AVAILABLE = True
except Exception:  # pragma: no cover - optional dependency at runtime
    Agent = object  # type: ignore
    Crew = object  # type: ignore
    Process = object  # type: ignore
    Task = object  # type: ignore
    CREWAI_AVAILABLE = False


def _is_incomplete(result: ScrapeResult) -> bool:
    return (
        result.status in {"needs_review", "blocked", "failed"}
        or result.listing_id is None
        or result.account_id is None
        or result.item_id is None
        or len(result.missing_fields) > 0
    )


def _fallback_analysis(result: ScrapeResult, capital_pool: float = 100000) -> AgentAnalysis:
    parsed = result.parsed_fields
    required_missing = list(result.missing_fields)
    risk_flags: List[str] = []
    confidence = 85.0

    if _is_incomplete(result):
        confidence = max(10.0, 70.0 - (len(required_missing) * 8.0))
        return AgentAnalysis(
            ok=True,
            recommendation="needs_review",
            confidence=confidence,
            projected_profit=None,
            roi_pct=None,
            capital_required=None,
            risk_flags=["INCOMPLETE_CONTEXT", *risk_flags],
            missing_fields=required_missing,
            reasoning=(
                "Deal requires review before recommendation. Missing/invalid fields: "
                + (", ".join(required_missing) if required_missing else "unknown")
            ),
        )

    current_bid = parsed.current_bid
    buyer_premium_pct = parsed.buyer_premium_pct
    if current_bid is None:
        required_missing.append("current_bid")
    if buyer_premium_pct is None:
        required_missing.append("buyer_premium_pct")

    if required_missing:
        confidence = max(15.0, confidence - (len(required_missing) * 10.0))
        return AgentAnalysis(
            ok=True,
            recommendation="needs_review",
            confidence=confidence,
            projected_profit=None,
            roi_pct=None,
            capital_required=None,
            risk_flags=["MISSING_CRITICAL_INPUTS", *risk_flags],
            missing_fields=required_missing,
            reasoning="Cannot evaluate with incomplete financial inputs.",
        )

    premium_cost = current_bid * buyer_premium_pct
    capital_required = current_bid + premium_cost
    confidence -= max(0.0, len(result.missing_fields) * 5.0)

    if capital_required > capital_pool:
        return AgentAnalysis(
            ok=True,
            recommendation="pass",
            confidence=max(20.0, confidence - 20.0),
            projected_profit=None,
            roi_pct=None,
            capital_required=capital_required,
            risk_flags=["CAPITAL_EXCEEDED"],
            missing_fields=result.missing_fields,
            reasoning=(
                f"Capital required ({capital_required:.2f}) exceeds pool ({capital_pool:.2f}). "
                "Cannot recommend buy."
            ),
        )

    estimated_resale = parsed.quantity
    if estimated_resale is None:
        # Do not invent resale value; degrade to review/watch.
        return AgentAnalysis(
            ok=True,
            recommendation="watch",
            confidence=max(25.0, confidence - 30.0),
            projected_profit=None,
            roi_pct=None,
            capital_required=capital_required,
            risk_flags=["NO_RESALE_ESTIMATE"],
            missing_fields=[*result.missing_fields, "estimated_resale_value"],
            reasoning=(
                "No resale estimate available; cannot compute profit safely. "
                "Tracked as watch/needs data."
            ),
        )

    projected_profit = estimated_resale - capital_required
    roi_pct = (projected_profit / capital_required) * 100 if capital_required > 0 else None

    if projected_profit <= 0:
        risk_flags.append("NEGATIVE_MARGIN")
        recommendation = "pass"
        confidence = max(25.0, confidence - 20.0)
    elif roi_pct is not None and roi_pct >= 25:
        recommendation = "buy"
        confidence = min(95.0, confidence + 5.0)
    else:
        recommendation = "watch"
        confidence = max(30.0, confidence - 5.0)

    return AgentAnalysis(
        ok=True,
        recommendation=recommendation,
        confidence=confidence,
        projected_profit=projected_profit,
        roi_pct=roi_pct,
        capital_required=capital_required,
        risk_flags=risk_flags,
        missing_fields=result.missing_fields,
        reasoning=(
            f"Evaluation based on validated listing_id={result.listing_id}. "
            f"capital_required={capital_required:.2f}, projected_profit={projected_profit:.2f}, "
            f"roi_pct={(roi_pct if roi_pct is not None else 0):.2f}."
        ),
    )


def _crewai_analysis(result: ScrapeResult, capital_pool: float = 100000) -> AgentAnalysis:
    # CrewAI is optional; if available, use it for reasoning and still enforce hard rules.
    fallback = _fallback_analysis(result, capital_pool=capital_pool)
    if not CREWAI_AVAILABLE:
        return fallback

    analyst = Agent(
        role="Deal Analyst",
        goal="Evaluate validated opportunities against capital constraints without inventing missing data.",
        backstory=(
            "You are an objective operator assistant that must return conservative recommendations "
            "with explicit missing fields and risk flags."
        ),
        allow_delegation=False,
        verbose=False,
    )

    task = Task(
        description=(
            "Review the validated deal payload and summarize recommendation reasoning. "
            "Do not fabricate missing values. "
            f"Capital pool: {capital_pool}. Payload: {result.model_dump_json()}"
        ),
        expected_output="Short structured rationale.",
        agent=analyst,
    )
    crew = Crew(agents=[analyst], tasks=[task], process=Process.sequential, verbose=False)
    try:
        summary = str(crew.kickoff())
    except Exception:
        summary = fallback.reasoning
    fallback.reasoning = f"{fallback.reasoning} CrewAI: {summary}"
    return fallback


def analyze_deal(scrape_result: ScrapeResult, capital_pool: float = 100000) -> AgentAnalysis:
    return _crewai_analysis(scrape_result, capital_pool=capital_pool)
