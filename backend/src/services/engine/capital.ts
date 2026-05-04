import { db } from "../../db/sqlite";

export const CAPITAL_POOL_USD = 100_000;

export class LiquidityCriticalError extends Error {
  readonly code = "LIQUIDITY_CRITICAL";
  readonly details: Record<string, unknown>;

  constructor(message: string, details: Record<string, unknown>) {
    super(message);
    this.details = details;
  }
}

const roundCurrency = (value: number): number =>
  Math.round((value + Number.EPSILON) * 100) / 100;

const toNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export interface LiquiditySnapshot {
  capital_pool: number;
  reserved_capital: number;
  acquired_capital: number;
  available_liquidity: number;
}

export const getAvailableLiquidity = (): LiquiditySnapshot => {
  const reservedRow = db
    .prepare(
      `SELECT COALESCE(SUM(reserved_capital), 0) AS reserved_total
       FROM deals`
    )
    .get() as { reserved_total?: unknown };

  const acquiredRow = db
    .prepare(
      `SELECT COALESCE(SUM(f.acquisition_cost), 0) AS acquired_total
       FROM deals d
       JOIN financials f ON f.deal_id = d.id
       WHERE d.status IN ('acquired', 'prep', 'listed', 'sold', 'completed')`
    )
    .get() as { acquired_total?: unknown };

  const reservedCapital = Math.max(0, roundCurrency(toNumber(reservedRow.reserved_total)));
  const acquiredCapital = Math.max(0, roundCurrency(toNumber(acquiredRow.acquired_total)));
  const availableLiquidity = roundCurrency(
    Math.max(0, CAPITAL_POOL_USD - reservedCapital - acquiredCapital)
  );

  return {
    capital_pool: CAPITAL_POOL_USD,
    reserved_capital: reservedCapital,
    acquired_capital: acquiredCapital,
    available_liquidity: availableLiquidity,
  };
};

export const assertLiquidityAvailable = (requiredCapital: number): LiquiditySnapshot => {
  const required = roundCurrency(Math.max(0, Number(requiredCapital) || 0));
  const snapshot = getAvailableLiquidity();
  if (snapshot.available_liquidity < required) {
    throw new LiquidityCriticalError("Insufficient available liquidity for scheduled bid.", {
      required_capital: required,
      available_liquidity: snapshot.available_liquidity,
      capital_pool: snapshot.capital_pool,
      reserved_capital: snapshot.reserved_capital,
      acquired_capital: snapshot.acquired_capital,
    });
  }
  return snapshot;
};

