import { sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { createTempDb, type TempDb } from "./helpers/temp-db.js";

describe("database", () => {
  let tmp: TempDb | undefined;

  afterEach(() => {
    tmp?.cleanup();
  });

  it("opens a temporary SQLite file with all migrations applied", () => {
    tmp = createTempDb();

    const applied = tmp.db.all<{ n: number }>(sql`select count(*) as n from __drizzle_migrations`);

    expect(applied[0]?.n).toBeGreaterThanOrEqual(1);
  });
});
