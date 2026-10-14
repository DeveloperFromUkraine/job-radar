// The country vocabulary (ADR-0003): names, flags and zones from Intl, plus the hand-kept tables of sad §8 —
// aliases, regions, zone names, filler / soft / exception words and short codes. Pure; no I/O.

export interface Country {
  code: string; // ISO 3166-1 alpha-2 (XK for Kosovo)
  name: string;
  flag: string;
}

// The fixed ISO 3166-1 alpha-2 list, territories included, plus XK.
const CODES =
  `AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW
BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA
GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH
KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY
MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH
SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI
VN VU WF WS XK YE YT ZA ZM ZW`.split(/\s+/);

// Where Intl's English name is unusual, the list shows this one instead (contract schema Country).
const PREFERRED_NAMES: Record<string, string> = { HK: "Hong Kong", MO: "Macau" };

// ICU names no zone for these codes.
const ZONE_FALLBACK: Record<string, string[]> = { XK: ["Europe/Belgrade"] };

// Accepted beside the Intl English name (sad §8 Aliases). Keys are normalized with normalize().
const ALIASES: Record<string, string> = {
  "united states of america": "US",
  "united kingdom of great britain and northern ireland": "GB",
  "great britain": "GB",
  "czech republic": "CZ",
  "hong kong": "HK",
  "moldova (republic of)": "MD",
  "republic of moldova": "MD",
  turkey: "TR",
  "south korea": "KR",
  "korea, republic of": "KR",
  russia: "RU",
  "russian federation": "RU",
  vietnam: "VN",
  "viet nam": "VN",
  macau: "MO",
  macao: "MO",
  "ivory coast": "CI",
  "cote d'ivoire": "CI",
  "palestine, state of": "PS",
  "iran (islamic republic of)": "IR",
  "bolivia (plurinational state of)": "BO",
  "venezuela (bolivarian republic of)": "VE",
  "tanzania, united republic of": "TZ",
  "taiwan, province of china": "TW",
  "netherlands (kingdom of the)": "NL",
};

// Unambiguous short codes read as countries (sad §8 Short codes); "EU" is a region, every other code is unread.
export const SHORT_CODES = new Map<string, string>([
  ["us", "US"],
  ["usa", "US"],
  ["u.s.", "US"],
  ["u.s.a.", "US"],
  ["uk", "GB"],
  ["uae", "AE"],
]);

// A name that is both a country and a part of another country: read only when another part decides (AC-01).
export const AMBIGUOUS_NAMES = new Set(["georgia"]);

const EU27 = "AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE";
// ponytail: hand-kept lists err toward inclusion (sad §11); the example-set test catches a missing member.
const EUROPE = `${EU27} IS LI NO GB CH AL BA ME MK RS XK UA MD BY AD MC SM VA GI FO IM JE GG AX SJ`;
const MIDDLE_EAST = "AE BH EG IL IQ IR JO KW LB OM PS QA SA SY TR YE GE AM AZ";
const AFRICA = `DZ AO BJ BW BF BI CV CM CF TD KM CG CD CI DJ EG GQ ER SZ ET GA GM GH GN GW KE LS LR LY MG MW ML MR MU
YT MA MZ NA NE NG RE RW SH ST SN SC SL SO ZA SS SD TZ TG TN UG EH ZM ZW IO`;
const LATAM = "MX BZ CR SV GT HN NI PA AR BO BR CL CO EC GY PY PE SR UY VE GF FK CU DO PR";
const NORTH_AMERICA = "US CA MX GL BM PM";
const CARIBBEAN = "AG AI AW BB BL BQ BS CW DM GD GP HT JM KN KY LC MF MQ MS SX TC TT VC VG VI";
const APAC = `CN HK MO TW JP KR KP MN BN KH ID LA MY MM PH SG TH TL VN AF BD BT IN MV NP PK LK AU NZ FJ PG SB VU NC PF WS
TO KI TV NR PW FM MH CK NU TK WF GU MP AS NF CX CC PN`;

const set = (...lists: string[]) => new Set(lists.join(" ").split(/\s+/).filter(Boolean));
const ALL = set(CODES.join(" "));

// Region names (normalized) → member codes. "Anywhere" is Worldwide only when alone — statement.ts decides that.
export const REGIONS = new Map<string, Set<string>>([
  ["worldwide", ALL],
  ["global", ALL],
  ["europe", set(EUROPE)],
  ["eu", set(EU27)],
  ["european union", set(EU27)],
  ["emea", set(EUROPE, MIDDLE_EAST, AFRICA, "RU TR")],
  ["latam", set(LATAM)],
  ["latin america", set(LATAM)],
  ["americas", set(NORTH_AMERICA, LATAM, CARIBBEAN, "GS UM")],
  ["north america", set(NORTH_AMERICA)],
  ["northern america", set(NORTH_AMERICA)],
  ["apac", set(APAC)],
  ["asia-pacific", set(APAC)],
  ["asia pacific", set(APAC)],
]);

