import { useEffect, useMemo, useState } from "react";
import {
  analyzeAuction,
  createManualAuction,
  deleteAuction,
  fetchAuctions,
  fetchPollerStatus,
  startPoller,
  updateAuction,
} from "../api";
import type {
  AuctionAnalysisResponse,
  AuctionRecord,
  AuctionUpsertPayload,
  AuctionVerdict,
  PollerStatusResponse,
} from "../types";

interface AuctionOpsPanelProps {
  mode: "live" | "admin";
}

const REFRESH_MS = 45_000;

const emptyForm = (): AuctionUpsertPayload => ({
  title: "",
  bid_amount: null,
  bid_increment: null,
  end_time: null,
  seller_name: null,
  seller_location: null,
  auction_url: "",
  category: "other",
  tags: [],
  notes: null,
  verdict: "neutral",
});

const toNumberOrNull = (value: string): number | null => {
  if (!value.trim()) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : null;
};

const toDateInput = (value: string | null): string => {
  if (!value) {
    return "";
  }
  const ts = Date.parse(value);
  if (!Number.isFinite(ts)) {
    return "";
  }
  return new Date(ts).toISOString().slice(0, 16);
};

const formatMoney = (value: number | null): string => (value === null ? "N/A" : `$${value.toFixed(2)}`);

const formatTimeLeft = (seconds: number | null): string => {
  if (seconds === null) {
    return "N/A";
  }
  const mins = Math.max(0, Math.floor(seconds / 60));
  if (mins < 60) {
    return `${mins}m`;
  }
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  return `${hours}h ${remMins}m`;
};

