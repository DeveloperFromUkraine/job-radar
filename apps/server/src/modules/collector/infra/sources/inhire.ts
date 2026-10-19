// inhire.io: its offers page loads every open offer from POST /getAllOffersNonAuth (no login; robots.txt
// disallows only /wp-admin/, uploads and /cdn-cgi/, read 2026-10-17), 50 a page by `{"page": n}`, so a
// run reads pages until one comes back short. Only remote offers ("Remote within Poland") are kept,
// filtered to the owner's roles by the collector. Every page read → `complete`; each offer states
// how many hours it has left.
import type { FetchResult, RawListing } from "../../domain/adapter.js";
import { type FetchContext, isObject, notOk, type SourceAdapter, unreadable } from "./types.js";

const SITE = "https://inhire.io";
const PAGE_SIZE = 50;
const MAX_PAGES = 15;
const HOUR = 60 * 60 * 1000;
const PERIODS: Record<string, string> = { HOURLY: "per hour", MONTHLY: "per month", YEARLY: "per year" };
const text = (v: unknown): string => (typeof v === "string" ? v : "");

/** "contract 142-190 PLN per hour; permanent 18000-22000 PLN per month" from the salary object. */
function pay(salary: unknown): string {
  if (!isObject(salary)) return "";
  return ["contract", "permanent"]
    .filter((kind) => text(salary[kind]))
    .map((kind) =>
      `${kind} ${text(salary[kind])} ${PERIODS[text(salary[`salary_period_${kind}`])] ?? ""}`.trim(),
    )
    .join("; ");
}

function toListing(offer: unknown, now: number): RawListing | null {
  if (!isObject(offer)) return null;
  const extra = isObject(offer.offerAdditionalFields) ? offer.offerAdditionalFields : {};
  const id = offer.recruitment_process_id;
  const slug = text(extra.rp_url);
  const title = text(offer.process_title).trim();
  if ((typeof id !== "number" && typeof id !== "string") || !slug || !title) return null;
  const roles = text(offer.roles).split(",").filter(Boolean);
  const hoursLeft = typeof extra.time_to_expiry_in_hours === "number" ? extra.time_to_expiry_in_hours : null;
  const published = Date.parse(text(offer.insertion_timestamp));
  return {
    sourceItemId: String(id),
    url: `${SITE}/praca/${slug}`,
    title,
    company: text(offer.company_name),
    // The list has no full text: what it does state goes in for the skill match and the score.
    description: [
      text(offer.job_offer_text),
      `<p>Roles: ${roles.join(", ")}</p>`,
      text(offer.skills) ? `<p>Skills: ${text(offer.skills).split(",").join(", ")}</p>` : "",
      text(offer.agreement_type) ? `<p>Contract: ${text(offer.agreement_type)}</p>` : "",
      typeof extra.experience_low_bound === "number"
        ? `<p>Experience: ${extra.experience_low_bound}+ years</p>`
        : "",
    ]
      .filter(Boolean)
      .join("\n"),
    locationRestriction: "Poland",
    categories: roles,
    publishedAt: Number.isNaN(published) ? null : published,
    expiresAt: hoursLeft === null ? null : now + hoursLeft * HOUR,
    payField: offer.undisclosed_salary === true ? "" : pay(offer.salary),
  };
}

export function inhireAdapter(baseUrl = SITE): SourceAdapter {
  return {
    id: "inhire",
    async fetchLatest(ctx: FetchContext): Promise<FetchResult> {
      const listings: RawListing[] = [];
      const seen = new Set<string>();
      let itemsReturned = 0;
      let allRead = false;
      for (let page = 1; page <= MAX_PAGES; page++) {
        const res = await ctx.http.postJson(`${baseUrl}/getAllOffersNonAuth`, { page });
        if (res.kind !== "ok") return notOk(res);
        const offers = isObject(res.body) ? res.body.response : null;
        if (!Array.isArray(offers)) return unreadable("no offer list");
        itemsReturned += offers.length;
        for (const offer of offers) {
          // Remote only: the owner looks for remote roles, and on-site offers name only Polish cities.
          if (!isObject(offer) || !/remote/i.test(text(offer.cities))) continue;
          const listing = toListing(offer, ctx.now);
          if (!listing) return unreadable("unexpected offer shape");
          if (seen.has(listing.sourceItemId)) continue;
          seen.add(listing.sourceItemId);
          listings.push(listing);
        }
        if (offers.length < PAGE_SIZE) {
          allRead = true;
          break;
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
