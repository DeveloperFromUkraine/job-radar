import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openPostings, postingsByIds } from "../src/modules/collector/app/open-postings.js";
import { createTempDb, type TempDb } from "./helpers/temp-db.js";

let t: TempDb;

function posting(
  id: string,
  status: "open" | "closed",
  firstFoundAt: number,
  publishedAt: number | null = null,
) {
  t.db.run(
    sql`insert into collector_postings (id, match_key, title, company, published_at, first_found_at, status, last_offered_at)
        values (${id}, ${id}, ${`Title ${id}`}, 'Example Co', ${publishedAt}, ${firstFoundAt}, ${status}, 1)`,
  );
}

function listing(
  id: string,
  postingId: string,
  sourceId: string,
  status: "open" | "closed",
  url = `https://jobs.example.test/${id}`,
) {
  t.db.run(
    sql`insert into collector_listings (id, posting_id, source_id, source_item_id, url, title, company, description,
          location_restriction, categories, first_collected_at, is_first_fill, last_seen_at, last_seen_run_id, status)
        values (${id}, ${postingId}, ${sourceId}, ${id}, ${url}, ${`L ${id}`}, 'Example Co', ${`D ${id}`},
          ${sourceId === "jobicy" ? "Worldwide" : null}, '[]', 1, 0, 1, 'r1', ${status})`,
  );
}

beforeEach(() => {
  t = createTempDb();
  t.db.run(
    sql`insert into collector_sources (id, fill_status) values ('jobicy', 'complete'), ('himalayas', 'complete')`,
  );
});
afterEach(() => t.cleanup());

describe("collector open-postings export", () => {
  it("returns an empty list for an empty collection", () => {
    expect(openPostings(t.db)).toEqual([]);
  });

  it("holds only open postings: closed out, reopened in (AC-04)", () => {
    posting("p-closed", "closed", 10);
    listing("l1", "p-closed", "jobicy", "closed");
    posting("p-reopened", "open", 20, 5); // reopened = open again in the collector
    listing("l2", "p-reopened", "jobicy", "open");

    const result = openPostings(t.db);
    expect(result.map((p) => p.id)).toEqual(["p-reopened"]);
    expect(result[0]).toEqual({
      id: "p-reopened",
      title: "Title p-reopened",
      company: "Example Co",
      publishedAt: 5,
      firstFoundAt: 20,
      listings: [
        {
          sourceId: "jobicy",
          status: "open",
          url: "https://jobs.example.test/l2",
          locationRestriction: "Worldwide",
          title: "L l2",
          description: "D l2",
        },
      ],
    });
  });

  it("names a closed listing's source and status without its text (AC-08)", () => {
    posting("p1", "open", 10);
    listing("l-open", "p1", "jobicy", "open");
    listing("l-closed", "p1", "himalayas", "closed");

    const [p] = openPostings(t.db);
    const closed = p?.listings.find((l) => l.sourceId === "himalayas");
    expect(closed).toEqual({
      sourceId: "himalayas",
      status: "closed",
      url: "https://jobs.example.test/l-closed",
      locationRestriction: null,
    });
    expect(p?.listings).toHaveLength(2);
  });

  it("filters to postings first collected after a moment", () => {
    posting("p-old", "open", 100);
    posting("p-at", "open", 200);
    posting("p-new", "open", 201);
    expect(openPostings(t.db, { foundAfter: 200 }).map((p) => p.id)).toEqual(["p-new"]);
  });

  it("reads open postings by id, leaving out closed and removed ones", () => {
    posting("a", "open", 1);
    listing("la", "a", "jobicy", "open");
    posting("b", "closed", 1);
    posting("c", "open", 1);
    const result = postingsByIds(t.db, ["c", "b", "gone", "a"]);
    expect(result.map((p) => p.id).sort()).toEqual(["a", "c"]);
    expect(result.find((p) => p.id === "a")?.listings).toHaveLength(1);
    expect(postingsByIds(t.db, [])).toEqual([]);
  });
});
