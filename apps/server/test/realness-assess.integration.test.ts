import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openPostings } from "../src/modules/collector/app/open-postings.js";
import { DEFAULT_SETTINGS } from "../src/modules/collector/domain/settings.js";
import { updateState } from "../src/modules/collector/infra/repo/state.js";
import { assess } from "../src/modules/realness/app/assess.js";
import { addPosting, type PostingSeed } from "./helpers/search-fixtures.js";
import { createTempDb, type TempDb } from "./helpers/temp-db.js";

// realness-score T08: assess() with switch-on rules over collected postings (AC-06 – AC-09).
const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 16, 10); // 12:00 in Warsaw
const TZ = "Europe/Warsaw";
const PAID = { payField: "USD 60000–80000" };

describe("assess (realness-score T08)", () => {
  let t: TempDb;
  beforeEach(() => {
    t = createTempDb();
  });
  afterEach(() => t.cleanup());

  const deps = () => ({ db: t.db, timeZone: TZ });
  const add = (seed: PostingSeed) => addPosting(t.db, { firstFoundAt: NOW, ...seed });
  const of = (id: string) => assess(deps(), openPostings(t.db), NOW).get(id);
  const disable = (...ids: ("jobicy" | "remotive" | "himalayas" | "weworkremotely")[]) => {
    const settings = structuredClone(DEFAULT_SETTINGS);
    for (const id of ids) settings.sources[id].enabled = false;
    updateState(t.db, { lastValidSettings: JSON.stringify(settings), lastValidSettingsAt: NOW });
  };

  it("a fresh posting stating pay has no signal", () => {
    const id = add({ listings: [{ sourceId: "jobicy", ...PAID }] });
    expect(of(id)).toEqual({ penalty: 0, signals: [] });
  });

  it("returns an assessment for every posting it is given", () => {
    const ids = [add({}), add({}), add({})];
    const result = assess(deps(), openPostings(t.db), NOW);
    expect([...result.keys()].sort()).toEqual([...ids].sort());
  });

  describe("no salary (AC-06)", () => {
    it.each([
      ["an empty pay field on a board with a field", { sourceId: "jobicy", payField: "" }, true],
      ["an amount in the pay field", { sourceId: "remotive", payField: "$50-$75 /hour" }, false],
      ["vague wording in the pay field", { sourceId: "remotive", payField: "competitive" }, true],
      ["a pay field not read since this shipped, on a board with a field", { sourceId: "jobicy" }, false],
      ["no pay field ever, We Work Remotely", { sourceId: "weworkremotely" }, true],
    ])("%s", (_label, listing, noSalary) => {
      const id = add({ description: "Build things.", listings: [listing] });
      expect(of(id)?.signals.some((s) => s.kind === "no_salary")).toBe(noSalary);
    });

    it("an amount in the description or the title counts; a non-pay amount does not", () => {
      const inText = add({
        description: "Salary range $145,000 - $160,000.",
        listings: [{ sourceId: "weworkremotely" }],
      });
      const inTitle = add({ title: "Go Engineer ($120k)", listings: [{ sourceId: "weworkremotely" }] });
      const funding = add({
        description: "We raised a $5M Series A.",
        listings: [{ sourceId: "weworkremotely" }],
      });
      expect(of(inText)?.signals).toEqual([]);
      expect(of(inTitle)?.signals).toEqual([]);
      expect(of(funding)?.signals).toEqual([{ kind: "no_salary" }]);
    });

    it("pay stated only on a disabled source's listing or a closed listing does not count", () => {
      const id = add({
        description: "Build things.",
        listings: [
          { sourceId: "remotive", payField: "$100k - $140k" },
          { sourceId: "himalayas", payField: "USD 90000 per year", status: "closed" },
          { sourceId: "jobicy", payField: "" },
        ],
      });
      disable("remotive");
      expect(of(id)?.signals).toEqual([{ kind: "no_salary" }]);
    });
  });

  describe("age and many boards (AC-07, AC-09)", () => {
    it("counts age from the publication time, never later than first found", () => {
      const posted = add({ publishedAt: NOW - 65 * DAY, firstFoundAt: NOW - 3 * DAY, listings: [PAID] });
      const firstFill = add({ publishedAt: null, firstFoundAt: NOW - 47 * DAY, listings: [PAID] });
      expect(of(posted)?.signals).toEqual([{ kind: "age", basis: "posted", days: 65 }]);
      expect(of(firstFill)?.signals).toEqual([{ kind: "age", basis: "first_found", days: 47 }]);
    });

    it("counts only enabled boards with an open listing: 4 → 3 keeps the signal, 2 leaves only age", () => {
      const id = add({
        firstFoundAt: NOW - 50 * DAY,
        listings: ["jobicy", "remotive", "himalayas", "weworkremotely"].map((sourceId) => ({
          sourceId,
          ...PAID,
        })),
      });
      expect(of(id)?.signals).toEqual([{ kind: "many_boards", boards: 4, days: 50 }]);
      disable("himalayas");
      expect(of(id)?.signals).toEqual([{ kind: "many_boards", boards: 3, days: 50 }]);
      disable("himalayas", "remotive");
      expect(of(id)?.signals).toEqual([{ kind: "age", basis: "first_found", days: 50 }]);
    });
  });

  describe("repost (AC-08)", () => {
    const head = { company: "Acme", title: "Senior Go Engineer", listings: [PAID] };

    it("a reopening since this shipped is a repost", () => {
      const id = add({ ...head, reopenedAt: NOW - DAY });
      expect(of(id)?.signals).toEqual([{ kind: "repost" }]);
    });

    it("an earlier closed look-alike more than 7 days before is a repost; within 7 days is not", () => {
      add({
        ...head,
        title: "Sr. Go Engineer",
        status: "closed",
        firstFoundAt: NOW - 20 * DAY,
        listings: [{ status: "closed" }],
      });
      const later = add({ ...head, firstFoundAt: NOW - 5 * DAY });
      expect(of(later)?.signals).toEqual([{ kind: "repost" }]);

      const within = add({ ...head, company: "Beta", firstFoundAt: NOW - 3 * DAY });
      add({
        ...head,
        company: "Beta",
        status: "closed",
        firstFoundAt: NOW - 8 * DAY,
        listings: [{ status: "closed" }],
      });
      expect(of(within)?.signals).toEqual([]);
    });

    it("an earlier copy still open means parallel hires: neither is a repost", () => {
      const earlier = add({ ...head, firstFoundAt: NOW - 20 * DAY });
      const later = add({ ...head, firstFoundAt: NOW - 5 * DAY });
      add({ ...head, status: "closed", firstFoundAt: NOW - 25 * DAY, listings: [{ status: "closed" }] });
      // The earlier one has a closed copy 5 days before it — not more than 7.
      expect(of(earlier)?.signals).toEqual([]);
      expect(of(later)?.signals).toEqual([]);
    });

    it("an earlier copy removed by clean-up causes no repost", () => {
      const gone = add({
        ...head,
        status: "closed",
        firstFoundAt: NOW - 30 * DAY,
        listings: [{ status: "closed" }],
      });
      t.db.run(sql`delete from collector_postings where id = ${gone}`);
      const id = add({ ...head, firstFoundAt: NOW - 2 * DAY });
      expect(of(id)?.signals).toEqual([]);
    });
  });

  it("caps the penalty at 30 and names every signal (AC-01, AC-02)", () => {
    const id = add({ firstFoundAt: NOW - 70 * DAY, reopenedAt: NOW - DAY, listings: [{ payField: "" }] });
    expect(of(id)).toEqual({
      penalty: 30,
      signals: [{ kind: "age", basis: "first_found", days: 70 }, { kind: "repost" }, { kind: "no_salary" }],
    });
  });
});
