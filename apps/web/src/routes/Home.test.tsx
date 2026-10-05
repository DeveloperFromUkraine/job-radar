import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import type { Posting, SearchResult, Visit } from "../api/search";
import { contractExample } from "../test/contract";
import { mockApi, renderWithProviders } from "../test/render";

const PROBLEMS = "GET /api/v1/collector/problems";
const VISIT = "POST /api/v1/search/visits";
const SEARCH = "POST /api/v1/search/snapshots";
const noProblems = { body: contractExample("getCollectorProblems", 200, "none") };
const returning = { body: contractExample<Visit>("openVisit", 200, "returning") };
const firstVisit = { body: contractExample("openVisit", 200, "first") };
const found = () => contractExample<SearchResult>("runSearch", 200, "found");
const card = (p: Partial<Posting>) => ({ ...(found().items[0] as Posting), ...p });
const feed = (): SearchResult => ({
  ...found(),
  skills: [],
  total: 412,
  items: [card({ matched_skills: [] })],
});
const firstVisitFeed = (): SearchResult => ({
  ...feed(),
  new_count: 0,
  items: [card({ matched_skills: [], is_new: false })],
});
const unavailable = {
  status: 503,
  body: {
    error: {
      code: "SEARCH_COLLECTION_UNAVAILABLE",
      message: "Job-radar could not read its postings just now. Try again.",
    },
  },
};

/** The JSON bodies sent to runSearch, in order. */
const searchBodies = (fetchMock: ReturnType<typeof mockApi>["fetchMock"]) =>
  fetchMock.mock.calls
    .filter(([path]) => String(path) === "/api/v1/search/snapshots")
    .map(([, init]) => JSON.parse(String(init?.body)));

const field = () => screen.getByLabelText("Your skills") as HTMLInputElement;

async function submit(text: string) {
  fireEvent.change(field(), { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: "Search" }));
}

