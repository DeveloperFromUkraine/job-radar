import { describe, expect, it } from "vitest";
import {
  countryList,
  lookupCountry,
  offsetsFor,
  REGIONS,
  regionTimeZones,
  SHORT_CODES,
  timeZonesOf,
} from "./vocabulary.js";

const WINTER = new Date(Date.UTC(2026, 0, 15));
const SUMMER = new Date(Date.UTC(2026, 6, 15));

describe("country list", () => {
  it("pins PL, US, GB and NZ: names, flags and zones (ADR-0003 consequence)", () => {
    const byCode = new Map(countryList().map((c) => [c.code, c]));
    expect(byCode.get("PL")).toEqual({ code: "PL", name: "Poland", flag: "🇵🇱" });
    expect(byCode.get("US")).toEqual({ code: "US", name: "United States", flag: "🇺🇸" });
    expect(byCode.get("GB")).toEqual({ code: "GB", name: "United Kingdom", flag: "🇬🇧" });
    expect(byCode.get("NZ")).toEqual({ code: "NZ", name: "New Zealand", flag: "🇳🇿" });
    expect(timeZonesOf("PL")).toEqual(["Europe/Warsaw"]);
    expect(timeZonesOf("GB")).toEqual(["Europe/London"]);
    expect(timeZonesOf("NZ")).toContain("Pacific/Auckland");
    expect(timeZonesOf("US")).toEqual(expect.arrayContaining(["America/New_York", "America/Los_Angeles"]));
  });

  it("holds territories as countries of their own, Kosovo included, ordered by name", () => {
    const list = countryList();
    const codes = list.map((c) => c.code);
    expect(codes).toEqual(expect.arrayContaining(["PR", "HK", "XK"]));
    expect(codes).not.toContain("EU");
    expect(codes).not.toContain("ZZ");
    expect(list.find((c) => c.code === "HK")?.name).toBe("Hong Kong");
    expect(list.find((c) => c.code === "XK")?.name).toBe("Kosovo");
    const names = list.map((c) => c.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "en")));
    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe("offsets on 15 January and 15 July (spec §6 Seasonal stability)", () => {
  it("gives Poland UTC+1 and UTC+2 whichever date of the year is asked", () => {
    expect(offsetsFor("PL", WINTER)).toEqual([60, 120]);
    expect(offsetsFor("PL", SUMMER)).toEqual([60, 120]);
  });

  it("pins GB, the US and southern-hemisphere NZ", () => {
    expect(offsetsFor("GB", WINTER)).toEqual([0, 60]);
    expect(offsetsFor("US", SUMMER)).toEqual(expect.arrayContaining([-600, -480, -420, -300, -240]));
    expect(offsetsFor("NZ", WINTER)).toEqual(expect.arrayContaining([720, 780]));
  });

  it("gives Kosovo offsets although ICU names no zone for it", () => {
    expect(offsetsFor("XK", WINTER)).toEqual([60, 120]);
  });
});

describe("lookupCountry (AC-05)", () => {
  it.each([
    ["Poland", "PL"],
    ["poland ", "PL"],
    ["  POLAND", "PL"],
    ["🇵🇱", "PL"],
    ["USA", "US"],
    ["U.S.A.", "US"],
    ["United States of America", "US"],
    ["UK", "GB"],
    ["Great Britain", "GB"],
    ["UAE", "AE"],
    ["Türkiye", "TR"],
    ["Turkiye", "TR"],
    ["Czech Republic", "CZ"],
    ["Moldova (Republic of)", "MD"],
    ["Ivory Coast", "CI"],
    ["Hong Kong", "HK"],
    ["Puerto Rico", "PR"],
    ["Bosnia and Herzegovina", "BA"],
    ["Bosnia & Herzegovina", "BA"],
    ["Saint Lucia", "LC"],
    ["Georgia", "GE"],
  ])("finds %s", (name, code) => {
    expect(lookupCountry(name)?.code).toBe(code);
  });

  it.each(["Polnd", "Europe", "EU", "EMEA", "CA", "IN", "", "   ", "Worldwide"])(
    "finds no country for %j",
    (name) => {
      expect(lookupCountry(name)).toBeUndefined();
    },
  );
});

describe("regions", () => {
  const has = (region: string, code: string) => REGIONS.get(region)?.has(code);

  it("keeps the EU at its 27 members", () => {
    expect(REGIONS.get("eu")?.size).toBe(27);
    expect(has("eu", "PL")).toBe(true);
    expect(has("eu", "GB")).toBe(false);
  });

  it("puts Poland in Europe and EMEA but not in LATAM, the Americas or APAC", () => {
    for (const r of ["europe", "emea", "worldwide", "global"]) expect(has(r, "PL")).toBe(true);
    for (const r of ["latam", "americas", "north america", "apac"]) expect(has(r, "PL")).toBe(false);
  });

  it("leaves Russia and Turkey out of Europe but in EMEA", () => {
    for (const c of ["RU", "TR"]) {
      expect(has("europe", c)).toBe(false);
      expect(has("emea", c)).toBe(true);
    }
    for (const c of ["GB", "CH", "UA", "MD", "XK", "NO"]) expect(has("europe", c)).toBe(true);
  });

  it("keeps Puerto Rico out of the USA but in LATAM and the Americas", () => {
    expect(has("latam", "PR")).toBe(true);
    expect(has("americas", "PR")).toBe(true);
    expect(has("latam", "US")).toBe(false);
    expect(has("north america", "US")).toBe(true);
  });

  it("lists only known country codes", () => {
    const codes = new Set(countryList().map((c) => c.code));
    for (const [name, members] of REGIONS)
      for (const c of members) expect([name, codes.has(c)]).toEqual([name, true]);
  });
});

describe("short codes", () => {
  it("reads only the fixed unambiguous list", () => {
    expect([...SHORT_CODES.keys()].sort()).toEqual(["u.s.", "u.s.a.", "uae", "uk", "us", "usa"]);
  });
});

describe("regionTimeZones", () => {
  it("reads the getTimeZones() method of newer V8 and the timeZones getter of Node 22", () => {
    expect(regionTimeZones({ getTimeZones: () => ["A/B"] })).toEqual(["A/B"]);
    expect(regionTimeZones({ timeZones: ["C/D"] })).toEqual(["C/D"]);
    expect(regionTimeZones({})).toEqual([]);
  });
});
