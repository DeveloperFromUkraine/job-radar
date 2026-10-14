// The look-alike rule (AC-10, AC-11; ADR-0004): the collector's merge normalization, then bracketed
// parts other than region names dropped and Sr/Jr read as Senior/Junior. Publication times and
// location restrictions are not compared. Computed on read, so widening the rule needs no migration.
import { normalizeCompany, normalizeTitle } from "../../collector/app/match-keys.js";
import type { Mark } from "./mark.js";

// ponytail: fixed region list, no upstream definition yet; tune with spec §8's look-alike question (due 2026-10-31).
const REGIONS = new Set([
  "worldwide",
  "global",
  "europe",
  "eu",
  "emea",
  "uk",
  "us",
  "usa",
  "north america",
  "americas",
  "latam",
  "south america",
  "apac",
  "asia",
  "africa",
  "oceania",
  "canada",
  "australia",
]);

const BRACKETS = /[([{]([^)\]}]*)[)\]}]/g;
const ABBREVIATIONS: Record<string, string> = { sr: "senior", jr: "junior" };

function titleKey(title: string): string {
  const kept = title.replace(BRACKETS, (_, inner: string) =>
    REGIONS.has(inner.trim().toLowerCase()) ? ` ${inner} ` : " ",
  );
  return normalizeTitle(kept)
    .split(" ")
    .map((w) => ABBREVIATIONS[w] ?? w)
    .join(" ");
}

// ponytail: process-wide memo of keys, dropped whole at 50k entries; ADR-0004's upgrade path when a
// page passed 1 s p95 with 5,000 marks. Keys are pure in (company, title), so it can never go stale.
const keys = new Map<string, string>();

export function lookAlikeKey(company: string, title: string): string {
  const id = `${company}\u0000${title}`;
  let key = keys.get(id);
  if (key === undefined) {
    if (keys.size >= 50_000) keys.clear();
    key = `${normalizeCompany(company)}|${titleKey(title)}`;
    keys.set(id, key);
  }
  return key;
}

export interface MarkedForHint {
  mark: Mark;
  markedAt: number;
  company: string;
}

/** The mark a hint names: an applied one if any, else the most recently set skip. */
export function winningMark<T extends MarkedForHint>(matches: readonly T[]): T | undefined {
  const rank = (m: T) => (m.mark === "applied" ? 1 : 0);
  return matches.reduce<T | undefined>(
    (best, m) =>
      !best || rank(m) > rank(best) || (rank(m) === rank(best) && m.markedAt > best.markedAt) ? m : best,
    undefined,
  );
}
