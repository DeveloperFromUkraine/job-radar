// Per-listing rules applied before merging: plain text only (sad §8), location kept exactly as
// stated or recorded as unknown (AC-21, AC-22), and the owner's category filter (AC-23).
import type { NormalizedListing, RawListing } from "./adapter.js";
import type { SourceId } from "./sources.js";

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, body: string) => {
    if (body[0] === "#") {
      const code =
        body[1]?.toLowerCase() === "x" ? Number.parseInt(body.slice(2), 16) : Number(body.slice(1));
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? match;
  });
}

/** Markup to plain text. Descriptions keep line breaks; titles and names become a single line. */
export function toPlainText(html: string, options: { singleLine?: boolean } = {}): string {
  const withBreaks = html
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr)\s*>/gi, "\n")
    .replace(/<[^>]*>/g, "");
  const text = decodeEntities(withBreaks);
  if (options.singleLine) return text.replace(/\s+/g, " ").trim();
  return text
    .split("\n")
    .map((line) => line.replace(/[ \t\f\v\r ]+/g, " ").trim())
    .filter((line) => line !== "")
    .join("\n");
}

/** The source's statement as given; nothing stated → null (unknown), never "anywhere". */
export function toLocationRestriction(raw: RawListing["locationRestriction"]): string | null {
  if (raw == null) return null;
  const parts = (typeof raw === "string" ? [raw] : raw).map((p) => p.trim()).filter((p) => p !== "");
  return parts.length === 0 ? null : parts.join(", ");
}

export function normalizeListing(sourceId: SourceId, raw: RawListing): NormalizedListing {
  return {
    sourceId,
    sourceItemId: raw.sourceItemId,
    url: raw.url,
    title: toPlainText(raw.title, { singleLine: true }),
    company: toPlainText(raw.company, { singleLine: true }),
    description: toPlainText(raw.description),
    locationRestriction: toLocationRestriction(raw.locationRestriction),
    categories: raw.categories.map((c) => toPlainText(c, { singleLine: true })).filter((c) => c !== ""),
    publishedAt: raw.publishedAt,
    expiresAt: raw.expiresAt,
  };
}

/** Keep listings in at least one of the owner's categories; count those with no category at all. */
export function filterByCategories(
  listings: readonly NormalizedListing[],
  ownerCategories: readonly string[],
): { kept: NormalizedListing[]; noCategory: number } {
  const wanted = new Set(ownerCategories);
  let noCategory = 0;
  const kept = listings.filter((l) => {
    if (l.categories.length === 0) {
      noCategory++;
      return false;
    }
    return l.categories.some((c) => wanted.has(c));
  });
  return { kept, noCategory };
}
