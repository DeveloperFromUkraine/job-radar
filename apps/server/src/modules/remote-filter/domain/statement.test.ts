import { describe, expect, it } from "vitest";
import { type ListingVerdict, listingVerdict } from "./statement.js";

const DATES = [new Date(Date.UTC(2026, 0, 15)), new Date(Date.UTC(2026, 6, 15))];
const FITS: ListingVerdict = { kind: "fits" };
const NOT_OPEN: ListingVerdict = { kind: "not_open" };
const check = (reason: string): ListingVerdict => ({ kind: "check", reason }) as ListingVerdict;

// Every row is judged on 15 January and 15 July (spec §6 Seasonal stability).
const cases: Array<[string | null, string, ListingVerdict]> = [
  // AC-01 — shown
  ["EMEA", "PL", FITS],
  ["Europe", "PL", FITS],
  ["Poland", "PL", FITS],
  ["🇵🇱 Poland, 🇺🇦 Ukraine", "PL", FITS],
  ["🇵🇱", "PL", FITS],
  ["Worldwide", "PL", FITS],
  ["Global", "PL", FITS],
  ["UTC-1 to UTC+3", "PL", FITS],
  ["UTC-1 – UTC+3", "PL", FITS],
  ["GMT+2", "PL", FITS],
  ["CET", "PL", FITS],
  ["Europe, PST hours", "PL", FITS],
  ["Remote - Poland only", "PL", FITS],
  ["100% Remote (EU)", "PL", FITS],
  ["Fully remote in the EU", "PL", FITS],
  ["Poland, Germany, +3 more", "PL", FITS],
  ["Anywhere", "PL", FITS],
  ["Anywhere in the World", "PL", FITS],
  ["Moldova (Republic of)", "MD", FITS],
  ["Korea, Republic of", "KR", FITS],
  ["UTC+5:30", "IN", FITS],
  ["UTC+5.5", "IN", FITS],
  // AC-01 — hidden
  ["USA", "PL", NOT_OPEN],
  ["LATAM", "PL", NOT_OPEN],
  ["Remote (US only)", "PL", NOT_OPEN],
  ["US-based", "PL", NOT_OPEN],
  ["Canada, USA", "PL", NOT_OPEN],
  ["Canada & USA", "PL", NOT_OPEN],
  ["UTC-8 to UTC-5", "PL", NOT_OPEN],
  ["PST", "PL", NOT_OPEN],
  ["USA, Anywhere", "PL", NOT_OPEN],
  ["Papua New Guinea", "GN", NOT_OPEN],
  ["Romania", "OM", NOT_OPEN],
  ["Georgia, USA", "PL", NOT_OPEN],
  ["U.S.A.", "PL", NOT_OPEN],
  // AC-02 — check, with its reason
  [null, "PL", check("not_stated")],
  ["", "PL", check("not_stated")],
  ["   ", "PL", check("not_stated")],
  ["Helsinki", "PL", check("not_recognised")],
  ["Worldwide except Poland", "PL", check("exception")],
  ["Worldwide, excluding Poland", "PL", check("exception")],
  ["Poland, not Germany", "PL", check("exception")],
  ["United States, UTC-10 to UTC+14", "PL", check("hours_only")],
  // AC-01 reading notes
  ["USA, Helsinki", "PL", check("not_recognised")],
  ["Remote", "PL", check("not_recognised")],
  ["Poland, Helsinki", "PL", check("not_recognised")],
  ["New Mexico", "MX", check("not_recognised")],
  ["Georgia", "PL", check("not_recognised")],
  ["Georgia", "GE", check("not_recognised")],
  ["CA", "PL", check("not_recognised")],
  ["IN", "IN", check("not_recognised")],
  ["European time zones", "PL", check("not_recognised")],
  ["USA timezones", "PL", check("not_recognised")],
  ["overlap with PST", "PL", check("not_recognised")],
  ["Anywhere, Helsinki", "PL", check("not_recognised")],
  ["Poland preferred", "PL", check("not_recognised")],
  ["USA preferred", "PL", check("not_recognised")],
  ["USA ideally", "PL", check("not_recognised")],
  ["USA, nice to have", "PL", check("not_recognised")],
  ["USA, Canada, +3 more", "PL", check("not_recognised")],
  ["USA, Canada…", "PL", check("not_recognised")],
  ["USA, Canada...", "PL", check("not_recognised")],
  ["<script>alert(1)</script>", "PL", check("not_recognised")],
  ["Worldwide except <b>Poland</b>", "PL", check("exception")],
];

describe("listingVerdict (AC-01, AC-02)", () => {
  for (const date of DATES) {
    it.each(cases)(`%j for %s on ${date.toISOString().slice(0, 10)}`, (statement, country, expected) => {
      expect(listingVerdict(statement, country, date)).toEqual(expected);
    });
  }

  it("reads a 10,000-character garbled statement as not recognised, promptly (spec §6.1)", () => {
    const garbage = "x§Q, ".repeat(2000);
    const started = performance.now();
    expect(listingVerdict(garbage, "PL", DATES[0] as Date)).toEqual(check("not_recognised"));
    expect(performance.now() - started).toBeLessThan(100);
  });
});
