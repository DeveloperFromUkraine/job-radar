// Daily clean-up (sad §6 Flow 9, AC-10): once per calendar day, after the day's first finished run.
// Unmarked postings past 60 counted days are removed; marked ones stay. If the marks port fails,
// nothing is removed that day — a mark must never be lost.
import { lt } from "drizzle-orm";
import { countedAgeMs, isPastRetention, RETENTION_MS } from "../domain/retention.js";
import { removePostings, retentionCandidates } from "../infra/repo/postings.js";
import { readDisabledPeriods } from "../infra/repo/sources.js";
import { readState, updateState } from "../infra/repo/state.js";
import { appSessions, requestLedger, runs } from "../infra/schema.js";
import type { CollectorDeps } from "./deps.js";
import type { MarkedPostings } from "./marked-postings.js";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export async function dailyCleanup(
  deps: CollectorDeps,
  day: string,
  marks: MarkedPostings,
): Promise<{ ran: boolean; removed: number }> {
  const { db } = deps;
  if (readState(db).lastCleanupOn === day) return { ran: false, removed: 0 };
  const now = deps.now();

  const periods = readDisabledPeriods(db);
  const past = retentionCandidates(db, now - RETENTION_MS).filter((p) => {
    const perSource = p.sourceIds.map((sourceId) =>
      periods
        .filter((d) => d.sourceId === sourceId)
        .map((d) => ({ from: d.disabledFrom, until: d.disabledUntil })),
    );
    return isPastRetention(countedAgeMs(p, perSource, now));
  });

  let removed = 0;
  if (past.length > 0) {
    try {
      const marked = await marks.markedAmong(past.map((p) => p.id));
      const unmarked = past.map((p) => p.id).filter((id) => !marked.has(id));
      removePostings(db, unmarked);
      removed = unmarked.length;
    } catch {
      // Remove nothing today; tomorrow's clean-up tries again.
    }
  }

  db.transaction((tx) => {
    tx.delete(requestLedger)
      .where(lt(requestLedger.sentAt, now - DAY))
      .run();
    tx.delete(runs)
      .where(lt(runs.startedAt, now - 60 * DAY))
      .run();
    tx.delete(appSessions)
      .where(lt(appSessions.lastSeenAt, now - 60 * DAY))
      .run();
  });
  updateState(db, { lastCleanupOn: day });
  return { ran: true, removed };
}
