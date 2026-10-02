// Himalayas (ADR-0004): ≤ 20 jobs a request, ≤ 4 requests a day (spec §8 Q3, checked 2026-10-02:
// the docs give no number, only that polling more than once a day brings no benefit), so a read is
// always `capped`; `expiryDate` is its direct close signal. It publishes no category list — the
// owner's categories match the jobs' `parentCategories`. Attribution: keep the Himalayas `guid` URL.
import type { FetchResult, RawListing } from "../../domain/adapter.js";
import { type FetchContext, isObject, notOk, type SourceAdapter, unreadable } from "./types.js";

export function himalayasAdapter(baseUrl = "https://himalayas.app"): SourceAdapter {
  return {
    id: "himalayas",
    async fetchLatest(ctx: FetchContext): Promise<FetchResult> {
      const res = await ctx.http.getJson(`${baseUrl}/jobs/api?limit=20`);
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
        completeness: "capped",
        listings,
        itemsReturned: body.jobs.length,
        coversPublishedAfter: null,
      };
    },
  };
}

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
const seconds = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v * 1000 : null;

/** A UTC offset as Himalayas states it (hours), written the way a person reads it. */
function timeZone(offset: number): string {
  return offset === 0 ? "UTC" : `UTC${offset > 0 ? "+" : ""}${offset}`;
}

function toListing(job: unknown): RawListing | null {
  if (!isObject(job)) return null;
  const { guid, title, companyName, description, pubDate, expiryDate } = job;
  if (typeof guid !== "string" || typeof title !== "string" || typeof companyName !== "string") return null;
  const zones = Array.isArray(job.timezoneRestrictions)
    ? job.timezoneRestrictions.filter((z): z is number => typeof z === "number").map(timeZone)
    : [];
  return {
    sourceItemId: guid,
    url: guid,
    title,
    company: companyName,
    description: typeof description === "string" ? description : "",
    // Countries, then time zones, exactly as stated; neither → nothing stated (AC-21, AC-22).
    locationRestriction: [...strings(job.locationRestrictions), ...zones],
    categories: strings(job.parentCategories),
    publishedAt: seconds(pubDate),
    expiresAt: seconds(expiryDate),
  };
}
