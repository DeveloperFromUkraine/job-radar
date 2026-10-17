// Working Nomads: its public API (workingnomads.com/api/exposed_jobs/, allowed by robots.txt, read
// 2026-10-17), one request a run for its current jobs. Categories are its `category_name`; no expiry
// is given, so a job expires 30 days after it was last seen in the feed. The feed is `capped`.
import type { FetchResult, RawListing } from "../../domain/adapter.js";
import { type FetchContext, isObject, notOk, type SourceAdapter, unreadable } from "./types.js";

const DAY = 24 * 60 * 60 * 1000;
const text = (v: unknown): string => (typeof v === "string" ? v : "");

function toListing(job: unknown, now: number): RawListing | null {
  if (!isObject(job)) return null;
  const url = text(job.url);
  const title = text(job.title);
  if (!url || !title) return null;
  const posted = Date.parse(text(job.pub_date));
  const publishedAt = Number.isNaN(posted) ? null : posted;
  return {
    sourceItemId: url,
    url,
    title,
    company: text(job.company_name),
    description: text(job.description),
    locationRestriction: text(job.location).trim() || null,
    categories: text(job.category_name) ? [text(job.category_name)] : [],
    publishedAt,
    expiresAt: now + 30 * DAY,
    payField: "",
  };
}

export function workingNomadsAdapter(baseUrl = "https://www.workingnomads.com"): SourceAdapter {
  return {
    id: "workingnomads",
    async fetchLatest(ctx: FetchContext): Promise<FetchResult> {
      const res = await ctx.http.getJson(`${baseUrl}/api/exposed_jobs/`);
      if (res.kind !== "ok") return notOk(res);
      if (!Array.isArray(res.body)) return unreadable("not a job list");
      const listings: RawListing[] = [];
      for (const job of res.body) {
        const listing = toListing(job, ctx.now);
        if (!listing) return unreadable("unexpected job shape");
        listings.push(listing);
      }
      return { completeness: "capped", listings, itemsReturned: res.body.length, coversPublishedAfter: null };
    },
  };
}
