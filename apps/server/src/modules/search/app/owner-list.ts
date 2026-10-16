// The owner's list (match-score ADR-0004, AC-13): unmarked open postings that match the kept skills and
// are shown by the visit's location filter, newest first. Matching scores exactly these; search stays the
// one place the list is defined. No HTTP route: an in-process export for matching.
import type { OpenPosting } from "../../collector/app/open-postings.js";
import { readState } from "../infra/repo.js";
import type { SearchDeps } from "./deps.js";
import { selectList } from "./search.js";

export function ownerList(deps: SearchDeps): OpenPosting[] {
  const { lastSkills, visitStartedAt } = readState(deps.db);
  const { found, hidden, marked } = selectList(deps, lastSkills, visitStartedAt, deps.now());
  return found.filter((f) => !hidden(f.posting.id) && !marked.has(f.posting.id)).map((f) => f.posting);
}
