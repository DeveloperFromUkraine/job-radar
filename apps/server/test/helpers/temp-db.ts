import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type DbHandle, openDb, runMigrations } from "../../src/core/db.js";

export interface TempDb extends DbHandle {
  file: string;
  cleanup(): void;
}

// A real, fully migrated SQLite file in a throwaway directory.
export function createTempDb(): TempDb {
  const dir = mkdtempSync(join(tmpdir(), "job-radar-test-"));
  const file = join(dir, "test.sqlite");
  const handle = openDb(file);
  runMigrations(handle.db);
  return {
    ...handle,
    file,
    cleanup() {
      handle.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
