import { afterEach, describe, expect, it, vi } from "vitest";
import { contractExample } from "../test/contract";
import { mockApi } from "../test/render";
import { ApiError } from "./collector";
import { getNextPage, getWaitingCount, openVisit, runSearch } from "./search";

const json = { method: "POST", headers: { "content-type": "application/json" } };

describe("search API client", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends every operation as a JSON POST and returns the contract body", async () => {
    const found = contractExample("runSearch", 200, "found");
    const page = contractExample("getNextPage", 200);
    const { fetchMock } = mockApi({
      "POST /api/v1/search/visits": { body: contractExample("openVisit", 200, "returning") },
      "POST /api/v1/search/snapshots": { body: found },
      "POST /api/v1/search/snapshots/s1/pages": { body: page },
      "POST /api/v1/search/snapshots/s1/waiting": { body: contractExample("getWaitingCount", 200) },
    });

    expect(await openVisit()).toEqual({
      last_skills: ["React", "Go"],
      previous_visit_started_at: "2026-10-04T09:00:00Z",
    });
    expect(await runSearch("React, TypeScript")).toEqual(found);
    expect(await getNextPage("s1", "50")).toEqual(page);
    expect(await getWaitingCount("s1")).toEqual({ waiting_count: 4 });

    expect(fetchMock.mock.calls.map(([path, init]) => [path, init])).toEqual([
      ["/api/v1/search/visits", { ...json, body: "{}" }],
      ["/api/v1/search/snapshots", { ...json, body: JSON.stringify({ skills: "React, TypeScript" }) }],
      ["/api/v1/search/snapshots/s1/pages", { ...json, body: JSON.stringify({ cursor: "50" }) }],
      ["/api/v1/search/snapshots/s1/waiting", { ...json, body: "{}" }],
    ]);
  });

  it("turns the error envelope into an ApiError with the contract's code and message", async () => {
    const invalid = contractExample<{ error: { code: string; message: string } }>(
      "runSearch",
      400,
      "no_letter",
    );
    mockApi({ "POST /api/v1/search/snapshots": { status: 400, body: invalid } });
    const err = await runSearch("--").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ code: "SEARCH_INVALID_SKILLS", message: invalid.error.message, status: 400 });
  });

  it("escapes the snapshot id into the path", async () => {
    const { calls } = mockApi({});
    await getWaitingCount("a/b").catch(() => {});
    expect(calls[0]?.path).toBe("/api/v1/search/snapshots/a%2Fb/waiting");
  });
});
