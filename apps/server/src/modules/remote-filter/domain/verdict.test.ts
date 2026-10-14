import { describe, expect, it } from "vitest";
import type { ListingVerdict } from "./statement.js";
import { postingVerdict } from "./verdict.js";

const DATES = [new Date(Date.UTC(2026, 0, 15)), new Date(Date.UTC(2026, 6, 15))];
// Stand-in for the collector's isStatedAnywhere() export (T05); app/verdicts.ts injects the real one.
const isStatedAnywhere = (s: string | null) => s !== null && /^\s*anywhere( in the world)?\s*$/i.test(s);

const FITS: ListingVerdict = { kind: "fits" };
const NOT_OPEN: ListingVerdict = { kind: "not_open" };
const check = (reason: string) => ({ kind: "check", reason }) as ListingVerdict;

// Every distinct location restriction in the owner's collection on 2026-10-14, judged for Poland.
const COLLECTION: Array<[string | null, ListingVerdict]> = [
  ["USA", NOT_OPEN],
  [null, check("not_stated")],
  ["EMEA", FITS],
  ["EMEA,  LATAM,  Canada,  USA", FITS],
  ["LATAM", NOT_OPEN],
  ["UK", NOT_OPEN],
  ["Canada,  USA", NOT_OPEN],
  ["🇺🇸 United States of America", NOT_OPEN],
  ["United States, UTC-10, UTC-9, UTC-8, UTC-7, UTC-6, UTC-5, UTC+14", NOT_OPEN],
  ["Spain", NOT_OPEN],
  ["Poland", FITS],
  ["Northern America, LATAM, Europe, APAC", FITS],
  ["Europe", FITS],
  ["Canada", NOT_OPEN],
  ["APAC,  EMEA", FITS],
  ["APAC", NOT_OPEN],
  ["Sweden,  UK,  USA", NOT_OPEN],
  ["Sweden", NOT_OPEN],
  ["Portugal,  USA", NOT_OPEN],
  ["Mexico", NOT_OPEN],
  ["Hong Kong", NOT_OPEN],
  ["Argentina", NOT_OPEN],
  ["Americas, Europe, Israel", FITS],
  ["🇧🇧 Barbados and 🇺🇸 United States of America", NOT_OPEN],
  [
    "🇦🇩 Andorra, 🇦🇱 Albania, 🇦🇹 Austria, 🇧🇦 Bosnia and Herzegovina, 🇧🇬 Bulgaria, 🇨🇭 Switzerland, 🇨🇿 Czechia, 🇩🇪 Germany, 🇩🇰 Denmark, 🇪🇪 Estonia, 🇪🇸 Spain, 🇫🇮 Finland, 🇫🇷 France, 🇬🇧 United Kingdom of Great Britain and Northern Ireland, 🇬🇷 Greece, 🇭🇷 Croatia, 🇭🇺 Hungary, 🇮🇹 Italy, 🇱🇹 Lithuania, 🇲🇩 Moldova (Republic of), 🇲🇪 Montenegro, 🇲🇰 North Macedonia, 🇳🇱 Netherlands, 🇳🇴 Norway, 🇵🇱 Poland, 🇵🇹 Portugal, 🇷🇴 Romania, 🇸🇪 Sweden, 🇸🇮 Slovenia, 🇸🇰 Slovakia, and 🇺🇦 Ukraine",
    FITS,
  ],
  ["Worldwide", FITS],
  ["Vietnam", NOT_OPEN],
  ["USA, Canada, USA timezones", check("not_recognised")],
  ["Sweden,  UK", NOT_OPEN],
  ["Remote - Americas", NOT_OPEN],
  ["New Zealand, UTC+12, UTC+12.75", NOT_OPEN],
  ["Netherlands", NOT_OPEN],
  ["LATAM,  Canada,  Europe,  USA", FITS],
  ["Helsinki", check("not_recognised")],
  ["Germany", NOT_OPEN],
  ["France, Japan, Turkey, Vietnam, Mexico, Norway", NOT_OPEN],
  ["France,  Netherlands,  Spain", NOT_OPEN],
  ["France", NOT_OPEN],
  ["Europe, USA, UK, Canada, Australia, Ireland, Switzerland, Singapore, Mexico, Iceland, Norway", FITS],
  ["Europe, USA, Canada, APAC", FITS],
  ["Europe,  USA", FITS],
  ["Europe,  UK,  USA", FITS],
  ["EMEA,  USA", FITS],
  ["Denmark,  France,  Germany,  Netherlands,  Portugal,  Spain,  Sweden,  UK", NOT_OPEN],
  ["Czechia", NOT_OPEN],
  ["Brazil,  Canada,  USA", NOT_OPEN],
  ["Brazil,  Canada,  Europe,  USA", FITS],
  [
    "Argentina,  Brazil,  Canada,  Czechia,  Estonia,  Ireland,  Mexico,  Poland,  Portugal,  Romania,  Spain,  UK,  Ukraine,  USA",
    FITS,
  ],
  // AC-01 – AC-02 whole-name, exception and mixed examples, plus sad §10 QG-1 extras
  ["🇵🇱 Poland, 🇺🇦 Ukraine", FITS],
  ["UTC-1 to UTC+3", FITS],
  ["Worldwide except Poland", check("exception")],
  ["United States, UTC-10 to UTC+14", check("hours_only")],
  ["USA, Anywhere", NOT_OPEN],
  ["Remote", check("not_recognised")],
  ["Anywhere", FITS],
  ["Anywhere in the World", FITS],
];

