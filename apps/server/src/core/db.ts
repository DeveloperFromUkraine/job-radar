import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { type BetterSQLite3Database, drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

export type Db = BetterSQLite3Database;

export interface DbHandle {
  db: Db;
  close(): void;
}

// Same path from src/core and dist/core: <app>/drizzle
const migrationsFolder = fileURLToPath(new URL("../../drizzle", import.meta.url));

export function openDb(file: string): DbHandle {
  if (file !== ":memory:") mkdirSync(dirname(file), { recursive: true });
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  return { db: drizzle(sqlite), close: () => sqlite.close() };
}

export function runMigrations(db: Db): void {
  migrate(db, { migrationsFolder });
}
