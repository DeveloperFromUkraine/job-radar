import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openPostings } from "../src/modules/collector/app/open-postings.js";
import { DEFAULT_SETTINGS } from "../src/modules/collector/domain/settings.js";
import { updateState } from "../src/modules/collector/infra/repo/state.js";
import { verdictsFor } from "../src/modules/remote-filter/app/verdicts.js";
import { listingVerdict } from "../src/modules/remote-filter/domain/statement.js";
import { addPosting } from "./helpers/search-fixtures.js";
import { createTempDb, type TempDb } from "./helpers/temp-db.js";

// Count listing reads to prove one parse per distinct statement per call.
vi.mock("../src/modules/remote-filter/domain/statement.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/modules/remote-filter/domain/statement.js")>();
  return { ...real, listingVerdict: vi.fn(real.listingVerdict) };
});

const NOW = Date.UTC(2026, 9, 14, 12);

describe("verdicts for postings and a country (AC-03)", () => {
  let t: TempDb;
  beforeEach(() => {
    t = createTempDb();
    vi.mocked(listingVerdict).mockClear();
  });
  afterEach(() => t.cleanup());

  const verdicts = (country = "PL") =>
    verdictsFor({ db: t.db, now: () => NOW }, openPostings(t.db), country, new Date(NOW));

  it("decides the three AC-03 postings from their open listings", () => {
    const usaAndNothing = addPosting(t.db, {
      listings: [
        { sourceId: "jobicy", locationRestriction: "USA" },
        { sourceId: "remotive", locationRestriction: null },
      ],
    });
    const usaAndAnywhere = addPosting(t.db, {
      listings: [
        { sourceId: "jobicy", locationRestriction: "USA" },
        { sourceId: "remotive", locationRestriction: "Anywhere" },
      ],
    });
    const emeaAndUsa = addPosting(t.db, {
      listings: [
        { sourceId: "jobicy", locationRestriction: "EMEA" },
        { sourceId: "remotive", locationRestriction: "USA" },
      ],
    });
    const v = verdicts();
    expect(v.get(usaAndNothing)).toEqual({ kind: "check", reason: "not_stated" });
    expect(v.get(usaAndAnywhere)).toEqual({ kind: "not_open" });
    expect(v.get(emeaAndUsa)).toEqual({ kind: "fits" });
  });

  it("ignores a fitting listing closed at its source", () => {
    const id = addPosting(t.db, {
      listings: [
        { sourceId: "jobicy", locationRestriction: "USA" },
        { sourceId: "remotive", locationRestriction: "Europe", status: "closed" },
      ],
    });
    expect(verdicts().get(id)).toEqual({ kind: "not_open" });
  });

  it("ignores a fitting listing from a disabled source", () => {
    const id = addPosting(t.db, {
      listings: [
        { sourceId: "jobicy", locationRestriction: "USA" },
        { sourceId: "remotive", locationRestriction: "Worldwide" },
      ],
    });
    expect(verdicts().get(id)).toEqual({ kind: "fits" });
    const settings = structuredClone(DEFAULT_SETTINGS);
    settings.sources.remotive.enabled = false;
    updateState(t.db, { lastValidSettings: JSON.stringify(settings), lastValidSettingsAt: NOW });
    expect(verdicts().get(id)).toEqual({ kind: "not_open" });
  });

  it("judges for the country asked (a look at Germany)", () => {
    const id = addPosting(t.db, { listings: [{ locationRestriction: "Germany" }] });
    expect(verdicts("PL").get(id)).toEqual({ kind: "not_open" });
    expect(verdicts("DE").get(id)).toEqual({ kind: "fits" });
  });

  it("reads each distinct statement once per call", () => {
    for (let i = 0; i < 40; i++)
      addPosting(t.db, { listings: [{ locationRestriction: i % 2 ? "USA" : "EMEA" }] });
    expect(verdicts().size).toBe(40);
    expect(vi.mocked(listingVerdict)).toHaveBeenCalledTimes(2);
  });
});
