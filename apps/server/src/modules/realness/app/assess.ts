// Realness for a set of postings, with switch-on rules (sad.md §4; ADR-0002). Never reads the switch:
// search applies it to the order and the cards, so mark records and daily shares never depend on it.
// No provider, no scoring spend (AC-13).
import type { Db } from "../../../core/db.js";
import { enabledSourceIds } from "../../collector/app/location.js";
import type { OpenListing, OpenPosting } from "../../collector/app/open-postings.js";
import { closedPostingHeads, hasPayField, openPostingHeads } from "../../collector/app/realness-facts.js";
import { lookAlikeKey } from "../../tracking/app/look-alike.js";
import { statesPay } from "../domain/pay.js";
import { type Realness, realnessOf, repostByLookAlike } from "../domain/signals.js";

export interface AssessDeps {
  db: Db;
  timeZone: string;
}

/** Unknown pay state (not read since this shipped) on a board with a pay field counts as stated (AC-06). */
const listingStatesPay = (l: OpenListing) =>
  (l.payField === null && hasPayField(l.sourceId)) ||
  statesPay(l.payField ?? "") ||
  statesPay(l.title ?? "") ||
  statesPay(l.description ?? "");

export function assess(
  deps: AssessDeps,
  postings: readonly OpenPosting[],
  now: number,
): Map<string, Realness> {
  const enabled: ReadonlySet<string> = enabledSourceIds(deps.db);
  const byKey = new Map<
    string,
    { id: string; status: "open" | "closed"; publishedAt: number | null; firstFoundAt: number }[]
  >();
  const index = (heads: ReturnType<typeof closedPostingHeads>, status: "open" | "closed") => {
    for (const h of heads) {
      const key = lookAlikeKey(h.company, h.title);
      const group = byKey.get(key) ?? [];
      group.push({ ...h, status });
      byKey.set(key, group);
    }
  };
  index(closedPostingHeads(deps.db), "closed");
  index(openPostingHeads(deps.db), "open");

  const result = new Map<string, Realness>();
  for (const p of postings) {
    const live = p.listings.filter((l) => l.status === "open" && enabled.has(l.sourceId));
    const sameKey = (byKey.get(lookAlikeKey(p.company, p.title)) ?? []).filter((h) => h.id !== p.id);
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
