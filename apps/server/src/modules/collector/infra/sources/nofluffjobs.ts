// No Fluff Jobs: robots.txt disallows `/api/` and `/posting/` (read 2026-10-17) but allows the search
// pages, and each search page carries its postings in the `serverApp-state` JSON. One remote search
// per owner category (`/pl/praca-zdalna/<category>`); its pages are cumulative ("show more"), so the
// last page holds them all: a category costs one request, or two when it has more than one page.
// Every page of every category read → `complete`, so a posting gone from the search closes (the
// board gives no expiry).
import type { FetchResult, RawListing } from "../../domain/adapter.js";
import { type FetchContext, isObject, notOk, payText, type SourceAdapter, unreadable } from "./types.js";

const SITE = "https://nofluffjobs.com";

interface SearchPage {
  postings: unknown[];
  totalCount: number;
  pageSize: number;
}

function searchPage(html: string): SearchPage | null {
  const m = /<script id="serverApp-state" type="application\/json">([\s\S]*?)<\/script>/.exec(html);
  if (!m) return null;
  let state: unknown;
  try {
    state = JSON.parse(m[1] as string);
  } catch {
    return null;
  }
  if (!isObject(state)) return null;
  for (const value of Object.values(state)) {
    if (isObject(value) && Array.isArray(value.postings) && typeof value.totalCount === "number") {
      const size =
        isObject(value.params) && typeof value.params.pageSize === "number" ? value.params.pageSize : 20;
      return { postings: value.postings, totalCount: value.totalCount, pageSize: size };
    }
  }
  return null;
}

const text = (v: unknown): string => (typeof v === "string" ? v : "");

function toListing(posting: unknown, category: string): RawListing | null {
  if (!isObject(posting)) return null;
  const { id, url, title, name } = posting;
  if (typeof id !== "string" || typeof url !== "string" || typeof title !== "string") return null;
  const salary = isObject(posting.salary) ? posting.salary : {};
  const period = text(salary.period).toLowerCase();
  const seniority = Array.isArray(posting.seniority)
    ? posting.seniority.filter((s) => typeof s === "string")
    : [];
  const posted = typeof posting.renewed === "number" ? posting.renewed : posting.posted;
  const amount = payText(salary.from, salary.to, salary.currency, period);
  return {
    sourceItemId: id,
    url: `${SITE}/pl/job/${url}`,
    title,
    company: text(name),
    // The search page has no full text, so what it states goes in for the skill match and the score.
    description: [
      seniority.length > 0 ? `<p>Level: ${seniority.join(", ")}</p>` : "",
      text(posting.technology) ? `<p>Technology: ${text(posting.technology)}</p>` : "",
      text(salary.type) ? `<p>Contract: ${text(salary.type)}</p>` : "",
    ]
      .filter(Boolean)
      .join("\n"),
    // A Polish board's remote search: open to candidates in Poland unless the text says otherwise.
    locationRestriction: "Poland",
    categories: [category],
    publishedAt: typeof posted === "number" ? posted : null,
    expiresAt: null,
    payField: amount && text(salary.type) ? `${text(salary.type)} ${amount}` : amount,
  };
}

export function noFluffJobsAdapter(baseUrl = SITE): SourceAdapter {
  return {
    id: "nofluffjobs",
    async fetchLatest(ctx: FetchContext): Promise<FetchResult> {
      const listings: RawListing[] = [];
      const seen = new Set<string>();
      let itemsReturned = 0;
      let allRead = true;
      for (const category of ctx.categories ?? []) {
        const path = `${baseUrl}/pl/praca-zdalna/${encodeURIComponent(category)}`;
        const first = await ctx.http.getText(path);
        if (first.kind !== "ok") return notOk(first);
        let page = searchPage(first.body as string);
        if (!page) return unreadable(`no postings on the ${category} search page`);
        if (page.postings.length < page.totalCount) {
          const last = await ctx.http.getText(`${path}?page=${Math.ceil(page.totalCount / page.pageSize)}`);
          if (last.kind !== "ok") return notOk(last);
          page = searchPage(last.body as string);
          if (!page) return unreadable(`no postings on the last ${category} search page`);
        }
        // A last page still short of the total leaves postings unread: absence must not close them.
        if (page.postings.length < page.totalCount) allRead = false;
        itemsReturned += page.postings.length;
        for (const posting of page.postings) {
          const listing = toListing(posting, category);
          if (!listing) return unreadable("unexpected posting shape");
          if (seen.has(listing.sourceItemId)) continue;
          seen.add(listing.sourceItemId);
          listings.push(listing);
        }
      }
      return {
        completeness: allRead ? "complete" : "capped",
        listings,
        itemsReturned,
        coversPublishedAfter: null,
      };
    },
  };
}
