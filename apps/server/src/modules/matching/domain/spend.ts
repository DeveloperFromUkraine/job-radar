// Spend rules (ADR-0006, spec AC-12, AC-19): the largest possible cost of an attempt, its settled cost,
// the cap check and the calendar month in the machine's time zone. Money is integer millionths of a
// dollar ("micros"); a price in dollars per million tokens times tokens is exactly micros. Pure.

/** Dollars per million tokens. */
export interface Price {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
}

export interface Usage {
  inputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  outputTokens: number;
}

export const usdToMicros = (usd: number): number => Math.round(usd * 1_000_000);
export const centsToMicros = (cents: number): number => cents * 10_000;
/** Spend is shown rounded up, so the screen never shows less than the ledger holds. */
export const toCentsUp = (micros: number): number => Math.ceil(micros / 10_000);

/**
 * An upper bound, not an estimate: every request byte counted as one input token (no byte-level
 * tokenizer exceeds that) at the cache-write rate, the highest input rate, plus the output limit.
 */
export function maxCostMicros(requestBytes: number, outputLimit: number, price: Price): number {
  return Math.ceil(requestBytes * price.cacheWrite + outputLimit * price.output);
}

export function settledCostMicros(u: Usage, price: Price): number {
  return Math.ceil(
    u.inputTokens * price.input +
      u.cacheWriteTokens * price.cacheWrite +
      u.cacheReadTokens * price.cacheRead +
      u.outputTokens * price.output,
  );
}

/** `spent` already holds this month's settled costs and open reservations. */
export function fits(a: { spent: number; cost: number; cap: number }): boolean {
  return a.spent + a.cost <= a.cap;
}

// ---- The calendar month in the machine's time zone ---------------------------------------------

/** The owner's calendar day (YYYY-MM-DD) at `at`, as tracking's grace day reads it. */
const ownerDay = (at: number, timeZone: string): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    at,
  );

/** The UTC offset of `timeZone` at `at`, in milliseconds (e.g. +2 h in Warsaw in summer). */
function offsetMs(at: number, timeZone: string): number {
  const n: Record<string, number> = {};
  for (const p of new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at)) {
    n[p.type] = Number(p.value);
  }
  const asUtc = Date.UTC(
    n.year ?? 0,
    (n.month ?? 1) - 1,
    n.day ?? 1,
    n.hour ?? 0,
    n.minute ?? 0,
    n.second ?? 0,
  );
  return asUtc - Math.floor(at / 1000) * 1000;
}

/** The instant local midnight starts `day` (YYYY-MM-DD) in `timeZone`. */
function midnight(day: string, timeZone: string): number {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  const guess = Date.UTC(y, m - 1, d);
  const first = guess - offsetMs(guess, timeZone);
  return guess - offsetMs(first, timeZone); // re-check across a DST change
}

export interface MonthWindow {
  start: number;
  end: number;
  /** The first day of the next month (YYYY-MM-DD), when a reached cap lifts. */
  resumesOn: string;
}

export function monthWindow(now: number, timeZone: string): MonthWindow {
  const [y, m] = ownerDay(now, timeZone).split("-").map(Number) as [number, number];
  const firstOfMonth = `${y}-${String(m).padStart(2, "0")}-01`;
  const resumesOn = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  return { start: midnight(firstOfMonth, timeZone), end: midnight(resumesOn, timeZone), resumesOn };
}
