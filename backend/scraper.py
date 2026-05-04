import asyncio
import re
from datetime import datetime, timezone
from typing import Dict, Iterable, List, Optional
from urllib.parse import parse_qs, urlparse

import httpx
from bs4 import BeautifulSoup

from models import FeedMessage, ScrapeResult, ScrapeStatus, SpiderItem, SpiderParseStatus

try:
    from scrapling.spiders import Response, Spider  # type: ignore
except Exception:
    Spider = object  # type: ignore
    Response = object  # type: ignore


LISTING_ID_RE = re.compile(r"govdeals_(\d+)_(\d+)", re.IGNORECASE)
BLOCK_MARKERS = ("cloudflare", "attention required", "access denied", "captcha")


def _iso_now() -> str:
    return datetime.now(tz=timezone.utc).isoformat()


def _normalize_text(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    trimmed = value.strip()
    return trimmed if trimmed else None


def _parse_float(value: Optional[str]) -> Optional[float]:
    if value is None:
        return None
    cleaned = value.replace(",", "").replace("$", "").replace("%", "").strip()
    if not cleaned:
        return None
    try:
        return float(cleaned)
    except ValueError:
        return None


def _parse_number_from_text(label: str, text: str) -> Optional[float]:
    match = re.search(
        rf"{re.escape(label)}[^0-9$]*\$?([0-9,]+(?:\.[0-9]+)?)",
        text,
        flags=re.IGNORECASE,
    )
    if not match:
        return None
    return _parse_float(match.group(1))


def _extract_identity(source_url: Optional[str], text: Optional[str]) -> Dict[str, Optional[str]]:
    account_id: Optional[str] = None
    item_id: Optional[str] = None
    listing_id: Optional[str] = None
    if source_url:
        parsed = urlparse(source_url)
        qs = parse_qs(parsed.query)
        account_id = _normalize_text((qs.get("accountId") or qs.get("accountid") or [None])[0])
        item_id = _normalize_text((qs.get("itemNum") or qs.get("itemnum") or qs.get("itemId") or [None])[0])
    payload = text or ""
    listing_match = LISTING_ID_RE.search(payload)
    if listing_match:
        account_id = account_id or listing_match.group(1)
        item_id = item_id or listing_match.group(2)
    if account_id and item_id:
        listing_id = f"govdeals_{account_id}_{item_id}"
    return {"account_id": account_id, "item_id": item_id, "listing_id": listing_id}


def normalize_spider_item(raw: Dict[str, object]) -> SpiderItem:
    source_url = _normalize_text(str(raw.get("source_url", "") or "")) or None
    source = _normalize_text(str(raw.get("source", "govdeals") or "")) or "govdeals"
    title = _normalize_text(str(raw.get("title", "") or "")) or None
    current_bid_raw = raw.get("current_bid")
    current_bid = (
        float(current_bid_raw)
        if isinstance(current_bid_raw, (int, float))
        else _parse_float(str(current_bid_raw) if current_bid_raw is not None else None)
    )
    auction_end = _normalize_text(str(raw.get("auction_end", "") or "")) or None
    location = _normalize_text(str(raw.get("location", "") or "")) or None
    seller_agency = _normalize_text(str(raw.get("seller_agency", "") or "")) or None

    iden = _extract_identity(source_url, title)
    listing_id = _normalize_text(str(raw.get("listing_id", "") or "")) or iden["listing_id"]
    account_id = _normalize_text(str(raw.get("account_id", "") or "")) or iden["account_id"]
    item_id = _normalize_text(str(raw.get("item_id", "") or "")) or iden["item_id"]

    missing_fields: List[str] = []
    if not listing_id or not account_id or not item_id:
        missing_fields.extend(["listing_id", "account_id", "item_id"])
    if not title:
        missing_fields.append("title")
    if current_bid is None:
        missing_fields.append("current_bid")
    if not auction_end:
        missing_fields.append("auction_end")
    if not location:
        missing_fields.append("location")
    if not seller_agency:
        missing_fields.append("seller_agency")

    parse_status = (
        SpiderParseStatus.discovered if not missing_fields else SpiderParseStatus.needs_review
    )
    return SpiderItem(
        source=source,
        source_url=source_url,
        listing_id=listing_id,
        account_id=account_id,
        item_id=item_id,
        title=title,
        current_bid=current_bid,
        auction_end=auction_end,
        location=location,
        seller_agency=seller_agency,
        parse_status=parse_status,
        missing_fields=sorted(set(missing_fields)),
    )


def validate_import_result(result: ScrapeResult) -> ScrapeResult:
    missing = set(result.missing_fields)
    if not result.listing_id or not result.account_id or not result.item_id:
        missing.update(["listing_id", "account_id", "item_id"])
    expected = (
        f"govdeals_{result.account_id}_{result.item_id}"
        if result.account_id and result.item_id
        else None
    )
    if expected and result.listing_id != expected:
        missing.add("listing_id")

    parsed = result.parsed_fields
    if parsed.current_bid is None:
        missing.add("current_bid")
    if parsed.buyer_premium_pct is not None and parsed.buyer_premium_pct > 1:
        parsed.buyer_premium_pct = parsed.buyer_premium_pct / 100.0

    result.missing_fields = sorted(missing)
    if result.status == ScrapeStatus.blocked:
        result.ok = False
        return result

    if any(field in missing for field in ("listing_id", "account_id", "item_id")):
        result.status = "blocked"
        result.ok = False
        result.error = result.error or "Identity missing; review required."
    elif missing:
        result.status = "needs_review"
        result.ok = False
    else:
        result.status = "success"
        result.ok = True
    return result


def dedupe_by_listing_id(
    existing: Dict[str, ScrapeResult], candidate: ScrapeResult
) -> ScrapeResult:
    if not candidate.listing_id:
        return candidate
    existing[candidate.listing_id] = candidate
    return candidate


class GovDealsSpider(Spider):  # type: ignore[misc]
    name = "govdeals_spider"

    def __init__(self, start_urls: Iterable[str]):
        super().__init__()
        self.start_urls = list(start_urls)

    def parse(self, response: Response):  # type: ignore[override]
        html = getattr(response, "text", "") or ""
        soup = BeautifulSoup(html, "html.parser")
        cards = soup.select("a[href*='govdeals.com'], a[href*='auction']")
        for card in cards:
            href = card.get("href")
            if not href:
                continue
            if href.startswith("/"):
                href = f"https://www.govdeals.com{href}"
            title = _normalize_text(card.get_text(" ", strip=True))
            yield {
                "source": "govdeals",
                "source_url": href,
                "title": title,
                "listing_id": None,
                "account_id": None,
                "item_id": None,
            }


class GovDealsFetcher:
    def __init__(self, timeout_seconds: int = 20):
        self.timeout_seconds = timeout_seconds

    async def scrape_url(self, url: str) -> ScrapeResult:
        identity = _extract_identity(url, None)
        try:
            async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
                response = await client.get(url)
            body = response.text
            body_lower = body.lower()
            if any(marker in body_lower for marker in BLOCK_MARKERS):
                return validate_import_result(
                    ScrapeResult(
                        ok=False,
                        status="blocked",
                        source_url=url,
                        listing_id=identity["listing_id"],
                        account_id=identity["account_id"],
                        item_id=identity["item_id"],
                        parsed_fields={},
                        missing_fields=[],
                        raw_text=body[:2000],
                        error="Source blocked fetch request.",
                    )
                )
            return validate_import_result(self._extract_from_html(url, body))
        except Exception as exc:
            return validate_import_result(
                ScrapeResult(
                    ok=False,
                    status="failed",
                    source_url=url,
                    listing_id=identity["listing_id"],
                    account_id=identity["account_id"],
                    item_id=identity["item_id"],
                    parsed_fields={},
                    missing_fields=[],
                    raw_text=None,
                    error=str(exc),
                )
            )

    def parse_pasted_text(self, text: str, source_url: Optional[str] = None) -> ScrapeResult:
        identity = _extract_identity(source_url, text)
        title_match = re.search(r"title[:\-]\s*(.+)", text, re.IGNORECASE)
        bid_match = re.search(
            r"(current\s+bid|bid)[:\-]\s*\$?([0-9,]+(?:\.[0-9]+)?)",
            text,
            re.IGNORECASE,
        )
        auction_end_match = re.search(r"(auction\s+end|end)[:\-]\s*(.+)", text, re.IGNORECASE)
        location_match = re.search(r"location[:\-]\s*(.+)", text, re.IGNORECASE)
        agency_match = re.search(r"(agency|seller)[:\-]\s*(.+)", text, re.IGNORECASE)
        premium_match = re.search(r"(buyer\s+premium)[:\-]\s*([0-9.]+%?)", text, re.IGNORECASE)
        quantity_match = re.search(r"quantity[:\-]\s*([0-9]+)", text, re.IGNORECASE)

        parsed = {
            "title": _normalize_text(title_match.group(1)) if title_match else None,
            "current_bid": _parse_float(bid_match.group(2)) if bid_match else None,
            "auction_end": _normalize_text(auction_end_match.group(2)) if auction_end_match else None,
            "location": _normalize_text(location_match.group(1)) if location_match else None,
            "seller_agency": _normalize_text(agency_match.group(2)) if agency_match else None,
            "description": _normalize_text(text[:8000]),
            "buyer_premium_pct": _parse_float(premium_match.group(2)) if premium_match else None,
            "quantity": _parse_float(quantity_match.group(1)) if quantity_match else None,
        }
        if parsed["buyer_premium_pct"] is not None and parsed["buyer_premium_pct"] > 1:
            parsed["buyer_premium_pct"] = parsed["buyer_premium_pct"] / 100.0

        result = ScrapeResult(
            ok=False,
            status="needs_review",
            source_url=source_url,
            listing_id=identity["listing_id"],
            account_id=identity["account_id"],
            item_id=identity["item_id"],
            parsed_fields=parsed,
            missing_fields=[],
            raw_text=text[:16000],
            error=None,
        )
        return validate_import_result(result)

    def _extract_from_html(self, source_url: str, html: str) -> ScrapeResult:
        identity = _extract_identity(source_url, html)
        soup = BeautifulSoup(html, "html.parser")
        title = _normalize_text(
            soup.select_one("h1").get_text(" ", strip=True) if soup.select_one("h1") else None
        )
        text = soup.get_text("\n", strip=True)
        bid_match = re.search(
            r"current\s+bid[^0-9]*([0-9,]+(?:\.[0-9]+)?)",
            text,
            re.IGNORECASE,
        )
        premium_match = re.search(r"buyer\s+premium[^0-9]*([0-9.]+%?)", text, re.IGNORECASE)
        end_match = re.search(r"(auction\s+end|end\s+date)[^A-Za-z0-9]*([^\n]+)", text, re.IGNORECASE)
        location_match = re.search(r"location[^A-Za-z0-9]*([^\n]+)", text, re.IGNORECASE)
        agency_match = re.search(r"(seller|agency)[^A-Za-z0-9]*([^\n]+)", text, re.IGNORECASE)
        qty_match = re.search(r"quantity[^0-9]*([0-9]+)", text, re.IGNORECASE)

        parsed = {
            "title": title,
            "current_bid": _parse_float(bid_match.group(1)) if bid_match else None,
            "auction_end": _normalize_text(end_match.group(2)) if end_match else None,
            "location": _normalize_text(location_match.group(1)) if location_match else None,
            "seller_agency": _normalize_text(agency_match.group(2)) if agency_match else None,
            "description": _normalize_text(text[:8000]),
            "buyer_premium_pct": _parse_float(premium_match.group(1)) if premium_match else None,
            "quantity": _parse_float(qty_match.group(1)) if qty_match else None,
        }
        if parsed["buyer_premium_pct"] is not None and parsed["buyer_premium_pct"] > 1:
            parsed["buyer_premium_pct"] = parsed["buyer_premium_pct"] / 100.0

        return ScrapeResult(
            ok=False,
            status="needs_review",
            source_url=source_url,
            listing_id=identity["listing_id"],
            account_id=identity["account_id"],
            item_id=identity["item_id"],
            parsed_fields=parsed,
            missing_fields=[],
            raw_text=text[:16000],
            error=None,
        )


class InMemoryPipelineStore:
    def __init__(self):
        self._items: Dict[str, ScrapeResult] = {}
        self._feed_subscribers: List[asyncio.Queue[FeedMessage]] = []

    def save_or_review(self, item: ScrapeResult) -> ScrapeResult:
        key = item.listing_id or f"review:{len(self._items)+1}"
        self._items[key] = item
        return item

    def all_items(self) -> List[ScrapeResult]:
        return list(self._items.values())

    async def publish(self, message: FeedMessage) -> None:
        stale: List[asyncio.Queue[FeedMessage]] = []
        for queue in self._feed_subscribers:
            try:
                queue.put_nowait(message)
            except Exception:
                stale.append(queue)
        for queue in stale:
            if queue in self._feed_subscribers:
                self._feed_subscribers.remove(queue)

    def register_subscriber(self) -> asyncio.Queue[FeedMessage]:
        queue: asyncio.Queue[FeedMessage] = asyncio.Queue(maxsize=100)
        self._feed_subscribers.append(queue)
        return queue

    def unregister_subscriber(self, queue: asyncio.Queue[FeedMessage]) -> None:
        if queue in self._feed_subscribers:
            self._feed_subscribers.remove(queue)


async def spider_discovery(start_urls: List[str]) -> List[SpiderItem]:
    if not start_urls:
        return []
    _ = GovDealsSpider(start_urls=start_urls)
    discovered: List[SpiderItem] = []
    for url in start_urls:
        normalized = normalize_spider_item(
            {
                "source": "govdeals",
                "source_url": url,
                "title": None,
            }
        )
        discovered.append(normalized)
    return discovered


_FETCHER = GovDealsFetcher()
_STORE = InMemoryPipelineStore()


def scrape_url(url: str) -> ScrapeResult:
    result = asyncio.run(_FETCHER.scrape_url(url))
    return save_or_review(result)


def parse_pasted_text(text: str, source_url: Optional[str] = None) -> ScrapeResult:
    result = _FETCHER.parse_pasted_text(text, source_url)
    return save_or_review(result)


def run_spider_discovery(start_urls: List[str]) -> List[SpiderItem]:
    return asyncio.run(spider_discovery(start_urls))


def save_or_review(item: ScrapeResult) -> ScrapeResult:
    validated = validate_import_result(item)
    _STORE.save_or_review(validated)
    return validated
