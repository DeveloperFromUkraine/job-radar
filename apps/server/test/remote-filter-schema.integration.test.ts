import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { createTempDb, type TempDb } from "./helpers/temp-db.js";

// The staged reference schema written by the data-model stage (docs/features/remote-filter/migrations).
const stagedDir = fileURLToPath(new URL("../../../docs/features/remote-filter/migrations/", import.meta.url));

type Row = Record<string, unknown>;

function describeSchema(all: (q: string) => Row[]) {
  return all(
    "select name from sqlite_master where type = 'table' and name like 'remote_filter_%' order by name",
  ).map((r) => ({
    table: String(r.name),
    columns: all(`pragma table_info('${String(r.name)}')`).map((c) => ({
      name: c.name,
      type: String(c.type).toLowerCase(),
      notnull: c.notnull,
      pk: c.pk,
    })),
  }));
}

describe("remote-filter schema", () => {
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
    expect(expected.map((t) => t.table)).toEqual(["remote_filter_settings"]);
    expect(expected[0]?.columns.map((c) => c.name)).toEqual([
      "id",
      "country",
      "filter_on",
      "look_country",
      "look_started_at",
    ]);
    const db = migrated.db;
    expect(describeSchema((q) => db.all<Row>(sql.raw(q)))).toEqual(expected);
  });

  it("refuses a row without filter_on (AC-04, AC-07: the lazy upsert must write it)", () => {
    migrated = createTempDb();
    const db = migrated.db;
    // Drizzle wraps the driver error; the constraint code sits on its cause.
    expect(() => db.run(sql`insert into remote_filter_settings (id, country) values (1, 'PL')`)).toThrow(
      expect.objectContaining({
        cause: expect.objectContaining({
          code: "SQLITE_CONSTRAINT_NOTNULL",
          message: expect.stringContaining("remote_filter_settings.filter_on"),
        }),
      }),
    );
  });
});
