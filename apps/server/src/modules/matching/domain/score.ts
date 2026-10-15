// Score rules: the total from part scores (ADR-0008), answer validation (AC-18), the text fingerprint
// and staleness (ADR-0005), and what a posting shows (CONTEXT: Match score). Pure.
import { createHash } from "node:crypto";

/** Bump when the prompt or the output schema changes: every score becomes stale (ADR-0008). */
export const SCORER_VERSION = "1";

export const STRIKES_TO_GIVE_UP = 3;
export const MAX_NOTE_WORDS = 40;

export type Part = number | null; // null = "not stated"
export interface Parts {
  skills: Part;
  roleType: Part;
  seniority: Part;
  terms: Part;
}

export const WEIGHTS: Record<keyof Parts, number> = { skills: 50, roleType: 20, seniority: 15, terms: 15 };

/** Weighted mean of the stated parts; an unstated part's weight is shared in proportion (AC-01 note, AC-04). */
export function total(parts: Parts): number | null {
  let sum = 0;
  let weight = 0;
  for (const key of Object.keys(WEIGHTS) as (keyof Parts)[]) {
    const v = parts[key];
    if (v === null) continue;
    sum += v * WEIGHTS[key];
    weight += WEIGHTS[key];
  }
  return weight === 0 ? null : Math.round(sum / weight);
}

// ---- The model's answer (AC-18) ----------------------------------------------------------------

export interface ScoredAnswer {
  parts: Parts;
  note: string;
  claims: string[];
}

export type AnswerCheck = { ok: true; value: ScoredAnswer } | { ok: false; reason: string };

const RAW_PARTS = {
  skills: "skills",
  roleType: "role_type",
  seniority: "seniority",
  terms: "terms",
} as const;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

/** Anything the provider returns is untrusted: only this shape becomes a score. */
export function validateAnswer(raw: unknown): AnswerCheck {
  if (!isRecord(raw) || raw.refusal === true)
    return { ok: false, reason: "the model would not handle this posting's text" };
  const rawParts = raw.parts;
  if (!isRecord(rawParts)) return { ok: false, reason: "the answer had no part scores" };
  const parts = {} as Parts;
  for (const [key, rawKey] of Object.entries(RAW_PARTS) as [keyof Parts, string][]) {
    const v = rawParts[rawKey];
    if (v === undefined) return { ok: false, reason: `the answer had no ${rawKey.replace("_", " ")} part` };
    if (v === "not_stated" || v === null) parts[key] = null;
    else if (typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 100) parts[key] = v;
    else return { ok: false, reason: `the ${rawKey.replace("_", " ")} part was not a number from 0 to 100` };
  }
  const note = typeof raw.note === "string" ? raw.note.trim() : "";
  if (!note) return { ok: false, reason: "the answer had no fit note" };
  if (note.split(/\s+/).length > MAX_NOTE_WORDS)
    return { ok: false, reason: `the fit note was longer than ${MAX_NOTE_WORDS} words` };
  const claims = raw.claims ?? [];
  if (!Array.isArray(claims) || claims.some((c) => typeof c !== "string"))
    return { ok: false, reason: "the claims were not a list of quotes" };
  return {
    ok: true,
    value: { parts, note, claims: claims.map((c: string) => c.trim()).filter((c: string) => c.length > 0) },
  };
}

// ---- Fingerprints and staleness (ADR-0005) -----------------------------------------------------

export interface ScoredText {
  title: string;
  company: string;
  description: string;
  /** The open listings' location restrictions (null = not stated). */
  locationRestrictions: (string | null)[];
}

/** A hash of exactly the text the scorer reads. */
export function textFingerprint(t: ScoredText): string {
  const locations = t.locationRestrictions.map((l) => l ?? "").sort();
  return createHash("sha256")
    .update(JSON.stringify([t.title, t.company, t.description, locations]))
    .digest("hex");
}

export function strikeKey(fingerprint: string, profileVersion: number, scorerVersion: string): string {
  return `${fingerprint}:${profileVersion}:${scorerVersion}`;
}

// ---- What a posting shows ----------------------------------------------------------------------

export type ScoringProblem = "provider_unreachable" | "rate_limited" | "key_missing" | "key_refused";

export const PROBLEM_REASONS: Record<ScoringProblem, string> = {
  provider_unreachable: "the language-model provider can't be reached right now",
  rate_limited: "the language-model provider is busy right now",
  key_missing: "no provider key is set up",
  key_refused: "the language-model provider refused job-radar's key",
};

/** The stored score row as matching/domain sees it. */
export interface ScoreRow {
  total: number | null;
  parts: Parts;
  note: string | null;
  claims: string[];
  textFingerprint: string | null;
  profileVersion: number | null;
  scorerVersion: string | null;
  strikeCount: number;
  strikeKey: string | null;
  lastFailure: string | null;
}

export interface MatchContext {
  /** The fingerprint of the posting's text today. */
  textFingerprint: string;
  profileVersion: number;
  problem: ScoringProblem | null;
  capReached: boolean;
}

export type MatchStateName = "scored" | "pending" | "not_scored" | "cap_reached" | "could_not_score";
export type Stale = "posting_changed" | "profile_changed";

export interface Match {
  state: MatchStateName;
  total: number | null;
  parts: Parts | null;
  note: string | null;
  claims: string[];
  stale: Stale | null;
  reason: string | null;
}

const none = (): Omit<Match, "state" | "reason"> => ({
  total: null,
  parts: null,
  note: null,
  claims: [],
  stale: null,
});

export function matchState(row: ScoreRow | undefined, ctx: MatchContext): Match {
  const key = strikeKey(ctx.textFingerprint, ctx.profileVersion, SCORER_VERSION);
  if (row && row.strikeCount >= STRIKES_TO_GIVE_UP && row.strikeKey === key) {
    return {
      ...none(),
      state: "could_not_score",
      reason: row.lastFailure ?? "the answers could not be used",
    };
  }
  if (row && row.total !== null) {
    const stale: Stale | null =
      row.textFingerprint !== ctx.textFingerprint
        ? "posting_changed"
        : row.profileVersion !== ctx.profileVersion || row.scorerVersion !== SCORER_VERSION
          ? "profile_changed"
          : null;
    return {
      state: "scored",
      total: row.total,
      parts: row.parts,
      note: row.note,
      claims: row.claims,
      stale,
      reason: null,
    };
  }
  if (ctx.capReached) return { ...none(), state: "cap_reached", reason: "monthly cap reached" };
  if (ctx.problem) return { ...none(), state: "not_scored", reason: PROBLEM_REASONS[ctx.problem] };
  return { ...none(), state: "pending", reason: "waiting to be scored" };
}

/** Does this posting still need an attempt, and in which queue? (flow 1: no score first, then stale) */
export function scoringNeed(row: ScoreRow | undefined, ctx: MatchContext): "none" | "unscored" | "stale" {
  const m = matchState(row, { ...ctx, problem: null, capReached: false });
  if (m.state === "could_not_score") return "none";
  if (m.state === "scored") return m.stale ? "stale" : "none";
  return "unscored";
}
