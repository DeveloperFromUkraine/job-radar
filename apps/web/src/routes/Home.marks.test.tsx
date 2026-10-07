import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import type { MarkState, Posting, SearchResult, Visit } from "../api/search";
import { contractExample } from "../test/contract";
import { mockApi, renderWithProviders } from "../test/render";

// applied-skipped SCR-01 main list: marking, the Undo notice, undo refused (AC-01 – AC-04, AC-12).
const PROBLEMS = "GET /api/v1/collector/problems";
const VISIT = "POST /api/v1/search/visits";
const SEARCH = "POST /api/v1/search/snapshots";
const A = "01926a00-0000-7000-8000-0000000000b1"; // new
const B = "01926a00-0000-7000-8000-0000000000b2";
const C = "01926a00-0000-7000-8000-0000000000b3";
const MARK = (id: string) => `POST /api/v1/tracking/marks/${id}`;
const UNDO = (id: string) => `POST /api/v1/tracking/marks/${id}/undo`;

const base = { body: contractExample("getCollectorProblems", 200, "none") };
const returning = { body: contractExample<Visit>("openVisit", 200, "returning") };
const found = (): SearchResult => {
  const r = contractExample<SearchResult>("runSearch", 200, "found");
  const first = r.items[0] as Posting;
  return {
    ...r,
    marked_count: 0,
    items: [
      { ...first, id: A, title: "Role A", is_new: true, look_alike: null },
      { ...first, id: B, title: "Role B", is_new: false, look_alike: null },
      { ...first, id: C, title: "Role C", is_new: false, look_alike: null },
    ],
  };
};
const state = (id: string, mark: "applied" | "skipped" | null, change: string): { body: MarkState } => ({
  body: { ...contractExample<MarkState>("setMark", 200, "applied"), posting_id: id, mark, change_id: change },
});
const refused = {
  status: 409,
  body: {
    error: {
      code: "TRACKING_MARK_CHANGED_ELSEWHERE",
      message:
        "This mark was changed elsewhere, so it was not undone. See the marked postings for its current mark.",
    },
  },
};

const titles = () => screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
const notice = () => screen.queryByTestId("undo-notice");

async function open(routes: Parameters<typeof mockApi>[0] = {}) {
  const api = mockApi({ [PROBLEMS]: base, [VISIT]: returning, [SEARCH]: { body: found() }, ...routes });
  renderWithProviders(<App />);
  await screen.findByText("130 postings · 3 new");
  return api;
}

describe("SCR-01 marking and Undo", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("marked: the card leaves only after the save, counts drop, the notice offers Undo (AC-01, AC-14)", async () => {
    const { fetchMock } = await open({ [MARK(A)]: state(A, "applied", "c1") });

    fireEvent.click(screen.getByRole("button", { name: "Mark Role A applied" }));
    expect(titles()).toContain("Role A"); // never optimistic

    await waitFor(() => expect(titles()).toEqual(["Role B", "Role C"]));
    expect(screen.getByText("129 postings · 2 new")).toBeTruthy();
    expect(within(notice() as HTMLElement).getByText("Marked applied")).toBeTruthy();
    expect(within(notice() as HTMLElement).getByRole("button", { name: "Undo" })).toBeTruthy();
    const call = fetchMock.mock.calls.find(([p]) => String(p).includes("/tracking/marks/"));
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({ mark: "applied" });
  });

  it("skipped: the notice says so (AC-02)", async () => {
    await open({ [MARK(B)]: state(B, "skipped", "c1") });
    fireEvent.click(screen.getByRole("button", { name: "Mark Role B skipped" }));
    await waitFor(() => expect(titles()).toEqual(["Role A", "Role C"]));
    expect(screen.getByText("129 postings · 3 new")).toBeTruthy();
    expect(within(notice() as HTMLElement).getByText("Marked skipped")).toBeTruthy();
  });

  it("undone: the card returns to its place with its New badge and the counts (AC-03)", async () => {
    const { fetchMock } = await open({
      [MARK(A)]: state(A, "applied", "c1"),
      [UNDO(A)]: state(A, null, "c2"),
    });
    fireEvent.click(screen.getByRole("button", { name: "Mark Role A applied" }));
    await waitFor(() => expect(titles()).toEqual(["Role B", "Role C"]));

    fireEvent.click(within(notice() as HTMLElement).getByRole("button", { name: "Undo" }));

    await waitFor(() => expect(titles()).toEqual(["Role A", "Role B", "Role C"]));
    expect(screen.getByText("130 postings · 3 new")).toBeTruthy();
    expect(screen.getAllByText("New")).toHaveLength(1);
    expect(notice()).toBeNull();
    const undo = fetchMock.mock.calls.find(([p]) => String(p).endsWith("/undo"));
    expect(JSON.parse(String(undo?.[1]?.body))).toEqual({ change_id: "c1" });
  });

  it("undo refused: nothing reverts; the notice points to the marked postings (AC-04)", async () => {
    await open({ [MARK(A)]: state(A, "applied", "c1"), [UNDO(A)]: refused });
    fireEvent.click(screen.getByRole("button", { name: "Mark Role A applied" }));
    await waitFor(() => expect(titles()).toEqual(["Role B", "Role C"]));

    fireEvent.click(within(notice() as HTMLElement).getByRole("button", { name: "Undo" }));

    // The refused notice replaces the marked one (a new element: it restarts the 8 s).
    expect(
      await screen.findByText(
        "This mark was changed elsewhere, so it was not undone. See the marked postings for its current mark.",
      ),
    ).toBeTruthy();
    expect(
      within(notice() as HTMLElement).getByRole("button", { name: "Show marked postings" }),
    ).toBeTruthy();
    expect(titles()).toEqual(["Role B", "Role C"]);
  });

  it("the notice closes after 8 s, and Undo is gone with it (spec §6 Undo window)", async () => {
    await open({ [MARK(A)]: state(A, "applied", "c1") });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fireEvent.click(screen.getByRole("button", { name: "Mark Role A applied" }));
    await waitFor(() => expect(notice()).not.toBeNull());
    act(() => vi.advanceTimersByTime(7_900));
    expect(notice()).not.toBeNull();
    act(() => vi.advanceTimersByTime(200));
    expect(notice()).toBeNull();
  });

  it("a second mark replaces the notice; Undo covers only the latest change (AC-03)", async () => {
    const { fetchMock } = await open({
      [MARK(A)]: state(A, "applied", "c1"),
      [MARK(B)]: state(B, "skipped", "c2"),
      [UNDO(B)]: state(B, null, "c3"),
    });
    fireEvent.click(screen.getByRole("button", { name: "Mark Role A applied" }));
    await waitFor(() => expect(titles()).toEqual(["Role B", "Role C"]));
    fireEvent.click(screen.getByRole("button", { name: "Mark Role B skipped" }));
    await waitFor(() => expect(titles()).toEqual(["Role C"]));
    expect(screen.getAllByTestId("undo-notice")).toHaveLength(1);
    expect(within(notice() as HTMLElement).getByText("Marked skipped")).toBeTruthy();

    fireEvent.click(within(notice() as HTMLElement).getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(titles()).toEqual(["Role B", "Role C"]));
    expect(fetchMock.mock.calls.filter(([p]) => String(p).endsWith("/undo"))).toHaveLength(1);
  });

  it("a search closes the notice (AC-03)", async () => {
    await open({ [MARK(A)]: state(A, "applied", "c1") });
    fireEvent.click(screen.getByRole("button", { name: "Mark Role A applied" }));
    await waitFor(() => expect(notice()).not.toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => expect(notice()).toBeNull());
  });
});
