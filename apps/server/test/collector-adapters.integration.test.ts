import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isDue } from "../src/modules/collector/domain/schedule.js";
import { type SourceId, sourceById } from "../src/modules/collector/domain/sources.js";
import { createSourceHttp } from "../src/modules/collector/infra/http.js";
import { ensureSources } from "../src/modules/collector/infra/repo/sources.js";
import { createAdapters } from "../src/modules/collector/infra/sources/index.js";
import { type FakeSources, fixture, json, startFakeSources } from "./helpers/fake-sources.js";
import { createTempDb, type TempDb } from "./helpers/temp-db.js";

const NOW = Date.UTC(2026, 9, 2, 12);

describe("Remotive, Himalayas and We Work Remotely adapters (ADR-0004)", () => {
  let db: TempDb;
  let fake: FakeSources;

  beforeEach(async () => {
    db = createTempDb();
    ensureSources(db.db);
    fake = await startFakeSources();
  });

  afterEach(async () => {
    db.cleanup();
    await fake.close();
  });

  const fetchLatest = (id: SourceId) =>
    createAdapters({ baseUrl: fake.baseUrl })[id].fetchLatest({
      http: createSourceHttp(db.db, sourceById(id), { now: () => NOW }),
      now: NOW,
    });

  describe("Remotive", () => {
    it("reads every active job in one unfiltered request and is complete", async () => {
      fake.route("/api/remote-jobs", json(fixture("remotive/complete.json")));

      const result = await fetchLatest("remotive");

      expect(fake.requests).toEqual(["/api/remote-jobs"]);
      expect(result).toMatchObject({
        completeness: "complete",
        itemsReturned: 3,
        coversPublishedAfter: null,
      });
      expect(result.listings[0]).toEqual({
        sourceItemId: "800001",
        url: "https://jobs.example.test/remotive/800001",
        title: "Senior back-end Engineer",
        company: "Example Co",
        description: "<p>Role description with <b>markup</b> &amp; entities.</p>",
        locationRestriction:
          "Europe, USA, UK, Canada, Australia, Ireland, Switzerland, Singapore, Mexico, Iceland, Norway",
        categories: ["Software Development"],
        publishedAt: Date.UTC(2026, 8, 30, 13, 15, 26),
        expiresAt: null,
      });
    });

    it("records an empty location as unknown (AC-22)", async () => {
      fake.route("/api/remote-jobs", json(fixture("remotive/complete.json")));
      expect((await fetchLatest("remotive")).listings[1]?.locationRestriction).toBe("");
    });

    it("is capped, never complete, when the response holds fewer jobs than the source has", async () => {
      fake.route("/api/remote-jobs", json(fixture("remotive/truncated.json")));
      expect((await fetchLatest("remotive")).completeness).toBe("capped");
    });

    it("fails a response without a jobs list", async () => {
      fake.route("/api/remote-jobs", json('{"jobs": "nope"}'));
      expect(await fetchLatest("remotive")).toMatchObject({
        completeness: "failed",
        failure: { code: "unreadable" },
      });
    });
  });

  describe("Himalayas", () => {
    it("reads the newest 20 jobs, capped, with location and time zones as stated", async () => {
      fake.route("/jobs/api", json(fixture("himalayas/latest.json")));

      const result = await fetchLatest("himalayas");

      expect(fake.requests).toEqual(["/jobs/api?limit=20"]);
      expect(result).toMatchObject({ completeness: "capped", itemsReturned: 3 });
      expect(result.listings[0]).toMatchObject({
        sourceItemId: "https://jobs.example.test/himalayas/1",
        url: "https://jobs.example.test/himalayas/1",
        company: "Example Co",
        locationRestriction: ["Poland", "Germany", "UTC+1", "UTC+2"],
        categories: ["Developer"],
        publishedAt: 1_790_939_333_000,
        expiresAt: 1_796_123_333_000,
      });
    });

    it("states nothing when neither countries nor time zones are given (AC-22)", async () => {
      fake.route("/jobs/api", json(fixture("himalayas/latest.json")));
      expect((await fetchLatest("himalayas")).listings[1]?.locationRestriction).toEqual([]);
    });

    it("carries the expiry date as a direct close signal", async () => {
      fake.route("/jobs/api", json(fixture("himalayas/latest.json")));
      expect((await fetchLatest("himalayas")).listings[2]?.expiresAt).toBe(1_790_000_000_000);
    });
  });

  describe("We Work Remotely", () => {
    it("is never due while its allowed rate is 0, so it is never fetched (spec §8 Q1)", () => {
      expect(isDue(sourceById("weworkremotely"), null, NOW)).toBe(false);
    });

    it("sends nothing even if asked, because its window never allows a read", async () => {
      const result = await fetchLatest("weworkremotely");
      expect(result).toMatchObject({ completeness: "partial", listings: [] });
      expect(fake.requests).toEqual([]);
    });
  });
});
