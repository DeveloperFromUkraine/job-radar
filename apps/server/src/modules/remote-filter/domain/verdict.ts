// One posting's verdict from the statements of its open listings (spec AC-03): "Anywhere" set aside when
// another listing states anything, then the best verdict wins — fits > check > not open — with one reason.
import { type ListingVerdict, type LocationCheck, listingVerdict } from "./statement.js";

const REASON_PRIORITY: LocationCheck[] = ["exception", "hours_only", "not_recognised", "not_stated"];

// isStatedAnywhere is the collector's rule (ADR-0002 layering): injected by app/verdicts.ts.
export function postingVerdict(
  statements: Array<string | null>,
  country: string,
  date: Date,
  isStatedAnywhere: (statement: string | null) => boolean,
  /** One listing's verdict; app/verdicts.ts passes a per-call cache keyed by statement text. */
  readListing: (statement: string | null) => ListingVerdict = (s) => listingVerdict(s, country, date),
): ListingVerdict {
  const statesSomething = statements.some((s) => s !== null && s.trim() !== "" && !isStatedAnywhere(s));
  const read = statesSomething ? statements.filter((s) => !isStatedAnywhere(s)) : statements;
  const verdicts = read.map(readListing);
  if (verdicts.some((v) => v.kind === "fits")) return { kind: "fits" };
  const reasons = verdicts.flatMap((v) => (v.kind === "check" ? [v.reason] : []));
  if (reasons.length)
    return { kind: "check", reason: REASON_PRIORITY.find((r) => reasons.includes(r)) as LocationCheck };
  // No open listing left is never asked by search; answer check, never a hide.
  return verdicts.length ? { kind: "not_open" } : { kind: "check", reason: "not_stated" };
}
