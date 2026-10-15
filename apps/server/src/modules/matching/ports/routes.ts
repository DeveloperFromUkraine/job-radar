// Matching HTTP routes (docs/features/match-score/contracts/openapi.yaml). The two GETs are read-only;
// the POSTs change state and sit behind the global access guard (collector ADR-0007, AC-17). The API
// speaks snake_case and cents; the module speaks camelCase and millionths of a dollar.
import type { FastifyPluginAsync } from "fastify";
import type { OpenPosting } from "../../collector/app/open-postings.js";
import { type CvDraftView, draftProfileFromCv } from "../app/cv-draft.js";
import type { MatchingDeps } from "../app/deps.js";
import { getScoringHealth } from "../app/health.js";
import { agreeNotice, getSettings, type SettingsView, saveProfile, setCap } from "../app/settings.js";
import type { Profile } from "../domain/profile.js";
import { CV_REFUSALS, MAX_CV_BYTES } from "../infra/cv-text.js";

type ApiProfile = {
  skills: { name: string; core: boolean }[];
  years: number | null;
  seniority: Profile["seniority"];
  role_types: Profile["roleTypes"];
  min_salary: Profile["minSalary"];
  engagement_forms: Profile["engagementForms"];
};

const toApi = (p: Profile): ApiProfile => ({
  skills: p.skills,
  years: p.years,
  seniority: p.seniority,
  role_types: p.roleTypes,
  min_salary: p.minSalary,
  engagement_forms: p.engagementForms,
});
const fromApi = (p: ApiProfile): Profile => ({
  skills: p.skills,
  years: p.years,
  seniority: p.seniority,
  roleTypes: p.role_types,
  minSalary: p.min_salary,
  engagementForms: p.engagement_forms,
});
const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString());

const settingsBody = (s: SettingsView) => ({
  profile: s.profile && toApi(s.profile),
  profile_version: s.profileVersion,
  cap_usd_cents: s.capUsdCents,
  spent_usd_cents: s.spentUsdCents,
  notice_agreed_at: iso(s.noticeAgreedAt),
});

const API_FIELD = {
  skills: "skills",
  years: "years",
  seniority: "seniority",
  roleTypes: "role_types",
  minSalary: "min_salary",
  engagementForms: "engagement_forms",
} as const;

const draftBody = (d: CvDraftView) => ({
  draft: toApi(d.draft),
  field_sources: Object.fromEntries(
    Object.entries(d.fieldSources).map(([k, v]) => [API_FIELD[k as keyof typeof API_FIELD], v]),
  ),
  not_mapped: d.notMapped,
  removed: d.removed,
  current: d.current && toApi(d.current),
});

// Fastify's AJV strips unknown properties instead of rejecting them; maxProperties makes an extra
// field a 400, as the contract's additionalProperties: false requires (remote-filter precedent).
const object = (properties: Record<string, object>, required = Object.keys(properties)) =>
  ({
    type: "object",
    required,
    additionalProperties: false,
    maxProperties: Object.keys(properties).length,
    properties,
  }) as const;
const nullable = (schema: object) => ({ anyOf: [schema, { type: "null" }] });

// Shape and types only: every field rule (AC-16) is validateProfile's, so each refusal names its field
// in plain language (MATCHING_INVALID_PROFILE) instead of the validator's text (review R9).
const profileSchema = object({
  skills: {
    type: "array",
    items: object({ name: { type: "string" }, core: { type: "boolean" } }),
  },
  years: { type: ["integer", "null"] },
  seniority: { type: ["string", "null"] },
  role_types: { type: "array", uniqueItems: true, items: { type: "string" } },
  min_salary: nullable(
    object({
      amount: { type: "integer" },
      currency: { type: "string" },
      period: { type: "string" },
    }),
  ),
  engagement_forms: { type: "array", uniqueItems: true, items: { type: "string" } },
});

/** 5 MB of file, base64-encoded, plus room for the JSON around it (sad.md §8 CV upload transport). */
export const CV_BODY_LIMIT = 7 * 1024 * 1024;

export function matchingRoutes(deps: MatchingDeps, ownerList: () => OpenPosting[]): FastifyPluginAsync {
  return async (app) => {
    app.get("/api/v1/matching/settings", async () => settingsBody(getSettings(deps)));

    app.post<{ Body: { profile: ApiProfile } }>(
      "/api/v1/matching/profile",
      { schema: { body: object({ profile: profileSchema }) } },
      async (request) => {
        const { changed, settings } = saveProfile(deps, fromApi(request.body.profile));
        return { changed, settings: settingsBody(settings) };
      },
    );

    app.post(
      "/api/v1/matching/notice",
      { schema: { body: { type: "object", additionalProperties: false, maxProperties: 0 } } },
      async () => ({ notice_agreed_at: iso(agreeNotice(deps).noticeAgreedAt) }),
    );

    app.post<{ Body: { cap_usd_cents: number } }>(
      "/api/v1/matching/cap",
      { schema: { body: object({ cap_usd_cents: { type: "integer", minimum: 0, maximum: 10_000 } }) } },
      async (request) => settingsBody(setCap(deps, request.body.cap_usd_cents)),
    );

    app.post<{ Body: { file_name: string; media_type: string; content_base64: string } }>(
      "/api/v1/matching/cv-drafts",
      {
        bodyLimit: CV_BODY_LIMIT,
        schema: {
          body: object({
            file_name: { type: "string", minLength: 1, maxLength: 255 },
            media_type: { type: "string", maxLength: 255 },
            content_base64: { type: "string", maxLength: Math.ceil(MAX_CV_BYTES / 3) * 4 },
          }),
        },
        // A body over the route's limit gets the AC-08 message, not the generic one (sad.md §8).
        errorHandler: (error, _request, reply) => {
          if (
            error.statusCode === 413 ||
            error.validation?.some((v) => v.keyword === "maxLength" && v.instancePath === "/content_base64")
          ) {
            const { status, message } = CV_REFUSALS.MATCHING_CV_TOO_LARGE;
            return reply.status(status).send({ error: { code: "MATCHING_CV_TOO_LARGE", message } });
          }
          throw error;
        },
      },
      async (request) => {
        const bytes = new Uint8Array(Buffer.from(request.body.content_base64, "base64"));
        return draftBody(await draftProfileFromCv(deps, { mediaType: request.body.media_type, bytes }));
      },
    );

    app.get("/api/v1/matching/health", async () => {
      const h = getScoringHealth(deps, ownerList);
      return {
        last_success_at: iso(h.lastSuccessAt),
        cap_usd_cents: h.capUsdCents,
        spent_usd_cents: h.spentUsdCents,
        cap_reached: h.capReached,
        resumes_on: h.resumesOn,
        pending_count: h.pendingCount,
        oldest_pending_since: iso(h.oldestPendingSince),
        could_not_score_count: h.couldNotScoreCount,
        problem: h.problem && { ...h.problem, since: iso(h.problem.since) },
      };
    });
  };
}
