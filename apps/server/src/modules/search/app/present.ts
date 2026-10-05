// OpenPosting → the API's Posting (contracts/openapi.yaml). Descriptions are never sent; a link only
// for an open listing with an http(s) URL (AC-08, AC-09).
import type { OpenPosting } from "../../collector/app/open-postings.js";
import { safeUrl } from "../domain/links.js";
import type { MatchedSkill } from "../domain/match.js";
import { effectiveTime } from "../domain/order.js";
import { isNew } from "../domain/visit.js";

const iso = (ms: number) => new Date(ms).toISOString();

export function presentPosting(
  p: OpenPosting,
  matched: MatchedSkill[],
  previousVisitStartedAt: number | null,
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
  };
}

export type Posting = ReturnType<typeof presentPosting>;

export const PAGE_SIZE = 50;

/** One page of an ordered result starting at `offset`; the cursor is the next offset. */
export function pageInfo(offset: number, total: number) {
  const has_next = offset + PAGE_SIZE < total;
  return { has_next, next_cursor: has_next ? String(offset + PAGE_SIZE) : null };
}
