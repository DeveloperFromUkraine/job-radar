import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type SourceId, sourceById } from "../src/modules/collector/domain/sources.js";
import { createSourceHttp } from "../src/modules/collector/infra/http.js";
import { ensureSources } from "../src/modules/collector/infra/repo/sources.js";
import { createAdapters } from "../src/modules/collector/infra/sources/index.js";
import { type FakeSources, fixture, json, startFakeSources, xml } from "./helpers/fake-sources.js";
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
    it("reads the public feed in one request, capped, with company and title split", async () => {
      fake.route("/remote-jobs.rss", xml(fixture("weworkremotely/latest.rss")));

      const result = await fetchLatest("weworkremotely");

      expect(fake.requests).toEqual(["/remote-jobs.rss"]);
      expect(result).toMatchObject({ completeness: "capped", itemsReturned: 4, coversPublishedAfter: null });
      expect(result.listings[0]).toMatchObject({
        sourceItemId: "https://jobs.example.test/wwr/1",
        url: "https://jobs.example.test/wwr/1",
        company: "Example Co",
        title: "Senior Java Developer",
        description: "<p>Role description with <b>markup</b> &amp; entities.</p>",
        categories: ["Back-End Programming"],
        publishedAt: Date.UTC(2026, 8, 17, 10, 51, 23),
        expiresAt: Date.UTC(2026, 9, 17, 10, 51, 23),
      });
      expect(result.listings[3]).toMatchObject({
        company: "Example & Sons",
        title: "Commercial Partnerships & Operations Director",
      });
    });

    it("takes the location from <country>, else a specific <region>, else states nothing (AC-21, AC-22)", async () => {
      fake.route("/remote-jobs.rss", xml(fixture("weworkremotely/latest.rss")));
      const [countries, anywhere, region] = (await fetchLatest("weworkremotely")).listings;
      expect(countries?.locationRestriction).toMatch(/^🇦🇩 Andorra, .*🇵🇱 Poland, .*and 🇺🇦 Ukraine$/);
      // "Anywhere in the World" sits beside country lists too (feed read 2026-10-03): nothing stated.
      expect(anywhere?.locationRestriction).toBeNull();
      expect(region?.locationRestriction).toBe("USA Only");
    });

    it("fails a response that is not an RSS feed", async () => {
      fake.route("/remote-jobs.rss", xml("<html>Just a moment...</html>"));
      expect(await fetchLatest("weworkremotely")).toMatchObject({
        completeness: "failed",
        failure: { code: "unreadable" },
      });
    });
  });
});
