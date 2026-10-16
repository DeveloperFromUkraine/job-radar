// Seeds for match-score tests (docs/features/match-score/data-model.md §Test fixtures). Placeholder data only.
import type { Db } from "../../src/core/db.js";
import { newId } from "../../src/core/id.js";
import type { Profile } from "../../src/modules/matching/domain/profile.js";
import { SCORER_VERSION } from "../../src/modules/matching/domain/score.js";
import { matchingScores, matchingSettings, matchingSpend } from "../../src/modules/matching/infra/schema.js";

/** The AC-01 profile: TypeScript and React core, Node nice-to-have, senior, backend + fullstack, 6,000 EUR, B2B. */
export const AC01_PROFILE: Profile = {
  skills: [
    { name: "TypeScript", core: true },
    { name: "React", core: true },
    { name: "Node", core: false },
  ],
  years: 8,
  seniority: "senior",
  roleTypes: ["backend", "fullstack"],
  minSalary: { amount: 6000, currency: "EUR", period: "month" },
  engagementForms: ["b2b"],
};

type SettingsInsert = typeof matchingSettings.$inferInsert;

export function seedProfile(
  db: Db,
  over: Partial<Omit<SettingsInsert, "id" | "profile">> & { profile?: Profile | null } = {},
): void {
  const { profile = AC01_PROFILE, ...rest } = over;
  const values = {
    profileVersion: profile ? 1 : 0,
    capUsdMicros: 5_000_000,
    noticeAgreedAt: 1,
    ...rest,
    profile: profile ? JSON.stringify(profile) : null,
  };
  db.insert(matchingSettings)
    .values({ id: 1, ...values })
    .onConflictDoUpdate({ target: matchingSettings.id, set: values })
    .run();
}

export interface ScoreSeed {
  total?: number | null;
  parts?: [number | null, number | null, number | null, number | null];
  textFingerprint?: string | null;
  profileVersion?: number | null;
  scorerVersion?: string | null;
  strikeCount?: number;
  strikeKey?: string | null;
  lastFailure?: string | null;
  lastFailureAt?: number | null;
  note?: string | null;
  claims?: string[];
}

export function seedScores(db: Db, postingIds: string[], seed: (i: number) => ScoreSeed = () => ({})): void {
  db.transaction(() => {
    postingIds.forEach((postingId, i) => {
      const s = seed(i);
      const [skills, roleType, seniority, terms] = s.parts ?? [70, 70, null, null];
      db.insert(matchingScores)
        .values({
          postingId,
          total: s.total === undefined ? 70 : s.total,
          skillsPart: skills,
          roleTypePart: roleType,
          seniorityPart: seniority,
          termsPart: terms,
          note: s.note === undefined ? "Fits your core skills." : s.note,
          claims: JSON.stringify(s.claims ?? []),
          textFingerprint: s.textFingerprint === undefined ? "fp" : s.textFingerprint,
          profileVersion: s.profileVersion === undefined ? 1 : s.profileVersion,
          scorerVersion: s.scorerVersion === undefined ? SCORER_VERSION : s.scorerVersion,
          scoredAt: 1,
          strikeCount: s.strikeCount ?? 0,
          strikeKey: s.strikeKey ?? null,
          lastFailure: s.lastFailure ?? null,
          lastFailureAt: s.lastFailureAt ?? null,
        })
        .run();
    });
  });
}

export function seedSpend(
  db: Db,
  rows: {
    startedAt: number;
    reservedUsdMicros: number;
    settledUsdMicros?: number | null;
    outcome?: "reserved" | "answered" | "unusable" | "no_answer";
    kind?: "score" | "draft";
  }[],
): void {
  for (const r of rows) {
    db.insert(matchingSpend)
      .values({
        id: newId(),
        kind: r.kind ?? "score",
        postingId: null,
        model: "claude-opus-5-5",
        reservedUsdMicros: r.reservedUsdMicros,
        settledUsdMicros: r.settledUsdMicros ?? null,
        outcome: r.outcome ?? (r.settledUsdMicros == null ? "reserved" : "answered"),
        startedAt: r.startedAt,
      })
      .run();
  }
}
