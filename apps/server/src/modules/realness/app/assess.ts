// Realness for a set of postings, with switch-on rules (sad.md §4; ADR-0002). Never reads the switch:
// search applies it to the order and the cards, so mark records and daily shares never depend on it.
// No provider, no scoring spend (AC-13).
import type { Db } from "../../../core/db.js";
import { enabledSourceIds } from "../../collector/app/location.js";
import type { OpenListing, OpenPosting } from "../../collector/app/open-postings.js";
import { closedPostingHeads, hasPayField, openPostingHeads } from "../../collector/app/realness-facts.js";
import { lookAlikeKey } from "../../tracking/app/look-alike.js";
import { fieldStatesPay, statesPay } from "../domain/pay.js";
import { effectiveTime, type Realness, realnessOf, repostByLookAlike } from "../domain/signals.js";

export interface AssessDeps {
  db: Db;
  timeZone: string;
}

/** Unknown pay state (not read since this shipped) on a board with a pay field counts as stated (AC-06). */
const listingStatesPay = (l: OpenListing) =>
  (l.payField === null && hasPayField(l.sourceId)) ||
  fieldStatesPay(l.payField ?? "") ||
  statesPay(l.title ?? "") ||
  statesPay(l.description ?? "");

type Head = ReturnType<typeof closedPostingHeads>[number];
type Keyed = Head & { status: "open" | "closed" };
interface Group {
  closed: Keyed | null;
  open: Keyed[];
}

export function assess(
  deps: AssessDeps,
  postings: readonly OpenPosting[],
  now: number,
): Map<string, Realness> {
  const enabled: ReadonlySet<string> = enabledSourceIds(deps.db);
  // Per look-alike key only the heads the repost rule can turn on: the earliest closed copy, and the two
  // earliest open ones (one may be the posting itself). Keeps a build O(n) with large look-alike groups.
  const groups = new Map<string, Group>();
  const group = (h: Head) => {
    const key = lookAlikeKey(h.company, h.title);
    const g = groups.get(key) ?? { closed: null, open: [] };
    groups.set(key, g);
    return g;
  };
  for (const h of closedPostingHeads(deps.db)) {
    const g = group(h);
    if (!g.closed || effectiveTime(h) < effectiveTime(g.closed)) g.closed = { ...h, status: "closed" };
  }
  for (const h of openPostingHeads(deps.db)) {
    const g = group(h);
    g.open = [...g.open, { ...h, status: "open" as const }]
      .sort((a, b) => effectiveTime(a) - effectiveTime(b))
      .slice(0, 2);
  }

  const result = new Map<string, Realness>();
  for (const p of postings) {
    const live = p.listings.filter((l) => l.status === "open" && enabled.has(l.sourceId));
    const g = groups.get(lookAlikeKey(p.company, p.title));
    const sameKey = g
      ? [...(g.closed ? [g.closed] : []), ...g.open.filter((h) => h.id !== p.id).slice(0, 1)]
      : [];
    result.set(
      p.id,
      realnessOf(
        {
          publishedAt: p.publishedAt,
          firstFoundAt: p.firstFoundAt,
          enabledOpenBoards: new Set(live.map((l) => l.sourceId)).size,
          reopened: p.reopenedAt !== null,
          repostByLookAlike: repostByLookAlike(p, sameKey),
          noSalary: !live.some(listingStatesPay),
        },
        now,
        deps.timeZone,
      ),
    );
  }
  return result;
}
