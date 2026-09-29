// Forward-only migrations (ADR 0003): back up the database file first;
// rollback = restore that backup.
import { copyFileSync, existsSync } from "node:fs";
import { loadConfig } from "./config.js";
import { openDb, runMigrations } from "./db.js";

const { databaseFile } = loadConfig();

if (existsSync(databaseFile)) {
  const backup = `${databaseFile}.bak-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  copyFileSync(databaseFile, backup);
  console.log(`backup: ${backup}`);
}

const handle = openDb(databaseFile);
try {
  runMigrations(handle.db);
  console.log(`migrated: ${databaseFile}`);
} finally {
  handle.close();
}
