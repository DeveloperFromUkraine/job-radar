// search_state: the single module-state row (id 1). The only SQL in the search module.
import { eq } from "drizzle-orm";
import type { Db } from "../../../core/db.js";
import type { VisitState } from "../domain/visit.js";
import { searchState } from "./schema.js";

const ROW = 1;

export interface SearchStateRow extends VisitState {
  lastSkills: string[];
}

export function readState(db: Db): SearchStateRow {
  db.insert(searchState).values({ id: ROW }).onConflictDoNothing().run();
  const row = db.select().from(searchState).where(eq(searchState.id, ROW)).get();
  if (!row) throw new Error("search_state row missing");
  const { id: _, lastSkills, ...visit } = row;
  return { ...visit, lastSkills: lastSkills === null ? [] : (JSON.parse(lastSkills) as string[]) };
}

export function saveVisit(db: Db, visit: VisitState): void {
  readState(db);
  db.update(searchState).set(visit).where(eq(searchState.id, ROW)).run();
}

/** `null` (or no skills) = none: the next opening starts with an empty field (AC-13). */
export function saveLastSkills(db: Db, skills: string[] | null): void {
  readState(db);
  const lastSkills = skills?.length ? JSON.stringify(skills) : null;
  db.update(searchState).set({ lastSkills }).where(eq(searchState.id, ROW)).run();
}
