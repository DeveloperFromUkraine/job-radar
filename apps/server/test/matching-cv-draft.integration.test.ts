import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadMatchingConfig } from "../src/core/config.js";
import { AppError } from "../src/core/errors.js";
import { draftProfileFromCv } from "../src/modules/matching/app/cv-draft.js";
import type { MatchingDeps } from "../src/modules/matching/app/deps.js";
import { agreeNotice } from "../src/modules/matching/app/settings.js";
import { readSettings } from "../src/modules/matching/infra/repo.js";
import { matchingSpend } from "../src/modules/matching/infra/schema.js";
import { type FakeProvider, fakeProvider, problem, USAGE } from "./helpers/fake-provider.js";
import { AC01_PROFILE, seedProfile, seedSpend } from "./helpers/matching-fixtures.js";
import { createTempDb, type TempDb } from "./helpers/temp-db.js";

const NOW = Date.UTC(2026, 9, 20, 10);
const PDF = "application/pdf";
const cv = (name: string) => new Uint8Array(readFileSync(new URL(`fixtures/cv/${name}`, import.meta.url)));
const draftAnswer = (over: Record<string, unknown> = {}) => ({
  kind: "answer" as const,
  answer: {
    skills: [
      { name: "TypeScript", core: true },
      { name: "React", core: true },
      { name: "GraphQL", core: false },
      { name: "user-0001@example.test", core: false },
    ],
    years: 8,
    seniority: "Senior",
    role_types: ["Full-stack", "Solutions Architect"],
    min_salary: null,
    engagement_forms: [],
    ...over,
  },
  usage: USAGE,
});

let t: TempDb;
let provider: FakeProvider;
let deps: MatchingDeps;

beforeEach(() => {
  t = createTempDb();
  provider = fakeProvider(draftAnswer());
  deps = {
    db: t.db,
    now: () => NOW,
    timeZone: "Europe/Warsaw",
    config: loadMatchingConfig({ ANTHROPIC_API_KEY: "sk-test-not-a-real-key" }),
    provider,
    wakeScorer: () => {},
  };
});
afterEach(() => t.cleanup());

const spend = () => t.db.select().from(matchingSpend).all();
async function refused(p: Promise<unknown>, code: string, status: number) {
  const e = await p.then(
    () => null,
    (err: unknown) => err,
  );
  expect(e).toBeInstanceOf(AppError);
  expect(e).toMatchObject({ code, statusCode: status });
  return e as AppError;
}

describe("draftProfileFromCv (AC-07, AC-09)", () => {
  it("drafts from a PDF: tags each field, maps onto the fixed lists, lists what was removed, keeps nothing", async () => {
    agreeNotice(deps);
    const r = await draftProfileFromCv(deps, { mediaType: PDF, bytes: cv("cv.pdf") });
    expect(r.draft).toEqual({
      skills: [
        { name: "TypeScript", core: true },
        { name: "React", core: true },
        { name: "GraphQL", core: false },
      ],
      years: 8,
      seniority: "senior",
      roleTypes: ["fullstack"],
      minSalary: null,
      engagementForms: [],
    });
    expect(r.fieldSources).toEqual({
      skills: "from_cv",
      years: "from_cv",
      seniority: "from_cv",
      roleTypes: "from_cv",
      minSalary: "not_found",
      engagementForms: "not_found",
    });
    expect(r.notMapped).toEqual([{ field: "role_types", value: "Solutions Architect" }]);
    expect(r.removed.map((d) => d.kind).sort()).toEqual(["email", "email", "name", "phone"]);
    expect(r.current).toBe(null);
    expect(readSettings(t.db).profile).toBe(null); // nothing saved until the owner confirms
  });

  it("sends no name or contact detail to the provider (AC-09, NFR No personal details sent)", async () => {
    agreeNotice(deps);
    await draftProfileFromCv(deps, { mediaType: PDF, bytes: cv("cv.pdf") });
    const sent = provider.sentText();
    for (const detail of ["Test User", "user-0001@example.test", "+48 000 000 000"])
      expect(sent).not.toContain(detail);
    expect(sent).toContain("Senior TypeScript engineer, 8 years");
  });

  it("shows the draft beside the current profile", async () => {
    seedProfile(t.db);
    const r = await draftProfileFromCv(deps, { mediaType: PDF, bytes: cv("cv.pdf") });
    expect(r.current).toEqual(AC01_PROFILE);
  });

  it("maps seniority, role types and engagement forms, and marks the rest not mapped", async () => {
    agreeNotice(deps);
    provider = fakeProvider(
      draftAnswer({
        seniority: "Rockstar",
        role_types: ["Backend", "DevOps", "Machine Learning"],
        engagement_forms: ["B2B", "full-time employment", "Volunteer"],
        min_salary: { amount: 6000, currency: "eur", period: "month" },
      }),
    );
    deps.provider = provider;
    const r = await draftProfileFromCv(deps, { mediaType: PDF, bytes: cv("cv.pdf") });
    expect(r.draft).toMatchObject({
      seniority: null,
      roleTypes: ["backend", "devops_sre", "ml_ai"],
      engagementForms: ["b2b", "employment"],
      minSalary: { amount: 6000, currency: "EUR", period: "month" },
    });
    expect(r.notMapped).toEqual([
      { field: "seniority", value: "Rockstar" },
      { field: "engagement_forms", value: "Volunteer" },
    ]);
  });

  it("records one draft spend, settled from usage", async () => {
    agreeNotice(deps);
    await draftProfileFromCv(deps, { mediaType: PDF, bytes: cv("cv.pdf") });
    expect(spend()).toEqual([
      expect.objectContaining({
        kind: "draft",
        postingId: null,
        outcome: "answered",
        settledUsdMicros: 15_600,
      }),
    ]);
  });
});

