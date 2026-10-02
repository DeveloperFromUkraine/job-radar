// Source health flags (AC-13, AC-14, AC-24, AC-25) with plain-language reasons. Stored flags are
// evaluated in finalize; overdue can rise without any run, so it is computed when health is read.
import type { Completeness, FailureCode } from "./adapter.js";

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

export type StoredFlagKind = "failing" | "silent" | "held_back" | "unknown_location" | "category_unmatched";
export type FlagKind = StoredFlagKind | "overdue";

export interface OutcomeRow {
  outcome: Completeness | "pending";
  itemsReturned: number | null;
  newListings: number;
  unknownLocationNew: number;
  failureReason: string | null;
  startedAt: number;
}

export interface FlagInput {
  now: number;
  firstSuccessAt: number | null;
  /** This source's due-run outcomes, newest first; the first one is the run being finalized. */
  recentOutcomes: OutcomeRow[];
  currentFlags: StoredFlagKind[];
  /** Closures held back in this run, with the source's open postings (AC-14); null when none. */
  held: { held: number; open: number } | null;
  ownerCategories: string[];
  /** The source's published category list, or null when it publishes none. */
  publishedCategories: string[] | null;
  categoriesMatchedLast7Days: string[];
}

export interface FlagDraft {
  kind: StoredFlagKind;
  reason: string;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const isSuccess = (o: OutcomeRow) =>
  o.outcome === "complete" || o.outcome === "capped" || o.outcome === "partial";

export function evaluateFlags(input: FlagInput): { raised: FlagDraft[]; cleared: StoredFlagKind[] } {
  const raised: FlagDraft[] = [];
  const cleared: StoredFlagKind[] = [];
  const settle = (kind: StoredFlagKind, reason: string | null, clears: boolean) => {
    if (reason !== null) raised.push({ kind, reason });
    else if (clears && input.currentFlags.includes(kind)) cleared.push(kind);
  };

  const runs = input.recentOutcomes.filter((o) => o.outcome !== "pending");
  const [latest, previous] = runs;
  const goodRead = latest !== undefined && isSuccess(latest) && (latest.itemsReturned ?? 0) > 0;

  // failing / silent: two consecutive due runs; they clear after a successful read that returns items.
  const failing = latest?.outcome === "failed" && previous?.outcome === "failed";
  settle(
    "failing",
    failing
      ? `Failed on the last 2 due runs - ${lowerFirst(latest?.failureReason ?? "the source failed.")}`
      : null,
    goodRead,
  );
  const zero = (o: OutcomeRow | undefined) => o !== undefined && isSuccess(o) && o.itemsReturned === 0;
  settle(
    "silent",
    zero(latest) && zero(previous) ? "Returned no items on the last 2 due runs." : null,
    goodRead,
  );

  // held back (AC-14): clears when the source's next run is at or under 30%.
  settle(
    "held_back",
    input.held
      ? `Would close ${pct(input.held.held / input.held.open)} of its ${input.held.open} open postings - ${input.held.held} closures held back.`
      : null,
    true,
  );

  // unknown location share (AC-25).
  const hasHistory = input.firstSuccessAt !== null && input.now - input.firstSuccessAt >= 7 * DAY;
  let unknownReason: string | null = null;
  if (hasHistory && latest && latest.newListings > 0) {
    const share = latest.unknownLocationNew / latest.newListings;
    const window = runs
      .slice(1)
      .filter(
        (o) =>
          o.newListings > 0 && o.startedAt >= latest.startedAt - 7 * DAY && o.startedAt < latest.startedAt,
      );
    const average =
      window.length === 0
        ? 0
        : window.reduce((sum, o) => sum + o.unknownLocationNew / o.newListings, 0) / window.length;
    if (share > 0.5 && share >= 2 * average) {
      unknownReason = `${pct(share)} of new listings state no location restriction (usually ${pct(average)}).`;
    }
  }
  settle("unknown_location", unknownReason, latest !== undefined);

  // category matched nothing (AC-24).
  const unmatched = input.ownerCategories.filter((c) =>
    input.publishedCategories !== null
      ? !input.publishedCategories.includes(c)
      : hasHistory && !input.categoriesMatchedLast7Days.includes(c),
  );
  settle(
    "category_unmatched",
    unmatched.length === 0
      ? null
      : unmatched.length === 1
        ? `Category "${unmatched[0]}" matched nothing at the source.`
        : `Categories ${unmatched.map((c) => `"${c}"`).join(", ")} matched nothing at the source.`,
    true,
  );

  return { raised, cleared };
}

/** Category warnings stay in source health; every other flag can cost postings (AC-13 note). */
export function raisesMarker(kind: FlagKind): boolean {
  return kind !== "category_unmatched";
}

export interface Session {
  startedAt: number;
  lastSeenAt: number;
}

/** Time the app was running since `since` — a sleeping laptop is not time a source could be read. */
export function runningTimeSince(since: number, sessions: readonly Session[], now: number): number {
  return sessions.reduce((sum, s) => {
    const from = Math.max(s.startedAt, since);
    const to = Math.min(s.lastSeenAt, now);
    return to > from ? sum + (to - from) : sum;
  }, 0);
}

/** Overdue (AC-13): not read for more than twice its interval while the app was running. */
export function overdueReason(
  lastReadAt: number,
  intervalMs: number,
  sessions: readonly Session[],
  now: number,
): string | null {
  const running = runningTimeSince(lastReadAt, sessions, now);
  if (running <= 2 * intervalMs) return null;
  const h = (ms: number) => `${Math.round(ms / HOUR)} h`;
  return `Not read for ${h(running)} while the app was running - it is due every ${h(intervalMs)}.`;
}

const FAILURE_TEXT: Record<FailureCode, string> = {
  unreachable: "The source could not be reached.",
  refused: "The source refused the request.",
  too_large: "The response was larger than 10 MB.",
  timed_out: "The source did not answer within 30 seconds.",
  unreadable: "The response could not be read.",
};

export function failureReasonText(code: FailureCode): string {
  return FAILURE_TEXT[code];
}
