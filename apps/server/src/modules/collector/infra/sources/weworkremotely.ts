// We Work Remotely (spec §8 Q1, answered 2026-10-03): its public RSS feed may be used by anyone who
// links back to WWR (weworkremotely.com/remote-job-rss-feed); keep the WWR `link` and name WWR as
// the source. One request a run for the all-jobs feed: it holds only the newest ~10 per category,
// so it is `capped` — absence never closes. `expires_at` is the direct close signal (moved forward
// when a posting is renewed). Titles read "Company: Role".
import type { FetchResult, RawListing } from "../../domain/adapter.js";
import { type FetchContext, notOk, type SourceAdapter, unreadable } from "./types.js";

// "Anywhere in the World" also sits beside country lists (feed read 2026-10-03): nothing stated.
const NOTHING_STATED = "Anywhere in the World";

const XML_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

/** One element's text, XML-decoded; markup inside stays for the listing rules to strip. */
function tag(item: string, name: string): string | null {
  const match = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(item);
  if (!match) return null;
  const text = match[1] as string;
  const cdata = /^\s*<!\[CDATA\[([\s\S]*)\]\]>\s*$/.exec(text);
  if (cdata) return cdata[1] as string;
  return text.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/gi, (m, body: string) => {
    if (body[0] !== "#") return XML_ENTITIES[body.toLowerCase()] ?? m;
    const code = body[1]?.toLowerCase() === "x" ? Number.parseInt(body.slice(2), 16) : Number(body.slice(1));
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
  });
}

function time(item: string, name: string): number | null {
  const parsed = Date.parse(tag(item, name) ?? "");
  return Number.isNaN(parsed) ? null : parsed;
}

function toListing(item: string): RawListing | null {
  const guid = tag(item, "guid");
  const link = tag(item, "link");
  const heading = tag(item, "title");
  if (!guid || !link || !heading) return null;
  const split = heading.indexOf(": ");
  const country = tag(item, "country")?.trim();
  const region = tag(item, "region")?.trim();
  const category = tag(item, "category")?.trim();
  return {
    sourceItemId: guid.trim(),
    url: link.trim(),
    company: split > 0 ? heading.slice(0, split) : "",
    title: split > 0 ? heading.slice(split + 2) : heading,
    description: tag(item, "description") ?? "",
    locationRestriction: country || (region && region !== NOTHING_STATED ? region : null),
    categories: category ? [category] : [],
    publishedAt: time(item, "pubDate"),
    expiresAt: time(item, "expires_at"),
  };
}

export function weWorkRemotelyAdapter(baseUrl = "https://weworkremotely.com"): SourceAdapter {
  return {
    id: "weworkremotely",
    async fetchLatest(ctx: FetchContext): Promise<FetchResult> {
      const res = await ctx.http.getText(`${baseUrl}/remote-jobs.rss`);
      if (res.kind !== "ok") return notOk(res);
      const body = res.body as string;
      if (!/<rss[\s>]/.test(body)) return unreadable("not an RSS feed");

      const items = body.match(/<item>[\s\S]*?<\/item>/g) ?? [];
      const listings: RawListing[] = [];
      for (const item of items) {
        const listing = toListing(item);
        if (!listing) return unreadable("unexpected item shape");
        listings.push(listing);
      }
      return { completeness: "capped", listings, itemsReturned: items.length, coversPublishedAfter: null };
    },
  };
}
