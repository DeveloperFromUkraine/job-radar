// Jobicy (ADR-0004): one request a run, newest 200 jobs published in the last 7 days; `complete`
// when nothing more was available, else `capped`; absence closes only inside the window it covers.
// API: github.com/Jobicy/remote-jobs-api (read 2026-10-02). Attribution: keep the Jobicy `url`.
import type { FetchResult, RawListing } from "../../domain/adapter.js";
import { type FetchContext, isObject, notOk, type SourceAdapter, unreadable } from "./types.js";

const HOUR = 60 * 60 * 1000;
const PAGE = 200;

export function jobicyAdapter(baseUrl = "https://jobicy.com"): SourceAdapter {
  return {
    id: "jobicy",
    async fetchLatest(ctx: FetchContext): Promise<FetchResult> {
      const res = await ctx.http.getJson(`${baseUrl}/api/v2/remote-jobs?count=${PAGE}`);
      if (res.kind !== "ok") return notOk(res);
      const body = res.body;
      if (!isObject(body) || !Array.isArray(body.jobs)) return unreadable("no jobs array");

      const listings: RawListing[] = [];
      for (const job of body.jobs) {
        const listing = toListing(job);
        if (!listing) return unreadable("unexpected job shape");
        listings.push(listing);
      }
      return {
        completeness: body.hasMore === false ? "complete" : "capped",
        listings,
        itemsReturned: body.jobs.length,
        // The feed holds the last 7 days; 12 h margin so a job just leaving it is not read as closed.
        coversPublishedAfter: ctx.now - 7 * 24 * HOUR + 12 * HOUR,
      };
    },
  };
}

function toListing(job: unknown): RawListing | null {
  if (!isObject(job)) return null;
  const { id, url, jobTitle, companyName, jobDescription, jobGeo, jobIndustry, pubDate } = job;
  if (typeof id !== "number" || typeof url !== "string" || typeof jobTitle !== "string") return null;
  if (typeof companyName !== "string") return null;
  const published = typeof pubDate === "string" ? Date.parse(pubDate) : Number.NaN;
  return {
    sourceItemId: String(id),
    url,
    title: jobTitle,
    company: companyName,
    description: typeof jobDescription === "string" ? jobDescription : "",
    // Jobicy writes "Anywhere" when the employer named no region — that is nothing stated (AC-22).
    locationRestriction:
      typeof jobGeo === "string" && jobGeo.trim().toLowerCase() !== "anywhere" ? jobGeo : null,
    categories: Array.isArray(jobIndustry)
      ? jobIndustry.filter((c): c is string => typeof c === "string")
      : [],
    publishedAt: Number.isNaN(published) ? null : published,
    expiresAt: null,
  };
}
