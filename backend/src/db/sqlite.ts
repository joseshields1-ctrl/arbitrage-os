import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const configuredDbPath = process.env.SQLITE_DB_PATH?.trim();
const dbPath = configuredDbPath
  ? path.resolve(configuredDbPath)
  : path.resolve(process.cwd(), "data", "arbitrage-os.db");
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

export const db = new Database(dbPath);

export const initializeDatabase = (): void => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS deals (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      category TEXT NOT NULL,
      seller_type TEXT NOT NULL DEFAULT 'unknown',
      source_platform TEXT NOT NULL,
      acquisition_state TEXT NOT NULL,
      status TEXT NOT NULL,
      stage_updated_at TEXT NOT NULL,
      discovered_date TEXT,
      purchase_date TEXT,
      listing_date TEXT,
      sale_date TEXT,
      completion_date TEXT,
      quantity_purchased INTEGER,
      quantity_broken INTEGER,
      unit_count INTEGER
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS financials (
      deal_id TEXT PRIMARY KEY,
      acquisition_cost REAL NOT NULL,
      buyer_premium_pct REAL,
      buyer_premium_overridden INTEGER NOT NULL DEFAULT 0,
      tax_rate REAL,
      tax REAL,
      transport_cost_actual REAL,
      transport_cost_estimated REAL,
      repair_cost REAL,
      prep_cost REAL,
      estimated_market_value REAL NOT NULL,
      sale_price_actual REAL,
      projected_profit REAL NOT NULL,
      realized_profit REAL,
      FOREIGN KEY (deal_id) REFERENCES deals(id) ON DELETE CASCADE
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS metadata (
      deal_id TEXT PRIMARY KEY,
      condition_grade TEXT NOT NULL,
      condition_notes TEXT NOT NULL,
      transport_type TEXT NOT NULL,
      presentation_quality TEXT NOT NULL,
      removal_deadline TEXT,
      title_status TEXT NOT NULL DEFAULT 'unknown',
      FOREIGN KEY (deal_id) REFERENCES deals(id) ON DELETE CASCADE
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS operator_decisions (
      id TEXT PRIMARY KEY,
      deal_id TEXT NOT NULL,
      decision TEXT NOT NULL,
      reason TEXT NOT NULL,
      decided_at TEXT NOT NULL,
      ai_recommendation_snapshot TEXT NOT NULL,
      FOREIGN KEY (deal_id) REFERENCES deals(id) ON DELETE CASCADE
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS opportunities (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      listing_url TEXT NOT NULL,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      current_bid REAL NOT NULL,
      auction_end TEXT NOT NULL,
      location TEXT NOT NULL,
      seller_agency TEXT NOT NULL,
      seller_type TEXT NOT NULL,
      buyer_premium_pct REAL NOT NULL,
      removal_window_days INTEGER NOT NULL,
      title_status TEXT NOT NULL,
      relisted INTEGER NOT NULL DEFAULT 0,
      condition_raw TEXT NOT NULL,
      estimated_resale_value REAL NOT NULL,
      estimated_repair_cost REAL NOT NULL,
      quantity_purchased INTEGER,
      quantity_broken INTEGER,
      status TEXT NOT NULL,
      interest TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS opportunity_decisions (
      id TEXT PRIMARY KEY,
      opportunity_id TEXT NOT NULL,
      action TEXT NOT NULL,
      reason TEXT,
      note TEXT,
      decided_at TEXT NOT NULL,
      opportunity_snapshot TEXT NOT NULL,
      FOREIGN KEY (opportunity_id) REFERENCES opportunities(id) ON DELETE CASCADE
    );
  `);

  // Migration-safe additions for optional unit breakdown support.
  const dealColumns = db.prepare(`PRAGMA table_info(deals)`).all() as Array<{
    name: string;
  }>;
  const hasUnitBreakdown = dealColumns.some((column) => column.name === "unit_breakdown");
  if (!hasUnitBreakdown) {
    db.exec(`ALTER TABLE deals ADD COLUMN unit_breakdown TEXT;`);
  }

  const hasPrepMetrics = dealColumns.some((column) => column.name === "prep_metrics");
  if (!hasPrepMetrics) {
    db.exec(`ALTER TABLE deals ADD COLUMN prep_metrics TEXT;`);
  }

  const hasUnitCount = dealColumns.some((column) => column.name === "unit_count");
  if (!hasUnitCount) {
    db.exec(`ALTER TABLE deals ADD COLUMN unit_count INTEGER;`);
  }
  const hasQuantityPurchased = dealColumns.some((column) => column.name === "quantity_purchased");
  if (!hasQuantityPurchased) {
    db.exec(`ALTER TABLE deals ADD COLUMN quantity_purchased INTEGER;`);
  }
  const hasQuantityBroken = dealColumns.some((column) => column.name === "quantity_broken");
  if (!hasQuantityBroken) {
    db.exec(`ALTER TABLE deals ADD COLUMN quantity_broken INTEGER;`);
  }
  const hasSellerType = dealColumns.some((column) => column.name === "seller_type");
  if (!hasSellerType) {
    db.exec(`ALTER TABLE deals ADD COLUMN seller_type TEXT NOT NULL DEFAULT 'unknown';`);
  }

  const financialColumns = db.prepare(`PRAGMA table_info(financials)`).all() as Array<{
    name: string;
  }>;
  const hasBuyerPremiumOverridden = financialColumns.some(
    (column) => column.name === "buyer_premium_overridden"
  );
  if (!hasBuyerPremiumOverridden) {
    db.exec(`ALTER TABLE financials ADD COLUMN buyer_premium_overridden INTEGER NOT NULL DEFAULT 0;`);
  }
  const hasSalePriceActual = financialColumns.some((column) => column.name === "sale_price_actual");
  if (!hasSalePriceActual) {
    db.exec(`ALTER TABLE financials ADD COLUMN sale_price_actual REAL;`);
  }
  const hasTaxRate = financialColumns.some((column) => column.name === "tax_rate");
  if (!hasTaxRate) {
    db.exec(`ALTER TABLE financials ADD COLUMN tax_rate REAL;`);
  }
  const hasTax = financialColumns.some((column) => column.name === "tax");
  if (!hasTax) {
    db.exec(`ALTER TABLE financials ADD COLUMN tax REAL;`);
  }

  const metadataColumns = db.prepare(`PRAGMA table_info(metadata)`).all() as Array<{
    name: string;
  }>;
  const hasRemovalDeadline = metadataColumns.some((column) => column.name === "removal_deadline");
  if (!hasRemovalDeadline) {
    db.exec(`ALTER TABLE metadata ADD COLUMN removal_deadline TEXT;`);
  }
  const hasTitleStatus = metadataColumns.some((column) => column.name === "title_status");
  if (!hasTitleStatus) {
    db.exec(`ALTER TABLE metadata ADD COLUMN title_status TEXT NOT NULL DEFAULT 'unknown';`);
  }
};
