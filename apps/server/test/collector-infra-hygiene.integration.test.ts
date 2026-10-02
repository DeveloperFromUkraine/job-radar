import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import {
  closeListings,
  closePostings,
  openPostingsTouching,
  removePostings,
} from "../src/modules/collector/infra/repo/postings.js";
import { ensureSources } from "../src/modules/collector/infra/repo/sources.js";
import { createTempDb, type TempDb } from "./helpers/temp-db.js";

const appDir = fileURLToPath(new URL("../src/modules/collector/app/", import.meta.url));

describe("layering (CLAUDE.md: queries only inside infra/)", () => {
  it("no use case in app/ builds SQL or touches the schema", () => {
    const offenders = readdirSync(appDir)
      .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
      .filter((f) => /from "drizzle-orm"|infra\/schema\.js/.test(readFileSync(`${appDir}${f}`, "utf8")));
    expect(offenders).toEqual([]);
  });
});

describe("volume beyond SQLite's bound-variable limit (sad §7: 10× of 20–40k listings)", () => {
  let db: TempDb;
  afterEach(() => db.cleanup());

  it("reads, closes and removes 40,000 open postings without one parameter per id", () => {
    db = createTempDb();
    ensureSources(db.db);
    const n = 40_000;
    const sqlite = new Database(db.file);
    const posting = sqlite.prepare(
      "insert into collector_postings (id, match_key, title, company, first_found_at, status, last_offered_at) values (?, ?, 'T', 'C', 0, 'open', 0)",
    );
    const listing = sqlite.prepare(
      `insert into collector_listings (id, posting_id, source_id, source_item_id, url, title, company, description,
         categories, first_collected_at, is_first_fill, last_seen_at, last_seen_run_id, status)
       values (?, ?, 'remotive', ?, 'u', 'T', 'C', '', '[]', 0, 0, 0, 'r', 'open')`,
    );
    sqlite.transaction(() => {
      for (let i = 0; i < n; i++) {
        posting.run(`p${i}`, `k${i}`);
        listing.run(`l${i}`, `p${i}`, `i${i}`);
      }
    })();

    const open = openPostingsTouching(db.db, ["remotive"]);
    expect(open).toHaveLength(n);

    closeListings(
      db.db,
      open.map((p) => p.listings[0]?.listingId as string),
      1,
    );
    closePostings(
      db.db,
      open.map((p) => p.postingId),
      1,
    );
    expect(
      sqlite.prepare("select count(*) as n from collector_postings where status = 'closed'").get(),
    ).toEqual({ n });

    removePostings(
      db.db,
      open.map((p) => p.postingId),
    );
    expect(sqlite.prepare("select count(*) as n from collector_listings").get()).toEqual({ n: 0 });
    sqlite.close();
  }, 60_000);
});