// Merged postings: the statements of their open listings (AC-03 and the T04 edge cases).
const MERGED: Array<[string, Array<string | null>, ListingVerdict]> = [
  ["USA + nothing", ["USA", null], check("not_stated")],
  ["USA + Anywhere", ["USA", "Anywhere"], NOT_OPEN],
  ["EMEA + USA (changed after merging)", ["EMEA", "USA"], FITS],
  ["Anywhere + Anywhere", ["Anywhere", "Anywhere in the World"], FITS],
  ["Anywhere + nothing", ["Anywhere", null], FITS],
  ["Anywhere + Helsinki", ["Anywhere", "Helsinki"], check("not_recognised")],
  ["Anywhere + Worldwide except Poland", ["Anywhere", "Worldwide except Poland"], check("exception")],
  ["EMEA + Worldwide except Poland", ["EMEA", "Worldwide except Poland"], FITS],
  ["USA + Canada", ["USA", "Canada"], NOT_OPEN],
  [
    "reason priority across listings",
    [null, "Helsinki", "United States, UTC-10 to UTC+14", "Worldwide except Poland", "USA"],
    check("exception"),
  ],
  ["hours beats not recognised", [null, "Helsinki", "United States, UTC-10 to UTC+14"], check("hours_only")],
  ["not recognised beats not stated", [null, "Helsinki"], check("not_recognised")],
  ["no open listing (defensive)", [], check("not_stated")],
];

describe("postingVerdict — fixed example set (spec §6 Verdict correctness, Seasonal stability)", () => {
  for (const date of DATES) {
    const day = date.toISOString().slice(0, 10);
    it.each(COLLECTION)(`%j for Poland on ${day}`, (statement, expected) => {
      expect(postingVerdict([statement], "PL", date, isStatedAnywhere)).toEqual(expected);
    });
    it.each(MERGED)(`%s on ${day}`, (_name, statements, expected) => {
      expect(postingVerdict(statements, "PL", date, isStatedAnywhere)).toEqual(expected);
    });
  }
});

// Seeded generator: no new dependency, the same statements on every run.
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2 ** 31;
    return s / 2 ** 31;
  };
}

describe("never a wrong hide on uncertainty (spec §6 property)", () => {
  const rand = rng(20261014);
  const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)] as T;
  const PLACES = [
    "USA",
    "Canada",
    "LATAM",
    "APAC",
    "Brazil",
    "UK",
    "Spain",
    "Remote (US only)",
    "UTC-8 to UTC-5",
    "PST",
  ];
  const UNFAMILIAR = ["Helsinki", "Zorbland", "Bay Area", "EST-ish", "Nordics", "Earth", "<i>x</i>", "CA"];
  const EXCEPTIONS = ["except Poland", "excluding Germany", "not USA", "outside the EU"];
  const HOURS = ["UTC+1", "UTC-1 to UTC+3", "CET", "GMT+2", "UTC-10 to UTC+14"];
  const statement = (extra: string) => {
    const parts = Array.from({ length: Math.floor(rand() * 3) }, () => pick(PLACES));
    parts.splice(Math.floor(rand() * (parts.length + 1)), 0, extra);
    return parts.join(pick([", ", "; ", " / ", " and "]));
  };

  const classes: Array<[string, () => Array<string | null>]> = [
    ["unknown (nothing stated)", () => [pick([null, "", "  "])]],
    ["unrecognised word", () => [statement(pick(UNFAMILIAR))]],
    ["exception", () => [statement(pick(EXCEPTIONS))]],
    ["fits only by working hours", () => [`${pick(["USA", "Canada", "LATAM", "Brazil"])}, ${pick(HOURS)}`]],
    ["one uncertain listing beside a hide", () => [statement(pick(UNFAMILIAR)), pick(PLACES)]],
  ];

  for (const [name, gen] of classes) {
    it(`never hides: ${name}`, () => {
      for (let i = 0; i < 300; i++) {
        const statements = gen();
        for (const date of DATES) {
          expect([statements, postingVerdict(statements, "PL", date, isStatedAnywhere).kind]).not.toEqual([
            statements,
            "not_open",
          ]);
        }
      }
    });
  }
});
