from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, HttpUrl


class ScrapeStatus(str, Enum):
    success = "success"
    needs_review = "needs_review"
    blocked = "blocked"
    failed = "failed"


class SpiderParseStatus(str, Enum):
    discovered = "discovered"
    needs_review = "needs_review"
    blocked = "blocked"
    failed = "failed"


class ParsedFields(BaseModel):
    model_config = ConfigDict(extra="ignore")

    title: Optional[str] = None
    current_bid: Optional[float] = None
    auction_end: Optional[str] = None
    location: Optional[str] = None
    seller_agency: Optional[str] = None
    description: Optional[str] = None
    buyer_premium_pct: Optional[float] = None
    quantity: Optional[float] = None


class ScrapeResult(BaseModel):
    model_config = ConfigDict(extra="ignore")

    ok: bool
    status: ScrapeStatus
    source_url: Optional[str] = None
    listing_id: Optional[str] = None
    account_id: Optional[str] = None
    item_id: Optional[str] = None
    parsed_fields: ParsedFields = Field(default_factory=ParsedFields)
    missing_fields: List[str] = Field(default_factory=list)
    raw_text: Optional[str] = None
    error: Optional[str] = None


class SpiderItem(BaseModel):
    model_config = ConfigDict(extra="ignore")

    source: Literal["govdeals"] = "govdeals"
    source_url: Optional[str] = None
    listing_id: Optional[str] = None
    account_id: Optional[str] = None
    item_id: Optional[str] = None
    title: Optional[str] = None
    current_bid: Optional[float] = None
    auction_end: Optional[str] = None
    location: Optional[str] = None
    seller_agency: Optional[str] = None
    parse_status: SpiderParseStatus = SpiderParseStatus.discovered
    missing_fields: List[str] = Field(default_factory=list)


class AgentAnalysis(BaseModel):
    model_config = ConfigDict(extra="ignore")

    ok: bool
    recommendation: Literal["buy", "watch", "pass", "needs_review"]
    confidence: float
    projected_profit: Optional[float] = None
    roi_pct: Optional[float] = None
    capital_required: Optional[float] = None
    risk_flags: List[str] = Field(default_factory=list)
    missing_fields: List[str] = Field(default_factory=list)
    reasoning: str


class HealthResponse(BaseModel):
    ok: bool = True
    service: str = "arbitrage-os-sniper-backend"
    timestamp: str = Field(default_factory=lambda: datetime.utcnow().isoformat() + "Z")
    ws_clients: int = 0
    start_urls: List[str] = Field(default_factory=list)


class ScrapeUrlRequest(BaseModel):
    url: HttpUrl


class ScrapeTextRequest(BaseModel):
    text: str = Field(min_length=1)
    source_url: Optional[str] = None


class AgentAnalyzeRequest(BaseModel):
    scrape_result: ScrapeResult
    capital_pool: float = 100000


class AssistantQueryRequest(BaseModel):
    mode: Literal["preview_opportunity", "persisted_deal"]
    deal_id: Optional[str] = None
    listing_id: Optional[str] = None
    snapshot: Optional[Dict[str, Any]] = None
    question: str = Field(min_length=1)


class AssistantQueryResponse(BaseModel):
    ok: bool
    state: Literal[
        "success",
        "disabled_missing_context",
        "api_failure",
        "timeout",
        "deal_not_found",
    ]
    answer: Optional[str] = None
    reason: Optional[str] = None
    missing_fields: List[str] = Field(default_factory=list)


class FeedMessage(BaseModel):
    type: Literal["feed_update", "sniper_pick", "heartbeat", "error"]
    timestamp: str = Field(default_factory=lambda: datetime.utcnow().isoformat() + "Z")
    payload: Dict[str, Any] = Field(default_factory=dict)

