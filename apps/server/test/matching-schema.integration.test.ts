import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { createTempDb, type TempDb } from "./helpers/temp-db.js";

// The staged reference schema written by the data-model stage (docs/features/match-score/migrations).
const stagedDir = fileURLToPath(new URL("../../../docs/features/match-score/migrations/", import.meta.url));

type Row = Record<string, unknown>;

function describeTables(all: (q: string) => Row[], like: string) {
  return all(`select name from sqlite_master where type = 'table' and name like '${like}' order by name`).map(
    (r) => ({
      table: String(r.name),
      columns: all(`pragma table_info('${String(r.name)}')`).map((c) => ({
        name: c.name,
        type: String(c.type).toLowerCase(),
        notnull: c.notnull,
        pk: c.pk,
      })),
      foreignKeys: all(`pragma foreign_key_list('${String(r.name)}')`).map((f) => ({
        table: f.table,
        from: f.from,
        to: f.to,
        on_delete: f.on_delete,
      })),
    }),
  );
}

function indexNames(all: (q: string) => Row[], table: string) {
  return all(`select name from sqlite_master where type = 'index' and tbl_name = '${table}' order by name`)
    .map((r) => String(r.name))
    .filter((n) => !n.startsWith("sqlite_autoindex"));
}

describe("matching schema", () => {
  let migrated: TempDb | undefined;
  let reference: Database.Database | undefined;

  afterEach(() => {
    migrated?.cleanup();
    reference?.close();
  });

  it("drizzle migrations produce exactly the staged matching tables (staged 01–03)", () => {
    migrated = createTempDb();
    const ref = new Database(":memory:");
    reference = ref;
    // The FK target only needs to exist for the reference schema to load.
    ref.exec("create table collector_postings (id text primary key not null)");
    for (const file of readdirSync(stagedDir)
      .filter((f) => f.endsWith(".up.sql") && f.includes("matching"))
      .sort()) {
      for (const stmt of readFileSync(`${stagedDir}${file}`, "utf8").split("--> statement-breakpoint")) {
        if (stmt.trim()) ref.exec(stmt);
      }
    }
    const refAll = (q: string) => ref.prepare(q).all() as Row[];
    const db = migrated.db;
    const dbAll = (q: string) => db.all<Row>(sql.raw(q));

    const expected = describeTables(refAll, "matching_%");
    expect(expected.map((t) => t.table)).toEqual(["matching_scores", "matching_settings", "matching_spend"]);
    expect(describeTables(dbAll, "matching_%")).toEqual(expected);
    expect(indexNames(dbAll, "matching_spend")).toEqual(["matching_spend_started_idx"]);
  });

  it("adds a nullable list_order to search_state (staged 04, AC-11)", () => {
    migrated = createTempDb();
    const cols = migrated.db.all<Row>(sql.raw("pragma table_info('search_state')"));
    expect(cols.find((c) => c.name === "list_order")).toMatchObject({ type: "TEXT", notnull: 0 });
  });

  it("refuses a score for an unknown posting and cascades a posting's removal", () => {
    migrated = createTempDb();
    const db = migrated.db;
    expect(() =>
      db.run(sql`insert into matching_scores (posting_id, strike_count) values ('nope', 0)`),
    ).toThrow(
      expect.objectContaining({ cause: expect.objectContaining({ code: "SQLITE_CONSTRAINT_FOREIGNKEY" }) }),
    );
    db.run(sql`insert into collector_postings (id, match_key, title, company, first_found_at, status, last_offered_at)
               values ('p1', 'k', 'T', 'Example Co', 0, 'open', 0)`);
    db.run(sql`insert into matching_scores (posting_id, strike_count) values ('p1', 0)`);
    db.run(sql`delete from collector_postings where id = 'p1'`);
    expect(db.all(sql`select * from matching_scores`)).toEqual([]);
  });

  it("refuses a settings row without the cap (the lazy upsert must write $5)", () => {
    migrated = createTempDb();
    const db = migrated.db;
    expect(() => db.run(sql`insert into matching_settings (id, profile_version) values (1, 0)`)).toThrow(
      expect.objectContaining({
        cause: expect.objectContaining({
          code: "SQLITE_CONSTRAINT_NOTNULL",
          message: expect.stringContaining("matching_settings.cap_usd_micros"),
        }),
      }),
    );
  });
});
