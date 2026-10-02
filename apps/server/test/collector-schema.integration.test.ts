import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { createTempDb, type TempDb } from "./helpers/temp-db.js";

// The staged reference schema written by the data-model stage (docs/features/remote-boards-collector/migrations).
const stagedDir = fileURLToPath(
  new URL("../../../docs/features/remote-boards-collector/migrations/", import.meta.url),
);

type Row = Record<string, unknown>;

function describeSchema(all: (q: string) => Row[]) {
  const tables = all(
    "select name from sqlite_master where type = 'table' and name like 'collector_%' order by name",
  ).map((r) => String(r.name));

  return tables.map((table) => ({
    table,
    columns: all(`pragma table_info('${table}')`).map((c) => ({
      name: c.name,
      type: String(c.type).toLowerCase(),
      notnull: c.notnull,
      pk: c.pk,
    })),
    foreignKeys: all(`pragma foreign_key_list('${table}')`)
      .map((f) => `${f.from}->${f.table}.${f.to} on delete ${f.on_delete}`)
      .sort(),
    indexes: all(`pragma index_list('${table}')`)
      .map((i) => {
        const cols = all(`pragma index_info('${i.name}')`)
          .map((c) => c.name)
          .join(",");
        const ddl = all(`select sql from sqlite_master where type = 'index' and name = '${i.name}'`)[0]?.sql;
        const where = typeof ddl === "string" ? (ddl.split(/\bwhere\b/i)[1] ?? "") : "";
        const key = i.origin === "c" ? String(i.name) : `<${i.origin}>`;
        return `${key} unique=${i.unique} partial=${i.partial} (${cols}) ${where.replace(/[`"\s]/g, "")}`;
      })
      .sort(),
  }));
}

describe("collector schema", () => {
  let migrated: TempDb | undefined;
  let reference: Database.Database | undefined;

  afterEach(() => {
    migrated?.cleanup();
    reference?.close();
  });

  it("drizzle migrations produce exactly the staged reference schema", () => {
    migrated = createTempDb();
    const ref = new Database(":memory:");
    reference = ref;
    for (const file of readdirSync(stagedDir)
      .filter((f) => f.endsWith(".up.sql"))
      .sort()) {
      const ddl = readFileSync(`${stagedDir}${file}`, "utf8").replaceAll("--> statement-breakpoint", "");
      ref.exec(ddl);
    }

    const expected = describeSchema((q) => ref.prepare(q).all() as Row[]);
    expect(expected.map((t) => t.table)).toHaveLength(10);
    const db = migrated.db;
    expect(describeSchema((q) => db.all<Row>(sql.raw(q)))).toEqual(expected);
  });

  it("allows at most one running run", () => {
    migrated = createTempDb();
    const run = (id: string, status: string) =>
      migrated?.db.run(
        sql`insert into collector_runs (id, trigger, status, started_at) values (${id}, 'schedule', ${status}, 1)`,
      );

    run("r1", "running");
    run("r2", "finished");
    let error: unknown;
    try {
      run("r3", "running");
    } catch (e) {
      error = e;
    }
    expect((error as { cause?: { code?: string } })?.cause?.code).toBe("SQLITE_CONSTRAINT_UNIQUE");
  });

  it("removes a posting's listings with the posting", () => {
    migrated = createTempDb();
    const db = migrated.db;
    db.run(sql`insert into collector_sources (id, fill_status) values ('jobicy', 'pending')`);
    db.run(
      sql`insert into collector_postings (id, match_key, title, company, first_found_at, status, last_offered_at)
          values ('p1', 'k', 'T', 'C', 1, 'open', 1)`,
    );
    db.run(
      sql`insert into collector_listings (id, posting_id, source_id, source_item_id, url, title, company,
            description, categories, first_collected_at, is_first_fill, last_seen_at, last_seen_run_id, status)
          values ('l1', 'p1', 'jobicy', 'item-1', 'https://jobs.example.test/1', 'T', 'C', '', '[]', 1, 0, 1, 'r1', 'open')`,
    );

    db.run(sql`delete from collector_postings where id = 'p1'`);

    expect(db.all(sql`select id from collector_listings`)).toEqual([]);
  });
});
