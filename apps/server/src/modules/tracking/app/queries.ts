// What search asks tracking (sad §6 Flows 2, 3, 5): which postings are marked now, the marked view's
// order, fresh mark states, and look-alike hints. Posting details come from collector/app.
import { postingsByIds } from "../../collector/app/open-postings.js";
import { retentionOutlook } from "../../collector/app/retention-outlook.js";
import { lookAlikeKey, winningMark } from "../domain/look-alike.js";
import type { Mark } from "../domain/mark.js";
import { markRowsNewestFirst, markedIds as readMarkedIds, rowsFor } from "../infra/repo.js";
import type { TrackingDeps } from "./deps.js";
import { type MarkState, presentMarkState } from "./mark-state.js";

/** Postings marked applied or skipped right now; cleared ones are unmarked (AC-12). */
export function markedIds(deps: TrackingDeps): Set<string> {
  return readMarkedIds(deps.db);
}

/**
 * The marked view's posting ids (AC-05): marked postings, open or closed, plus closed postings whose
 * mark was cleared and that clean-up has not removed yet — most recently changed first.
 */
export function markedOrder(deps: TrackingDeps): string[] {
  const rows = markRowsNewestFirst(deps.db);
  const cleared = rows.filter((r) => r.mark === null).map((r) => r.postingId);
  const closed = new Set(
    postingsByIds(deps.db, cleared, { includeClosed: true })
      .filter((p) => p.status === "closed")
      .map((p) => p.id),
  );
  return rows.filter((r) => r.mark !== null || closed.has(r.postingId)).map((r) => r.postingId);
}

/** Current mark states of the given postings (rows read fresh, AC-05). */
export function markStatesFor(
  deps: TrackingDeps,
  postings: readonly { id: string; status: "open" | "closed" }[],
): Map<string, MarkState> {
  const ids = postings.map((p) => p.id);
  const rows = new Map(rowsFor(deps.db, ids).map((r) => [r.postingId, r]));
  const now = deps.now();
  const outlook = retentionOutlook(deps.db, ids, now);
  return new Map(
    postings.map((p) => [
      p.id,
      presentMarkState(p.id, rows.get(p.id) ?? null, p, outlook.get(p.id), now, deps.timeZone),
    ]),
  );
}

export interface LookAlike {
  mark: Mark;
  marked_at: string;
  company: string;
}

/**
 * The look-alike hint per posting (AC-10, AC-11; ADR-0004): built on read over the current marks,
 * closed postings included and cleared ones excluded. Postings without a match are left out.
 */
export function hintsFor(
  deps: TrackingDeps,
  postings: readonly { id: string; company: string; title: string }[],
): Map<string, LookAlike> {
  const marks = new Map(
    markRowsNewestFirst(deps.db)
      .filter((r) => r.mark !== null)
      .map((r) => [r.postingId, r]),
  );
  const hints = new Map<string, LookAlike>();
  if (marks.size === 0) return hints;

  type Match = { id: string; mark: Mark; markedAt: number; company: string };
  const byKey = new Map<string, Match[]>();
  for (const p of postingsByIds(deps.db, [...marks.keys()], { includeClosed: true })) {
    const row = marks.get(p.id);
    if (!row?.mark) continue;
    const key = lookAlikeKey(p.company, p.title);
    byKey.set(key, [
      ...(byKey.get(key) ?? []),
      { id: p.id, mark: row.mark, markedAt: row.markedAt, company: p.company },
    ]);
  }
  for (const p of postings) {
    const matches = (byKey.get(lookAlikeKey(p.company, p.title)) ?? []).filter((m) => m.id !== p.id);
    const win = winningMark(matches);
    if (win)
      hints.set(p.id, {
        mark: win.mark,
        marked_at: new Date(win.markedAt).toISOString(),
        company: win.company,
      });
  }
  return hints;
}
