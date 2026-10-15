// Exactly the text the scorer sends and the fingerprint covers (ADR-0005): title, company, the longest
// open listing's description (a merged posting carries several), and the open listings' locations.
import type { OpenPosting } from "../../collector/app/open-postings.js";
import type { ScoredText } from "../domain/score.js";

export function scoredText(p: OpenPosting): ScoredText {
  const open = p.listings.filter((l) => l.status === "open");
  const listings = open.length ? open : p.listings;
  const description = listings
    .map((l) => l.description ?? "")
    .reduce((longest, d) => (d.length > longest.length ? d : longest), "");
  return {
    title: p.title,
    company: p.company,
    description,
    locationRestrictions: listings.map((l) => l.locationRestriction),
  };
}
