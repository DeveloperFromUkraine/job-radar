// Mark, change, clear and undo (sad §6 Flows 1 and 4). The domain decides, the repo writes one
// synchronous statement, and the answer is the posting's MarkState. Expected failures become the
// contract's codes; a mark is confirmed only after its write returned (spec §6 Durability).
import { AppError } from "../../../core/errors.js";
import { newId } from "../../../core/id.js";
import { postingsByIds } from "../../collector/app/open-postings.js";
import { retentionOutlook } from "../../collector/app/retention-outlook.js";
import { applyMark, applyUndo, type Mark, type MarkRow } from "../domain/mark.js";
import { deleteGuarded, getMark, PostingGone, replaceGuarded, writeMark } from "../infra/repo.js";
import type { TrackingDeps } from "./deps.js";
import { type MarkState, presentMarkState } from "./mark-state.js";

const postingGone = () =>
  new AppError("TRACKING_POSTING_NOT_FOUND", "This posting is no longer in job-radar.", 404);
const changedElsewhere = () =>
  new AppError(
    "TRACKING_MARK_CHANGED_ELSEWHERE",
    "This mark was changed elsewhere, so it was not undone. See the marked postings for its current mark.",
    409,
  );

/** Runs a mark change; anything unexpected from the database means marks can't be saved now (AC-14). */
function change<T>(deps: TrackingDeps, action: string, fn: () => T): T {
  const started = deps.now();
  try {
    return fn();
  } catch (err) {
    if (err instanceof AppError) throw err;
    if (err instanceof PostingGone) throw postingGone();
    throw new AppError(
      "TRACKING_MARKS_UNAVAILABLE",
      "Job-radar could not save your mark just now. Try again.",
      503,
    );
  } finally {
    // Never the title or company: with the marks they reveal where the owner applied (sad §8).
    deps.log?.info({ action, durationMs: deps.now() - started });
  }
}

function stateOf(deps: TrackingDeps, postingId: string, row: MarkRow | null): MarkState {
  const [posting] = postingsByIds(deps.db, [postingId], { includeClosed: true });
  if (!posting) throw postingGone();
  const now = deps.now();
  const outlook = retentionOutlook(deps.db, [postingId], now).get(postingId);
  return presentMarkState(postingId, row, posting, outlook, now, deps.timeZone);
}

function requirePosting(deps: TrackingDeps, postingId: string): void {
  if (postingsByIds(deps.db, [postingId], { includeClosed: true }).length === 0) throw postingGone();
}

/** Sets, changes or (with null) clears the mark. Setting the current state writes nothing. */
export function setMark(deps: TrackingDeps, postingId: string, mark: Mark | null): MarkState {
  return change(deps, mark === null ? "clear" : "mark", () => {
    requirePosting(deps, postingId);
    const row = getMark(deps.db, postingId);
    const next = applyMark(row, postingId, mark, deps.now(), newId());
    if (next) writeMark(deps.db, next);
    return stateOf(deps, postingId, next ?? row);
  });
}

/** Reverses the change `changeId` made, only if nothing changed the mark since (AC-03, AC-04). */
export function undoMark(deps: TrackingDeps, postingId: string, changeId: string): MarkState {
  return change(deps, "undo", () => {
    requirePosting(deps, postingId);
    const row = getMark(deps.db, postingId);
    const outcome = applyUndo(row, changeId, newId());
    if (outcome.kind === "changedElsewhere") throw changedElsewhere();
    if (outcome.kind === "delete") {
      if (!deleteGuarded(deps.db, postingId, changeId)) throw changedElsewhere();
      return stateOf(deps, postingId, null);
    }
    if (!replaceGuarded(deps.db, outcome.row, changeId)) throw changedElsewhere();
    return stateOf(deps, postingId, outcome.row);
  });
}
