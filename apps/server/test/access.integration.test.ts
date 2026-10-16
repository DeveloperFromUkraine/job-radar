import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { assertLoopbackHost } from "../src/core/access.js";
import { createTempDb, type TempDb } from "./helpers/temp-db.js";

// ADR-0007: loopback only, Host allowlist, same-origin state changes with a JSON body.
const PORT = 3000;
const ok = { host: `127.0.0.1:${PORT}` };

describe("access guard", () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
  });

  async function appWithEcho() {
    app = await buildApp({ port: PORT });
    app.post("/test/echo", async () => ({ ok: true }));
    return app;
  }

  it.each(["127.0.0.1:3000", "localhost:3000"])("serves a request whose Host is %s", async (host) => {
    const a = await appWithEcho();

    const res = await a.inject({ method: "GET", url: "/health", headers: { host } });

    expect(res.statusCode).toBe(200);
  });

  it.each(["evil.example.test:3000", "localhost:4000", "192.168.1.20:3000"])(
    "refuses a request whose Host is %s",
    async (host) => {
      const a = await appWithEcho();

      const res = await a.inject({ method: "GET", url: "/health", headers: { host } });

      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe("FORBIDDEN_HOST");
    },
  );

  it("refuses a cross-site state-changing request", async () => {
    const a = await appWithEcho();

    const res = await a.inject({
      method: "POST",
      url: "/test/echo",
      headers: { ...ok, "sec-fetch-site": "cross-site" },
      payload: {},
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("CROSS_SITE_REQUEST");
  });

  it("accepts a same-origin state-changing request with a JSON body", async () => {
    const a = await appWithEcho();

    const res = await a.inject({
      method: "POST",
      url: "/test/echo",
      headers: { ...ok, "sec-fetch-site": "same-origin" },
      payload: {},
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("refuses a state-changing request without a body", async () => {
    const a = await appWithEcho();

    const res = await a.inject({ method: "POST", url: "/test/echo", headers: ok });

    expect(res.statusCode).toBe(415);
    expect(res.json().error.code).toBe("UNSUPPORTED_MEDIA_TYPE");
  });

  it("refuses a state-changing request with a non-JSON body", async () => {
    const a = await appWithEcho();

    const res = await a.inject({
      method: "POST",
      url: "/test/echo",
      headers: { ...ok, "content-type": "text/plain" },
      payload: "{}",
    });

    expect(res.statusCode).toBe(415);
    expect(res.json().error.code).toBe("UNSUPPORTED_MEDIA_TYPE");
  });

  it.each(["127.0.0.1", "localhost", "::1"])("allows the server to bind %s", (host) => {
    expect(() => assertLoopbackHost(host)).not.toThrow();
  });

  it.each(["0.0.0.0", "192.168.1.20", "::"])("refuses to start on %s", (host) => {
    expect(() => assertLoopbackHost(host)).toThrow(/loopback/);
  });
});

// realness-score AC-12: the switch and the list with its reasons, like every other route.
describe("access to realness and the list with its reasons", () => {
  let app: FastifyInstance;
  let t: TempDb;

  afterEach(async () => {
    await app?.close();
    t?.cleanup();
  });

  async function realApp() {
    t = createTempDb();
    app = await buildApp({ port: PORT, collector: { databaseFile: t.file, scheduler: false } });
    await app.ready();
    return app;
  }
  const realnessRow = () => t.db.all(sql`select realness_on from realness_settings`);

  it.each([
    ["GET", "/api/v1/realness/settings", undefined],
    ["POST", "/api/v1/realness/settings", { on: false }],
    ["POST", "/api/v1/search/snapshots", { skills: "" }],
  ] as const)("refuses %s %s from a foreign Host", async (method, url, payload) => {
    const a = await realApp();
    const res = await a.inject({ method, url, headers: { host: "evil.example.test:3000" }, payload });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("FORBIDDEN_HOST");
    expect(realnessRow()).toEqual([]);
  });

  it.each([
    ["/api/v1/realness/settings", { on: false }],
    ["/api/v1/search/snapshots", { skills: "" }],
  ])("refuses a cross-site POST %s", async (url, payload) => {
    const a = await realApp();
    const res = await a.inject({
      method: "POST",
      url,
      headers: { ...ok, "sec-fetch-site": "cross-site" },
      payload,
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("CROSS_SITE_REQUEST");
    expect(realnessRow()).toEqual([]);
  });
});
