// Wellfound: its remote role pages (`/role/r/<role>`, allowed by robots.txt, read 2026-10-17) carry
// that role's remote jobs with their full text in the page's Apollo state (`__NEXT_DATA__`). One
// request per owner role; an unknown role redirects to a page without jobs. A page holds only part of
// a role's jobs, so the read is `capped`; a job expires 30 days after it was last seen.
import type { FetchResult, RawListing } from "../../domain/adapter.js";
import { type FetchContext, isObject, notOk, type SourceAdapter, unreadable } from "./types.js";

const SITE = "https://wellfound.com";
const DAY = 24 * 60 * 60 * 1000;
const text = (v: unknown): string => (typeof v === "string" ? v : "");

/** The page's Apollo cache: one flat map of "Type:id" → object. */
function apolloState(html: string): Record<string, unknown> | null {
  const m = /<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!m) return null;
  let data: unknown;
  try {
    data = JSON.parse(m[1] as string);
  } catch {
    return null;
  }
  const props = isObject(data) && isObject(data.props) ? data.props : {};
  const page = isObject(props.pageProps) ? props.pageProps : props;
  const state = isObject(page.apolloState) ? page.apolloState.data : null;
  return isObject(state) ? state : null;
}

export function wellfoundAdapter(baseUrl = SITE): SourceAdapter {
  return {
    id: "wellfound",
    async fetchLatest(ctx: FetchContext): Promise<FetchResult> {
      const listings: RawListing[] = [];
      const seen = new Set<string>();
      let itemsReturned = 0;
      for (const role of ctx.categories ?? []) {
        const res = await ctx.http.getText(`${baseUrl}/role/r/${encodeURIComponent(role)}`);
        if (res.kind !== "ok") return notOk(res);
        const state = apolloState(res.body as string);
        if (!state) return unreadable(`no job data on the ${role} page`);
        // Companies name their jobs by reference: "JobListingSearchResult:<id>".
        const companyOf = new Map<string, string>();
        for (const [key, value] of Object.entries(state)) {
          if (!key.startsWith("StartupResult:") || !isObject(value)) continue;
          const refs = Array.isArray(value.highlightedJobListings) ? value.highlightedJobListings : [];
          for (const ref of refs) if (isObject(ref)) companyOf.set(text(ref.__ref), text(value.name));
        }
        for (const [key, job] of Object.entries(state)) {
          if (!key.startsWith("JobListingSearchResult:") || !isObject(job)) continue;
          itemsReturned++;
          const id = text(job.id);
          const title = text(job.title).trim();
          if (!id || !title) return unreadable("unexpected job shape");
          if (seen.has(id)) continue;
          seen.add(id);
          const accepted = Array.isArray(job.acceptedRemoteLocationNames)
            ? job.acceptedRemoteLocationNames.filter((l) => typeof l === "string")
            : [];
          const live = typeof job.liveStartAt === "number" ? job.liveStartAt * 1000 : null;
          listings.push({
            sourceItemId: id,
            url: `${SITE}/jobs/${id}-${text(job.slug)}`,
            title,
            company: companyOf.get(key) ?? "",
            description: text(job.description),
            // Where remote work is accepted from, when stated; none stated is unknown.
            locationRestriction: accepted.length > 0 ? accepted.join(", ") : null,
            categories: [role],
            publishedAt: live,
            expiresAt: ctx.now + 30 * DAY,
            payField: text(job.compensation),
          });
        }
      }
      return { completeness: "capped", listings, itemsReturned, coversPublishedAfter: null };
    },
  };
}
