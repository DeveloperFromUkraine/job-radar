import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import type { ScoringHealth } from "../api/matching";
import type { SearchResult } from "../api/search";
import { contractExample } from "../test/contract";
import { mockApi, renderWithProviders } from "../test/render";

const PROBLEMS = "GET /api/v1/collector/problems";
const HEALTH = "GET /api/v1/matching/health";
const VISIT = "POST /api/v1/search/visits";
const SEARCH = "POST /api/v1/search/snapshots";
const noProblems = { body: contractExample("getCollectorProblems", 200, "none") };
const problems = { body: contractExample("getCollectorProblems", 200, "problem") };
const visit = { body: contractExample("openVisit", 200, "returning") };
const healthy = { body: contractExample<ScoringHealth>("getScoringHealth", 200, "healthy") };
const keyRefused = { body: contractExample<ScoringHealth>("getScoringHealth", 200, "key_refused") };
const capReached = { body: contractExample<ScoringHealth>("getScoringHealth", 200, "cap_reached") };
const bestMatch = () => contractExample<SearchResult>("runSearch", 200, "best_match");
const newest = (): SearchResult => ({ ...bestMatch(), order: "newest" });
const noProfile = () => contractExample<SearchResult>("runSearch", 200, "no_profile");

const searchBodies = (fetchMock: ReturnType<typeof mockApi>["fetchMock"]) =>
  fetchMock.mock.calls
    .filter(([path]) => String(path) === "/api/v1/search/snapshots")
    .map(([, init]) => JSON.parse(String(init?.body)));

const radios = () => within(screen.getByRole("radiogroup", { name: "Order" })).getAllByRole("radio");

describe("SCR-01 order and scoring notices", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("newest first is selected by default; switching runs the search best match first and keeps it (AC-11)", async () => {
    const { fetchMock } = mockApi({
      [PROBLEMS]: noProblems,
      [HEALTH]: healthy,
      [VISIT]: visit,
      [SEARCH]: [{ body: newest() }, { body: bestMatch() }],
    });
    renderWithProviders(<App />);
    await screen.findByText("Senior Fullstack Engineer");
    const [newestRadio, bestRadio] = radios();
    expect(newestRadio).toMatchObject({ checked: true });
    expect(newestRadio?.closest("label")?.className).toContain("min-h-11");
    fireEvent.click(bestRadio as HTMLElement);
    await waitFor(() => expect(searchBodies(fetchMock).at(-1)).toMatchObject({ order: "best_match" }));
    await waitFor(() => expect(radios()[1]).toMatchObject({ checked: true }));
    expect(searchBodies(fetchMock)[0]).not.toHaveProperty("order"); // the first search uses the kept order
  });

  // realness-score ADR-0003: the order switch is offered without a profile too.
  it("without a profile: one line with one action, the order switch, no matches (AC-15)", async () => {
    mockApi({ [PROBLEMS]: noProblems, [HEALTH]: healthy, [VISIT]: visit, [SEARCH]: { body: noProfile() } });
    renderWithProviders(<App />);
    expect(
      await screen.findByText("No scores yet — set up your profile to see how each posting fits."),
    ).toBeTruthy();
    const link = screen.getByRole("link", { name: "Set up profile" });
    expect(link.getAttribute("href")).toBe("/profile");
    expect(screen.getByRole("radiogroup", { name: "Order" })).toBeTruthy();
    expect(screen.queryByText(/^Not scored/)).toBeNull();
  });

  it("cap reached: says when scoring resumes, with Change cap, and no problem marker (AC-12, screens.md SCR-01, review R6)", async () => {
    mockApi({
      [PROBLEMS]: noProblems,
      [HEALTH]: capReached,
      [VISIT]: visit,
      [SEARCH]: { body: bestMatch() },
    });
    renderWithProviders(<App />);
    expect(
      await screen.findByText("This month's scoring cap is reached. Scoring resumes on 1 November."),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: "Change cap" }).getAttribute("href")).toBe("/profile");
    expect(screen.queryByText("Scoring has a problem.")).toBeNull();
  });

  it("a provider or key problem raises the marker, which names scoring and leads to source health (AC-14)", async () => {
    mockApi({
      [PROBLEMS]: noProblems,
      [HEALTH]: keyRefused,
      [VISIT]: visit,
      [SEARCH]: { body: bestMatch() },
    });
    renderWithProviders(<App />);
    const marker = await screen.findByRole("link", { name: /Scoring has a problem\./ });
    expect(marker.getAttribute("href")).toBe("/sources");
  });

  it("a source problem keeps the marker's own text", async () => {
    mockApi({ [PROBLEMS]: problems, [HEALTH]: healthy, [VISIT]: visit, [SEARCH]: { body: bestMatch() } });
    renderWithProviders(<App />);
    expect(await screen.findByText("A source has a problem that can cost you postings.")).toBeTruthy();
  });

  it("a failed health read shows nothing and the list is unaffected", async () => {
    mockApi({
      [PROBLEMS]: noProblems,
      [HEALTH]: { status: 500, body: { error: { code: "INTERNAL", message: "Internal server error" } } },
      [VISIT]: visit,
      [SEARCH]: { body: bestMatch() },
    });
    renderWithProviders(<App />);
    await screen.findByText("Senior Fullstack Engineer");
    expect(screen.queryByText(/has a problem/)).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("the order switch is hidden in the marked view", async () => {
    mockApi({
      [PROBLEMS]: noProblems,
      [HEALTH]: healthy,
      [VISIT]: visit,
      [SEARCH]: { body: bestMatch() },
      "POST /api/v1/search/marked-snapshots": { body: contractExample("runMarkedView", 200) },
    });
    renderWithProviders(<App />);
    await screen.findByRole("radiogroup", { name: "Order" });
    fireEvent.click(screen.getByRole("switch", { name: "Show marked postings" }));
    await waitFor(() => expect(screen.queryByRole("radiogroup", { name: "Order" })).toBeNull());
  });
});
