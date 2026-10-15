import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { openDb, runMigrations } from "../src/core/db.js";
import { loadContract } from "./helpers/contract.js";
import { type FakeProvider, fakeProvider, USAGE } from "./helpers/fake-provider.js";

const contract = loadContract("match-score");
const headers = { host: "127.0.0.1:3000" };
const NOW = Date.UTC(2026, 9, 20, 10);
const cvPdf = readFileSync(new URL("fixtures/cv/cv.pdf", import.meta.url)).toString("base64");
const profile = {
  skills: [
    { name: "TypeScript", core: true },
    { name: "React", core: true },
    { name: "Node", core: false },
  ],
  years: 8,
  seniority: "senior",
  role_types: ["backend", "fullstack"],
  min_salary: { amount: 6000, currency: "EUR", period: "month" },
  engagement_forms: ["b2b"],
};

let dir: string;
let app: FastifyInstance;
let provider: FakeProvider;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "job-radar-matching-"));
  const databaseFile = join(dir, "job-radar.sqlite");
  const handle = openDb(databaseFile);
  runMigrations(handle.db);
  handle.close();
  provider = fakeProvider({
    kind: "answer",
    answer: {
      skills: [{ name: "TypeScript", core: true }],
      years: 8,
      seniority: "senior",
      role_types: ["fullstack"],
      min_salary: null,
      engagement_forms: [],
    },
    usage: USAGE,
  });
  app = await buildApp({
    port: 3000,
    collector: { databaseFile, scheduler: false, now: () => NOW },
    matching: { provider, scorer: false, env: { ANTHROPIC_API_KEY: "sk-test-not-a-real-key" } },
  });
  await app.ready();
});
afterEach(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

const get = (path: string) => app.inject({ method: "GET", url: `/api/v1/matching/${path}`, headers });
const post = (path: string, payload: unknown, extra: Record<string, string> = {}) =>
  app.inject({
    method: "POST",
    url: `/api/v1/matching/${path}`,
    headers: { ...headers, ...extra },
    payload: payload as object,
  });

describe("matching routes (contract)", () => {
  it("getMatchingSettings: first open (AC-15, AC-20)", async () => {
    const res = await get("settings");
    expect(res.statusCode).toBe(200);
    contract.expectContract("getMatchingSettings", 200, res.json());
    expect(res.json()).toEqual({
      profile: null,
      profile_version: 0,
      cap_usd_cents: 500,
      spent_usd_cents: 0,
      notice_agreed_at: null,
    });
  });

  it("saveProfile: 409 before the notice, then 200 changed, then 200 unchanged (AC-20, AC-21, AC-10)", async () => {
    const before = await post("profile", { profile });
    expect(before.statusCode).toBe(409);
    contract.expectContract("saveProfile", 409, before.json());
    const agreed = await post("notice", {});
    contract.expectContract("agreeNotice", 200, agreed.json());
    expect(agreed.json()).toEqual({ notice_agreed_at: new Date(NOW).toISOString() });
    const first = await post("profile", { profile });
    contract.expectContract("saveProfile", 200, first.json());
    expect(first.json()).toMatchObject({ changed: true, settings: { profile, profile_version: 1 } });
    const again = await post("profile", { profile });
    expect(again.json()).toMatchObject({ changed: false, settings: { profile_version: 1 } });
  });

  it("saveProfile: 400 with the field named (AC-16)", async () => {
    await post("notice", {});
    const res = await post("profile", { profile: { ...profile, skills: [{ name: "React", core: false }] } });
    expect(res.statusCode).toBe(400);
    contract.expectContract("saveProfile", 400, res.json());
    expect(res.json().error).toEqual({
      code: "MATCHING_INVALID_PROFILE",
      message: "Skills: mark at least one skill as core.",
    });
  });

  it.each([
    ["a skill over 50 characters", { skills: [{ name: "x".repeat(51), core: true }] }, "Skills: "],
    [
      "a negative salary",
      { min_salary: { amount: -1, currency: "EUR", period: "month" } },
      "Minimum salary: ",
    ],
    ["years above 60", { years: 61 }, "Years of experience: "],
    ["no skills at all", { skills: [] }, "Skills: "],
  ])(
    "saveProfile: %s answers the field message, not the validator's (AC-16, review R9)",
    async (_n, over, field) => {
      await post("notice", {});
      const res = await post("profile", { profile: { ...profile, ...over } });
      expect(res.statusCode).toBe(400);
      contract.expectContract("saveProfile", 400, res.json());
      expect(res.json().error.code).toBe("MATCHING_INVALID_PROFILE");
      expect(res.json().error.message.startsWith(field)).toBe(true);
    },
  );

  it("setScoringCap: saved in cents, 400 outside $0–$100 (AC-19)", async () => {
    const res = await post("cap", { cap_usd_cents: 800 });
    contract.expectContract("setScoringCap", 200, res.json());
    expect(res.json().cap_usd_cents).toBe(800);
    const bad = await post("cap", { cap_usd_cents: 10_001 });
    expect(bad.statusCode).toBe(400);
    contract.expectContract("setScoringCap", 400, bad.json());
  });

  it("draftProfileFromCv: a draft from a PDF, with nothing saved (AC-07)", async () => {
    await post("notice", {});
    const res = await post("cv-drafts", {
      file_name: "cv.pdf",
      media_type: "application/pdf",
      content_base64: cvPdf,
    });
    expect(res.statusCode).toBe(200);
    contract.expectContract("draftProfileFromCv", 200, res.json());
    expect(res.json()).toMatchObject({
      draft: { skills: [{ name: "TypeScript", core: true }], role_types: ["fullstack"] },
      field_sources: { min_salary: "not_found" },
      current: null,
    });
    expect((await get("settings")).json().profile).toBe(null);
  });

  it("draftProfileFromCv: an unreadable file and an over-large body answer with the AC-08 messages", async () => {
    await post("notice", {});
    const png = await post("cv-drafts", {
      file_name: "photo.png",
      media_type: "image/png",
      content_base64: "iVBORw0KGgo=",
    });
    expect(png.statusCode).toBe(400);
    contract.expectContract("draftProfileFromCv", 400, png.json());
    expect(png.json().error.code).toBe("MATCHING_CV_UNSUPPORTED");
    const huge = await post("cv-drafts", {
      file_name: "cv.txt",
      media_type: "text/plain",
      content_base64: "A".repeat(7 * 1024 * 1024 + 10),
    });
    expect(huge.statusCode).toBe(413);
    contract.expectContract("draftProfileFromCv", 413, huge.json());
    expect(huge.json().error.code).toBe("MATCHING_CV_TOO_LARGE");
  });

  it("getScoringHealth (AC-14)", async () => {
    const res = await get("health");
    expect(res.statusCode).toBe(200);
    contract.expectContract("getScoringHealth", 200, res.json());
  });

  it("refuses another site and a foreign host (AC-17)", async () => {
    const cross = await post("profile", { profile }, { "sec-fetch-site": "cross-site" });
    expect(cross.statusCode).toBe(403);
    contract.expectContract("saveProfile", 403, cross.json());
    expect(cross.json().error.code).toBe("CROSS_SITE_REQUEST");
    const foreign = await app.inject({
      method: "GET",
      url: "/api/v1/matching/settings",
      headers: { host: "evil.example.test" },
    });
    expect(foreign.statusCode).toBe(403);
    expect(foreign.json().error.code).toBe("FORBIDDEN_HOST");
    const cap = await post("cap", { cap_usd_cents: 0 }, { "sec-fetch-site": "cross-site" });
    expect(cap.statusCode).toBe(403);
    expect((await get("settings")).json().cap_usd_cents).toBe(500);
  });

  it("search shows matches once a profile exists (wired score reader, ADR-0004)", async () => {
    await post("notice", {});
    await post("profile", { profile });
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/search/snapshots",
      headers,
      payload: { skills: "" },
    });
    expect(res.json()).toMatchObject({ has_profile: true, order: "newest" });
  });
});
