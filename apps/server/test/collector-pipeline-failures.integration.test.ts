import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CollectorDeps } from "../src/modules/collector/app/deps.js";
import { noMarks } from "../src/modules/collector/app/marked-postings.js";
import { openRun } from "../src/modules/collector/app/open-run.js";
import { executeRun } from "../src/modules/collector/app/run-pipeline.js";
import { startUp } from "../src/modules/collector/app/startup.js";
import type { FetchResult } from "../src/modules/collector/domain/adapter.js";
import { SOURCES } from "../src/modules/collector/domain/sources.js";
import type { SourceAdapter } from "../src/modules/collector/infra/sources/types.js";
import { createTempDb, type TempDb } from "./helpers/temp-db.js";

const HOUR = 60 * 60 * 1000;
const T0 = Date.UTC(2026, 9, 2, 12);
type Row = Record<string, unknown>;

const empty = (over: Partial<FetchResult> = {}): FetchResult => ({
  completeness: "complete",
  listings: [],
  itemsReturned: 0,
  coversPublishedAfter: null,
  ...over,
});
const fine = (id: SourceAdapter["id"], over: Partial<FetchResult> = {}): SourceAdapter => ({
  id,
  fetchLatest: async () => empty(over),
});

describe("failures inside the run pipeline (sad §8 Error handling)", () => {
  let db: TempDb;
  let dir: string;
  let now: number;
  let deps: CollectorDeps;

  beforeEach(() => {
    db = createTempDb();
    dir = mkdtempSync(join(tmpdir(), "job-radar-pipeline-"));
    now = T0;
    deps = {
      db: db.db,
      now: () => now,
      settingsFile: join(dir, "settings.json"),
      adapters: {
        jobicy: fine("jobicy"),
        himalayas: fine("himalayas", { completeness: "capped" }),
        remotive: fine("remotive"),
        weworkremotely: fine("weworkremotely"),
      },
      timeZone: "Europe/Warsaw",
    };
    startUp(deps);
  });

  afterEach(() => {
    db.cleanup();
    rmSync(dir, { recursive: true, force: true });
  });

  const rows = (q: string) => db.db.all<Row>(sql.raw(q));
  const start = () => {
    const run = openRun(deps, "schedule");
    if (run.kind !== "started") throw new Error(`no run: ${run.kind}`);
    return run;
  };

  it("a throwing ingest fails that source only, and the run finishes", async () => {
    deps.adapters.remotive = {
      id: "remotive",
      fetchLatest: async () => {
        throw new Error("boom");
      },
    };
    const run = start();

    await executeRun(deps, run, noMarks);

    expect(
      rows(
        `select source_id, outcome, failure_reason from collector_run_sources where run_id = '${run.runId}' order by source_id`,
      ),
    ).toEqual([
      { source_id: "himalayas", outcome: "capped", failure_reason: null },
      { source_id: "jobicy", outcome: "complete", failure_reason: null },
      {
        source_id: "remotive",
        outcome: "failed",
        failure_reason: "The source's response could not be processed.",
      },
      { source_id: "weworkremotely", outcome: "complete", failure_reason: null },
    ]);
    expect(rows(`select status from collector_runs where id = '${run.runId}'`)).toEqual([
      { status: "finished" },
    ]);
  });

  it("a run whose finalize throws is recorded as incomplete, so the next run can start", async () => {
    deps.adapters.jobicy = {
      id: "jobicy",
      // Breaks finalize (flags table) after ingest has committed.
      fetchLatest: async () => {
        db.db.run(sql`drop table collector_source_flags`);
        return empty();
      },
    };
    const run = start();

    await expect(executeRun(deps, run, noMarks)).rejects.toThrow();

    expect(rows(`select status from collector_runs where id = '${run.runId}'`)).toEqual([
      { status: "incomplete" },
    ]);
    now = T0 + HOUR;
    expect(openRun(deps, "schedule").kind).not.toBe("already_running");
  });

  it("a throwing first fill keeps the source's real verdict and outcome, and raises no failure flag", async () => {
    deps.sources = SOURCES.map((s) => (s.id === "himalayas" ? { ...s, limits: { perDay: 8 } } : s));
    deps.adapters.himalayas = {
      id: "himalayas",
      fetchLatest: async () => empty({ completeness: "capped", itemsReturned: 5, nextCursor: "c2" }),
      fetchOlder: async () => {
        throw new Error("fill page exploded");
      },
    };

    for (const at of [T0, T0 + 6 * HOUR]) {
      now = at;
      const run = start();
      await executeRun(deps, run, noMarks);
      expect(
        rows(
          `select outcome from collector_run_sources where run_id = '${run.runId}' and source_id = 'himalayas'`,
        ),
      ).toEqual([{ outcome: "capped" }]);
    }
    expect(rows("select kind from collector_source_flags where source_id = 'himalayas'")).toEqual([]);
    expect(rows("select fill_status from collector_sources where id = 'himalayas'")).toEqual([
      { fill_status: "continuing" },
    ]);
  });
  it("a fill that fails while storing keeps the source's read and outcome (round-2 review R8)", async () => {
    deps.sources = SOURCES.map((s) => (s.id === "himalayas" ? { ...s, limits: { perDay: 8 } } : s));
    deps.adapters.himalayas = {
      id: "himalayas",
      fetchLatest: async () => empty({ completeness: "capped", itemsReturned: 5, nextCursor: "c2" }),
      fetchOlder: async () =>
        empty({
          completeness: "capped",
          itemsReturned: 1,
          nextCursor: null,
          // A listing the store cannot insert: the failure happens after the page was fetched.
          listings: [
            {
              sourceItemId: null as unknown as string,
              url: "u",
              title: "T",
              company: "C",
              description: "",
              locationRestriction: null,
              categories: ["Developer"],
              publishedAt: T0 - 2 * HOUR,
              expiresAt: null,
            },
          ],
        }),
    };
    const run = start();

    await executeRun(deps, run, noMarks);

    expect(
      rows(
        `select outcome from collector_run_sources where run_id = '${run.runId}' and source_id = 'himalayas'`,
      ),
    ).toEqual([{ outcome: "capped" }]);
    expect(rows(`select status from collector_runs where id = '${run.runId}'`)).toEqual([
      { status: "finished" },
    ]);
    expect(rows("select kind from collector_source_flags where source_id = 'himalayas'")).toEqual([]);
  });
});
