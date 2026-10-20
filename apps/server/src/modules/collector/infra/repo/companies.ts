// collector_companies queries: the company job boards the "ats" source reads.
import { and, asc, eq, inArray, like, ne, or, sql } from "drizzle-orm";
import type { Db } from "../../../../core/db.js";
import { newId } from "../../../../core/id.js";
import { type BoardRef, nameKey } from "../../domain/ats.js";
import { companies, listings, postings } from "../schema.js";

export type CompanyRow = typeof companies.$inferSelect;
export type Origin = CompanyRow["origin"];

export function findBoard(db: Db, board: BoardRef): CompanyRow | undefined {
  return db
    .select()
    .from(companies)
    .where(and(eq(companies.ats, board.ats), eq(companies.slug, board.slug)))
    .get();
}

/** Adds a found board; a board already known keeps its row (and a removed one stays removed). */
export function addBoard(db: Db, board: BoardRef, name: string, origin: Origin, now: number): CompanyRow {
  db.insert(companies)
    .values({
      id: newId(),
      name,
      nameKey: nameKey(name),
      ats: board.ats,
      slug: board.slug,
      origin,
      status: "active",
      addedAt: now,
    })
    .onConflictDoNothing()
    .run();
  return findBoard(db, board) as CompanyRow;
}

/** A name probed with no board found: remembered, so it is not probed again. */
export function addNotFound(db: Db, name: string, now: number): void {
  db.insert(companies)
    .values({ id: newId(), name, nameKey: nameKey(name), origin: "probe", status: "not_found", addedAt: now })
    .run();
}

/** Active boards, never read or read longest ago first. */
export function dueBoards(db: Db, limit: number): CompanyRow[] {
  return db
    .select()
    .from(companies)
    .where(eq(companies.status, "active"))
    .orderBy(
      sql`${companies.lastCheckedAt} is not null`,
      asc(companies.lastCheckedAt),
      asc(companies.addedAt),
    )
    .limit(limit)
    .all();
}

export function recordBoardRead(
  db: Db,
  id: string,
  result: "ok" | "failed" | "not_found",
  openRoles: number | null,
  now: number,
): void {
  db.update(companies)
    .set(
      result === "not_found"
        ? { status: "not_found", lastCheckedAt: now, lastResult: null, openRoles: null }
        : { lastCheckedAt: now, lastResult: result, ...(openRoles === null ? {} : { openRoles }) },
    )
    .where(eq(companies.id, id))
    .run();
}

export function listCompanies(db: Db): CompanyRow[] {
  return db
    .select()
    .from(companies)
    .where(eq(companies.status, "active"))
    .orderBy(sql`${companies.openRoles} is null`, sql`${companies.openRoles} desc`, asc(companies.nameKey))
    .all();
}

export function readCompany(db: Db, id: string): CompanyRow | undefined {
  return db.select().from(companies).where(eq(companies.id, id)).get();
}

export function setCompanyStatus(db: Db, id: string, status: CompanyRow["status"]): void {
  db.update(companies).set({ status }).where(eq(companies.id, id)).run();
}

/** Open listings from the boards that link to a company board (an apply link, a description). */
export function listingsLinkingBoards(db: Db): { company: string; text: string }[] {
  const mentions = (host: string) =>
    or(like(listings.url, `%${host}%`), like(listings.description, `%${host}%`));
  return db
    .select({ company: listings.company, url: listings.url, description: listings.description })
    .from(listings)
    .where(
      and(
        eq(listings.status, "open"),
        ne(listings.sourceId, "ats"),
        or(mentions("greenhouse.io/"), mentions("lever.co/"), mentions("ashbyhq.com/")),
      ),
    )
    .all()
    .map((r) => ({ company: r.company, text: `${r.url}\n${r.description}` }));
}

/** Companies of open postings not probed yet, the most recently found first. */
export function unprobedCompanies(db: Db, limit: number): string[] {
  const names = db
    .select({ company: postings.company })
    .from(postings)
    .where(and(eq(postings.status, "open"), ne(postings.company, "")))
    .groupBy(postings.company)
    .orderBy(sql`max(${postings.firstFoundAt}) desc`)
    .all()
    .map((r) => r.company);
  const seen = new Set(
    names.length === 0
      ? []
      : db
          .select({ key: companies.nameKey })
          .from(companies)
          .where(inArray(companies.nameKey, names.map(nameKey)))
          .all()
          .map((r) => r.key),
  );
  const out: string[] = [];
  for (const name of names) {
    const key = nameKey(name);
    if (key === "" || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
    if (out.length === limit) break;
  }
  return out;
}
