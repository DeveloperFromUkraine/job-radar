// DOU (jobs.dou.ua): its public RSS feed, allowed by robots.txt (read 2026-10-17), one request per
// owner category with `remote` (`/vacancies/feeds/?category=<category>&remote`), each holding that
// category's newest remote jobs; an unknown category answers with none. The title carries the rest:
// "<role> в <company>, <cities>, <pay>, віддалено". No expiry is given, so a job counts as expiring 30
// days after it was published. The feed is `capped`.
import type { FetchResult, RawListing } from "../../domain/adapter.js";
import { type FetchContext, notOk, type SourceAdapter, unreadable } from "./types.js";
import { tag, time } from "./weworkremotely.js";

const DAY = 24 * 60 * 60 * 1000;

/** "Front End Developer в Acme, Київ, $2000–2200, віддалено" → role, company and the pay part. */
export function splitTitle(heading: string): { title: string; company: string; pay: string } {
  const at = heading.lastIndexOf(" в ");
  if (at < 0) return { title: heading, company: "", pay: "" };
  const [company = "", ...rest] = heading.slice(at + 3).split(", ");
  return {
    title: heading.slice(0, at),
    company,
    pay: rest.find((p) => /\d/.test(p) && /[$€₴]/.test(p)) ?? "",
  };
}

function toListing(item: string, category: string): RawListing | null {
  const guid = tag(item, "guid");
  const link = tag(item, "link");
  const heading = tag(item, "title");
  if (!guid || !link || !heading) return null;
  const { title, company, pay } = splitTitle(heading.trim());
  const publishedAt = time(item, "pubDate");
  return {
    // The guid carries an update stamp and the link a utm tag ("…/vacancies/123/?1791976644"): both drop it.
    sourceItemId: guid.trim().split("?")[0] as string,
    url: link.trim().split("?")[0] as string,
    title,
    company,
    description: tag(item, "description") ?? "",
    // Remote, but where from is not stated: unknown, so the remote filter marks it "check".
    locationRestriction: null,
    categories: [category],
    publishedAt,
    expiresAt: publishedAt === null ? null : publishedAt + 30 * DAY,
    payField: pay,
  };
}

export function douAdapter(baseUrl = "https://jobs.dou.ua"): SourceAdapter {
  return {
    id: "dou",
    async fetchLatest(ctx: FetchContext): Promise<FetchResult> {
      const listings: RawListing[] = [];
      const seen = new Set<string>();
      let itemsReturned = 0;
      for (const category of ctx.categories ?? []) {
        const res = await ctx.http.getText(
          `${baseUrl}/vacancies/feeds/?category=${encodeURIComponent(category)}&remote`,
        );
        if (res.kind !== "ok") return notOk(res);
        const body = res.body as string;
        if (!/<rss[\s>]/.test(body)) return unreadable("not an RSS feed");
        const items = body.match(/<item>[\s\S]*?<\/item>/g) ?? [];
        itemsReturned += items.length;
        for (const item of items) {
          const listing = toListing(item, category);
          if (!listing) return unreadable("unexpected item shape");
          if (seen.has(listing.sourceItemId)) continue;
          seen.add(listing.sourceItemId);
          listings.push(listing);
        }
      }
      return { completeness: "capped", listings, itemsReturned, coversPublishedAfter: null };
    },
  };
}
