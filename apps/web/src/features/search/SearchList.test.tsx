import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import type { Posting, SearchResult } from "../../api/search";
import { contractExample } from "../../test/contract";
import { SearchList } from "./SearchList";

const PL = { code: "PL", name: "Poland", flag: "🇵🇱" };
const DE = { code: "DE", name: "Germany", flag: "🇩🇪" };
const found = () => contractExample<SearchResult>("runSearch", 200, "found");

function list(result: SearchResult, extra: Partial<Parameters<typeof SearchList>[0]> = {}) {
  const handlers = {
    onClearSkills: vi.fn(),
    onSwitchFilterOff: vi.fn(),
    onBackFromLook: vi.fn(),
    onShowMarked: vi.fn(),
  };
  render(
    <MemoryRouter>
      <SearchList
        result={result}
        postings={result.items as Posting[]}
        previousVisitStartedAt="2026-10-04T08:00:00Z"
        onRefresh={vi.fn()}
        hasNext={false}
        loadingMore={false}
        onShowMore={vi.fn()}
        ownCountry={PL}
        {...handlers}
        {...extra}
      />
    </MemoryRouter>,
  );
  return handlers;
}

describe("SearchList with the location filter (remote-filter SCR-01)", () => {
  it("own: the summary carries the hidden part (AC-07)", () => {
    list({
      ...found(),
      total: 102,
      new_count: 2,
      hidden_count: 38,
      location_filter: { mode: "own", country: PL },
    });
    expect(screen.getByText("102 postings · 2 new — 38 hidden, not open to Poland")).toBeTruthy();
  });

  it("own with nothing hidden: no hidden part", () => {
    list({
      ...found(),
      total: 3,
      new_count: 1,
      hidden_count: 0,
      location_filter: { mode: "own", country: PL },
    });
    expect(screen.getByText("3 postings · 1 new")).toBeTruthy();
  });

  it("off: no hidden part", () => {
    list({
      ...found(),
      total: 140,
      new_count: 2,
      hidden_count: 0,
      location_filter: { mode: "off", country: PL },
    });
    expect(screen.getByText("140 postings · 2 new")).toBeTruthy();
  });

  it("look: the summary names Germany (AC-06)", () => {
    list({
      ...found(),
      total: 99,
      new_count: 0,
      hidden_count: 41,
      location_filter: { mode: "look", country: DE },
    });
    expect(screen.getByText("99 postings · 0 new — 41 hidden, not open to Germany")).toBeTruthy();
  });

  it("filter hid everything: the filter's message with Switch filter off and Clear skills (AC-08)", () => {
    const h = list({
      ...found(),
      total: 0,
      new_count: 0,
      hidden_count: 12,
      items: [],
      location_filter: { mode: "own", country: PL },
    });
    expect(screen.getByText("No posting open to Poland matches. The location filter hid 12.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Switch filter off" }));
    fireEvent.click(screen.getByRole("button", { name: "Clear skills" }));
    expect(h.onSwitchFilterOff).toHaveBeenCalled();
    expect(h.onClearSkills).toHaveBeenCalled();
  });

  it("the filter's message action shows its pending state and error (review F-3)", () => {
    list(
      {
        ...found(),
        total: 0,
        new_count: 0,
        hidden_count: 12,
        items: [],
        location_filter: { mode: "own", country: PL },
      },
      { switching: true, switchError: <p role="alert">Something went wrong.</p> },
    );
    expect(screen.getByRole("button", { name: "Switch filter off" }).getAttribute("aria-busy")).toBe("true");
    expect(screen.getByRole("alert").textContent).toBe("Something went wrong.");
  });

  it("the filter's message wins over nothing left to review whenever something was hidden (AC-08 note)", () => {
    list({
      ...found(),
      total: 0,
      marked_count: 3,
      hidden_count: 2,
      items: [],
      location_filter: { mode: "own", country: PL },
    });
    expect(screen.getByText("No posting open to Poland matches. The location filter hid 2.")).toBeTruthy();
    expect(screen.queryByText(/Nothing left to review/)).toBeNull();
  });

  it("nothing hidden: nothing left to review is unchanged", () => {
    list({
      ...found(),
      total: 0,
      marked_count: 3,
      hidden_count: 0,
      items: [],
      location_filter: { mode: "own", country: PL },
    });
    expect(screen.getByText(/Nothing left to review/)).toBeTruthy();
  });

  it("a look that hides everything names Germany and offers Back to Poland", () => {
    const h = list({
      ...found(),
      total: 0,
      hidden_count: 5,
      items: [],
      location_filter: { mode: "look", country: DE },
    });
    expect(screen.getByText("No posting open to Germany matches. The location filter hid 5.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Switch filter off" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Back to Poland" }));
    expect(h.onBackFromLook).toHaveBeenCalled();
  });

  it("a look with no own country offers Back to all postings", () => {
    list(
      { ...found(), total: 0, hidden_count: 5, items: [], location_filter: { mode: "look", country: DE } },
      { ownCountry: null },
    );
    expect(screen.getByRole("button", { name: "Back to all postings" })).toBeTruthy();
  });
});
