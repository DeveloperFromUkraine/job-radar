// Seeds for search tests (docs/features/search-postings/data-model.md §Test fixtures). Plain inserts
// into the collector's tables; search itself never writes them.
import { sql } from "drizzle-orm";
import type { Db } from "../../src/core/db.js";
import { newId } from "../../src/core/id.js";
import { readState, type SearchStateRow, saveVisit } from "../../src/modules/search/infra/repo.js";

export interface ListingSeed {
  sourceId?: string;
  status?: "open" | "closed";
  url?: string;
  title?: string;
  description?: string;
  locationRestriction?: string | null;
}

export interface PostingSeed {
  id?: string;
  title?: string;
  company?: string;
  description?: string;
  publishedAt?: number | null;
  firstFoundAt?: number;
  status?: "open" | "closed";
  /** Default: one open Jobicy listing carrying the posting's title and description. */
  listings?: ListingSeed[];
}

export function addPosting(db: Db, seed: PostingSeed = {}): string {
  const id = seed.id ?? newId();
  const title = seed.title ?? "Software Engineer";
  const description = seed.description ?? "A role.";
  db.run(
    sql`insert into collector_postings (id, match_key, title, company, published_at, first_found_at, status, last_offered_at)
        values (${id}, ${id}, ${title}, ${seed.company ?? "Example Co"}, ${seed.publishedAt ?? null},
          ${seed.firstFoundAt ?? 1}, ${seed.status ?? "open"}, 1)`,
  );
  for (const l of seed.listings ?? [{}]) {
    const listingId = newId();
    const sourceId = l.sourceId ?? "jobicy";
    db.run(sql`insert or ignore into collector_sources (id, fill_status) values (${sourceId}, 'complete')`);
    db.run(
      sql`insert into collector_listings (id, posting_id, source_id, source_item_id, url, title, company, description,
            location_restriction, categories, first_collected_at, is_first_fill, last_seen_at, last_seen_run_id, status)
          values (${listingId}, ${id}, ${sourceId}, ${listingId}, ${l.url ?? `https://jobs.example.test/${listingId}`},
            ${l.title ?? title}, ${seed.company ?? "Example Co"}, ${l.description ?? description},
            ${l.locationRestriction === undefined ? "Worldwide" : l.locationRestriction}, '[]',
            ${seed.firstFoundAt ?? 1}, 0, 1, 'r1', ${l.status ?? "open"})`,
    );
  }
  return id;
}

/** `n` open postings, each with one listing of realistic description length; returns their ids. */
export function seedOpenPostings(db: Db, n: number, seed: (i: number) => PostingSeed = () => ({})): string[] {
  const ids: string[] = [];
  db.transaction(() => {
    for (let i = 0; i < n; i++)
      ids.push(
        addPosting(db, {
          description: "We build remote-first software. ".repeat(100),
          firstFoundAt: i + 1,
          ...seed(i),
        }),
      );
  });
  return ids;
}

/** Upserts the singleton search_state row for visit scenarios (AC-13, AC-14). */
export function setSearchState(db: Db, partial: Partial<Omit<SearchStateRow, "lastSkills">>): void {
  const { lastSkills: _, ...state } = readState(db);
  saveVisit(db, { ...state, ...partial });
}
