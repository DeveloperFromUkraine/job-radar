import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import type { MarkedPosting, MarkedResult, MarkState, SearchResult, Visit } from "../api/search";
import { contractExample } from "../test/contract";
import { mockApi, renderWithProviders } from "../test/render";

// applied-skipped SCR-01 marked view (AC-05, AC-06, AC-07).
const PROBLEMS = "GET /api/v1/collector/problems";
const VISIT = "POST /api/v1/search/visits";
const SEARCH = "POST /api/v1/search/snapshots";
const MARKED = "POST /api/v1/search/marked-snapshots";
const TITLE = "Sr. Backend Engineer (Go) – Remote";

const view = (): MarkedResult => contractExample<MarkedResult>("runMarkedView", 200);
const item = (): MarkedPosting => view().items[0] as MarkedPosting;
const P = item().id;
const MARK = `POST /api/v1/tracking/marks/${P}`;
const UNDO = `POST /api/v1/tracking/marks/${P}/undo`;
const state = (over: Partial<MarkState>): { body: MarkState } => ({
  body: { ...item().mark_state, ...over },
});
const routes = {
  [PROBLEMS]: { body: contractExample("getCollectorProblems", 200, "none") },
  [VISIT]: { body: contractExample<Visit>("openVisit", 200, "returning") },
  [SEARCH]: { body: contractExample<SearchResult>("runSearch", 200, "found") },
};

const toggle = () => screen.getByRole("switch", { name: "Show marked postings" }) as HTMLInputElement;
const card = () => screen.getByRole("article");
const notice = () => screen.queryByTestId("undo-notice");
const bodies = (fetchMock: ReturnType<typeof mockApi>["fetchMock"], path: string) =>
  fetchMock.mock.calls.filter(([p]) => String(p) === path).map(([, init]) => JSON.parse(String(init?.body)));

async function openMarked(extra: Parameters<typeof mockApi>[0] = {}, body: MarkedResult = view()) {
  const api = mockApi({ ...routes, [MARKED]: { body }, ...extra });
  renderWithProviders(<App />);
  await screen.findByText("130 postings · 3 new");
  expect(toggle().checked).toBe(false); // off on every visit
  fireEvent.click(toggle());
  return api;
}

