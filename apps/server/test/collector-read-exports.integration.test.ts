import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { enabledSourceIds, isStatedAnywhere } from "../src/modules/collector/app/location.js";
import { openPostings, postingsByIds } from "../src/modules/collector/app/open-postings.js";
import { closedPostingHeads, hasPayField } from "../src/modules/collector/app/realness-facts.js";
import { retentionOutlook } from "../src/modules/collector/app/retention-outlook.js";
import { DEFAULT_SETTINGS } from "../src/modules/collector/domain/settings.js";
import { updateState } from "../src/modules/collector/infra/repo/state.js";
import { addPosting } from "./helpers/search-fixtures.js";
import { createTempDb, type TempDb } from "./helpers/temp-db.js";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 7, 12);

describe("collector read-only exports for applied-skipped", () => {
  let t: TempDb;
  beforeEach(() => {
    t = createTempDb();
  });
  afterEach(() => t.cleanup());

  describe("postingsByIds with closed postings (AC-05)", () => {
    it("leaves closed postings out by default, as search expects", () => {
      const id = addPosting(t.db, { status: "closed", listings: [{ status: "closed" }] });
      expect(postingsByIds(t.db, [id])).toEqual([]);
    });

    it("returns closed postings with every listing named and its text, when asked", () => {
      const id = addPosting(t.db, {
        title: "Data Engineer",
        status: "closed",
        listings: [
          { sourceId: "remotive", status: "closed", description: "Go and SQL" },
          { sourceId: "jobicy", status: "closed" },
        ],
      });
      const [p] = postingsByIds(t.db, [id], { includeClosed: true });
      expect(p).toMatchObject({ id, status: "closed", title: "Data Engineer" });
      expect(p?.listings.map((l) => [l.sourceId, l.status, l.description])).toEqual([
        ["remotive", "closed", "Go and SQL"],
        ["jobicy", "closed", "A role."],
      ]);
    });

    it("marks open postings as open", () => {
      const id = addPosting(t.db);
      expect(postingsByIds(t.db, [id], { includeClosed: true })[0]?.status).toBe("open");
    });
  });

  describe("retentionOutlook (AC-07, AC-09)", () => {
    function posting(
      id: string,
      over: { status: "open" | "closed"; closedAt?: number; lastOfferedAt: number },
    ) {
      addPosting(t.db, { id, status: over.status, listings: [{ sourceId: "jobicy", status: over.status }] });
      t.db.run(
        sql`update collector_postings set closed_at = ${over.closedAt ?? null}, last_offered_at = ${over.lastOfferedAt} where id = ${id}`,
      );
    }

    it("flags a posting past 60 counted days as removable now", () => {
      posting("old", { status: "closed", closedAt: NOW - 61 * DAY, lastOfferedAt: NOW - 61 * DAY });
      expect(retentionOutlook(t.db, ["old"], NOW).get("old")).toEqual({
        pastRetention: true,
        removableFrom: NOW - DAY + 1,
      });
    });

    it("gives a younger posting the moment it becomes removable", () => {
      posting("young", { status: "closed", closedAt: NOW - 10 * DAY, lastOfferedAt: NOW - 10 * DAY });
      expect(retentionOutlook(t.db, ["young"], NOW).get("young")).toEqual({
        pastRetention: false,
        removableFrom: NOW + 50 * DAY + 1,
      });
    });

    it("does not count days when every source was disabled (collector AC-26)", () => {
      posting("paused", { status: "open", lastOfferedAt: NOW - 70 * DAY });
      t.db.run(sql`insert into collector_source_disabled_periods (id, source_id, disabled_from, disabled_until)
        values ('d1', 'jobicy', ${NOW - 40 * DAY}, ${NOW - 20 * DAY})`);
      expect(retentionOutlook(t.db, ["paused"], NOW).get("paused")).toEqual({
        pastRetention: false,
        removableFrom: NOW + 10 * DAY + 1,
      });
    });

    it("has no removal moment while every source is still disabled", () => {
      posting("frozen", { status: "open", lastOfferedAt: NOW - 30 * DAY });
      t.db.run(sql`insert into collector_source_disabled_periods (id, source_id, disabled_from, disabled_until)
        values ('d1', 'jobicy', ${NOW - 5 * DAY}, null)`);
      expect(retentionOutlook(t.db, ["frozen"], NOW).get("frozen")).toEqual({
        pastRetention: false,
        removableFrom: null,
      });
    });

    it("leaves unknown ids out", () => {
      expect(retentionOutlook(t.db, ["missing"], NOW).size).toBe(0);
    });
  });

  describe("location exports for remote-filter (remote-filter AC-03, AC-10)", () => {
    it("re-exports the explicit Anywhere rule", () => {
      expect(isStatedAnywhere(" Anywhere in the World ")).toBe(true);
      expect(isStatedAnywhere("USA")).toBe(false);
    });

    it("lists the sources enabled by the settings in force", () => {
      expect(enabledSourceIds(t.db)).toContain("jobicy");
      const settings = structuredClone(DEFAULT_SETTINGS);
      settings.sources.remotive.enabled = false;
      updateState(t.db, { lastValidSettings: JSON.stringify(settings), lastValidSettingsAt: NOW });
      const enabled = enabledSourceIds(t.db);
      expect(enabled).toContain("jobicy");
      expect(enabled).not.toContain("remotive");
    });
  });

  describe("realness facts (realness-score AC-06, AC-08)", () => {
    it("gives each open posting its reopening time and each listing its pay field", () => {
      const id = addPosting(t.db, {
        reopenedAt: NOW - DAY,
        listings: [
          { sourceId: "jobicy", payField: "USD 60000–80000" },
          { sourceId: "remotive", payField: "" },
          { sourceId: "himalayas" }, // not read since this shipped
        ],
      });
      const [p] = openPostings(t.db);
      expect(p).toMatchObject({ id, reopenedAt: NOW - DAY });
      expect(p?.listings.map((l) => [l.sourceId, l.payField])).toEqual([
        ["jobicy", "USD 60000–80000"],
        ["remotive", ""],
        ["himalayas", null],
      ]);
      expect(openPostings(t.db, {})[0]?.listings).toHaveLength(3);
      const other = addPosting(t.db);
      expect(postingsByIds(t.db, [other])[0]?.reopenedAt).toBeNull();
    });

    it("lists closed postings' heads only; removed postings are gone", () => {
      const closed = addPosting(t.db, {
        status: "closed",
        title: "Data Engineer",
        company: "Acme",
        publishedAt: NOW - 30 * DAY,
        firstFoundAt: NOW - 20 * DAY,
        listings: [{ status: "closed" }],
      });
      addPosting(t.db, { title: "Open One" });
      const removed = addPosting(t.db, { status: "closed", listings: [{ status: "closed" }] });
      t.db.run(sql`delete from collector_postings where id = ${removed}`);
      expect(closedPostingHeads(t.db)).toEqual([
        {
          id: closed,
          company: "Acme",
          title: "Data Engineer",
          publishedAt: NOW - 30 * DAY,
          firstFoundAt: NOW - 20 * DAY,
        },
      ]);
    });

    it("knows which boards have a pay field", () => {
      expect(["himalayas", "remotive", "jobicy", "weworkremotely", "nope"].map(hasPayField)).toEqual([
        true,
        true,
        true,
        false,
        false,
      ]);
    });
  });
});
