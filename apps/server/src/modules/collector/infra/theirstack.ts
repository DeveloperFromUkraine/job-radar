// TheirStack (theirstack.com), used only to find companies that are hiring: one jobs search a day
// with the owner's key (THEIRSTACK_API_KEY), whose links lead to the companies' own boards. Each job
// returned costs a credit (the free plan had 200 a month on 2026-10-20), so the search is small and
// narrow. Any failure finds nothing: discovery is a bonus, never a reason for a run to fail.
const ENDPOINT = "https://api.theirstack.com/v1/jobs/search";
const LIMIT = 6; // ponytail: ~200 credits a month on the free plan; raise with a paid plan
const EU = [
  "PL",
  "DE",
  "NL",
  "IE",
  "GB",
  "SE",
  "DK",
  "FI",
  "NO",
  "ES",
  "PT",
  "FR",
  "BE",
  "AT",
  "CH",
  "CZ",
  "EE",
  "LT",
  "LV",
];

export interface HiringJob {
  company: string;
  links: string;
}

export async function searchHiring(apiKey: string, endpoint = ENDPOINT): Promise<HiringJob[]> {
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        page: 0,
        limit: LIMIT,
        posted_at_max_age_days: 1,
        workplace_types_or: ["remote"],
        job_country_code_or: EU,
        job_title_or: ["frontend", "front end", "full stack", "fullstack", "react", "typescript"],
        job_title_not: ["java", ".net", "php", "junior", "intern", "python", "c#"],
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return [];
    const body = (await res.json()) as { data?: unknown };
    if (!Array.isArray(body.data)) return [];
    return body.data.map((j: Record<string, unknown>) => ({
      company: typeof j.company === "string" ? j.company : "",
      links: [j.final_url, j.url, j.source_url].filter((v) => typeof v === "string").join("\n"),
    }));
  } catch {
    return [];
  }
}
