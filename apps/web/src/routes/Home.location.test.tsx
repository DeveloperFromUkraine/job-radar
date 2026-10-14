import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import type { RemoteFilterSettings } from "../api/remoteFilter";
import type { SearchResult, Visit } from "../api/search";
import { contractExample } from "../test/contract";
import { mockApi, renderWithProviders } from "../test/render";

// remote-filter SCR-01: the location bar on the main screen (AC-04, AC-06, AC-07, AC-11).
const SEARCH = "POST /api/v1/search/snapshots";
const PL = { code: "PL", name: "Poland", flag: "🇵🇱" };
const filtered = () => contractExample<SearchResult>("runSearch", 200, "filtered");
const withPoland = (): RemoteFilterSettings => ({
  ...contractExample<RemoteFilterSettings>("getRemoteFilterSettings", 200, "first_open"),
  country: PL,
});
const base = {
  "GET /api/v1/collector/problems": { body: contractExample("getCollectorProblems", 200, "none") },
  "POST /api/v1/search/visits": { body: contractExample<Visit>("openVisit", 200, "returning") },
  "GET /api/v1/remote-filter/settings": { body: withPoland() },
};
const searches = (calls: { method: string; path: string }[]) =>
  calls.filter((c) => `${c.method} ${c.path}` === SEARCH).length;

describe("SCR-01 location bar", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sits under the skills field and describes the list on screen", async () => {
    mockApi({ ...base, [SEARCH]: { body: filtered() } });
    renderWithProviders(<App />);
    const bar = await screen.findByRole("region", { name: "Location filter" });
    expect(bar.textContent).toContain(`Open to 🇵🇱 Poland`);
    const field = screen.getByLabelText("Your skills");
    expect(field.compareDocumentPosition(bar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("switching the filter off runs the search again with the field's skills (AC-07)", async () => {
    const off: SearchResult = {
      ...filtered(),
      hidden_count: 0,
      location_filter: { mode: "off", country: PL },
    };
    const { calls, fetchMock } = mockApi({
      ...base,
      [SEARCH]: [{ body: filtered() }, { body: off }],
      "POST /api/v1/remote-filter/filter": { body: { ...withPoland(), filter_on: false } },
    });
    renderWithProviders(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Switch off" }));
    expect(await screen.findByText("Location filter is off")).toBeTruthy();
    expect(searches(calls)).toBe(2);
    const bodies = fetchMock.mock.calls
      .filter(([p]) => String(p) === "/api/v1/search/snapshots")
      .map(([, init]) => JSON.parse(String(init?.body)));
    expect(bodies[1]).toEqual(bodies[0]);
  });

  it("the filter's empty message switches the filter off (AC-08)", async () => {
    const allHidden = contractExample<SearchResult>("runSearch", 200, "all_hidden");
    const { calls } = mockApi({
      ...base,
      [SEARCH]: [
        { body: allHidden },
        { body: { ...filtered(), location_filter: { mode: "off", country: PL } } },
      ],
      "POST /api/v1/remote-filter/filter": { body: { ...withPoland(), filter_on: false } },
    });
    renderWithProviders(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Switch filter off" }));
    await waitFor(() => expect(searches(calls)).toBe(2));
    expect(calls).toContainEqual({ method: "POST", path: "/api/v1/remote-filter/filter" });
  });

  it("the empty message's switch shows the switch error with Retry (review F-3)", async () => {
    const allHidden = contractExample<SearchResult>("runSearch", 200, "all_hidden");
    const fail = { status: 500, body: { error: { code: "INTERNAL", message: "Something went wrong." } } };
    const { calls } = mockApi({
      ...base,
      [SEARCH]: [
        { body: allHidden },
        { body: { ...filtered(), location_filter: { mode: "off", country: PL } } },
      ],
      "POST /api/v1/remote-filter/filter": [fail, { body: { ...withPoland(), filter_on: false } }],
    });
    renderWithProviders(<App />);
    const button = await screen.findByRole("button", { name: "Switch filter off" });
    fireEvent.click(button);
    expect((await screen.findByRole("alert")).textContent).toContain("Something went wrong.");
    expect(searches(calls)).toBe(1);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(searches(calls)).toBe(2));
  });

  it("a later filter change from the bar clears the empty message's old switch error (re-review N-2)", async () => {
    const allHidden = contractExample<SearchResult>("runSearch", 200, "all_hidden");
    const fail = { status: 500, body: { error: { code: "INTERNAL", message: "Something went wrong." } } };
    mockApi({
      ...base,
      [SEARCH]: [
        { body: allHidden },
        { body: { ...filtered(), location_filter: { mode: "off", country: PL } } },
        { body: allHidden },
      ],
      "POST /api/v1/remote-filter/filter": [
        fail,
        { body: { ...withPoland(), filter_on: false } },
        { body: { ...withPoland(), filter_on: true } },
      ],
    });
    renderWithProviders(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Switch filter off" }));
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Switch off" }));
    fireEvent.click(await screen.findByRole("button", { name: "Switch on" }));
    await screen.findByRole("button", { name: "Switch filter off" });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("is hidden while the marked view is on, and back when it goes off (AC-11)", async () => {
    mockApi({
      ...base,
      [SEARCH]: { body: filtered() },
      "POST /api/v1/search/marked-snapshots": { body: contractExample("runMarkedView", 200) },
    });
    renderWithProviders(<App />);
    await screen.findByRole("region", { name: "Location filter" });
    const toggle = screen.getByRole("switch", { name: "Show marked postings" });
    fireEvent.click(toggle);
    await waitFor(() => expect(screen.queryByRole("region", { name: "Location filter" })).toBeNull());
    fireEvent.click(toggle);
    expect(await screen.findByRole("region", { name: "Location filter" })).toBeTruthy();
  });
});
