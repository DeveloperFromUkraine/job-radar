// Imported sources (Pracuj.pl, theprotocol.it): both answer programs with a bot check, so job-radar
// never fetches them. The owner looks at their search in their own browser, on request, and the
// listings found are written to `<data dir>/imports/<source>.json`; a run reads that file.
// File shape: { "importedAt": ISO time, "complete": boolean, "listings": RawListing[] } (times as
// ISO strings or null). `complete` says the look read every page of the owner's search, so a listing
// gone from it has closed; otherwise the read is `capped` and only a stated expiry closes.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { FetchResult, RawListing } from "../../domain/adapter.js";
import type { SourceId } from "../../domain/sources.js";
import { type FetchContext, isObject, notOk, type SourceAdapter, unreadable } from "./types.js";

const time = (v: unknown): number | null => {
  const parsed = typeof v === "string" ? Date.parse(v) : Number.NaN;
  return Number.isNaN(parsed) ? null : parsed;
};
const text = (v: unknown): string => (typeof v === "string" ? v : "");

function toListing(item: unknown): RawListing | null {
  if (!isObject(item)) return null;
  const { sourceItemId, url, title } = item;
  if (typeof sourceItemId !== "string" || typeof url !== "string" || typeof title !== "string") return null;
  return {
    sourceItemId,
    url,
    title,
    company: text(item.company),
    description: text(item.description),
    locationRestriction: typeof item.locationRestriction === "string" ? item.locationRestriction : null,
    categories: Array.isArray(item.categories) ? item.categories.filter((c) => typeof c === "string") : [],
    publishedAt: time(item.publishedAt),
    expiresAt: time(item.expiresAt),
    payField: text(item.payField),
  };
}

export function importedAdapter(id: SourceId, importsDir: string | undefined): SourceAdapter {
  return {
    id,
    async fetchLatest(ctx: FetchContext): Promise<FetchResult> {
      // Reading the file counts as the source's read, so it is due on its interval like the others.
      if (!ctx.http.countRead()) return notOk({ kind: "limited" });
      let body: string;
      try {
        if (!importsDir) throw new Error("no imports directory");
        body = await readFile(join(importsDir, `${id}.json`), "utf8");
      } catch {
        // Nothing imported yet: an empty read, never "silent" (itemsReturned null).
        return { completeness: "partial", listings: [], itemsReturned: null, coversPublishedAfter: null };
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(body);
      } catch {
        return unreadable("the import file is not valid JSON");
      }
      if (!isObject(parsed) || !Array.isArray(parsed.listings))
        return unreadable("the import file has no listings");
      const listings: RawListing[] = [];
      for (const item of parsed.listings) {
        const listing = toListing(item);
        if (!listing) return unreadable("unexpected listing in the import file");
        listings.push(listing);
      }
      return {
        completeness: parsed.complete === true ? "complete" : "capped",
        listings,
        itemsReturned: listings.length,
        coversPublishedAfter: null,
      };
    },
  };
}
