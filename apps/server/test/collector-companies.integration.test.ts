import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { addCompany, createCompanyRegistry } from "../src/modules/collector/app/companies.js";
import { sourceById } from "../src/modules/collector/domain/sources.js";
import { createSourceHttp } from "../src/modules/collector/infra/http.js";
import { addBoard, dueBoards, listCompanies } from "../src/modules/collector/infra/repo/companies.js";
import { ensureSources } from "../src/modules/collector/infra/repo/sources.js";
import { postings } from "../src/modules/collector/infra/schema.js";
import { atsAdapter } from "../src/modules/collector/infra/sources/ats.js";
import { collectorRoutes } from "../src/modules/collector/ports/routes.js";
import { expectContract } from "./helpers/contract.js";
import { type FakeSources, fixture, json, startFakeSources } from "./helpers/fake-sources.js";
import { createTempDb, type TempDb } from "./helpers/temp-db.js";

const NOW = Date.UTC(2026, 9, 20, 12);
const DAY = 24 * 60 * 60 * 1000;
const BOARDS = {
  greenhouse: "/v1/boards/example/jobs",
  lever: "/v0/postings/example",
  ashby: "/posting-api/job-board/example",
} as const;

describe("company job boards (the ats source)", () => {
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

  const http = () => createSourceHttp(db.db, sourceById("ats"), { now: () => NOW });
  const registry = (theirstackKey?: string) =>
    createCompanyRegistry(
      { db: db.db },
      { baseUrl: fake.baseUrl, theirstackKey, theirstackEndpoint: `${fake.baseUrl}/theirstack` },
    );
  const read = (theirstackKey?: string) =>
    atsAdapter(registry(theirstackKey), fake.baseUrl).fetchLatest({ http: http(), now: NOW });
  const addPosting = (company: string, firstFoundAt = NOW) =>
    db.db
      .insert(postings)
      .values({
        id: `p-${company}`,
        matchKey: company,
        title: "Frontend Engineer",
        company,
        firstFoundAt,
        status: "open",
        lastOfferedAt: firstFoundAt,
      })
      .run();

  it("reads each due board and keeps its remote roles, whatever the system", async () => {
    fake.route(BOARDS.greenhouse, json(fixture("ats/greenhouse.json")));
    fake.route(BOARDS.lever, json(fixture("ats/lever.json")));
    fake.route(BOARDS.ashby, json(fixture("ats/ashby.json")));
    for (const ats of ["greenhouse", "lever", "ashby"] as const) {
      addBoard(db.db, { ats, slug: "example" }, "Example Co", "manual", NOW);
    }

    const result = await read();

    expect(result).toMatchObject({ completeness: "capped", itemsReturned: 5 });
    // Hybrid, on-site and unlisted jobs are left out; the non-engineering role has no category.
    expect(result.listings.map((l) => [l.title, l.categories])).toEqual([
      ["Senior Frontend Engineer", ["frontend"]],
      ["Account Executive", []],
      ["Full Stack Engineer", ["fullstack"]],
      ["Senior / Staff Fullstack Engineer", ["fullstack"]],
      ["Product Designer", []],
    ]);
    const [greenhouse, , lever, ashby] = result.listings;
    expect(greenhouse).toMatchObject({
      sourceItemId: "greenhouse:example:6136160004",
      url: "https://job-boards.greenhouse.io/example/jobs/6136160004",
      company: "Example Co",
      description: "<p>Build the <b>dashboard</b> &amp; more.</p>",
      locationRestriction: "Remote - Europe",
      publishedAt: null,
      expiresAt: NOW + 7 * DAY,
      payField: "",
    });
    expect(lever).toMatchObject({
      locationRestriction: "Warsaw, Poland",
      payField: "PLN 20000–28000 per month",
    });
    expect(lever?.description).toContain("<h3>What you will do</h3><ul><li>Ship features</li></ul>");
    expect(ashby).toMatchObject({ locationRestriction: "Europe, Poland", payField: "€90K – €120K" });

    // Each board was read now, with its count of engineering roles.
    expect(listCompanies(db.db).map((c) => [c.ats, c.lastCheckedAt, c.lastResult, c.openRoles])).toEqual([
      ["greenhouse", NOW, "ok", 1],
      ["lever", NOW, "ok", 1],
      ["ashby", NOW, "ok", 1],
    ]);
  });

  it("stops reading a board that is gone, and fails only when no board answers", async () => {
    addBoard(db.db, { ats: "lever", slug: "gone" }, "Gone Co", "manual", NOW);
    fake.route("/v0/postings/gone", json('{"ok":false}', 404));
    expect(await read()).toMatchObject({ completeness: "capped", listings: [] });
    expect(dueBoards(db.db, 10)).toEqual([]);

    addBoard(db.db, { ats: "greenhouse", slug: "down" }, "Down Co", "manual", NOW);
    fake.route("/v1/boards/down/jobs", json("{}", 500));
    expect(await read()).toMatchObject({ completeness: "failed", failure: { code: "unreachable" } });
  });

  it("finds boards by guessing them from the collected companies' names, each name once", async () => {
    addPosting("Example Co");
    addPosting("Nowhere Labs", NOW - DAY);
    fake.route(BOARDS.ashby, json(fixture("ats/ashby.json")));

    await read();

    // "Example Co" → example: Greenhouse and Lever answer 404, Ashby has the board.
    expect(fake.requests.slice(0, 3)).toEqual([
      "/v1/boards/example/jobs?content=true",
      "/v0/postings/example?mode=json",
      "/posting-api/job-board/example?includeCompensation=true",
    ]);
    expect(listCompanies(db.db).map((c) => [c.name, c.ats, c.slug, c.origin])).toEqual([
      ["Example Co", "ashby", "example", "probe"],
    ]);

    const before = fake.requests.length;
    await read();
    // Nothing is probed again: only the found board is read.
    expect(fake.requests.slice(before)).toEqual(["/posting-api/job-board/example?includeCompensation=true"]);
  });

  it("asks TheirStack for hiring companies at most once a day, with the key", async () => {
    const searches: string[] = [];
    fake.route("/theirstack", async (req, res) => {
      searches.push(String(req.headers.authorization));
      res.writeHead(200, { "content-type": "application/json" }).end(
        JSON.stringify({
          data: [
            { company: "Hiring Co", final_url: "https://jobs.ashbyhq.com/hiringco/1", url: "https://x.test" },
          ],
        }),
      );
    });

    fake.route("/posting-api/job-board/hiringco", json(fixture("ats/ashby.json")));
    await read(); // no key: no search
    await read("test-key");
    await read("test-key");

    expect(searches).toEqual(["Bearer test-key"]);
    expect(listCompanies(db.db).map((c) => [c.name, c.ats, c.slug, c.origin])).toEqual([
      ["Hiring Co", "ashby", "hiringco", "theirstack"],
    ]);
  });

  it("adds a company by its board link or its site, once", async () => {
    fake.route(BOARDS.greenhouse, json(fixture("ats/greenhouse.json")));
    const deps = { db: db.db, now: () => NOW };
    const opts = { baseUrl: fake.baseUrl, http: http() };

    const added = await addCompany(deps, "https://job-boards.greenhouse.io/Example/jobs/1", opts);
    expect(added).toMatchObject({
      kind: "added",
      company: { name: "Example", ats: "greenhouse", origin: "manual" },
    });
    expect(await addCompany(deps, "jobs.ashbyhq.com/example", opts)).toEqual({ kind: "not_found" });
    expect(await addCompany(deps, "http://127.0.0.1:3000", opts)).toEqual({ kind: "invalid" });
    expect(await addCompany(deps, "localhost", opts)).toEqual({ kind: "invalid" });
    // A site: its pages name no board here, so its name is guessed — and that board is listed already.
    expect(await addCompany(deps, "www.example.test", opts)).toMatchObject({ kind: "exists" });
  });

  it("lists, adds and removes companies over HTTP, as the contract says", async () => {
    fake.route(BOARDS.lever, json(fixture("ats/lever.json")));
    const app: FastifyInstance = await buildApp({ port: 3000 });
    await app.register(
      collectorRoutes(
        { db: db.db, now: () => NOW, settingsFile: "", adapters: {} as never, timeZone: "UTC" },
        () => {},
        { baseUrl: fake.baseUrl },
      ),
    );
    const call = async (method: "GET" | "POST" | "DELETE", url: string, payload?: object) =>
      app.inject({ method, url, payload, headers: { host: "127.0.0.1:3000" } });
    try {
      const post = await call("POST", "/api/v1/collector/companies", {
        url: "https://jobs.lever.co/example",
      });
      expect(post.statusCode).toBe(201);
      expectContract("addCompany", 201, post.json());
      expect(post.json()).toMatchObject({ board_url: "https://jobs.lever.co/example", origin: "manual" });

      const again = await call("POST", "/api/v1/collector/companies", {
        url: "https://jobs.lever.co/example",
      });
      expect(again.statusCode).toBe(200);
      const bad = await call("POST", "/api/v1/collector/companies", { url: "not a site" });
      expect(bad.statusCode).toBe(422);
      expectContract("addCompany", 422, bad.json());

      const list = await call("GET", "/api/v1/collector/companies");
      expectContract("listCompanies", 200, list.json());
      expect(list.json().companies).toHaveLength(1);

      const id = post.json().id as string;
      expect((await call("DELETE", `/api/v1/collector/companies/${id}`, {})).statusCode).toBe(204);
      expect((await call("DELETE", `/api/v1/collector/companies/${id}`, {})).statusCode).toBe(404);
      expect((await call("GET", "/api/v1/collector/companies")).json().companies).toEqual([]);
    } finally {
      await app.close();
    }
  });
});
