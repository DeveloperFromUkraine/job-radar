// Typed client for the matching API (docs/features/match-score/contracts/openapi.yaml).
import { post, request } from "./collector";

export type MatchStateName = "scored" | "pending" | "not_scored" | "cap_reached" | "could_not_score";

export interface MatchParts {
  skills: number | null;
  role_type: number | null;
  seniority: number | null;
  terms: number | null;
}

/** A posting's match score, or why it has none (CONTEXT: Match score). Note and claims are untrusted text. */
export interface Match {
  state: MatchStateName;
  total: number | null;
  parts: MatchParts | null;
  note: string | null;
  claims: string[];
  stale: "posting_changed" | "profile_changed" | null;
  reason: string | null;
}

export const SENIORITIES = ["junior", "mid", "senior", "lead", "staff", "principal"] as const;
export const ROLE_TYPES = [
  "backend",
  "frontend",
  "fullstack",
  "mobile",
  "devops_sre",
  "data",
  "ml_ai",
  "qa",
  "security",
  "engineering_management",
] as const;
export const ENGAGEMENT_FORMS = ["employment", "b2b", "contract_freelance"] as const;
export const PERIODS = ["hour", "day", "month", "year"] as const;

export type Seniority = (typeof SENIORITIES)[number];
export type RoleType = (typeof ROLE_TYPES)[number];
export type EngagementForm = (typeof ENGAGEMENT_FORMS)[number];
export type Period = (typeof PERIODS)[number];

export interface Profile {
  skills: { name: string; core: boolean }[];
  years: number | null;
  seniority: Seniority | null;
  role_types: RoleType[];
  min_salary: { amount: number; currency: string; period: Period } | null;
  engagement_forms: EngagementForm[];
}

export interface MatchingSettings {
  profile: Profile | null;
  profile_version: number;
  cap_usd_cents: number;
  spent_usd_cents: number;
  notice_agreed_at: string | null;
}

export interface SaveProfileResult {
  changed: boolean;
  settings: MatchingSettings;
}

export type FieldSource = "from_cv" | "not_found";
export interface CvDraft {
  draft: Profile;
  field_sources: Record<keyof Profile, FieldSource>;
  not_mapped: { field: "seniority" | "role_types" | "engagement_forms"; value: string }[];
  removed: { kind: "name" | "email" | "phone" | "address" | "link"; text: string }[];
  current: Profile | null;
}

export interface ScoringHealth {
  last_success_at: string | null;
  cap_usd_cents: number;
  spent_usd_cents: number;
  cap_reached: boolean;
  resumes_on: string | null;
  pending_count: number;
  oldest_pending_since: string | null;
  could_not_score_count: number;
  problem: {
    kind:
      | "provider_unreachable"
      | "rate_limited"
      | "key_missing"
      | "key_refused"
      | "request_rejected"
      | "cap_reached";
    reason: string;
    since: string;
  } | null;
}

const base = "/api/v1/matching";
export const getMatchingSettings = () => request<MatchingSettings>(`${base}/settings`);
export const saveProfile = (profile: Profile) => post<SaveProfileResult>(`${base}/profile`, { profile });
export const agreeNotice = () => post<{ notice_agreed_at: string }>(`${base}/notice`);
export const setScoringCap = (capUsdCents: number) =>
  post<MatchingSettings>(`${base}/cap`, { cap_usd_cents: capUsdCents });
export const draftProfileFromCv = (file: { file_name: string; media_type: string; content_base64: string }) =>
  post<CvDraft>(`${base}/cv-drafts`, file);
export const getScoringHealth = () => request<ScoringHealth>(`${base}/health`);
