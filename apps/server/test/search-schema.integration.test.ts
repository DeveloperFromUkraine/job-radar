import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { createTempDb, type TempDb } from "./helpers/temp-db.js";

// The staged reference schema written by the data-model stage (docs/features/search-postings/migrations).
const stagedDir = fileURLToPath(
  new URL("../../../docs/features/search-postings/migrations/", import.meta.url),
);

type Row = Record<string, unknown>;

function describeSchema(all: (q: string) => Row[]) {
  const tables = all(
    "select name from sqlite_master where type = 'table' and name like 'search_%' order by name",
  ).map((r) => String(r.name));

  return tables.map((table) => ({
    table,
    columns: all(`pragma table_info('${table}')`).map((c) => ({
      name: c.name,
      type: String(c.type).toLowerCase(),
      notnull: c.notnull,
      pk: c.pk,
    })),
    indexes: all(`pragma index_list('${table}')`).map((i) => String(i.name)),
  }));
}

describe("search schema", () => {
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
      ref.exec(readFileSync(`${stagedDir}${file}`, "utf8"));
    }

    const expected = describeSchema((q) => ref.prepare(q).all() as Row[]);
    expect(expected.map((t) => t.table)).toEqual(["search_state"]);
    const db = migrated.db;
    expect(describeSchema((q) => db.all<Row>(sql.raw(q)))).toEqual(expected);
  });

  it("starts with no state row (upserted lazily)", () => {
    migrated = createTempDb();
    expect(migrated.db.all(sql`select * from search_state`)).toEqual([]);
  });
});
