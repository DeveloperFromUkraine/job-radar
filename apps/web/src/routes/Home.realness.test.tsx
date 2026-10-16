import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import type { ScoringHealth } from "../api/matching";
import type { SearchResult } from "../api/search";
import { contractExample } from "../test/contract";
import { mockApi, renderWithProviders } from "../test/render";

// realness-score SCR-01: the realness switch, its save error, and best match first without a profile.
const PROBLEMS = "GET /api/v1/collector/problems";
const HEALTH = "GET /api/v1/matching/health";
const VISIT = "POST /api/v1/search/visits";
const SEARCH = "POST /api/v1/search/snapshots";
const SAVE = "POST /api/v1/realness/settings";
const base = {
  [PROBLEMS]: { body: contractExample("getCollectorProblems", 200, "none") },
  [HEALTH]: { body: contractExample<ScoringHealth>("getScoringHealth", 200, "healthy") },
  [VISIT]: { body: contractExample("openVisit", 200, "returning") },
};
const lowered = () => contractExample<SearchResult>("runSearch", 200, "best_match_lowered");
const off = (): SearchResult => ({
  ...lowered(),
  realness_on: false,
  items: lowered().items.map((p) => ({ ...p, realness: null })),
});
const notSaved = { status: 503, body: contractExample("setRealnessOn", 503) };
const realnessSwitch = () => screen.getByRole("switch", { name: "Lower stale postings" }) as HTMLInputElement;
const saves = (fetchMock: ReturnType<typeof mockApi>["fetchMock"]) =>
  fetchMock.mock.calls
    .filter(([path, init]) => String(path) === "/api/v1/realness/settings" && init?.method === "POST")
    .map(([, init]) => JSON.parse(String(init?.body)));
const searches = (fetchMock: ReturnType<typeof mockApi>["fetchMock"]) =>
  fetchMock.mock.calls.filter(([path]) => String(path) === "/api/v1/search/snapshots").length;

describe("SCR-01 realness switch", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("is on when the list says so, in a 44 px label, after the order switch", async () => {
    mockApi({ ...base, [SEARCH]: { body: lowered() } });
    renderWithProviders(<App />);
    await screen.findByText("Lowered: posted 65 days ago · no salary listed");
    expect(realnessSwitch().checked).toBe(true);
    expect(realnessSwitch().closest("label")?.className).toContain("min-h-11");
    const order = screen.getByRole("radiogroup", { name: "Order" });
    expect(order.compareDocumentPosition(realnessSwitch()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("switching off saves, then reloads the list without reason lines (AC-10)", async () => {
    const { fetchMock } = mockApi({
      ...base,
      [SEARCH]: [{ body: lowered() }, { body: off() }],
      [SAVE]: { body: { realness_on: false } },
    });
    renderWithProviders(<App />);
    await screen.findByText("Lowered: posted 65 days ago · no salary listed");
    fireEvent.click(realnessSwitch());
    await waitFor(() => expect(screen.queryByText(/^Lowered:/)).toBeNull());
    expect(saves(fetchMock)).toEqual([{ on: false }]);
    expect(searches(fetchMock)).toBe(2);
    expect(realnessSwitch().checked).toBe(false);
  });

  it("a failed save puts the switch back, keeps the list and offers a retry of the same change (AC-11)", async () => {
    const { fetchMock } = mockApi({
      ...base,
      [SEARCH]: [{ body: lowered() }, { body: off() }],
      [SAVE]: [notSaved, { body: { realness_on: false } }],
    });
    renderWithProviders(<App />);
    await screen.findByText("Lowered: posted 65 days ago · no salary listed");
    fireEvent.click(realnessSwitch());
    expect(await screen.findByText("Your realness choice was not saved.")).toBeTruthy();
    expect(
      screen.getByText("Job-radar could not save your realness choice just now. Try again."),
    ).toBeTruthy();
    expect(realnessSwitch().checked).toBe(true);
    expect(screen.getByText("Lowered: posted 65 days ago · no salary listed")).toBeTruthy();
    expect(searches(fetchMock)).toBe(1);

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.queryByText("Your realness choice was not saved.")).toBeNull());
    expect(saves(fetchMock)).toEqual([{ on: false }, { on: false }]);
    await waitFor(() => expect(realnessSwitch().checked).toBe(false));
  });

  it("is hidden in the marked view", async () => {
    mockApi({
      ...base,
      [SEARCH]: { body: lowered() },
      "POST /api/v1/search/marked-snapshots": { body: contractExample("runMarkedView", 200) },
    });
    renderWithProviders(<App />);
    await screen.findByText("Lowered: posted 65 days ago · no salary listed");
    fireEvent.click(screen.getByRole("switch", { name: "Show marked postings" }));
    await waitFor(() => expect(screen.queryByRole("switch", { name: "Lower stale postings" })).toBeNull());
  });
});

describe("best match first without a profile (ADR-0003, AC-05)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("offers the order switch, and says how best match first works until a profile exists", async () => {
    const noProfile: SearchResult = { ...lowered(), has_profile: false, order: "best_match" };
    mockApi({ ...base, [SEARCH]: { body: noProfile } });
    renderWithProviders(<App />);
    expect(
      await screen.findByText(
        "No scores yet — set up your profile to see how each posting fits. Until you set up a profile, best match first puts postings with fewer realness signals first.",
      ),
    ).toBeTruthy();
    expect(screen.getByRole("radiogroup", { name: "Order" })).toBeTruthy();
  });

  it("newest first without a profile keeps the plain line", async () => {
    const noProfile: SearchResult = { ...lowered(), has_profile: false, order: "newest" };
    mockApi({ ...base, [SEARCH]: { body: noProfile } });
    renderWithProviders(<App />);
    expect(
      await screen.findByText("No scores yet — set up your profile to see how each posting fits."),
    ).toBeTruthy();
  });
});
