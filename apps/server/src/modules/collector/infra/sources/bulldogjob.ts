// Bulldogjob: robots.txt disallows `/feeds` (read 2026-10-17) but allows the job search pages, which
// carry up to 50 jobs in the page's `__NEXT_DATA__` JSON. One remote search per owner role
// (`/companies/jobs/s/city,Remote/role,<role>`); a role with more jobs than one page holds is read
// `capped`, otherwise `complete`. The list gives no publication time, so age counts from when
// job-radar first found a job.
import type { FetchResult, RawListing } from "../../domain/adapter.js";
import { type FetchContext, isObject, notOk, type SourceAdapter, unreadable } from "./types.js";

const SITE = "https://bulldogjob.pl";

function searchPage(html: string): { jobs: unknown[]; totalCount: number } | null {
  const m = /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/.exec(html);
  if (!m) return null;
  let data: unknown;
  try {
    data = JSON.parse(m[1] as string);
  } catch {
    return null;
  }
  const props = isObject(data) && isObject(data.props) ? data.props.pageProps : null;
  if (!isObject(props) || !Array.isArray(props.jobs) || typeof props.totalCount !== "number") return null;
  return { jobs: props.jobs, totalCount: props.totalCount };
}

const text = (v: unknown): string => (typeof v === "string" ? v : "");

function toListing(job: unknown, role: string): RawListing | null {
  if (!isObject(job)) return null;
  const { id, position } = job;
  if (typeof id !== "string" || typeof position !== "string") return null;
  const salary = isObject(job.denominatedSalaryLong) ? job.denominatedSalaryLong : {};
  const contracts = [job.contractB2b && "b2b", job.contractEmployment && "employment"].filter(Boolean);
  const tags = Array.isArray(job.technologyTags)
    ? job.technologyTags.filter((t) => typeof t === "string")
    : [];
  return {
    sourceItemId: id,
    url: `${SITE}/companies/jobs/${id}`,
    title: position,
    company: isObject(job.company) ? text(job.company.name) : "",
    // The search page has no full text, so what it states goes in for the skill match and the score.
    description: [
      text(job.experienceLevel) ? `<p>Level: ${text(job.experienceLevel)}</p>` : "",
      contracts.length > 0 ? `<p>Contract: ${contracts.join(", ")}</p>` : "",
      tags.length > 0 ? `<p>Technologies: ${tags.join(", ")}</p>` : "",
    ]
      .filter(Boolean)
      .join("\n"),
    // A Polish board's remote search: open to candidates in Poland unless the text says otherwise.
    locationRestriction: "Poland",
    categories: [role],
    publishedAt: null,
    expiresAt: null,
    // The board states pay as one text, e.g. "20 000 - 24 000" with its currency.
    payField:
      text(salary.money) && !salary.hidden ? `${text(salary.money)} ${text(salary.currency)}`.trim() : "",
  };
}

export function bulldogjobAdapter(baseUrl = SITE): SourceAdapter {
  return {
    id: "bulldogjob",
    async fetchLatest(ctx: FetchContext): Promise<FetchResult> {
      const listings: RawListing[] = [];
      const seen = new Set<string>();
      let itemsReturned = 0;
      let allRead = true;
      for (const role of ctx.categories ?? []) {
        const res = await ctx.http.getText(
          `${baseUrl}/companies/jobs/s/city,Remote/role,${encodeURIComponent(role)}`,
        );
        if (res.kind !== "ok") return notOk(res);
        const page = searchPage(res.body as string);
        if (!page) return unreadable(`no jobs on the ${role} search page`);
        // More jobs than one page holds: the rest are unread, so absence must not close them.
        if (page.jobs.length < page.totalCount) allRead = false;
        itemsReturned += page.jobs.length;
        for (const job of page.jobs) {
          const listing = toListing(job, role);
          if (!listing) return unreadable("unexpected job shape");
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
