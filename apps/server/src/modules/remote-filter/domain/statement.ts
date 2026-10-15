// Reads one stated location restriction and decides one listing's verdict for a country on a date
// (spec AC-01, AC-02; sad §8 "Reading a statement"). Pure: the date is a parameter, statements are plain text.
import {
  AMBIGUOUS_NAMES,
  COUNTRY_NAMES,
  EXCEPTION_WORDS,
  FILLER_WORDS,
  FLAGS,
  normalize,
  offsetsFor,
  REGIONS,
  SOFT_WORDS,
  ZONE_NAMES,
} from "./vocabulary.js";

// Contract schema LocationCheck, in priority order: exception > hours_only > not_recognised > not_stated.
export type LocationCheck = "exception" | "hours_only" | "not_recognised" | "not_stated";
export type ListingVerdict =
  | { kind: "fits" }
  | { kind: "not_open" }
  | { kind: "check"; reason: LocationCheck };

interface Reading {
  places: Array<Set<string>>; // each named country (one code) or region (its members)
  zones: Array<[number, number]>; // offset ranges in minutes, inclusive
  shortZones: string[]; // two-letter zone names (et, ct, mt, pt): also country codes
  anywhere: boolean;
  ambiguous: string[]; // codes of names that are also a part of another country (Georgia)
  exception: boolean;
  soft: boolean;
  cutShort: boolean;
  unknown: boolean;
}

// ponytail: length guard instead of a smarter parser; long real lists stay well under it (spec §6.1).
const MAX_LENGTH = 2000;

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const word = (body: string, flags = "g") => new RegExp(`(?<![a-z0-9])(?:${body})(?![a-z0-9])`, flags);

const ZONE = `(?:utc|gmt)\\s*[+\\-−]\\s*\\d{1,2}(?:[:.]\\d{1,2})?|${[...ZONE_NAMES.keys()].sort((a, b) => b.length - a.length).join("|")}`;
const ZONE_RE = word(`(${ZONE})(?:\\s*(?:to|–|—|-|−)\\s*(${ZONE}))?(?:\\s+hours)?`);
const ANYWHERE = ["anywhere in the world", "anywhere"];
// Country names, aliases, short codes and regions in one pass, longest first, whole words only.
const PHRASE_RE = word(
  [...COUNTRY_NAMES.keys(), ...REGIONS.keys(), ...ANYWHERE]
    .sort((a, b) => b.length - a.length)
    .map(escapeRe)
    .join("|"),
);
const CUT_SHORT_RE = /…|\.\.\.|\+\s*\d+\s*more/g;
const SOFT_RE = word(SOFT_WORDS.map(escapeRe).join("|"));
const FLAG_RE = /\p{Regional_Indicator}{2}/gu;
const ZONE_MARK = "\uE000"; // stands in for a zone ZONE_RE has read
const BROKEN_RANGE_RE = /\uE000[^\p{L}\p{N}\uE000]*[-–—−][^\p{L}\p{N}\uE000]*\uE000/u;

function zoneOffsets(zone: string): number[] {
  const named = ZONE_NAMES.get(zone);
  if (named) return named;
  const m = /^(?:utc|gmt)\s*([+\-−])\s*(\d{1,2})(?:([:.])(\d{1,2}))?$/.exec(zone);
  if (!m) return [];
  const minutes = !m[4] ? 0 : m[3] === ":" ? Number(m[4]) : Math.round(Number(`0.${m[4]}`) * 60);
  return [(m[1] === "+" ? 1 : -1) * (Number(m[2]) * 60 + minutes)];
}

