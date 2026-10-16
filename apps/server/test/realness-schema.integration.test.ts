import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { createTempDb, type TempDb } from "./helpers/temp-db.js";

// The staged reference schema written by the data-model stage (docs/features/realness-score/migrations).
const stagedDir = fileURLToPath(
  new URL("../../../docs/features/realness-score/migrations/", import.meta.url),
);

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

function column(rows: Row[], name: string) {
  return rows.find((c) => c.name === name);
}

const insertPosting = (id: string) =>
  sql.raw(`insert into collector_postings (id, match_key, title, company, first_found_at, status, last_offered_at)
           values ('${id}', 'k', 'T', 'Example Co', 0, 'open', 0)`);

describe("realness schema", () => {
  let migrated: TempDb | undefined;
  let reference: Database.Database | undefined;

  afterEach(() => {
    migrated?.cleanup();
    reference?.close();
  });

  it("drizzle migrations produce exactly the staged realness tables (staged 03–05)", () => {
    migrated = createTempDb();
    const ref = new Database(":memory:");
    reference = ref;
    ref.exec("create table collector_postings (id text primary key not null)");
    for (const file of readdirSync(stagedDir)
      .filter((f) => f.endsWith(".up.sql") && f.includes("realness"))
      .sort()) {
      ref.exec(readFileSync(`${stagedDir}${file}`, "utf8"));
    }
    const refAll = (q: string) => ref.prepare(q).all() as Row[];
    const db = migrated.db;
    const dbAll = (q: string) => db.all<Row>(sql.raw(q));

    const expected = describeTables(refAll, "realness_%");
    expect(expected.map((t) => t.table)).toEqual([
      "realness_daily_shares",
      "realness_mark_records",
      "realness_settings",
    ]);
    expect(describeTables(dbAll, "realness_%")).toEqual(expected);
  });

  it("adds nullable pay_field to listings and reopened_at to postings (staged 01–02)", () => {
    migrated = createTempDb();
    const db = migrated.db;
    expect(
      column(db.all<Row>(sql.raw("pragma table_info('collector_listings')")), "pay_field"),
    ).toMatchObject({
      type: "TEXT",
      notnull: 0,
    });
    expect(
      column(db.all<Row>(sql.raw("pragma table_info('collector_postings')")), "reopened_at"),
    ).toMatchObject({
      type: "INTEGER",
      notnull: 0,
    });
    // A row written without the new columns reads NULL (unknown / not reopened), never "".
    db.run(insertPosting("p1"));
    expect(db.all(sql`select reopened_at from collector_postings`)).toEqual([{ reopened_at: null }]);
  });

  it("refuses a mark record for an unknown posting and cascades a posting's removal", () => {
    migrated = createTempDb();
    const db = migrated.db;
    const record = (id: string) =>
      sql.raw(`insert into realness_mark_records (posting_id, mark, penalty, signals, recorded_at)
               values ('${id}', 'applied', 25, '[]', 0)`);
    expect(() => db.run(record("nope"))).toThrow(
      expect.objectContaining({ cause: expect.objectContaining({ code: "SQLITE_CONSTRAINT_FOREIGNKEY" }) }),
    );
    db.run(insertPosting("p1"));
    db.run(record("p1"));
    db.run(sql`delete from collector_postings where id = 'p1'`);
    expect(db.all(sql`select * from realness_mark_records`)).toEqual([]);
  });

  it("keeps one daily share per day", () => {
    migrated = createTempDb();
    const db = migrated.db;
    const share = sql.raw(
      "insert into realness_daily_shares (day, postings, lowered, recorded_at) values ('2026-10-16', 10, 2, 0)",
    );
    db.run(share);
    expect(() => db.run(share)).toThrow(
      expect.objectContaining({ cause: expect.objectContaining({ code: "SQLITE_CONSTRAINT_PRIMARYKEY" }) }),
    );
  });
});
