// Remote OK: its public API (remoteok.com/api, allowed by robots.txt, read 2026-10-17), one request a
// run for the newest ~100 jobs. API terms: link back to the job's Remote OK URL and name Remote OK as
// the source (the card does both); never use its logo. The first element is the legal notice, not a
// job. Categories are the job's tags; no expiry is given, so a job counts as expiring 30 days after it
// was posted. The feed is `capped`.
import type { FetchResult, RawListing } from "../../domain/adapter.js";
import { type FetchContext, isObject, notOk, payText, type SourceAdapter, unreadable } from "./types.js";

const DAY = 24 * 60 * 60 * 1000;
const text = (v: unknown): string => (typeof v === "string" ? v : "");

function toListing(job: unknown): RawListing | null {
  if (!isObject(job)) return null;
  const id = typeof job.id === "string" || typeof job.id === "number" ? String(job.id) : "";
  const url = text(job.url);
  const title = text(job.position);
  if (!id || !url || !title) return null;
  const posted = Date.parse(text(job.date));
  const publishedAt = Number.isNaN(posted) ? null : posted;
  return {
    sourceItemId: id,
    url,
    title,
    company: text(job.company),
    description: text(job.description),
    locationRestriction: text(job.location).trim() || null,
    categories: Array.isArray(job.tags) ? job.tags.filter((t) => typeof t === "string") : [],
    publishedAt,
    expiresAt: publishedAt === null ? null : publishedAt + 30 * DAY,
    payField: payText(Number(job.salary_min), Number(job.salary_max), "USD", "annual"),
  };
}

export function remoteOkAdapter(baseUrl = "https://remoteok.com"): SourceAdapter {
  return {
    id: "remoteok",
    async fetchLatest(ctx: FetchContext): Promise<FetchResult> {
      const res = await ctx.http.getJson(`${baseUrl}/api`);
      if (res.kind !== "ok") return notOk(res);
      if (!Array.isArray(res.body)) return unreadable("not a job list");
      const jobs = res.body.filter((j) => !(isObject(j) && "legal" in j));
      const listings: RawListing[] = [];
      for (const job of jobs) {
        const listing = toListing(job);
        if (!listing) return unreadable("unexpected job shape");
        listings.push(listing);
      }
      return { completeness: "capped", listings, itemsReturned: jobs.length, coversPublishedAfter: null };
    },
  };
}
