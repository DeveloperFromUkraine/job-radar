import type { FetchResult } from "../../domain/adapter.js";
import type { SourceId } from "../../domain/sources.js";
import type { HttpResult, SourceHttp } from "../http.js";

export interface FetchContext {
  http: SourceHttp;
  now: number;
}

export interface SourceAdapter {
  id: SourceId;
  /** The regular read: the newest listings within the source's read budget. */
  fetchLatest(ctx: FetchContext): Promise<FetchResult>;
  /** The next older page, for sources that can page back in time (first fill). */
  fetchOlder?(ctx: FetchContext, cursor: string): Promise<FetchResult>;
}

/** The FetchResult for a request that did not return a usable body. */
export function notOk(result: Exclude<HttpResult, { kind: "ok" }>): FetchResult {
  return result.kind === "limited"
    ? // Nothing was asked of the source: not "zero items", so never silent (AC-13, sad §8).
      { completeness: "partial", listings: [], itemsReturned: null, coversPublishedAfter: null }
    : {
        completeness: "failed",
        listings: [],
        itemsReturned: 0,
        coversPublishedAfter: null,
        failure: result.failure,
      };
}

export function unreadable(detail: string): FetchResult {
  return {
    completeness: "failed",
    listings: [],
    itemsReturned: 0,
    coversPublishedAfter: null,
    failure: { code: "unreadable", detail },
  };
}

export const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const PERIODS: Record<string, string> = { annual: "year", yearly: "year", monthly: "month", hourly: "hour" };

/**
 * A board's structured pay (min/max, currency, period) as one text a person would read, e.g.
 * "USD 60000–80000 per year"; no amount → "" (realness-score ADR-0004: the collector keeps it as stated).
 */
export function payText(min: unknown, max: unknown, currency: unknown, period?: unknown): string {
  const amounts = [min, max].filter((v): v is number => typeof v === "number" && Number.isFinite(v) && v > 0);
  if (amounts.length === 0) return "";
  const range = amounts[0] === amounts[1] ? `${amounts[0]}` : amounts.join("–");
  const parts = [typeof currency === "string" && currency !== "" ? currency : null, range];
  if (typeof period === "string" && period !== "") parts.push(`per ${PERIODS[period] ?? period}`);
  return parts.filter(Boolean).join(" ");
}
