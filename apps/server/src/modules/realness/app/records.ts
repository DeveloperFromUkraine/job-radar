// Realness kept with every mark and once a day, for the §7 checks (spec AC-14; sad.md §6 flows 6, 7).
// Both use switch-on rules, and a failed write is logged and never fails the mark or the list.
import { postingsByIds } from "../../collector/app/open-postings.js";
import type { FilterMode } from "../../remote-filter/app/settings.js";
import type { Realness } from "../domain/signals.js";
import { deleteMarkRecord, insertDailyShare, upsertMarkRecord } from "../infra/repo.js";
import { assess } from "./assess.js";
import type { RealnessDeps } from "./deps.js";

/** Tracking's hook, called after a mark is saved: the latest mark's realness, or no record when cleared. */
export function onMarkChanged(
  deps: RealnessDeps,
  postingId: string,
  mark: "applied" | "skipped" | null,
): void {
  try {
    if (mark === null) {
      deleteMarkRecord(deps.db, postingId);
      return;
    }
    const now = deps.now();
    const postings = postingsByIds(deps.db, [postingId], { includeClosed: true });
    const realness = assess(deps, postings, now).get(postingId);
    if (!realness) return;
    upsertMarkRecord(deps.db, {
      postingId,
      mark,
      penalty: realness.penalty,
      signals: JSON.stringify(realness.signals),
      recordedAt: now,
    });
  } catch {
    // Only the id: with the marks, titles would reveal where the owner applied.
    deps.log?.warn({ module: "realness", postingId });
  }
}

const dayOf = (at: number, timeZone: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    at,
  );

/** The day's first opening of the owner's list keeps its lowered share; a one-off look is ignored. */
export function noteListShown(
  deps: RealnessDeps,
  assessments: ReadonlyMap<string, Realness>,
  filterMode: FilterMode,
) {
  if (filterMode === "look") return;
  const now = deps.now();
  const day = dayOf(now, deps.timeZone);
  try {
    const lowered = [...assessments.values()].filter((r) => r.penalty > 0).length;
    insertDailyShare(deps.db, { day, postings: assessments.size, lowered, recordedAt: now });
  } catch {
    deps.log?.warn({ module: "realness", day });
  }
}
