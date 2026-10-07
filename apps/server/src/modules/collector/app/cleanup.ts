// Daily clean-up (sad §6 Flow 9, AC-10): once per calendar day, after the day's first finished run.
// Postings past 60 counted days are removed unless the port says they are protected (applied, or in
// their grace day — applied-skipped ADR-0003); skipped ones go like unmarked ones. If the port fails,
// nothing is removed that day — an applied posting must never be lost.
import { countedAgeMs, isPastRetention, periodsPerSource, RETENTION_MS } from "../domain/retention.js";
import { pruneHistory } from "../infra/repo/history.js";
import { removePostings, retentionCandidates } from "../infra/repo/postings.js";
import { readDisabledPeriods } from "../infra/repo/sources.js";
import { readState, updateState } from "../infra/repo/state.js";
import type { CollectorDeps } from "./deps.js";
import type { ProtectedPostings } from "./marked-postings.js";

export async function dailyCleanup(
  deps: CollectorDeps,
  day: string,
  marks: ProtectedPostings,
): Promise<{ ran: boolean; removed: number }> {
  const { db } = deps;
  if (readState(db).lastCleanupOn === day) return { ran: false, removed: 0 };
  const now = deps.now();

  const periods = readDisabledPeriods(db);
  const past = retentionCandidates(db, now - RETENTION_MS).filter((p) =>
    isPastRetention(countedAgeMs(p, periodsPerSource(p.sourceIds, periods), now)),
  );

  let removed = 0;
  if (past.length > 0) {
    try {
      const kept = await marks.protectedAmong(past.map((p) => p.id));
      const unprotected = past.map((p) => p.id).filter((id) => !kept.has(id));
      removePostings(db, unprotected);
      removed = unprotected.length;
    } catch {
      // Remove nothing today; tomorrow's clean-up tries again.
    }
  }

  pruneHistory(db, now);
  updateState(db, { lastCleanupOn: day });
  return { ran: true, removed };
}
