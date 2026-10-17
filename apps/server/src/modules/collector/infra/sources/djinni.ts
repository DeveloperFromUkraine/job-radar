// Djinni: its public RSS feed (djinni.co/jobs/rss/, allowed by robots.txt, read 2026-10-17), one
// request per owner category (`?primary_keyword=<category>`), each holding that keyword's newest jobs.
// An unknown keyword answers with every job, so only items whose <category> is the asked one are kept.
// The feed names no company, location or pay, and gives no expiry: a job counts as expiring 30 days
// after it was published (Djinni archives jobs on its own about then). The feed is `capped`.
import type { FetchResult, RawListing } from "../../domain/adapter.js";
import { type FetchContext, notOk, type SourceAdapter, unreadable } from "./types.js";
import { tag, time } from "./weworkremotely.js";

const DAY = 24 * 60 * 60 * 1000;

function toListing(item: string): RawListing | null {
  const guid = tag(item, "guid");
  const link = tag(item, "link");
  const title = tag(item, "title");
  if (!guid || !link || !title) return null;
  const publishedAt = time(item, "pubDate");
  const category = tag(item, "category")?.trim();
  return {
    sourceItemId: guid.trim(),
    url: link.trim(),
    title,
    company: "",
    description: tag(item, "description") ?? "",
    locationRestriction: null,
    categories: category ? [category] : [],
    publishedAt,
    expiresAt: publishedAt === null ? null : publishedAt + 30 * DAY,
    payField: "",
  };
}

export function djinniAdapter(baseUrl = "https://djinni.co"): SourceAdapter {
  return {
    id: "djinni",
    async fetchLatest(ctx: FetchContext): Promise<FetchResult> {
      const listings: RawListing[] = [];
      const seen = new Set<string>();
      let itemsReturned = 0;
      for (const category of ctx.categories ?? []) {
        const res = await ctx.http.getText(
          `${baseUrl}/jobs/rss/?primary_keyword=${encodeURIComponent(category)}`,
        );
        if (res.kind !== "ok") return notOk(res);
        const body = res.body as string;
        if (!/<rss[\s>]/.test(body)) return unreadable("not an RSS feed");
        const items = body.match(/<item>[\s\S]*?<\/item>/g) ?? [];
        itemsReturned += items.length;
        for (const item of items) {
          const listing = toListing(item);
          if (!listing) return unreadable("unexpected item shape");
          if (listing.categories[0] !== category || seen.has(listing.sourceItemId)) continue;
          seen.add(listing.sourceItemId);
          listings.push(listing);
        }
      }
      return { completeness: "capped", listings, itemsReturned, coversPublishedAfter: null };
    },
  };
}
