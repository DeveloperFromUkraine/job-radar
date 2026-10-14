import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDb } from "../src/core/db.js";
import { countries, lookup } from "../src/modules/remote-filter/app/countries.js";
import type { RemoteFilterDeps } from "../src/modules/remote-filter/app/deps.js";
import {
  activeFilter,
  chooseCountry,
  getSettings,
  setFilterOn,
  setLook,
} from "../src/modules/remote-filter/app/settings.js";
import { readSettings } from "../src/modules/remote-filter/infra/repo.js";
import { setRemoteFilterSettings } from "./helpers/remote-filter-fixtures.js";
import { createTempDb, type TempDb } from "./helpers/temp-db.js";

const MIN = 60 * 1000;
const T0 = Date.UTC(2026, 9, 14, 9);
const PL = { code: "PL", name: "Poland", flag: "🇵🇱" };
const DE = { code: "DE", name: "Germany", flag: "🇩🇪" };
const PT = { code: "PT", name: "Portugal", flag: "🇵🇹" };
const UNKNOWN = {
  code: "REMOTE_FILTER_UNKNOWN_COUNTRY",
  message: "No country matches that name.",
  statusCode: 400,
};

describe("remote-filter settings use cases", () => {
  let t: TempDb;
  let now: number;
  let deps: RemoteFilterDeps;
  beforeEach(() => {
    t = createTempDb();
    now = T0;
    deps = { db: t.db, now: () => now };
  });
  afterEach(() => t.cleanup());

  describe("countries (AC-05, ADR-0003)", () => {
    it("lists the one country list ordered by name", () => {
      const list = countries();
      expect(list).toContainEqual(PL);
      expect(list.map((c) => c.name)).toEqual(
        [...list.map((c) => c.name)].sort((a, b) => a.localeCompare(b, "en")),
      );
    });

    it.each(["Polnd", "Europe", "CA", ""])("refuses %j with REMOTE_FILTER_UNKNOWN_COUNTRY", (name) => {
      expect(() => lookup(name)).toThrow(expect.objectContaining(UNKNOWN));
    });
  });

  it("starts with no country and the filter on: mode none, with the prompt (AC-04)", () => {
    expect(getSettings(deps)).toEqual({ country: null, filterOn: true, countries: countries() });
    expect(activeFilter(deps, T0)).toEqual({ mode: "none", country: null });
  });

  it("remembers the chosen country and the filter across a reopen of the DB file (AC-04)", () => {
    chooseCountry(deps, " poland ");
    expect(activeFilter(deps, T0)).toEqual({ mode: "own", country: PL });
    t.close();
    const reopened = openDb(t.file);
    try {
      const fresh: RemoteFilterDeps = { db: reopened.db, now: () => now };
      expect(getSettings(fresh)).toMatchObject({ country: PL, filterOn: true });
      expect(activeFilter(fresh, T0 + 60 * MIN)).toEqual({ mode: "own", country: PL });
    } finally {
      reopened.close();
    }
  });

  it.each(["Polnd", "Europe"])("refuses %j to choose and leaves the row unchanged (AC-05)", (name) => {
    setRemoteFilterSettings(t.db, { country: "PL", filterOn: false });
    const before = readSettings(t.db);
    expect(() => chooseCountry(deps, name)).toThrow(expect.objectContaining(UNKNOWN));
    expect(() => setLook(deps, name)).toThrow(expect.objectContaining(UNKNOWN));
    expect(readSettings(t.db)).toEqual(before);
  });

  it("changing the country to Portugal switches the filter on (AC-13)", () => {
    setRemoteFilterSettings(t.db, { country: "PL", filterOn: false });
    expect(chooseCountry(deps, "Portugal")).toMatchObject({ country: PT, filterOn: true });
    expect(activeFilter(deps, T0)).toEqual({ mode: "own", country: PT });
  });

  it("switching off keeps the owner's country, mode off (AC-07)", () => {
    chooseCountry(deps, "Poland");
    expect(setFilterOn(deps, false)).toMatchObject({ country: PL, filterOn: false });
    expect(activeFilter(deps, T0)).toEqual({ mode: "off", country: PL });
    setFilterOn(deps, true);
    expect(activeFilter(deps, T0)).toEqual({ mode: "own", country: PL });
  });

  it("switching on with no country chosen saves it but stays mode none", () => {
    setFilterOn(deps, false);
    setFilterOn(deps, true);
    expect(readSettings(t.db).filterOn).toBe(true);
    setFilterOn(deps, false);
    expect(activeFilter(deps, T0)).toEqual({ mode: "none", country: null });
  });

  describe("a one-off look (AC-06)", () => {
    const visit = T0 - 10 * MIN;

    it("filters for Germany without touching the owner's country, then back to Poland", () => {
      chooseCountry(deps, "Poland");
      expect(setLook(deps, "Germany")).toEqual({ look: DE });
      expect(activeFilter(deps, visit)).toEqual({ mode: "look", country: DE });
      expect(getSettings(deps)).toMatchObject({ country: PL, filterOn: true });
      expect(setLook(deps, null)).toEqual({ look: null });
      expect(activeFilter(deps, visit)).toEqual({ mode: "own", country: PL });
      expect(readSettings(t.db)).toMatchObject({ lookCountry: null, lookStartedAt: null });
    });

    it("switches the filter on for the look; ending it returns the owner's off", () => {
      setRemoteFilterSettings(t.db, { country: "PL", filterOn: false });
      setLook(deps, "Germany");
      expect(activeFilter(deps, visit)).toEqual({ mode: "look", country: DE });
      setLook(deps, null);
      expect(activeFilter(deps, visit)).toEqual({ mode: "off", country: PL });
    });

    it("switching the filter during a look does not end the look", () => {
      chooseCountry(deps, "Poland");
      setLook(deps, "Germany");
      setFilterOn(deps, false);
      expect(activeFilter(deps, visit)).toEqual({ mode: "look", country: DE });
    });

    it("choosing a country during a look leaves the look as it is", () => {
      chooseCountry(deps, "Poland");
      setLook(deps, "Germany");
      chooseCountry(deps, "Portugal");
      expect(activeFilter(deps, visit)).toEqual({ mode: "look", country: DE });
    });

    it("a look from an earlier visit is ignored: the owner's own filter again", () => {
      chooseCountry(deps, "Poland");
      setLook(deps, "Germany");
      expect(activeFilter(deps, T0 + 45 * MIN)).toEqual({ mode: "own", country: PL });
    });

    it("works with no country chosen, and back is the prompt again", () => {
      setLook(deps, "🇩🇪");
      expect(activeFilter(deps, visit)).toEqual({ mode: "look", country: DE });
      setLook(deps, null);
      expect(activeFilter(deps, visit)).toEqual({ mode: "none", country: null });
    });
  });
});
