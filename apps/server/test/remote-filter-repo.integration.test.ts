import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDb } from "../src/core/db.js";
import {
  readSettings,
  writeCountry,
  writeFilterOn,
  writeLook,
} from "../src/modules/remote-filter/infra/repo.js";
import { setRemoteFilterSettings } from "./helpers/remote-filter-fixtures.js";
import { createTempDb, type TempDb } from "./helpers/temp-db.js";

const T = Date.UTC(2026, 9, 14, 12);
const NONE = { country: null, filterOn: true, lookCountry: null, lookStartedAt: null };

describe("remote-filter settings repo", () => {
  let t: TempDb;
  beforeEach(() => {
    t = createTempDb();
  });
  afterEach(() => t.cleanup());

  const rowCount = () => t.db.all<{ n: number }>(sql`select count(*) n from remote_filter_settings`)[0]?.n;

  it("creates the row lazily on first read: no country, filter on, no look (AC-04)", () => {
    expect(rowCount()).toBe(0);
    expect(readSettings(t.db)).toEqual(NONE);
    expect(readSettings(t.db)).toEqual(NONE);
    expect(rowCount()).toBe(1);
  });

  it("writes the country with the filter state (AC-04, AC-13)", () => {
    writeCountry(t.db, "PL", true);
    expect(readSettings(t.db)).toEqual({ ...NONE, country: "PL" });
  });

  it("switches the filter off and on (AC-07)", () => {
    writeCountry(t.db, "PL", true);
    writeFilterOn(t.db, false);
    expect(readSettings(t.db)).toMatchObject({ country: "PL", filterOn: false });
    writeFilterOn(t.db, true);
    expect(readSettings(t.db)).toMatchObject({ filterOn: true });
  });

  it("starts a look and clears it as a pair (AC-06)", () => {
    writeCountry(t.db, "PL", true);
    writeLook(t.db, "DE", T);
    expect(readSettings(t.db)).toEqual({ ...NONE, country: "PL", lookCountry: "DE", lookStartedAt: T });
    writeLook(t.db, null, null);
    expect(readSettings(t.db)).toEqual({ ...NONE, country: "PL" });
  });

  it("writes on an empty table without tripping the filter_on NOT NULL", () => {
    writeLook(t.db, "DE", T);
    expect(readSettings(t.db)).toEqual({ ...NONE, lookCountry: "DE", lookStartedAt: T });
    expect(rowCount()).toBe(1);
  });

  it("keeps every value across a close and reopen of the DB file (AC-04, AC-07)", () => {
    writeCountry(t.db, "PL", true);
    writeFilterOn(t.db, false);
    writeLook(t.db, "DE", T);
    t.close(); // cleanup closes again: a no-op on a closed better-sqlite3 handle
    const reopened = openDb(t.file);
    try {
      expect(readSettings(reopened.db)).toEqual({
        country: "PL",
        filterOn: false,
        lookCountry: "DE",
        lookStartedAt: T,
      });
    } finally {
      reopened.close();
    }
  });

  it("the fixture seeds any partial state", () => {
    setRemoteFilterSettings(t.db, { country: "PL", filterOn: false });
    setRemoteFilterSettings(t.db, { lookCountry: "PT", lookStartedAt: T });
    expect(readSettings(t.db)).toEqual({
      country: "PL",
      filterOn: false,
      lookCountry: "PT",
      lookStartedAt: T,
    });
  });
});
