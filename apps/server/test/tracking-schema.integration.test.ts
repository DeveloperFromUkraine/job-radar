import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { newId } from "../src/core/id.js";
import { addPosting } from "./helpers/search-fixtures.js";
import { createTempDb, type TempDb } from "./helpers/temp-db.js";

// The staged reference schema written by the data-model stage (docs/features/applied-skipped/migrations).
const stagedDir = fileURLToPath(
  new URL("../../../docs/features/applied-skipped/migrations/", import.meta.url),
);

type Row = Record<string, unknown>;

function describeSchema(all: (q: string) => Row[]) {
  return all(
    "select name from sqlite_master where type = 'table' and name like 'tracking_%' order by name",
  ).map((r) => {
    const table = String(r.name);
    return {
      table,
      columns: all(`pragma table_info('${table}')`).map((c) => ({
        name: c.name,
        type: String(c.type).toLowerCase(),
        notnull: c.notnull,
        pk: c.pk,
      })),
      foreignKeys: all(`pragma foreign_key_list('${table}')`).map((f) => ({
        table: f.table,
        from: f.from,
        to: f.to,
        onDelete: f.on_delete,
      })),
    };
  });
}

const insertMark = (t: TempDb, postingId: string) =>
  t.db.run(
    sql`insert into tracking_marks (posting_id, mark, marked_at, change_id) values (${postingId}, 'skipped', 1, ${newId()})`,
  );

describe("tracking schema", () => {
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
    // The staged SQL references collector_postings; the reference needs the target table to exist.
    ref.exec("create table collector_postings (id text primary key not null)");
    for (const file of readdirSync(stagedDir)
      .filter((f) => f.endsWith(".up.sql"))
      .sort()) {
      ref.exec(readFileSync(`${stagedDir}${file}`, "utf8"));
    }

    const expected = describeSchema((q) => ref.prepare(q).all() as Row[]);
    expect(expected.map((t) => t.table)).toEqual(["tracking_marks"]);
    const db = migrated.db;
    expect(describeSchema((q) => db.all<Row>(sql.raw(q)))).toEqual(expected);
  });

  it("deletes a posting's mark row with the posting (AC-09)", () => {
    migrated = createTempDb();
    const id = addPosting(migrated.db);
    insertMark(migrated, id);
    migrated.db.run(sql`delete from collector_listings where posting_id = ${id}`);
    migrated.db.run(sql`delete from collector_postings where id = ${id}`);
    expect(migrated.db.all(sql`select * from tracking_marks`)).toEqual([]);
  });

  it("refuses a mark for a posting that does not exist (AC-15)", () => {
    migrated = createTempDb();
    const t = migrated;
    // Drizzle wraps the driver error; the constraint code sits on its cause.
    expect(() => insertMark(t, newId())).toThrow(
      expect.objectContaining({ cause: expect.objectContaining({ code: "SQLITE_CONSTRAINT_FOREIGNKEY" }) }),
    );
  });
});
