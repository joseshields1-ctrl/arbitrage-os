import { useMemo, useState } from "react";
import type {
  DealView,
  ReconCategory,
  ReconditioningEntry,
  ReconditioningRecord,
  ReconPaidBy,
  ReconStatus,
} from "../types";
import {
  computeReconditioningSummary,
  computeTimeDiscipline,
  createEmptyReconditioningRecord,
} from "../utils/reconditioning";

interface ReconditioningPanelProps {
  deal: DealView;
  value: ReconditioningRecord;
  onChange: (dealId: string, record: ReconditioningRecord) => void;
}

interface DraftReconEntry {
  category: ReconCategory;
  description: string;
  cost: string;
  date: string;
  paid_by: ReconPaidBy;
}

const RECON_CATEGORIES: ReconCategory[] = [
  "Paint & Body",
  "Tires",
  "Rims",
  "Mechanical Repair",
  "Mechanical Maintenance",
  "Soft Detail",
  "Deep Detail",
  "Other",
];

const formatCurrency = (value: number): string => `$${value.toFixed(2)}`;

const clampCost = (value: string): number | null => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return Math.round(parsed * 100) / 100;
};

const ReconditioningPanel = ({ deal, value, onChange }: ReconditioningPanelProps) => {
  const record = value ?? createEmptyReconditioningRecord();
  const [draft, setDraft] = useState<DraftReconEntry>({
    category: "Mechanical Repair",
    description: "",
    cost: "",
    date: new Date().toISOString().slice(0, 10),
    paid_by: "buyer",
  });

  const summary = useMemo(() => computeReconditioningSummary(deal, record), [deal, record]);
  const discipline = useMemo(() => computeTimeDiscipline(deal, record), [deal, record]);

  const updateRecord = (next: ReconditioningRecord): void => {
    onChange(deal.deal.id, next);
  };

  const addEntry = (): void => {
    const cost = clampCost(draft.cost);
    if (cost === null || !draft.description.trim()) {
      return;
    }
    const entry: ReconditioningEntry = {
      id: crypto.randomUUID(),
      category: draft.category,
      description: draft.description.trim(),
      cost,
      date: draft.date ? `${draft.date}T00:00:00.000Z` : new Date().toISOString(),
      paid_by: draft.paid_by,
    };
    updateRecord({
      ...record,
      entries: [entry, ...record.entries],
      status: record.status === "not_started" ? "in_progress" : record.status,
    });
    setDraft((prev) => ({
      ...prev,
      description: "",
      cost: "",
    }));
  };

  const removeEntry = (entryId: string): void => {
    updateRecord({
      ...record,
      entries: record.entries.filter((entry) => entry.id !== entryId),
    });
  };

  const arrivalDateInput = record.arrival_date ? new Date(record.arrival_date).toISOString().slice(0, 10) : "";

  return (
    <section className="decision-section recon-panel">
      <h4>Vehicle Reconditioning</h4>
      <div className="recon-summary-grid">
        <div>
          <span>Total Recon Cost</span>
          <strong>{formatCurrency(summary.total_recon_cost)}</strong>
        </div>
        <div>
          <span>Status</span>
          <strong>{record.status.replace("_", " ")}</strong>
        </div>
        <div>
          <span>Profit After Recon</span>
          <strong>{formatCurrency(summary.profit_after_recon)}</strong>
        </div>
      </div>

      <div className="detail-panel-grid">
        <label>
          Arrival Date
          <input
            type="date"
            value={arrivalDateInput}
            onChange={(event) =>
              updateRecord({
                ...record,
                arrival_date: event.target.value ? `${event.target.value}T00:00:00.000Z` : null,
              })
            }
          />
        </label>
        <label>
          Extension
          <select
            value={record.extension_days}
            onChange={(event) =>
              updateRecord({
                ...record,
                extension_days: Number(event.target.value) === 14 ? 14 : 0,
              })
            }
          >
            <option value={0}>No extension</option>
            <option value={14}>14-day extension</option>
          </select>
        </label>
        <label>
          Recon Status
          <select
            value={record.status}
            onChange={(event) =>
              updateRecord({
                ...record,
                status: event.target.value as ReconStatus,
              })
            }
          >
            <option value="not_started">Not Started</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
          </select>
        </label>
      </div>

      {discipline.warning ? (
        <ul className="warning-flags">
          <li>{discipline.warning}</li>
        </ul>
      ) : null}

      <div className="manual-comp-editor">
        <h5>Add Recon Entry</h5>
        <div className="detail-panel-grid">
          <label>
            Category
            <select
              value={draft.category}
              onChange={(event) =>
                setDraft((prev) => ({
                  ...prev,
                  category: event.target.value as ReconCategory,
                }))
              }
            >
              {RECON_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>
          <label>
            Description
            <input
              value={draft.description}
              onChange={(event) =>
                setDraft((prev) => ({
                  ...prev,
                  description: event.target.value,
                }))
              }
            />
          </label>
          <label>
            Cost
            <input
              type="number"
              step="0.01"
              value={draft.cost}
              onChange={(event) =>
                setDraft((prev) => ({
                  ...prev,
                  cost: event.target.value,
                }))
              }
            />
          </label>
          <label>
            Date
            <input
              type="date"
              value={draft.date}
              onChange={(event) =>
                setDraft((prev) => ({
                  ...prev,
                  date: event.target.value,
                }))
              }
            />
          </label>
          <label>
            Paid By
            <select
              value={draft.paid_by}
              onChange={(event) =>
                setDraft((prev) => ({
                  ...prev,
                  paid_by: event.target.value as ReconPaidBy,
                }))
              }
            >
              <option value="buyer">buyer</option>
              <option value="seller">seller</option>
              <option value="split">split</option>
            </select>
          </label>
        </div>
        <div className="entry-actions">
          <button type="button" className="secondary-button" onClick={addEntry}>
            Add Recon Cost
          </button>
        </div>
      </div>

      {record.entries.length > 0 ? (
        <div className="manual-comp-list">
          <ul>
            {record.entries.map((entry) => (
              <li key={entry.id}>
                <strong>{entry.category}</strong> · {entry.description} · {formatCurrency(entry.cost)} ·{" "}
                {new Date(entry.date).toLocaleDateString()} · {entry.paid_by}
                <button type="button" className="link-button" onClick={() => removeEntry(entry.id)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="section-subtitle">No recon entries yet.</p>
      )}
    </section>
  );
};

export default ReconditioningPanel;
