// Matching's tables (data-model.md): the settings singleton (id 1, created lazily with version 0 and
// the $5 cap), one score per posting, and the spend ledger. The only SQL in the module.
import { and, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import type { Db } from "../../../core/db.js";
import { newId } from "../../../core/id.js";
import type { Profile } from "../domain/profile.js";
import type { Parts, ScoreRow, ScoringProblem } from "../domain/score.js";
import { fits, type Usage } from "../domain/spend.js";
import { matchingScores, matchingSettings, matchingSpend } from "./schema.js";

const ROW = 1;
/** The connection, or the handle of a transaction on it. */
type Conn = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];
export const DEFAULT_CAP_USD_MICROS = 5_000_000;

// ---- Settings ----------------------------------------------------------------------------------

export interface SettingsRow {
  profile: Profile | null;
  profileVersion: number;
  profileSavedAt: number | null;
  capUsdMicros: number;
  noticeAgreedAt: number | null;
  lastSuccessAt: number | null;
  scoringProblem: ScoringProblem | null;
  scoringProblemAt: number | null;
}

export function readSettings(db: Db): SettingsRow {
  db.insert(matchingSettings)
    .values({ id: ROW, profileVersion: 0, capUsdMicros: DEFAULT_CAP_USD_MICROS })
    .onConflictDoNothing()
    .run();
  const row = db.select().from(matchingSettings).where(eq(matchingSettings.id, ROW)).get();
  if (!row) throw new Error("matching_settings row missing");
  const { id: _id, profile, ...rest } = row;
  return { ...rest, profile: profile === null ? null : (JSON.parse(profile) as Profile) };
}

function write(db: Db, values: Partial<typeof matchingSettings.$inferInsert>): void {
  readSettings(db);
  db.update(matchingSettings).set(values).where(eq(matchingSettings.id, ROW)).run();
}

export const writeProfile = (db: Db, profile: Profile, version: number, at: number) =>
  write(db, { profile: JSON.stringify(profile), profileVersion: version, profileSavedAt: at });
export const writeCap = (db: Db, capUsdMicros: number) => write(db, { capUsdMicros });
export const setLastSuccess = (db: Db, at: number) => write(db, { lastSuccessAt: at });
export const clearProblem = (db: Db) => write(db, { scoringProblem: null, scoringProblemAt: null });

/** The first agreement is kept (AC-20: the owner agrees once). */
export function agreeNotice(db: Db, at: number): void {
  readSettings(db);
  db.update(matchingSettings)
    .set({ noticeAgreedAt: at })
    .where(and(eq(matchingSettings.id, ROW), isNull(matchingSettings.noticeAgreedAt)))
    .run();
}

/** A problem keeps the time it was first seen while it lasts. */
export function setProblem(db: Db, kind: ScoringProblem, at: number): void {
  const current = readSettings(db);
  if (current.scoringProblem === kind) return;
  write(db, { scoringProblem: kind, scoringProblemAt: at });
}

// ---- Scores ------------------------------------------------------------------------------------

type ScoreSelect = typeof matchingScores.$inferSelect;

const toRow = (r: ScoreSelect): ScoreRow => ({
  total: r.total,
  parts: { skills: r.skillsPart, roleType: r.roleTypePart, seniority: r.seniorityPart, terms: r.termsPart },
  note: r.note,
  claims: r.claims === null ? [] : (JSON.parse(r.claims) as string[]),
  textFingerprint: r.textFingerprint,
  profileVersion: r.profileVersion,
  scorerVersion: r.scorerVersion,
  strikeCount: r.strikeCount,
  strikeKey: r.strikeKey,
  lastFailure: r.lastFailure,
});

const CHUNK = 500; // well under SQLite's bound-variable limit

export function scoresFor(db: Db, postingIds: string[]): Map<string, ScoreRow> {
  const out = new Map<string, ScoreRow>();
  for (let i = 0; i < postingIds.length; i += CHUNK) {
    const ids = postingIds.slice(i, i + CHUNK);
    for (const r of db.select().from(matchingScores).where(inArray(matchingScores.postingId, ids)).all()) {
      out.set(r.postingId, toRow(r));
    }
  }
  return out;
}

export interface NewScore {
  total: number;
  parts: Parts;
  note: string;
  claims: string[];
  textFingerprint: string;
  profileVersion: number;
  scorerVersion: string;
}