describe("SCR-01 marked view", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("lists the marked postings with their mark, date and Closed, and the counts (AC-05)", async () => {
    const { fetchMock } = await openMarked();
    expect(await screen.findByText("12 marked and 1 cleared")).toBeTruthy();
    expect(toggle().checked).toBe(true);
    expect(within(card()).getByText("Applied on 3 Oct")).toBeTruthy();
    expect(within(card()).getByText("Closed")).toBeTruthy();
    expect(within(card()).getByRole("button", { name: `Mark ${TITLE} skipped` })).toBeTruthy();
    expect(within(card()).getByRole("button", { name: `Clear the mark on ${TITLE}` })).toBeTruthy();
    expect(bodies(fetchMock, "/api/v1/search/marked-snapshots")).toEqual([{ skills: "React, Go" }]);
    expect(screen.queryByText("130 postings · 3 new")).toBeNull();
  });

  it("says only 'N marked' with no cleared ones", async () => {
    await openMarked({}, { ...view(), cleared_count: 0 });
    expect(await screen.findByText("12 marked")).toBeTruthy();
  });

  it("changes a mark in place, with Undo restoring it in place (AC-06, AC-03)", async () => {
    await openMarked({
      [MARK]: state({ mark: "skipped", marked_at: "2026-10-07T09:15:00Z", change_id: "c9" }),
      [UNDO]: state({}),
    });
    fireEvent.click(await screen.findByRole("button", { name: `Mark ${TITLE} skipped` }));
    expect(await within(card()).findByText("Skipped on 7 Oct")).toBeTruthy();
    expect(within(notice() as HTMLElement).getByText("Marked skipped")).toBeTruthy();

    fireEvent.click(within(notice() as HTMLElement).getByRole("button", { name: "Undo" }));
    expect(await within(card()).findByText("Applied on 3 Oct")).toBeTruthy();
  });

  it("clearing a closed posting turns its card into Cleared with the removal date (AC-07)", async () => {
    await openMarked({ [MARK]: state({ mark: null, removed_after: "2026-10-08", change_id: "c9" }) });
    fireEvent.click(await screen.findByRole("button", { name: `Clear the mark on ${TITLE}` }));
    expect(await within(card()).findByText("Cleared · removed after 8 Oct")).toBeTruthy();
    expect(within(card()).getByRole("button", { name: `Mark ${TITLE} applied` })).toBeTruthy();
    expect(within(notice() as HTMLElement).getByText("Mark cleared")).toBeTruthy();
  });

  it("asks before an at-risk applied posting loses its mark; Cancel sends nothing (AC-07)", async () => {
    const atRisk = view();
    (atRisk.items[0] as MarkedPosting).mark_state.at_risk = true;
    const { fetchMock } = await openMarked(
      { [MARK]: state({ mark: null, removed_after: "2026-10-08" }) },
      atRisk,
    );

    fireEvent.click(await screen.findByRole("button", { name: `Clear the mark on ${TITLE}` }));
    expect(
      within(card()).getByText("Without the applied mark, this posting will be removed at clean-up."),
    ).toBeTruthy();
    fireEvent.click(within(card()).getByRole("button", { name: "Cancel" }));
    expect(bodies(fetchMock, `/api/v1/tracking/marks/${P}`)).toEqual([]);

    fireEvent.click(within(card()).getByRole("button", { name: `Mark ${TITLE} skipped` }));
    fireEvent.click(within(card()).getByRole("button", { name: "Continue" }));
    await waitFor(() =>
      expect(bodies(fetchMock, `/api/v1/tracking/marks/${P}`)).toEqual([{ mark: "skipped" }]),
    );
  });

  it("is empty with no marked postings, naming the skills", async () => {
    await openMarked({}, { ...view(), marked_count: 0, cleared_count: 0, items: [] });
    expect(await screen.findByText("No marked postings match Go.")).toBeTruthy();
  });

  it("turning it off reloads the main list (AC-05)", async () => {
    const { fetchMock } = await openMarked();
    await screen.findByText("12 marked and 1 cleared");
    fireEvent.click(toggle());
    expect(await screen.findByText("130 postings · 3 new")).toBeTruthy();
    expect(toggle().checked).toBe(false);
    expect(bodies(fetchMock, "/api/v1/search/snapshots")).toHaveLength(2);
  });

  it("a search with the switch on narrows the marked view and keeps the switch on", async () => {
    const { fetchMock } = await openMarked();
    await screen.findByText("12 marked and 1 cleared");
    fireEvent.change(screen.getByLabelText("Your skills"), { target: { value: "Go" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() =>
      expect(bodies(fetchMock, "/api/v1/search/marked-snapshots")).toEqual([
        { skills: "React, Go" },
        { skills: "Go" },
      ]),
    );
    expect(toggle().checked).toBe(true);
    expect(bodies(fetchMock, "/api/v1/search/snapshots")).toHaveLength(1);
  });

  it("an expired view reloads and says so", async () => {
    const paged = { ...view(), has_next: true, next_cursor: "50" };
    const expired = {
      status: 410,
      body: {
        error: {
          code: "SEARCH_SNAPSHOT_EXPIRED",
          message: "This list has expired; it was reloaded from the newest.",
        },
      },
    };
    await openMarked({ [`POST /api/v1/search/marked-snapshots/${paged.snapshot_id}/pages`]: expired }, paged);
    fireEvent.click(await screen.findByRole("button", { name: "Show 50 more" }));
    expect(await screen.findByText("This list had expired and was reloaded.")).toBeTruthy();
  });

  it("Show marked postings from nothing left to review turns the switch on (AC-13)", async () => {
    mockApi({
      ...routes,
      [SEARCH]: { body: contractExample<SearchResult>("runSearch", 200, "nothing_left") },
      [MARKED]: { body: view() },
    });
    renderWithProviders(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Show marked postings" }));
    expect(await screen.findByText("12 marked and 1 cleared")).toBeTruthy();
    expect(toggle().checked).toBe(true);
  });
});
