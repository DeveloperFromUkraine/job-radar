// Just Join IT: no public feed, and its API host disallows robots (api.justjoin.it/robots.txt,
// "Disallow: /", read 2026-10-17). The offer list pages on justjoin.it are allowed and carry the
// newest 50 offers of a category as data inside the page (the Next.js RSC payload), with the full
// description. One request per owner category a run, remote offers only; the page holds only the
// newest 50, so it is `capped` — absence never closes, `expiredAt` is the direct close signal.
import type { FetchResult, RawListing } from "../../domain/adapter.js";
import { type FetchContext, isObject, notOk, payText, type SourceAdapter, unreadable } from "./types.js";

/** The page's RSC payload: every `self.__next_f.push([1,"…"])` string, decoded and joined. */
function rscPayload(html: string): string {
  let text = "";
  for (const m of html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)) {
    text += JSON.parse(m[1] as string) as string;
  }
  return text;
}

/** The JSON array after `"offers":`, cut by bracket depth outside strings. */
function offersArray(payload: string): unknown[] | null {
  const key = payload.indexOf('{"offers":[');
  if (key < 0) return null;
  const start = key + '{"offers":'.length;
  let depth = 0;
  let inString = false;
  for (let i = start; i < payload.length; i++) {
    const c = payload[i];
    if (inString) {
      if (c === "\\") i++;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === "[" || c === "{") depth++;
    else if (c === "]" || c === "}") {
      depth--;
      if (depth === 0) {
        const parsed: unknown = JSON.parse(payload.slice(start, i + 1));
        return Array.isArray(parsed) ? parsed : null;
      }
    }
  }
  return null;
}

const time = (v: unknown): number | null => {
  const parsed = typeof v === "string" ? Date.parse(v) : Number.NaN;
  return Number.isNaN(parsed) ? null : parsed;
};

/** Each contract type's pay as stated in its original currency: "b2b EUR 60000–80000 per year". */
function pay(types: unknown): string {
  if (!Array.isArray(types)) return "";
  return types
    .filter((t) => isObject(t) && t.currencySource === "original")
    .map((t) => {
      const text = payText(t.from, t.to, t.currency, t.unit);
      return text && typeof t.type === "string" ? `${t.type} ${text}` : text;
    })
    .filter(Boolean)
    .join("; ");
}

const SITE = "https://justjoin.it";

function toListing(offer: unknown, category: string): RawListing | null {
  if (!isObject(offer)) return null;
  const { guid, slug, title, companyName } = offer;
  if (typeof guid !== "string" || typeof slug !== "string" || typeof title !== "string") return null;
  const skills = Array.isArray(offer.requiredSkills)
    ? offer.requiredSkills.filter((s) => typeof s === "string")
    : [];
  const contracts = Array.isArray(offer.employmentTypes)
    ? [
        ...new Set(
          offer.employmentTypes
            .map((t) => (isObject(t) ? t.type : null))
            .filter((t) => typeof t === "string"),
        ),
      ]
    : [];
  return {
    sourceItemId: guid,
    url: `${SITE}/job-offer/${slug}`,
    title,
    company: typeof companyName === "string" ? companyName : "",
    // The list page has no full text, so what it does state goes into the description for the skill
    // match and the match score: level, contract types and required skills.
    description: [
      typeof offer.body === "string" ? offer.body : "",
      typeof offer.experienceLevel === "string" ? `<p>Level: ${offer.experienceLevel}</p>` : "",
      contracts.length > 0 ? `<p>Contract: ${contracts.join(", ")}</p>` : "",
      `<p>Required skills: ${skills.join(", ")}</p>`,
    ]
      .filter(Boolean)
      .join("\n"),
    // A Polish board: its remote offers are for candidates in Poland unless the text says otherwise.
    locationRestriction: "Poland",
    categories: [category],
    publishedAt: time(offer.publishedAt),
    expiresAt: time(offer.expiredAt),
    payField: pay(offer.employmentTypes),
  };
}

export function justJoinItAdapter(baseUrl = SITE): SourceAdapter {
  return {
    id: "justjoinit",
    async fetchLatest(ctx: FetchContext): Promise<FetchResult> {
      const listings: RawListing[] = [];
      const seen = new Set<string>();
      let itemsReturned = 0;
      for (const category of ctx.categories ?? []) {
        const res = await ctx.http.getText(
          `${baseUrl}/job-offers/all-locations/${encodeURIComponent(category)}?remote=yes`,
        );
        if (res.kind !== "ok") return notOk(res);
        const offers = offersArray(rscPayload(res.body as string));
        if (!offers) return unreadable(`no offer list on the ${category} page`);
        itemsReturned += offers.length;
        for (const offer of offers) {
          if (isObject(offer) && offer.workplaceType !== "remote") continue;
          const listing = toListing(offer, category);
          if (!listing) return unreadable("unexpected offer shape");
          // An offer in two of the owner's categories is one listing, kept with the first.
          if (seen.has(listing.sourceItemId)) continue;
          seen.add(listing.sourceItemId);
          listings.push(listing);
        }
      }
      return { completeness: "capped", listings, itemsReturned, coversPublishedAfter: null };
    },
  };
}
