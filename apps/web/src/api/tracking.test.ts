import { afterEach, describe, expect, it, vi } from "vitest";
import { contractExample } from "../test/contract";
import { mockApi } from "../test/render";
import { ApiError } from "./collector";
import { getNextMarkedPage, runMarkedView } from "./search";
import { setMark, undoMark } from "./tracking";

const json = { method: "POST", headers: { "content-type": "application/json" } };
const P = "01926a00-0000-7000-8000-0000000000b1";

describe("tracking API client", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends marks and undos as JSON POSTs and returns the MarkState", async () => {
    const state = contractExample("setMark", 200, "applied");
    const back = contractExample("undoMark", 200, "back_to_unmarked");
    const { fetchMock } = mockApi({
      [`POST /api/v1/tracking/marks/${P}`]: { body: state },
      [`POST /api/v1/tracking/marks/${P}/undo`]: { body: back },
    });
    expect(await setMark(P, "applied")).toEqual(state);
    expect(await setMark(P, null)).toEqual(state);
    expect(await undoMark(P, "c1")).toEqual(back);
    expect(fetchMock.mock.calls.map(([path, init]) => [path, init])).toEqual([
      [`/api/v1/tracking/marks/${P}`, { ...json, body: '{"mark":"applied"}' }],
      [`/api/v1/tracking/marks/${P}`, { ...json, body: '{"mark":null}' }],
      [`/api/v1/tracking/marks/${P}/undo`, { ...json, body: '{"change_id":"c1"}' }],
    ]);
  });

  it("surfaces the contract's error codes", async () => {
    mockApi({
      [`POST /api/v1/tracking/marks/${P}/undo`]: {
        status: 409,
        body: { error: { code: "TRACKING_MARK_CHANGED_ELSEWHERE", message: "changed" } },
      },
    });
    await expect(undoMark(P, "c1")).rejects.toEqual(
      new ApiError("TRACKING_MARK_CHANGED_ELSEWHERE", "changed", 409),
    );
  });

  it("opens and pages the marked view", async () => {
    const view = contractExample("runMarkedView", 200);
    const page = contractExample("getNextMarkedPage", 200);
    const { fetchMock } = mockApi({
      "POST /api/v1/search/marked-snapshots": { body: view },
      "POST /api/v1/search/marked-snapshots/s1/pages": { body: page },
    });
    expect(await runMarkedView("Go")).toEqual(view);
    expect(await getNextMarkedPage("s1", "50")).toEqual(page);
    expect(fetchMock.mock.calls.map(([path]) => path)).toEqual([
      "/api/v1/search/marked-snapshots",
      "/api/v1/search/marked-snapshots/s1/pages",
    ]);
  });
});