describe("refusals and failures (AC-08, AC-20)", () => {
  it("refuses before the notice is agreed: nothing read or sent (AC-20)", async () => {
    await refused(
      draftProfileFromCv(deps, { mediaType: PDF, bytes: cv("cv.pdf") }),
      "MATCHING_NOTICE_NOT_AGREED",
      409,
    );
    expect(provider.sent).toHaveLength(0);
  });

  it.each([
    ["scan.pdf", PDF, "MATCHING_CV_NO_TEXT", 400],
    ["empty.txt", "text/plain", "MATCHING_CV_EMPTY", 400],
    ["photo.png", "image/png", "MATCHING_CV_UNSUPPORTED", 400],
  ])("refuses %s before anything is sent or counted", async (file, mediaType, code, status) => {
    agreeNotice(deps);
    const e = await refused(draftProfileFromCv(deps, { mediaType, bytes: cv(file) }), code, status);
    expect(e.message).toContain("Upload a PDF, a Word document (.docx) or a plain text file");
    expect(provider.sent).toHaveLength(0);
    expect(spend()).toHaveLength(0);
  });

  it("refuses when the cap would be exceeded: nothing sent", async () => {
    agreeNotice(deps);
    seedSpend(t.db, [{ startedAt: NOW - 1000, reservedUsdMicros: 4_980_000, settledUsdMicros: 4_980_000 }]);
    const e = await refused(
      draftProfileFromCv(deps, { mediaType: PDF, bytes: cv("cv.pdf") }),
      "MATCHING_CAP_REACHED",
      409,
    );
    expect(e.message).toContain("1 November");
    expect(provider.sent).toHaveLength(0);
  });

  it.each([
    ["provider_unreachable", "MATCHING_PROVIDER_UNAVAILABLE"],
    ["rate_limited", "MATCHING_PROVIDER_UNAVAILABLE"],
    ["key_refused", "MATCHING_KEY_PROBLEM"],
    ["key_missing", "MATCHING_KEY_PROBLEM"],
  ] as const)("%s: tells why, keeps the reservation as spent, profile unchanged", async (p, code) => {
    seedProfile(t.db);
    deps.provider = fakeProvider(problem(p));
    const e = await refused(draftProfileFromCv(deps, { mediaType: PDF, bytes: cv("cv.pdf") }), code, 503);
    expect(e.message).not.toContain("sk-");
    expect(spend()).toEqual([expect.objectContaining({ outcome: "no_answer", settledUsdMicros: null })]);
    expect(readSettings(t.db).profile).toEqual(AC01_PROFILE);
  });

  it("an unusable draft costs what it used and says so", async () => {
    agreeNotice(deps);
    deps.provider = fakeProvider({ kind: "answer", answer: { refusal: true }, usage: USAGE });
    await refused(
      draftProfileFromCv(deps, { mediaType: PDF, bytes: cv("cv.pdf") }),
      "MATCHING_DRAFT_UNUSABLE",
      502,
    );
    expect(spend()).toEqual([expect.objectContaining({ outcome: "unusable", settledUsdMicros: 15_600 })]);
  });
});