// Zone names → UTC offsets in minutes (sad §8 Zones). A generic US zone covers both its standard and daylight offset.
export const ZONE_NAMES = new Map<string, number[]>([
  ["utc", [0]],
  ["gmt", [0]],
  ["wet", [0]],
  ["west", [60]],
  ["cet", [60]],
  ["cest", [120]],
  ["eet", [120]],
  ["eest", [180]],
  ["et", [-300, -240]],
  ["est", [-300]],
  ["edt", [-240]],
  ["ct", [-360, -300]],
  ["cst", [-360]],
  ["cdt", [-300]],
  ["mt", [-420, -360]],
  ["mst", [-420]],
  ["mdt", [-360]],
  ["pt", [-480, -420]],
  ["pst", [-480]],
  ["pdt", [-420]],
]);

export const FILLER_WORDS = new Set([
  "remote",
  "only",
  "based",
  "fully",
  "in",
  "the",
  "100%",
  "and",
  "or",
  "&",
]);
export const SOFT_WORDS = ["nice to have", "preferred", "ideally", "welcome", "plus"];
export const EXCEPTION_WORDS = new Set(["except", "excluding", "not", "outside"]);

// Lower-case, strip diacritics, straighten quotes, squeeze spaces: "Türkiye" → "turkiye".
export function normalize(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[‘’`´]/g, "'")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const flagOf = (code: string) => String.fromCodePoint(...[...code].map((ch) => 0x1f1a5 + ch.charCodeAt(0)));

// The region time-zone accessor is the `timeZones` getter in Node 22 and `getTimeZones()` in newer V8 (ADR-0003).
export function regionTimeZones(locale: { timeZones?: string[]; getTimeZones?: () => string[] }): string[] {
  return locale.getTimeZones?.() ?? locale.timeZones ?? [];
}

export function timeZonesOf(code: string): string[] {
  return ZONE_FALLBACK[code] ?? regionTimeZones(new Intl.Locale(`und-${code}`) as never);
}

const intlNames = new Intl.DisplayNames(["en"], { type: "region", fallback: "none" });

// Every code Intl names in English (ADR-0003 answer to spec §8 Q3).
const COUNTRIES: Country[] = CODES.flatMap((code) => {
  const name = intlNames.of(code) && (PREFERRED_NAMES[code] ?? intlNames.of(code));
  return name ? [{ code, name, flag: flagOf(code) }] : [];
}).sort((a, b) => a.name.localeCompare(b.name, "en"));

const BY_CODE = new Map(COUNTRIES.map((c) => [c.code, c]));

// Every name a country answers to (Intl name, preferred name, aliases, short codes), normalized → code.
export const COUNTRY_NAMES = new Map<string, string>([
  ...COUNTRIES.map((c) => [normalize(c.name), c.code] as const),
  // Intl writes "Bosnia & Herzegovina", "St. Lucia"; sources also write "and" and "Saint".
  ...COUNTRIES.flatMap((c) => {
    const intl = normalize(intlNames.of(c.code) ?? c.name);
    return [intl, intl.replace(/ & /g, " and "), intl.replace(/\bst\. /g, "saint ")].map(
      (n) => [n, c.code] as const,
    );
  }),
  ...Object.entries(ALIASES),
  ...SHORT_CODES,
]);

export const FLAGS = new Map(COUNTRIES.map((c) => [c.flag, c.code]));

export function countryList(): Country[] {
  return COUNTRIES;
}

export function countryByCode(code: string): Country | undefined {
  return BY_CODE.get(code);
}

// AC-05: an English name, alias, short code or flag, ignoring case and surrounding spaces; regions find nothing.
export function lookupCountry(name: string): Country | undefined {
  const trimmed = name.trim();
  const code = FLAGS.get(trimmed) ?? COUNTRY_NAMES.get(normalize(trimmed));
  return code ? BY_CODE.get(code) : undefined;
}

const offsetCache = new Map<string, number[]>();

function zoneOffset(timeZone: string, at: Date): number {
  const label =
    new Intl.DateTimeFormat("en", { timeZone, timeZoneName: "longOffset" })
      .formatToParts(at)
      .find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const m = /GMT([+-])(\d\d):(\d\d)/.exec(label);
  return m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
}

// The country's UTC offsets (minutes, ascending) on 15 January and 15 July of the date's year — so the
// verdict never changes with the season (spec §6).
export function offsetsFor(code: string, date: Date): number[] {
  const year = date.getUTCFullYear();
  const key = `${code}:${year}`;
  let offsets = offsetCache.get(key);
  if (!offsets) {
    const days = [new Date(Date.UTC(year, 0, 15, 12)), new Date(Date.UTC(year, 6, 15, 12))];
    offsets = [...new Set(timeZonesOf(code).flatMap((tz) => days.map((d) => zoneOffset(tz, d))))].sort(
      (a, b) => a - b,
    );
    offsetCache.set(key, offsets);
  }
  return offsets;
}
