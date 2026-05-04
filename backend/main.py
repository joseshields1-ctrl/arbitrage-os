import asyncio
import json
import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from agents import analyze_deal
from models import (
    AgentAnalysis,
    AssistantQueryRequest,
    AssistantQueryResponse,
    ScrapeResult,
    SpiderItem,
    validate_import_result,
)
from scraper import dedupe_by_listing_id, parse_pasted_text, run_spider_discovery, scrape_url


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")
START_URLS = os.getenv("GOVDEALS_START_URLS", "https://www.govdeals.com").split(",")

app = FastAPI(title="Arbitrage OS Sniper Backend", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in FRONTEND_ORIGIN.split(",") if origin.strip()],
    allow_methods=["*"],
    allow_headers=["*"],
)

validated_feed: List[ScrapeResult] = []
spider_discovery_feed: List[SpiderItem] = []
assistant_snapshots: Dict[str, Dict[str, Any]] = {}
ws_clients: Set[WebSocket] = set()
ws_lock = asyncio.Lock()


class ScrapeUrlRequest(BaseModel):
    url: str = Field(min_length=1)


class ScrapeTextRequest(BaseModel):
    text: str = Field(min_length=1)
    source_url: Optional[str] = None


class AnalyzeRequest(BaseModel):
    scrape_result: ScrapeResult
    capital_pool: float = 100000


class AssistantRequestModel(BaseModel):
    mode: str
    deal_id: Optional[str] = None
    listing_id: Optional[str] = None
    snapshot: Optional[Dict[str, Any]] = None
    question: str


async def _broadcast(message: Dict[str, Any]) -> None:
    serialized = json.dumps(message)
    async with ws_lock:
        stale: List[WebSocket] = []
        for ws in ws_clients:
            try:
                await ws.send_text(serialized)
            except Exception:
                stale.append(ws)
        for ws in stale:
            ws_clients.discard(ws)


async def _broadcast_validated_feed_update(item: ScrapeResult) -> None:
    await _broadcast(
        {
            "type": "feed_update",
            "timestamp": now_iso(),
            "payload": item.model_dump(),
        }
    )


async def _broadcast_sniper_pick(result: ScrapeResult, analysis: AgentAnalysis) -> None:
    if analysis.recommendation != "buy":
        return
    await _broadcast(
        {
            "type": "sniper_pick",
            "timestamp": now_iso(),
            "payload": {
                "scrape_result": result.model_dump(),
                "analysis": analysis.model_dump(),
            },
        }
    )


@app.get("/health")
async def health() -> Dict[str, Any]:
    return {
        "ok": True,
        "service": "arbitrage-os-sniper-backend",
        "timestamp": now_iso(),
        "start_urls": [url.strip() for url in START_URLS if url.strip()],
    }


@app.post("/scrape/url", response_model=ScrapeResult)
async def scrape_url_endpoint(body: ScrapeUrlRequest) -> ScrapeResult:
    try:
        result = scrape_url(body.url)
        result = validate_import_result(result)
        if result.listing_id:
            dedupe_by_listing_id(validated_feed, result)
        else:
            validated_feed.append(result)
        await _broadcast_validated_feed_update(result)
        return result
    except Exception as exc:
        raise HTTPException(status_code=400, detail={"error": str(exc)})


@app.post("/scrape/text", response_model=ScrapeResult)
async def scrape_text_endpoint(body: ScrapeTextRequest) -> ScrapeResult:
    try:
        result = parse_pasted_text(body.text, body.source_url)
        result = validate_import_result(result)
        if result.listing_id:
            dedupe_by_listing_id(validated_feed, result)
        else:
            validated_feed.append(result)
        await _broadcast_validated_feed_update(result)
        return result
    except Exception as exc:
        raise HTTPException(status_code=400, detail={"error": str(exc)})


@app.post("/agent/analyze", response_model=AgentAnalysis)
async def agent_analyze_endpoint(body: AnalyzeRequest) -> AgentAnalysis:
    try:
        normalized = validate_import_result(body.scrape_result)
        analysis = analyze_deal(normalized, capital_pool=body.capital_pool)
        await _broadcast_sniper_pick(normalized, analysis)
        return analysis
    except Exception as exc:
        raise HTTPException(status_code=400, detail={"error": str(exc)})


