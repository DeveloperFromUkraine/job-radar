// Company job boards (the "ats" source): the applicant-tracking systems whose public job-board APIs
// list a company's open roles without a key — Greenhouse, Lever and Ashby. Pure: finding a board in a
// link, guessing a board's name from a company's, and sorting a title into the owner's roles.

export type Ats = "greenhouse" | "lever" | "ashby";
export const ATS_LIST: readonly Ats[] = ["greenhouse", "lever", "ashby"];

export interface BoardRef {
  ats: Ats;
  slug: string;
}

const LINKS: readonly [Ats, RegExp][] = [
  [
    "greenhouse",
    /(?:boards|job-boards)(?:\.eu)?\.greenhouse\.io\/(?:embed\/job_board\?for=)?([a-z0-9_-]+)/gi,
  ],
  ["lever", /jobs\.(?:eu\.)?lever\.co\/([a-z0-9_.-]+)/gi],
  ["ashby", /jobs\.ashbyhq\.com\/([a-z0-9_.%-]+)/gi],
];
const NOT_SLUGS = new Set(["embed", "v1", "api"]);

/** Every distinct board linked from a text (a listing's apply link, a careers page). */
export function findBoards(text: string): BoardRef[] {
  const found = new Map<string, BoardRef>();
  for (const [ats, pattern] of LINKS) {
    for (const m of text.matchAll(pattern)) {
      // A link ending a sentence keeps its full stop out of the name.
      const slug = decodeURIComponent(m[1] ?? "")
        .toLowerCase()
        .replace(/\.+$/, "");
      if (slug && !NOT_SLUGS.has(slug)) found.set(`${ats}:${slug}`, { ats, slug });
    }
  }
  return [...found.values()];
}

/** The public page a person opens for a board. */
export function boardPage({ ats, slug }: BoardRef): string {
  if (ats === "greenhouse") return `https://job-boards.greenhouse.io/${slug}`;
  if (ats === "lever") return `https://jobs.lever.co/${slug}`;
  return `https://jobs.ashbyhq.com/${slug}`;
}

const LEGAL = /\b(inc|ltd|llc|gmbh|sp\.? ?z ?o\.? ?o|s\.?a|corp|co|limited|group|technologies)\b\.?/g;

/** A company name compared across sources: lower case, letters and digits only. */
export const nameKey = (name: string): string => name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

/**
 * Board names a company is likely to use ("Lemon.io" → lemonio, lemon-io), tried in order. Checked
 * live on 2026-10-20: 18 of 40 collected companies answered on one of the three systems.
 * ponytail: a common word as a name (Upgrade, Socket) can find another company's board; the owner
 * removes it on the companies list.
 */
export function slugGuesses(name: string): string[] {
  const words =
    name
      .toLowerCase()
      .replace(LEGAL, " ")
      .match(/[a-z0-9]+/g) ?? [];
  if (words.length === 0) return [];
  return [...new Set([words.join(""), words.join("-")])];
}

/** The roles a title names; none → the listing is not an engineering role the owner tracks. */
const ROLES: readonly [string, RegExp][] = [
  ["fullstack", /full[\s-]?stack/i],
  [
    "frontend",
    /front[\s-]?end|\breact\b(?![\s-]?native)|\bvue\b|angular|\bui (?:engineer|developer)|\bweb (?:engineer|developer)|javascript|typescript/i,
  ],
  ["mobile", /react[\s-]?native|\bios\b|android|mobile/i],
  ["backend", /back[\s-]?end|\bnode(?:\.?js)?\b|platform engineer/i],
  ["software", /software (?:engineer|developer)|product engineer/i],
];

export const ATS_ROLES: readonly string[] = ROLES.map(([role]) => role);

export function rolesOf(title: string): string[] {
  return ROLES.filter(([, pattern]) => pattern.test(title)).map(([role]) => role);
}
