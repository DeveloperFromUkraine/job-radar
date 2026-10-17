import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
        payField: "",
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

    it("takes the location from <country>, else <region> as stated, Anywhere included (AC-21; remote-filter AC-10)", async () => {
      fake.route("/remote-jobs.rss", xml(fixture("weworkremotely/latest.rss")));
      const [countries, anywhere, region] = (await fetchLatest("weworkremotely")).listings;
      expect(countries?.locationRestriction).toMatch(/^🇦🇩 Andorra, .*🇵🇱 Poland, .*and 🇺🇦 Ukraine$/);
      // An explicit "Anywhere in the World" is kept as stated; the filter reads it as Worldwide.
      expect(anywhere?.locationRestriction).toBe("Anywhere in the World");
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

  describe("Just Join IT", () => {
    const html = (body: string) => xml(body); // the adapter reads the body as text whatever its type
    const fetchJustJoinIt = (categories: string[]) =>
      createAdapters({ baseUrl: fake.baseUrl }).justjoinit.fetchLatest({
        http: createSourceHttp(db.db, sourceById("justjoinit"), { now: () => NOW }),
        now: NOW,
        categories,
      });

    it("reads one remote page per owner category, capped, from the offers inside the page", async () => {
      fake.route("/job-offers/all-locations/javascript", html(fixture("justjoinit/javascript.html")));

      const result = await fetchJustJoinIt(["javascript"]);

      expect(fake.requests).toEqual(["/job-offers/all-locations/javascript?remote=yes"]);
      expect(result).toMatchObject({ completeness: "capped", itemsReturned: 3, coversPublishedAfter: null });
      expect(result.listings).toHaveLength(3);
      expect(result.listings[0]).toMatchObject({
        sourceItemId: "00000000-0000-4000-8000-000000000001",
        url: "https://justjoin.it/job-offer/example-offer-1",
        company: "Example Co",
        title: "Senior Full Stack Engineer",
        locationRestriction: "Poland",
        categories: ["javascript"],
        publishedAt: Date.parse("2026-10-16T16:00:11.504Z"),
        expiresAt: Date.parse("2026-10-31T22:59:59.999Z"),
        payField: "b2b EUR 60000–80000 per year",
      });
      expect(result.listings[0]?.description).toContain("<b>markup</b>");
      expect(result.listings[0]?.description).toContain("<p>Level: senior</p>");
      expect(result.listings[0]?.description).toContain("<p>Contract: b2b</p>");
      expect(result.listings[0]?.description).toMatch(/Required skills: .+/);
      // No amount stated: no pay field; a monthly PLN range keeps its period.
      expect(result.listings[1]?.payField).toBe("");
      expect(result.listings[2]?.payField).toBe("b2b PLN 17500–25500 per month");
    });

    it("keeps an offer found in two categories once", async () => {
      fake.route("/job-offers/all-locations/javascript", html(fixture("justjoinit/javascript.html")));
      fake.route("/job-offers/all-locations/html", html(fixture("justjoinit/javascript.html")));

      const result = await fetchJustJoinIt(["javascript", "html"]);

      expect(fake.requests).toHaveLength(2);
      expect(result.listings.map((l) => l.sourceItemId)).toEqual([
        "00000000-0000-4000-8000-000000000001",
        "00000000-0000-4000-8000-000000000002",
        "00000000-0000-4000-8000-000000000003",
      ]);
    });

    it("fails a page without an offer list", async () => {
      fake.route("/job-offers/all-locations/javascript", html("<html>Just a moment...</html>"));
      expect(await fetchJustJoinIt(["javascript"])).toMatchObject({
        completeness: "failed",
        failure: { code: "unreadable" },
      });
    });
  });

  describe("No Fluff Jobs", () => {
    const fetchNoFluffJobs = (categories: string[]) =>
      createAdapters({ baseUrl: fake.baseUrl }).nofluffjobs.fetchLatest({
        http: createSourceHttp(db.db, sourceById("nofluffjobs"), { now: () => NOW }),
        now: NOW,
        categories,
      });
    // The search's pages are cumulative: page 2 holds pages 1 and 2.
    const searchPages = () =>
      fake.route("/pl/praca-zdalna/frontend", (req, res) => {
        const page = (req.url ?? "").includes("page=2") ? "frontend-page2.html" : "frontend-page1.html";
        res.writeHead(200, { "content-type": "text/html" }).end(fixture(`nofluffjobs/${page}`));
      });

    it("reads a category's remote search to its last, cumulative page and is complete", async () => {
      searchPages();

      const result = await fetchNoFluffJobs(["frontend"]);

      expect(fake.requests).toEqual(["/pl/praca-zdalna/frontend", "/pl/praca-zdalna/frontend?page=2"]);
      expect(result).toMatchObject({
        completeness: "complete",
        itemsReturned: 3,
        coversPublishedAfter: null,
      });
      expect(result.listings).toHaveLength(3);
      expect(result.listings[0]).toMatchObject({
        sourceItemId: "example-offer-1-Remote",
        url: "https://nofluffjobs.com/pl/job/example-offer-1-remote",
        company: "Example Co",
        title: "React Developer | Premium Interior E-commerce Brand | Project-based",
        description: "<p>Level: Senior</p>\n<p>Technology: React</p>\n<p>Contract: b2b</p>",
        locationRestriction: "Poland",
        categories: ["frontend"],
        // Renewed postings count from the renewal, as the board shows them.
        publishedAt: 1792161663110,
        expiresAt: null,
        payField: "b2b PLN 80–130 per hour",
      });
      expect(result.listings[1]?.publishedAt).toBe(1792150622655);
      // A hidden salary (shown after the last interview) is no amount.
      expect(result.listings[2]?.payField).toBe("");
    });

    it("stays capped when the last page still holds fewer than the total", async () => {
      fake.route("/pl/praca-zdalna/frontend", (_req, res) => {
        res.writeHead(200, { "content-type": "text/html" }).end(fixture("nofluffjobs/frontend-page1.html"));
      });
      expect(await fetchNoFluffJobs(["frontend"])).toMatchObject({
        completeness: "capped",
        itemsReturned: 2,
      });
    });

    it("fails a page without the search state", async () => {
      fake.route("/pl/praca-zdalna/frontend", xml("<html>Just a moment...</html>"));
      expect(await fetchNoFluffJobs(["frontend"])).toMatchObject({
        completeness: "failed",
        failure: { code: "unreadable" },
      });
    });
  });

  describe("Bulldogjob", () => {
    const fetchBulldogjob = (categories: string[]) =>
      createAdapters({ baseUrl: fake.baseUrl }).bulldogjob.fetchLatest({
        http: createSourceHttp(db.db, sourceById("bulldogjob"), { now: () => NOW }),
        now: NOW,
        categories,
      });

    it("reads one remote search per owner role, complete when the page holds them all", async () => {
      fake.route("/companies/jobs/s/city,Remote/role,frontend", xml(fixture("bulldogjob/frontend.html")));

      const result = await fetchBulldogjob(["frontend"]);

      expect(fake.requests).toEqual(["/companies/jobs/s/city,Remote/role,frontend"]);
      expect(result).toMatchObject({
        completeness: "complete",
        itemsReturned: 3,
        coversPublishedAfter: null,
      });
      expect(result.listings[0]).toMatchObject({
        sourceItemId: "900001-example-offer-1",
        url: "https://bulldogjob.pl/companies/jobs/900001-example-offer-1",
        company: "Example Co",
        title: "Senior Frontend Developer (React + React Native)",
        description:
          "<p>Level: senior</p>\n<p>Contract: b2b, employment</p>\n<p>Technologies: React Native, TypeScript, Redux, GraphQL</p>",
        locationRestriction: "Poland",
        categories: ["frontend"],
        // The list gives no publication time: age counts from when job-radar first found it.
        publishedAt: null,
        expiresAt: null,
        payField: "20 000 - 24 000 PLN",
      });
      expect(result.listings[2]?.payField).toBe("");
    });

    it("is capped when the role has more jobs than the page holds", async () => {
      fake.route(
        "/companies/jobs/s/city,Remote/role,frontend",
        xml(fixture("bulldogjob/frontend-capped.html")),
      );
      expect(await fetchBulldogjob(["frontend"])).toMatchObject({ completeness: "capped", itemsReturned: 3 });
    });

    it("fails a page without the job data", async () => {
      fake.route("/companies/jobs/s/city,Remote/role,frontend", xml("<html>Just a moment...</html>"));
      expect(await fetchBulldogjob(["frontend"])).toMatchObject({
        completeness: "failed",
        failure: { code: "unreadable" },
      });
    });
  });

  describe("Imported sources (Pracuj.pl, theprotocol.it)", () => {
    let dir: string;
    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), "job-radar-imports-"));
    });
    afterEach(() => rmSync(dir, { recursive: true, force: true }));

    // One read an hour: each read here is an hour after the last.
    let at = NOW;
    const fetchImported = (importsDir?: string) => {
      at += 60 * 60 * 1000;
      const now = at;
      return createAdapters({ importsDir }).pracuj.fetchLatest({
        http: createSourceHttp(db.db, sourceById("pracuj"), { now: () => now }),
        now,
      });
    };
    const listing = {
      sourceItemId: "1005164217",
      url: "https://www.pracuj.pl/praca/example,oferta,1005164217",
      title: "Senior Frontend Developer (Next.js / React)",
      company: "Example Co",
      description: "<p>Level: senior</p>",
      locationRestriction: "Poland",
      categories: ["frontend"],
      publishedAt: "2026-10-16T14:42:53Z",
      expiresAt: "2026-11-15T22:59:59Z",
      payField: "",
    };

    it("asks nothing and reads nothing while no file is imported", async () => {
      expect(await fetchImported(dir)).toEqual({
        completeness: "partial",
        listings: [],
        itemsReturned: null,
        coversPublishedAfter: null,
      });
      expect(await fetchImported(undefined)).toMatchObject({ completeness: "partial", itemsReturned: null });
      expect(fake.requests).toEqual([]);
    });

    it("reads the imported listings, complete only when the look read every page", async () => {
      writeFileSync(join(dir, "pracuj.json"), JSON.stringify({ complete: true, listings: [listing] }));
      const result = await fetchImported(dir);
      expect(result).toMatchObject({ completeness: "complete", itemsReturned: 1 });
      expect(result.listings[0]).toEqual({
        ...listing,
        publishedAt: Date.UTC(2026, 9, 16, 14, 42, 53),
        expiresAt: Date.UTC(2026, 10, 15, 22, 59, 59),
      });

      writeFileSync(join(dir, "pracuj.json"), JSON.stringify({ listings: [listing] }));
      expect(await fetchImported(dir)).toMatchObject({ completeness: "capped", itemsReturned: 1 });
    });

    it("fails a file that is not valid JSON or holds an unexpected listing", async () => {
      writeFileSync(join(dir, "pracuj.json"), "{");
      expect(await fetchImported(dir)).toMatchObject({
        completeness: "failed",
        failure: { code: "unreadable" },
      });
      writeFileSync(join(dir, "pracuj.json"), JSON.stringify({ listings: [{ title: "no id" }] }));
      expect(await fetchImported(dir)).toMatchObject({
        completeness: "failed",
        failure: { code: "unreadable" },
      });
    });
  });

  describe("Djinni, DOU, Remote OK and Working Nomads feeds", () => {
    const read = (id: SourceId, categories?: string[]) =>
      createAdapters({ baseUrl: fake.baseUrl })[id].fetchLatest({
        http: createSourceHttp(db.db, sourceById(id), { now: () => NOW }),
        now: NOW,
        categories,
      });
    const DAY = 24 * 60 * 60 * 1000;

    it("Djinni: one RSS request per category, keeping only that category's jobs, expiring 30 days on", async () => {
      fake.route("/jobs/rss/", xml(fixture("djinni/javascript.xml")));

      const result = await read("djinni", ["JavaScript"]);

      expect(fake.requests).toEqual(["/jobs/rss/?primary_keyword=JavaScript"]);
      expect(result).toMatchObject({ completeness: "capped", itemsReturned: 3 });
      // The third item is another category: an unknown keyword answers with every job.
      expect(result.listings.map((l) => l.title)).toEqual([
        "Junior Three.js Developer",
        "Junior Frontend Developer",
      ]);
      const publishedAt = Date.parse("2026-10-16T08:12:06Z");
      expect(result.listings[0]).toMatchObject({
        sourceItemId: "https://djinni.co/jobs/900001-example-role-1/",
        url: "https://djinni.co/jobs/900001-example-role-1/",
        company: "",
        locationRestriction: null,
        categories: ["JavaScript"],
        publishedAt,
        expiresAt: publishedAt + 30 * DAY,
        payField: "",
      });
    });

    it("DOU: one remote RSS request per category, company and pay read from the title", async () => {
      fake.route("/vacancies/feeds/", xml(fixture("dou/front-end.xml")));

      const result = await read("dou", ["Front End"]);

      expect(fake.requests).toEqual(["/vacancies/feeds/?category=Front%20End&remote"]);
      expect(result).toMatchObject({ completeness: "capped", itemsReturned: 2 });
      expect(result.listings[0]).toMatchObject({
        sourceItemId: "https://jobs.dou.ua/companies/example-1/vacancies/900001/",
        url: "https://jobs.dou.ua/companies/example-1/vacancies/900001/",
        title: "E-commerce Web Developer (WordPress-Shopify)",
        company: "Example Co",
        locationRestriction: null,
        categories: ["Front End"],
        publishedAt: Date.parse("2026-10-14T11:17:24Z"),
        payField: "$2000–2200",
      });
      expect(result.listings[1]).toMatchObject({
        title: "Front End Developer",
        company: "Example Labs",
        payField: "",
      });
    });

    it("Remote OK: one API request, the legal notice skipped, tags as categories, pay in USD a year", async () => {
      fake.route("/api", json(fixture("remoteok/api.json")));

      const result = await read("remoteok");

      expect(fake.requests).toEqual(["/api"]);
      expect(result).toMatchObject({ completeness: "capped", itemsReturned: 2 });
      expect(result.listings[0]).toMatchObject({
        sourceItemId: "90001",
        url: "https://remoteOK.com/remote-jobs/example-1",
        company: "Example Co",
        payField: "USD 50000–70000 per year",
        publishedAt: Date.parse("2026-10-14T14:44:21Z"),
      });
      expect(result.listings[0]?.categories).toContain("data annotation");
      // No location stated is unknown, never "anywhere"; 0 pay is no pay.
      expect(result.listings[1]).toMatchObject({
        locationRestriction: null,
        payField: "",
        company: "Example Labs",
      });
    });

    it("Working Nomads: one API request, category and location as stated", async () => {
      fake.route("/api/exposed_jobs/", json(fixture("workingnomads/jobs.json")));

      const result = await read("workingnomads");

      expect(fake.requests).toEqual(["/api/exposed_jobs/"]);
      expect(result).toMatchObject({ completeness: "capped", itemsReturned: 2 });
      expect(result.listings[0]).toMatchObject({
        sourceItemId: "https://www.workingnomads.com/job/go/900001/",
        company: "Example Co",
        categories: ["Development"],
        locationRestriction: "Europe, LATAM, APAC, the U.S., Canada",
        publishedAt: Date.parse("2026-10-15T14:14:32Z"),
      });
    });

    it("fails a feed that is not RSS or not a job list", async () => {
      fake.route("/jobs/rss/", xml("<html>Just a moment...</html>"));
      fake.route("/api", json(JSON.stringify({ error: "nope" })));
      expect(await read("djinni", ["JavaScript"])).toMatchObject({
        completeness: "failed",
        failure: { code: "unreadable" },
      });
      expect(await read("remoteok")).toMatchObject({
        completeness: "failed",
        failure: { code: "unreadable" },
      });
    });
  });
});
