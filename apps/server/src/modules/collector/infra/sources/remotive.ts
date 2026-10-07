// Remotive (ADR-0004): one unfiltered request a run (≤ 4 a day). The response carries every active
// job (checked 2026-10-02: 17 jobs, 197 KB), so it is `complete` when `job-count` equals
// `total-job-count`. Attribution: keep the Remotive `url` and name Remotive as the source.
import type { FetchResult, RawListing } from "../../domain/adapter.js";
import { type FetchContext, isObject, notOk, type SourceAdapter, unreadable } from "./types.js";

export function remotiveAdapter(baseUrl = "https://remotive.com"): SourceAdapter {
  return {
    id: "remotive",
    async fetchLatest(ctx: FetchContext): Promise<FetchResult> {
      const res = await ctx.http.getJson(`${baseUrl}/api/remote-jobs`);
      if (res.kind !== "ok") return notOk(res);
      const body = res.body;
      if (!isObject(body) || !Array.isArray(body.jobs)) return unreadable("no jobs array");

      const listings: RawListing[] = [];
      for (const job of body.jobs) {
        const listing = toListing(job);
        if (!listing) return unreadable("unexpected job shape");
        listings.push(listing);
      }
      const complete =
        typeof body["total-job-count"] === "number" && body["total-job-count"] === body.jobs.length;
      return {
        completeness: complete ? "complete" : "capped",
        listings,
        itemsReturned: body.jobs.length,
        coversPublishedAfter: null,
      };
    },
  };
}

function toListing(job: unknown): RawListing | null {
  if (!isObject(job)) return null;
  const {
    id,
    url,
    title,
    company_name,
    category,
    publication_date,
    candidate_required_location,
    description,
  } = job;
  if ((typeof id !== "number" && typeof id !== "string") || typeof url !== "string") return null;
  if (typeof title !== "string" || typeof company_name !== "string") return null;
  // Remotive writes UTC times without a zone designator.
  const published = typeof publication_date === "string" ? Date.parse(`${publication_date}Z`) : Number.NaN;
  return {
    sourceItemId: String(id),
    url,
    title,
    company: company_name,
    description: typeof description === "string" ? description : "",
    locationRestriction: typeof candidate_required_location === "string" ? candidate_required_location : null,
    categories: typeof category === "string" ? [category] : [],
    publishedAt: Number.isNaN(published) ? null : published,
    expiresAt: null,
  };
}
