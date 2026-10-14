// Search's verdict question (ADR-0002): one verdict per posting for a country, from the open listings of
// enabled sources (AC-03), each distinct statement read once per call.

import { enabledSourceIds, isStatedAnywhere } from "../../collector/app/location.js";
import type { OpenPosting } from "../../collector/app/open-postings.js";
import { type ListingVerdict, listingVerdict } from "../domain/statement.js";
import { postingVerdict } from "../domain/verdict.js";
import type { RemoteFilterDeps } from "./deps.js";

export type { ListingVerdict as Verdict, LocationCheck } from "../domain/statement.js";

export function verdictsFor(
  deps: RemoteFilterDeps,
  postings: readonly Pick<OpenPosting, "id" | "listings">[],
  country: string,
  date: Date,
): Map<string, ListingVerdict> {
  const enabled: Set<string> = enabledSourceIds(deps.db);
  const cache = new Map<string | null, ListingVerdict>();
  const read = (s: string | null) => {
    let v = cache.get(s);
    if (!v) {
      v = listingVerdict(s, country, date);
      cache.set(s, v);
    }
    return v;
  };
  const verdicts = new Map<string, ListingVerdict>();
  for (const p of postings) {
    const statements = p.listings
      .filter((l) => l.status === "open" && enabled.has(l.sourceId))
      .map((l) => l.locationRestriction);
    verdicts.set(p.id, postingVerdict(statements, country, date, isStatedAnywhere, read));
  }
  return verdicts;
}
