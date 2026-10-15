// OpenPosting → the API's Posting (docs/features/remote-filter/contracts/openapi.yaml, which adds
// location_check in presentPage; docs/features/match-score/contracts/openapi.yaml adds match). Descriptions are never sent; a link only for an open listing with an
// http(s) URL (AC-08, AC-09).
import type { OpenPosting } from "../../collector/app/open-postings.js";
import type { LookAlike } from "../../tracking/app/queries.js";
import { safeUrl } from "../domain/links.js";
import type { MatchedSkill } from "../domain/match.js";
import { effectiveTime } from "../domain/order.js";
import { isNew } from "../domain/visit.js";
import type { MatchView } from "./deps.js";

const iso = (ms: number) => new Date(ms).toISOString();

export function presentPosting(
  p: OpenPosting,
  matched: MatchedSkill[],
  previousVisitStartedAt: number | null,
  lookAlike: LookAlike | null = null,
) {
  return {
    id: p.id,
    title: p.title,
    company: p.company,
    published_at: p.publishedAt === null ? null : iso(effectiveTime(p)),
    first_seen_at: iso(p.firstFoundAt),
    is_new: isNew(p.firstFoundAt, previousVisitStartedAt),
    matched_skills: matched,
    listings: p.listings.map((l) => ({
      source_id: l.sourceId,
      status: l.status,
      url: l.status === "open" ? safeUrl(l.url) : null,
      location_restriction: l.locationRestriction,
    })),
    look_alike: lookAlike,
  };
}

export type Posting = ReturnType<typeof presentPosting>;

/** A MatchView as the contract's `Match`; null when there is no profile or scores could not be read. */
export function presentMatch(m: MatchView | undefined) {
  if (!m) return null;
  const { parts, ...rest } = m;
  return {
    ...rest,
    parts: parts && {
      skills: parts.skills,
      role_type: parts.roleType,
      seniority: parts.seniority,
      terms: parts.terms,
    },
  };
}

export const PAGE_SIZE = 50;

/**
 * The next page of a snapshot (applied-skipped ADR-0002): from `offset`, walk past marked ids until
 * PAGE_SIZE unmarked ones. The cursor is the position after the last id read, so a posting marked
 * since loading is left out, one cleared since appears in its place, and none is skipped (AC-12).
 */
export function walkUnmarked(ids: readonly string[], offset: number, marked: ReadonlySet<string>) {
  const picked: string[] = [];
  let i = offset;
  for (; i < ids.length && picked.length < PAGE_SIZE; i++)
    if (!marked.has(ids[i] as string)) picked.push(ids[i] as string);
  const has_next = ids.slice(i).some((id) => !marked.has(id));
  return { picked, has_next, next_cursor: has_next ? String(i) : null };
}