function read(statement: string): Reading {
  const r: Reading = {
    places: [],
    zones: [],
    shortZones: [],
    anywhere: false,
    ambiguous: [],
    exception: false,
    soft: false,
    cutShort: false,
    unknown: false,
  };
  // The zone marker must only ever stand for a zone ZONE_RE read (re-review 4 N-4).
  if (statement.includes(ZONE_MARK)) r.unknown = true;
  let rest = statement.replace(FLAG_RE, (flag) => {
    const code = FLAGS.get(flag);
    if (code) r.places.push(new Set([code]));
    else r.unknown = true;
    return " , ";
  });
  rest = normalize(rest)
    .replace(CUT_SHORT_RE, () => {
      r.cutShort = true;
      return " , ";
    })
    .replace(SOFT_RE, () => {
      r.soft = true;
      return " , ";
    })
    .replace(ZONE_RE, (_all, from: string, to?: string) => {
      const offsets = [...zoneOffsets(from), ...(to ? zoneOffsets(to) : [])];
      for (const z of [from, to]) if (z?.length === 2) r.shortZones.push(z);
      if (to) r.zones.push([Math.min(...offsets), Math.max(...offsets)]);
      else for (const o of offsets) r.zones.push([o, o]);
      return ` ${ZONE_MARK} `;
    });
  // A dash run between two zones the range reader did not join ("UTC-1 -- UTC+3", "(UTC-1) - (UTC+3)") may be a
  // range: never read it as two points (re-review 3 N-1c). Checked before places go, so a place between the two
  // zones ("Poland (CET) - Romania (EET)") still breaks the run (re-review 4 N-4).
  if (BROKEN_RANGE_RE.test(rest)) r.unknown = true;
  rest = rest.replace(PHRASE_RE, (phrase) => {
    if (ANYWHERE.includes(phrase)) r.anywhere = true;
    else if (AMBIGUOUS_NAMES.has(phrase)) r.ambiguous.push(COUNTRY_NAMES.get(phrase) as string);
    else {
      const code = COUNTRY_NAMES.get(phrase);
      r.places.push(code ? new Set([code]) : (REGIONS.get(phrase) as Set<string>));
    }
    return " , ";
  });
  // Only a fixed set separates words: spaces, list punctuation, ZONE_RE's own dashes, the zone marker and a lone
  // dot. Anything else left over (Польша, 🌍, "~", "->", "..", "〜", "‒") is a word, unknown → check (review F-1,
  // N-1, N-1b).
  for (const w of rest.split(/(?:[\s,;/|()[\]:!?"'*·•&+\-–—−\uE000]|(?<!\.)\.(?!\.))+/u)) {
    if (!w || FILLER_WORDS.has(w)) continue;
    if (EXCEPTION_WORDS.has(w)) r.exception = true;
    else r.unknown = true;
  }
  return r;
}

const check = (reason: LocationCheck): ListingVerdict => ({ kind: "check", reason });

// One listing's verdict: hide (not_open) only on a confident reading that leaves the country out.
export function listingVerdict(statement: string | null, country: string, date: Date): ListingVerdict {
  if (statement === null || statement.trim() === "") return check("not_stated");
  if (statement.length > MAX_LENGTH) return check("not_recognised");
  const r = read(statement);
  if (r.exception) return check("exception");
  // "PT" may be Pacific Time or Portugal: unknown when it is the judged country's own code (review F-2).
  if (r.shortZones.includes(country.toLowerCase())) r.unknown = true;

  // "Anywhere" is Worldwide only when it is the whole statement; beside other parts it is dropped (AC-10).
  const otherParts = r.places.length + r.zones.length > 0 || r.unknown || r.ambiguous.length > 0;
  if (r.anywhere && !otherParts) r.places.push(REGIONS.get("worldwide") as Set<string>);

  const offsets = offsetsFor(country, date);
  const placeFits = r.places.some((p) => p.has(country));
  const zonesFit = r.zones.some(([lo, hi]) => offsets.some((o) => lo <= o && o <= hi));
  const hasPlaces = r.places.length > 0;
  // Georgia is read only when another part already decides (AC-01).
  if (
    r.ambiguous.length &&
    (!(hasPlaces || r.zones.length) || (!placeFits && r.ambiguous.includes(country)))
  ) {
    r.unknown = true;
  }

  const hoursOnly = hasPlaces && !placeFits && zonesFit;
  if (r.unknown || r.soft || !(hasPlaces || r.zones.length))
    return check(hoursOnly ? "hours_only" : "not_recognised");
  if (placeFits || (!hasPlaces && zonesFit)) return { kind: "fits" };
  if (hoursOnly) return check("hours_only");
  return r.cutShort ? check("not_recognised") : { kind: "not_open" };
}