/** A usable answer replaces the score and ends any run of strikes. */
export function upsertScore(db: Db, postingId: string, s: NewScore, at: number): void {
  const values = {
    total: s.total,
    skillsPart: s.parts.skills,
    roleTypePart: s.parts.roleType,
    seniorityPart: s.parts.seniority,
    termsPart: s.parts.terms,
    note: s.note,
    claims: JSON.stringify(s.claims),
    textFingerprint: s.textFingerprint,
    profileVersion: s.profileVersion,
    scorerVersion: s.scorerVersion,
    scoredAt: at,
    strikeCount: 0,
    strikeKey: null,
    lastFailure: null,
    lastFailureAt: null,
  };
  db.insert(matchingScores)
    .values({ postingId, ...values })
    .onConflictDoUpdate({ target: matchingScores.postingId, set: values })
    .run();
}

/** One more unusable answer against `key`; a different key starts the count again. Returns the count. */
export function addStrike(db: Db, postingId: string, key: string, reason: string, at: number): number {
  const existing = db.select().from(matchingScores).where(eq(matchingScores.postingId, postingId)).get();
  const strikeCount = existing && existing.strikeKey === key ? existing.strikeCount + 1 : 1;
  const values = { strikeCount, strikeKey: key, lastFailure: reason, lastFailureAt: at };
  db.insert(matchingScores)
    .values({ postingId, ...values })
    .onConflictDoUpdate({ target: matchingScores.postingId, set: values })
    .run();
  return strikeCount;
}

export function couldNotScoreCountSince(db: Db, since: number, strikes = 3): number {
  const row = db
    .select({ n: sql<number>`count(*)` })
    .from(matchingScores)
    .where(and(gte(matchingScores.strikeCount, strikes), gte(matchingScores.lastFailureAt, since)))
    .get();
  return row?.n ?? 0;
}

// ---- Spend ledger (ADR-0006) -------------------------------------------------------------------

/** This month's settled costs plus open and no-answer reservations at their maximum. */
export function monthSpend(db: Conn, monthStart: number): number {
  const row = db
    .select({
      n: sql<number>`coalesce(sum(coalesce(${matchingSpend.settledUsdMicros}, ${matchingSpend.reservedUsdMicros})), 0)`,
    })
    .from(matchingSpend)
    .where(gte(matchingSpend.startedAt, monthStart))
    .get();
  return row?.n ?? 0;
}

/** When this month's latest attempt started: when a reached cap was reached. */
export function lastSpendAt(db: Db, monthStart: number): number | null {
  const row = db
    .select({ at: sql<number | null>`max(${matchingSpend.startedAt})` })
    .from(matchingSpend)
    .where(gte(matchingSpend.startedAt, monthStart))
    .get();
  return row?.at ?? null;
}

export interface Reservation {
  kind: "score" | "draft";
  postingId: string | null;
  model: string;
  cost: number;
  cap: number;
  monthStart: number;
  at: number;
}

/**
 * The cap check and the insert run in one synchronous transaction on the only connection, so two
 * attempts can never both pass it (ADR-0006).
 */
export function reserve(db: Db, r: Reservation): { ok: true; id: string } | { ok: false } {
  return db.transaction((tx) => {
    const spent = monthSpend(tx, r.monthStart);
    if (!fits({ spent, cost: r.cost, cap: r.cap })) return { ok: false as const };
    const id = newId();
    tx.insert(matchingSpend)
      .values({
        id,
        kind: r.kind,
        postingId: r.postingId,
        model: r.model,
        reservedUsdMicros: r.cost,
        outcome: "reserved",
        startedAt: r.at,
      })
      .run();
    return { ok: true as const, id };
  });
}

export function settle(
  db: Db,
  id: string,
  s: { outcome: "answered" | "unusable"; cost: number; usage: Usage; at: number },
): void {
  db.update(matchingSpend)
    .set({
      outcome: s.outcome,
      settledUsdMicros: s.cost,
      inputTokens: s.usage.inputTokens,
      cacheWriteTokens: s.usage.cacheWriteTokens,
      cacheReadTokens: s.usage.cacheReadTokens,
      outputTokens: s.usage.outputTokens,
      settledAt: s.at,
    })
    .where(eq(matchingSpend.id, id))
    .run();
}

/**
 * No answer came. If the attempt may have been charged, the reservation stays counted at its largest
 * possible cost; if not (an error answer, or nothing sent), it settles at zero (AC-12, fix 2026-10-16).
 */
export function markNoAnswer(db: Db, id: string, at: number, charged: boolean): void {
  db.update(matchingSpend)
    .set({ outcome: "no_answer", settledAt: at, ...(charged ? {} : { settledUsdMicros: 0 }) })
    .where(eq(matchingSpend.id, id))
    .run();
}