describe("SCR-01 main screen", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("loading: the field and button are disabled with three skeleton rows", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
    renderWithProviders(<App />);

    expect(field().disabled).toBe(true);
    expect(screen.getByRole("button", { name: "Search" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getAllByTestId("skeleton-row")).toHaveLength(3);
    expect(screen.queryByRole("link", { name: /source has a problem/i })).toBeNull();
  });

  it("default: remembered skills, a fresh search, the count, new marks and cards (AC-01, AC-13, AC-14)", async () => {
    const { fetchMock } = mockApi({
      [PROBLEMS]: noProblems,
      [VISIT]: returning,
      [SEARCH]: { body: found() },
    });
    renderWithProviders(<App />);

    expect(await screen.findByText("130 postings · 3 new")).toBeTruthy();
    expect(field().value).toBe("React, Go");
    expect(searchBodies(fetchMock)).toEqual([{ skills: "React, Go" }]);
    expect(screen.getByText("Senior React Engineer")).toBeTruthy();
    expect(screen.getByText("New")).toBeTruthy();
    expect(screen.getByText("React · title")).toBeTruthy();
  });

  it("feed: an empty field lists every open posting with no skill chips (AC-10)", async () => {
    mockApi({
      [PROBLEMS]: noProblems,
      [VISIT]: { body: { ...returning.body, last_skills: [] } },
      [SEARCH]: { body: feed() },
    });
    renderWithProviders(<App />);

    expect(await screen.findByText("412 open postings · 3 new")).toBeTruthy();
    expect(screen.queryByText(/· title/)).toBeNull();
    expect(screen.queryByText("TypeScript")).toBeNull();
  });

  it("first visit: no new count and no New badges (AC-14)", async () => {
    mockApi({ [PROBLEMS]: noProblems, [VISIT]: firstVisit, [SEARCH]: { body: firstVisitFeed() } });
    renderWithProviders(<App />);

    expect(await screen.findByText("412 open postings")).toBeTruthy();
    expect(screen.queryByText(/new$/)).toBeNull();
    expect(screen.queryByText("New")).toBeNull();
  });

  it("searching keeps the list on screen; validation shows the message and leaves the list unchanged (AC-05)", async () => {
    const invalid = contractExample<{ error: { message: string } }>("runSearch", 400, "no_letter");
    const { fetchMock } = mockApi({
      [PROBLEMS]: noProblems,
      [VISIT]: returning,
      [SEARCH]: [{ body: found() }, { status: 400, body: invalid }],
    });
    renderWithProviders(<App />);
    await screen.findByText("130 postings · 3 new");

    await submit("React, --");

    expect(await screen.findByText(invalid.error.message)).toBeTruthy();
    expect(field().getAttribute("aria-invalid")).toBe("true");
    expect(field().value).toBe("React, --");
    expect(screen.getByText("130 postings · 3 new")).toBeTruthy();
    expect(screen.getByText("Senior React Engineer")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(searchBodies(fetchMock)).toEqual([{ skills: "React, Go" }, { skills: "React, --" }]);
  });

  it("nothing matches: names the skills and offers Clear skills, which runs the feed (AC-11)", async () => {
    const { fetchMock } = mockApi({
      [PROBLEMS]: noProblems,
      [VISIT]: returning,
      [SEARCH]: [{ body: contractExample("runSearch", 200, "nothing_matches") }, { body: feed() }],
    });
    renderWithProviders(<App />);

    expect(await screen.findByText("Nothing matches Haskell.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Clear skills" }));

    expect(await screen.findByText("412 open postings · 3 new")).toBeTruthy();
    expect(field().value).toBe("");
    expect(searchBodies(fetchMock).at(-1)).toEqual({ skills: "" });
  });

  it("collection empty: points to source health; Clear skills only when skills were used (AC-11)", async () => {
    const empty = contractExample<SearchResult>("runSearch", 200, "collection_empty");
    mockApi({ [PROBLEMS]: noProblems, [VISIT]: firstVisit, [SEARCH]: { body: empty } });
    renderWithProviders(<App />);

    expect(await screen.findByText("The first collection hasn't brought postings yet.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open source health" }).getAttribute("href")).toBe("/sources");
    expect(screen.queryByRole("button", { name: "Clear skills" })).toBeNull();
  });

  it("collection empty after a skills search also offers Clear skills", async () => {
    const empty = { ...contractExample<SearchResult>("runSearch", 200, "collection_empty"), skills: ["Go"] };
    mockApi({ [PROBLEMS]: noProblems, [VISIT]: returning, [SEARCH]: { body: empty } });
    renderWithProviders(<App />);

    expect(await screen.findByText("The first collection hasn't brought postings yet.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Clear skills" })).toBeTruthy();
  });

  it("error: the message with Retry, skills kept, the last list still visible; Retry repeats the search (AC-12)", async () => {
    const { fetchMock } = mockApi({
      [PROBLEMS]: noProblems,
      [VISIT]: returning,
      [SEARCH]: [{ body: found() }, unavailable, { body: { ...found(), total: 131 } }],
    });
    renderWithProviders(<App />);
    await screen.findByText("130 postings · 3 new");

    await submit("Rust");

    expect(await screen.findByText("Couldn't load postings.")).toBeTruthy();
    expect(screen.getByText("Job-radar could not read its postings just now. Try again.")).toBeTruthy();
    expect(field().value).toBe("Rust");
    expect(screen.getByText("Senior React Engineer")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("131 postings · 3 new")).toBeTruthy();
    expect(screen.queryByText("Couldn't load postings.")).toBeNull();
    expect(searchBodies(fetchMock)).toEqual([
      { skills: "React, Go" },
      { skills: "Rust" },
      { skills: "Rust" },
    ]);
  });

  it("error: a failed visit shows Retry, which records the visit again", async () => {
    const { calls } = mockApi({
      [PROBLEMS]: noProblems,
      [VISIT]: [unavailable, returning],
      [SEARCH]: { body: found() },
    });
    renderWithProviders(<App />);

    expect(await screen.findByText("Couldn't load postings.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("130 postings · 3 new")).toBeTruthy();
    expect(calls.filter((c) => c.path === "/api/v1/search/visits")).toHaveLength(2);
  });

  it("problem: a marker that links to source health (collector AC-13)", async () => {
    mockApi({
      [PROBLEMS]: { body: contractExample("getCollectorProblems", 200, "problem") },
      [VISIT]: returning,
      [SEARCH]: { body: found() },
    });
    renderWithProviders(<App />);

    const marker = await screen.findByRole("link", {
      name: /A source has a problem that can cost you postings/,
    });
    expect(marker.getAttribute("href")).toBe("/sources");
  });

  it("the problem check failing: an inline banner with the API message and Retry", async () => {
    const { calls } = mockApi({
      [PROBLEMS]: [
        { status: 500, body: { error: { code: "INTERNAL", message: "Internal server error" } } },
        { body: contractExample("getCollectorProblems", 200, "problem") },
      ],
      [VISIT]: returning,
      [SEARCH]: { body: found() },
    });
    renderWithProviders(<App />);

    expect(await screen.findByText("Couldn't check your sources.")).toBeTruthy();
    expect(screen.getByText("Internal server error")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("link", { name: /source has a problem/i })).toBeTruthy();
    expect(calls.filter((c) => c.path === "/api/v1/collector/problems")).toHaveLength(2);
  });

  it("re-checks problems every 60 s so the marker appears on an open screen", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { calls } = mockApi({
      [PROBLEMS]: [noProblems, { body: contractExample("getCollectorProblems", 200, "problem") }],
      [VISIT]: returning,
      [SEARCH]: { body: found() },
    });
    renderWithProviders(<App />);
    await screen.findByText("130 postings · 3 new");
    await waitFor(() => expect(calls.filter((c) => c.path === "/api/v1/collector/problems")).toHaveLength(1));

    await vi.advanceTimersByTimeAsync(60_000);

    expect(await screen.findByRole("link", { name: /source has a problem/i })).toBeTruthy();
  });
});