@app.post("/assistant/query", response_model=AssistantQueryResponse)
async def assistant_query_endpoint(body: AssistantRequestModel) -> AssistantQueryResponse:
    try:
        request = AssistantQueryRequest(
            mode=body.mode, deal_id=body.deal_id, listing_id=body.listing_id, snapshot=body.snapshot, question=body.question
        )
        if not request.question.strip():
            return AssistantQueryResponse(
                ok=False,
                state="disabled_missing_context",
                answer=None,
                reason="question is required",
                missing_fields=["question"],
            )
        if request.mode not in {"preview_opportunity", "persisted_deal"}:
            return AssistantQueryResponse(
                ok=False,
                state="api_failure",
                answer=None,
                reason="invalid mode",
                missing_fields=["mode"],
            )

        if request.mode == "persisted_deal":
            deal_key = request.deal_id or ""
            snapshot = assistant_snapshots.get(deal_key)
            if not snapshot:
                return AssistantQueryResponse(
                    ok=False,
                    state="deal_not_found",
                    answer=None,
                    reason="deal not found in assistant context cache",
                    missing_fields=["deal_id"],
                )
            selected_deal = snapshot.get("selected_deal", {})
        else:
            selected_deal = (request.snapshot or {}).get("selected_deal")
            if not selected_deal:
                return AssistantQueryResponse(
                    ok=False,
                    state="disabled_missing_context",
                    answer=None,
                    reason="selected_deal context is required for preview_opportunity",
                    missing_fields=["selected_deal"],
                )

        missing: List[str] = []
        for field in ["listing_id", "title", "current_bid", "auction_end", "location", "seller_agency"]:
            if selected_deal.get(field) in (None, ""):
                missing.append(field)

        answer = (
            "Context grounded response.\n"
            f"Question: {request.question}\n"
            f"Listing: {selected_deal.get('listing_id')}\n"
            f"Title: {selected_deal.get('title')}\n"
            f"Current Bid: {selected_deal.get('current_bid')}\n"
            f"Risk Flags: {selected_deal.get('risk_flags') or []}\n"
            f"Missing Fields: {missing}\n"
        )
        return AssistantQueryResponse(
            ok=True,
            state="success" if not missing else "disabled_missing_context",
            answer=None if missing else answer,
            reason="context missing required fields" if missing else None,
            missing_fields=missing,
        )
    except Exception as exc:
        return AssistantQueryResponse(
            ok=False,
            state="api_failure",
            answer=None,
            reason=str(exc),
            missing_fields=[],
        )


@app.websocket("/ws/feed")
async def ws_feed(websocket: WebSocket) -> None:
    await websocket.accept()
    async with ws_lock:
        ws_clients.add(websocket)
    heartbeat_task = asyncio.create_task(_heartbeat_loop(websocket))
    try:
        while True:
            raw = await websocket.receive_text()
            try:
                payload = json.loads(raw)
            except json.JSONDecodeError:
                await websocket.send_text(
                    json.dumps(
                        {
                            "type": "error",
                            "timestamp": now_iso(),
                            "payload": {"error": "invalid_json"},
                        }
                    )
                )
                continue
            if payload.get("type") == "register_assistant_context":
                deal_id = payload.get("deal_id")
                snapshot = payload.get("snapshot")
                if deal_id and isinstance(snapshot, dict):
                    assistant_snapshots[str(deal_id)] = snapshot
                    await websocket.send_text(
                        json.dumps(
                            {
                                "type": "feed_update",
                                "timestamp": now_iso(),
                                "payload": {"registered": True, "deal_id": deal_id},
                            }
                        )
                    )
            elif payload.get("type") == "run_discovery":
                discovered = run_spider_discovery([url.strip() for url in START_URLS if url.strip()])
                spider_discovery_feed.clear()
                spider_discovery_feed.extend(discovered)
                for item in discovered:
                    normalized = validate_import_result(
                        ScrapeResult(
                            ok=False,
                            status="needs_review",
                            source_url=item.source_url,
                            listing_id=item.listing_id,
                            account_id=item.account_id,
                            item_id=item.item_id,
                            parsed_fields={
                                "title": item.title,
                                "current_bid": item.current_bid,
                                "auction_end": item.auction_end,
                                "location": item.location,
                                "seller_agency": item.seller_agency,
                                "description": None,
                                "buyer_premium_pct": None,
                                "quantity": None,
                            },
                            missing_fields=item.missing_fields,
                            raw_text=None,
                            error=None,
                        )
                    )
                    dedupe_by_listing_id(validated_feed, normalized)
                    await _broadcast_validated_feed_update(normalized)
            else:
                await websocket.send_text(
                    json.dumps(
                        {
                            "type": "error",
                            "timestamp": now_iso(),
                            "payload": {"error": "unsupported_message_type"},
                        }
                    )
                )
    except WebSocketDisconnect:
        pass
    finally:
        heartbeat_task.cancel()
        async with ws_lock:
            ws_clients.discard(websocket)


async def _heartbeat_loop(websocket: WebSocket) -> None:
    try:
        while True:
            await websocket.send_text(
                json.dumps(
                    {
                        "type": "heartbeat",
                        "timestamp": now_iso(),
                        "payload": {"clients": len(ws_clients)},
                    }
                )
            )
            await asyncio.sleep(30)
    except Exception:
        return
