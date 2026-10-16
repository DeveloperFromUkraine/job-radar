// The collector's read-only exports for realness-score (sad §4 assumptions ledger): closed postings
// that still exist (removed ones cannot cause a repost) and which boards have their own pay field.
import type { SourceId } from "../domain/sources.js";

export {
  readClosedPostingHeads as closedPostingHeads,
  readOpenPostingHeads as openPostingHeads,
} from "../infra/repo/open-postings.js";

const PAY_FIELD_BOARDS: ReadonlySet<string> = new Set<SourceId>(["himalayas", "remotive", "jobicy"]);

/** We Work Remotely has none; an unknown source has none. */
export const hasPayField = (sourceId: string): boolean => PAY_FIELD_BOARDS.has(sourceId);