function AuctionOpsPanel({ mode }: AuctionOpsPanelProps) {
  const [auctions, setAuctions] = useState<AuctionRecord[]>([]);
  const [pollerStatus, setPollerStatus] = useState<PollerStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<AuctionUpsertPayload>(emptyForm());
  const [analysisByAuctionId, setAnalysisByAuctionId] = useState<Record<string, AuctionAnalysisResponse["analysis"]>>(
    {}
  );

  const loadData = async (): Promise<void> => {
    const [auctionsResult, pollerResult] = await Promise.allSettled([fetchAuctions(), fetchPollerStatus()]);
    if (auctionsResult.status === "fulfilled") {
      setAuctions(auctionsResult.value);
      setError(null);
    } else {
      setError(
        auctionsResult.reason instanceof Error
          ? auctionsResult.reason.message
          : "Failed to load auctions"
      );
    }
    if (pollerResult.status === "fulfilled") {
      setPollerStatus(pollerResult.value);
    }
    setLoading(false);
  };

  useEffect(() => {
    void loadData();
    const intervalId = window.setInterval(() => {
      void loadData();
    }, REFRESH_MS);
    return () => window.clearInterval(intervalId);
  }, []);

  const feedStateLabel = useMemo(() => {
    if (!pollerStatus) {
      return "Unknown";
    }
    if (pollerStatus.running && pollerStatus.poll_count >= 1) {
      return "Live";
    }
    if (pollerStatus.running) {
      return "Initializing";
    }
    return "Not Live";
  }, [pollerStatus]);

  const upsertForm = (
    key: keyof AuctionUpsertPayload,
    value: AuctionUpsertPayload[keyof AuctionUpsertPayload]
  ): void => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleCreate = async (): Promise<void> => {
    setBusyId("create");
    try {
      await createManualAuction(form);
      setForm(emptyForm());
      await loadData();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Failed to create auction");
    } finally {
      setBusyId(null);
    }
  };

  const handleAnalyze = async (auctionId: string): Promise<void> => {
    setBusyId(`analyze-${auctionId}`);
    try {
      const result = await analyzeAuction(auctionId);
      setAnalysisByAuctionId((prev) => ({ ...prev, [auctionId]: result.analysis }));
    } catch (analyzeError) {
      setError(analyzeError instanceof Error ? analyzeError.message : "AI analysis failed");
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (auctionId: string): Promise<void> => {
    setBusyId(`delete-${auctionId}`);
    try {
      await deleteAuction(auctionId);
      await loadData();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Delete failed");
    } finally {
      setBusyId(null);
    }
  };

  const handleSaveEdit = async (auction: AuctionRecord): Promise<void> => {
    setBusyId(`edit-${auction.id}`);
    try {
      await updateAuction(auction.id, {
        title: auction.title,
        bid_amount: auction.bid_amount,
        bid_increment: auction.bid_increment,
        end_time: auction.end_time,
        seller_name: auction.seller_name,
        seller_location: auction.seller_location,
        auction_url: auction.auction_url,
        tags: auction.tags,
        notes: auction.notes,
        verdict: auction.verdict,
      });
      setEditingId(null);
      await loadData();
    } catch (editError) {
      setError(editError instanceof Error ? editError.message : "Update failed");
    } finally {
      setBusyId(null);
    }
  };

  const updateAuctionRow = <K extends keyof AuctionRecord>(
    auctionId: string,
    key: K,
    value: AuctionRecord[K]
  ): void => {
    setAuctions((prev) =>
      prev.map((item) => (item.id === auctionId ? { ...item, [key]: value } : item))
    );
  };

  return (
    <section className="panel">
      <h2 className="page-title">{mode === "live" ? "Live Feed" : "Manual Input / Admin"}</h2>
      <div className="opportunities-feed-state-row">
        <span className={`risk-chip ${feedStateLabel === "Live" ? "info" : "warning"}`}>
          Feed freshness: {feedStateLabel}
        </span>
        {pollerStatus ? (
          <span className="muted">
            Poller {pollerStatus.running ? "running" : "stopped"} · polls {pollerStatus.poll_count}
          </span>
        ) : null}
        <button
          type="button"
          className="secondary-button"
          onClick={() => void loadData()}
          disabled={busyId === "refresh"}
        >
          Refresh
        </button>
        <button
          type="button"
          className="ghost-button"
          onClick={() => {
            void startPoller()
              .then((status) => {
                setPollerStatus(status);
                setError(null);
              })
              .catch((pollerError) => {
                setError(
                  pollerError instanceof Error ? pollerError.message : "Unable to start poller"
                );
              });
          }}
        >
          Start Poller
        </button>
      </div>

      {mode === "admin" ? (
        <div className="form-grid-two">
          <label>
            Title
            <input value={form.title} onChange={(event) => upsertForm("title", event.target.value)} />
          </label>
          <label>
            Auction URL
            <input
              value={form.auction_url}
              placeholder="https://www.govdeals.com/..."
              onChange={(event) => upsertForm("auction_url", event.target.value)}
            />
          </label>
          <label>
            Current Bid
            <input
              type="number"
              step="0.01"
              value={form.bid_amount ?? ""}
              onChange={(event) => upsertForm("bid_amount", toNumberOrNull(event.target.value))}
            />
          </label>
          <label>
            Bid Increment
            <input
              type="number"
              step="0.01"
              value={form.bid_increment ?? ""}
              onChange={(event) => upsertForm("bid_increment", toNumberOrNull(event.target.value))}
            />
          </label>
          <label>
            End Time
            <input
              type="datetime-local"
              value={toDateInput(form.end_time)}
              onChange={(event) =>
                upsertForm("end_time", event.target.value ? new Date(event.target.value).toISOString() : null)
              }
            />
          </label>
          <label>
            Seller Name
            <input
              value={form.seller_name ?? ""}
              onChange={(event) => upsertForm("seller_name", event.target.value || null)}
            />
          </label>
          <label>
            Seller Location
            <input
              value={form.seller_location ?? ""}
              onChange={(event) => upsertForm("seller_location", event.target.value || null)}
            />
          </label>
          <label>
            Verdict
            <select
              value={form.verdict}
              onChange={(event) => upsertForm("verdict", event.target.value as AuctionVerdict)}
            >
              <option value="neutral">neutral</option>
              <option value="good">good</option>
              <option value="bad">bad</option>
            </select>
          </label>
          <label className="span-two">
            Tags (comma separated)
            <input
              value={form.tags.join(", ")}
              onChange={(event) =>
                upsertForm(
                  "tags",
                  event.target.value
                    .split(",")
                    .map((item) => item.trim())
                    .filter((item) => item.length > 0)
                )
              }
            />
          </label>
          <label className="span-two">
            Notes
            <textarea
              rows={2}
              value={form.notes ?? ""}
              onChange={(event) => upsertForm("notes", event.target.value || null)}
            />
          </label>
          <div className="entry-actions span-two">
            <button type="button" className="primary-button" onClick={() => void handleCreate()}>
              {busyId === "create" ? "Saving..." : "Add Manual Auction"}
            </button>
          </div>
        </div>
      ) : null}

      {loading ? <p>Loading auctions...</p> : null}
      {error ? <p className="error-banner">{error}</p> : null}
      {!loading && auctions.length === 0 ? <p>No auctions yet. Start poller or add manual entries.</p> : null}

      <div className="scanner-opportunity-list">
        {auctions.map((auction) => {
          const editing = editingId === auction.id;
          const analysis = analysisByAuctionId[auction.id];
          return (
            <article key={auction.id} className="opportunity-card">
              <div className="opportunity-header-row">
                {editing ? (
                  <input
                    value={auction.title ?? ""}
                    onChange={(event) => updateAuctionRow(auction.id, "title", event.target.value)}
                  />
                ) : (
                  <h4>{auction.title ?? "Untitled Auction"}</h4>
                )}
                <span className="urgency-indicator">{formatTimeLeft(auction.time_left_seconds)}</span>
              </div>
              <p className="muted">
                {editing ? (
                  <input
                    value={auction.seller_name ?? ""}
                    onChange={(event) => updateAuctionRow(auction.id, "seller_name", event.target.value)}
                  />
                ) : (
                  `${auction.seller_name ?? "Unknown seller"} · ${auction.seller_location ?? "Unknown location"}`
                )}
              </p>
              <div className="opportunity-metric-grid">
                <div>
                  <span>Current Bid</span>
                  {editing ? (
                    <input
                      type="number"
                      step="0.01"
                      value={auction.bid_amount ?? ""}
                      onChange={(event) =>
                        updateAuctionRow(auction.id, "bid_amount", toNumberOrNull(event.target.value))
                      }
                    />
                  ) : (
                    <strong>{formatMoney(auction.bid_amount)}</strong>
                  )}
                </div>
                <div>
                  <span>Bid Increment</span>
                  {editing ? (
                    <input
                      type="number"
                      step="0.01"
                      value={auction.bid_increment ?? ""}
                      onChange={(event) =>
                        updateAuctionRow(auction.id, "bid_increment", toNumberOrNull(event.target.value))
                      }
                    />
                  ) : (
                    <strong>{formatMoney(auction.bid_increment)}</strong>
                  )}
                </div>
                <div>
                  <span>Verdict</span>
                  {editing ? (
                    <select
                      value={auction.verdict}
                      onChange={(event) =>
                        updateAuctionRow(auction.id, "verdict", event.target.value as AuctionVerdict)
                      }
                    >
                      <option value="neutral">neutral</option>
                      <option value="good">good</option>
                      <option value="bad">bad</option>
                    </select>
                  ) : (
                    <strong>{auction.verdict}</strong>
                  )}
                </div>
              </div>
              <div className="form-grid-two">
                <label>
                  Seller Location
                  {editing ? (
                    <input
                      value={auction.seller_location ?? ""}
                      onChange={(event) =>
                        updateAuctionRow(auction.id, "seller_location", event.target.value || null)
                      }
                    />
                  ) : (
                    <strong>{auction.seller_location ?? "N/A"}</strong>
                  )}
                </label>
                <label>
                  Auction URL
                  {editing ? (
                    <input
                      value={auction.auction_url ?? ""}
                      onChange={(event) =>
                        updateAuctionRow(auction.id, "auction_url", event.target.value || null)
                      }
                    />
                  ) : (
                    <strong>{auction.auction_url ?? "N/A"}</strong>
                  )}
                </label>
                <label className="span-two">
                  Tags (comma separated)
                  {editing ? (
                    <input
                      value={auction.tags.join(", ")}
                      onChange={(event) =>
                        updateAuctionRow(
                          auction.id,
                          "tags",
                          event.target.value
                            .split(",")
                            .map((item) => item.trim())
                            .filter((item) => item.length > 0)
                        )
                      }
                    />
                  ) : (
                    <strong>{auction.tags.length > 0 ? auction.tags.join(", ") : "none"}</strong>
                  )}
                </label>
                <label className="span-two">
                  Notes
                  {editing ? (
                    <textarea
                      rows={2}
                      value={auction.notes ?? ""}
                      onChange={(event) => updateAuctionRow(auction.id, "notes", event.target.value || null)}
                    />
                  ) : (
                    <strong>{auction.notes ?? "none"}</strong>
                  )}
                </label>
              </div>
              {auction.auction_url ? (
                <a href={auction.auction_url} target="_blank" rel="noreferrer">
                  Open GovDeals listing
                </a>
              ) : null}
              <div className="entry-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => void handleAnalyze(auction.id)}
                  disabled={busyId === `analyze-${auction.id}`}
                >
                  {busyId === `analyze-${auction.id}` ? "Analyzing..." : "Analyze with AI"}
                </button>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => setEditingId(editing ? null : auction.id)}
                >
                  {editing ? "Cancel Edit" : "Edit"}
                </button>
                {editing ? (
                  <button
                    type="button"
                    className="primary-button"
                    onClick={() => void handleSaveEdit(auction)}
                    disabled={busyId === `edit-${auction.id}`}
                  >
                    Save
                  </button>
                ) : null}
                {mode === "admin" ? (
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => void handleDelete(auction.id)}
                    disabled={busyId === `delete-${auction.id}`}
                  >
                    Delete
                  </button>
                ) : null}
              </div>
              {analysis ? (
                <div className="preview-box">
                  <p>
                    <strong>AI Summary:</strong> {analysis.summary}
                  </p>
                  <p>
                    <strong>Suggested action:</strong> {analysis.suggested_action} · <strong>Risk:</strong>{" "}
                    {analysis.risk_level}
                  </p>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}

export default AuctionOpsPanel;
