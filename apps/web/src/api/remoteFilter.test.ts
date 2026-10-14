import { afterEach, describe, expect, it, vi } from "vitest";
import { contractExample } from "../test/contract";
import { mockApi } from "../test/render";
import { ApiError } from "./collector";
import { chooseCountry, getRemoteFilterSettings, setFilterOn, setLook } from "./remoteFilter";

const json = { method: "POST", headers: { "content-type": "application/json" } };

describe("remote-filter API client", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reads the settings and sends each change as a JSON POST", async () => {
    const settings = contractExample("getRemoteFilterSettings", 200, "first_open");
    const chosen = contractExample("chooseCountry", 200);
    const off = contractExample("setFilterOn", 200);
    const look = contractExample("setLook", 200, "started");
    const { fetchMock } = mockApi({
      "GET /api/v1/remote-filter/settings": { body: settings },
      "POST /api/v1/remote-filter/country": { body: chosen },
      "POST /api/v1/remote-filter/filter": { body: off },
      "POST /api/v1/remote-filter/look": { body: look },
    });
    expect(await getRemoteFilterSettings()).toEqual(settings);
    expect(await chooseCountry("Poland")).toEqual(chosen);
    expect(await setFilterOn(false)).toEqual(off);
    expect(await setLook("Germany")).toEqual(look);
    expect(await setLook(null)).toEqual(look);
    expect(fetchMock.mock.calls.map(([path, init]) => [path, init])).toEqual([
      ["/api/v1/remote-filter/settings", undefined],
      ["/api/v1/remote-filter/country", { ...json, body: '{"name":"Poland"}' }],
      ["/api/v1/remote-filter/filter", { ...json, body: '{"on":false}' }],
      ["/api/v1/remote-filter/look", { ...json, body: '{"name":"Germany"}' }],
      ["/api/v1/remote-filter/look", { ...json, body: '{"name":null}' }],
    ]);
  });

  it("surfaces REMOTE_FILTER_UNKNOWN_COUNTRY (AC-05)", async () => {
    mockApi({
      "POST /api/v1/remote-filter/country": {
        status: 400,
        body: { error: { code: "REMOTE_FILTER_UNKNOWN_COUNTRY", message: "No country matches that name." } },
      },
    });
    await expect(chooseCountry("Polnd")).rejects.toEqual(
      new ApiError("REMOTE_FILTER_UNKNOWN_COUNTRY", "No country matches that name.", 400),
    );
  });
});
