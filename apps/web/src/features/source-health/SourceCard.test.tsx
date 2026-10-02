import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { SourceHealth, SourceHealthRow } from "../../api/collector";
import { contractExample } from "../../test/contract";
import { SourceCard } from "./SourceCard";

const NOW = Date.parse("2026-10-02T12:00:00Z");
const MIN = 60_000;
const iso = (offsetMs: number) => new Date(NOW + offsetMs).toISOString();

// Rows start from the contract's own example and change only what each state needs.
const exampleRow = (index: number) =>
  contractExample<SourceHealth>("getSourceHealth", 200, "collected").sources[index] as SourceHealthRow;
const healthy = (): SourceHealthRow => ({
  ...exampleRow(0),
  source_id: "jobicy",
  state: "enabled",
  last_success_at: iso(-40 * MIN),
  next_due_at: iso(20 * MIN),
  flags: [],
  last_outcome: {
    source_id: "jobicy",
    outcome: "complete",
    failure_reason: null,
    counts: { added: 4, updated: 1, closed: 0, held: 0, no_category: 0 },
    fetch_finished_at: iso(-40 * MIN),
  },
  fill: { status: "complete", reached_at: null, next_part_due_at: null, completed_at: iso(-1000 * MIN) },
  reads: { last_60_min: 1, last_24_h: 23 },
  freshness: { p90_minutes: 204, sample_size: 50, without_publication_time: 0 },
});
const card = (row: SourceHealthRow) => render(<SourceCard row={row} now={NOW} />);

describe("SourceCard (SCR-02 source card states)", () => {
  it("healthy: last success, last run counts, next due, reads and freshness (AC-12)", () => {
    card(healthy());

    const name = screen.getByRole("link", { name: "Jobicy" });
    expect(name.getAttribute("href")).toBe("https://jobicy.com");
    expect(screen.getByText("Enabled")).toBeTruthy();
    expect(screen.getByText("Last success 40 min ago")).toBeTruthy();
    expect(screen.getByText("Last run: +4 new · 1 updated · 0 closed · 0 held")).toBeTruthy();
    expect(screen.getByText("Next due in 20 min")).toBeTruthy();
    expect(screen.getByText("Reads 24 h: 23 · Fresh p90: 3.4 h")).toBeTruthy();
    expect(screen.getByText("Last success 40 min ago").getAttribute("title")).toBeTruthy();
  });

  it("flagged: the failure reason in plain words (AC-03, AC-13)", () => {
    const remotive = exampleRow(0); // the contract example: Remotive failing
    card(remotive);

    expect(screen.getByText("Problem")).toBeTruthy();
    expect(
      screen.getByText(/Failed on the last 2 due runs - the source did not answer within 30 seconds\./),
    ).toBeTruthy();
  });

  it("possibly changed: held-back closures shown as held, with the number (AC-14)", () => {
    const row = healthy();
    row.flags = [
      {
        kind: "held_back",
        reason: "Would close 42% of its 31 open postings - 13 closures held back.",
        raised_at: iso(0),
        raises_marker: true,
      },
    ];
    if (row.last_outcome)
      row.last_outcome.counts = { added: 2, updated: 0, closed: 0, held: 13, no_category: 0 };
    card(row);

    expect(screen.getByText("Problem")).toBeTruthy();
    expect(
      screen.getByText(/Would close 42% of its 31 open postings - 13 closures held back\./),
    ).toBeTruthy();
    expect(screen.getByText("Last run: +2 new · 0 updated · 0 closed · 13 held")).toBeTruthy();
  });

  it("unusual unknown-location share names the share (AC-25)", () => {
    const row = healthy();
    row.flags = [
      {
        kind: "unknown_location",
        reason: "60% of new listings state no location restriction (usually 20%).",
        raised_at: iso(0),
        raises_marker: true,
      },
    ];
    card(row);
    expect(screen.getByText(/60% of new listings state no location restriction/)).toBeTruthy();
  });

  it("category notice: shown on the card without the problem badge (AC-23, AC-24)", () => {
    const row = healthy();
    row.flags = [
      {
        kind: "category_unmatched",
        reason: 'Category "devops" matched nothing at the source.',
        raised_at: iso(0),
        raises_marker: false,
      },
    ];
    if (row.last_outcome) row.last_outcome.counts.no_category = 3;
    card(row);

    expect(screen.queryByText("Problem")).toBeNull();
    expect(screen.getByText('Category "devops" matched nothing at the source.')).toBeTruthy();
    expect(screen.getByText("3 listings had no category and were skipped.")).toBeTruthy();
  });

  it("filling: how far the 30-day fill has reached and when it continues (AC-19)", () => {
    const row = healthy();
    row.fill = {
      status: "continuing",
      reached_at: "2026-09-14T08:00:00Z",
      next_part_due_at: iso(6 * 60 * MIN),
      completed_at: null,
    };
    card(row);
    expect(screen.getByText(/Filling the last 30 days: reached 14 Sep · next part in 6 h/)).toBeTruthy();
  });

  it("disabled: postings kept, no next due (AC-26)", () => {
    card(exampleRow(1)); // the contract example: We Work Remotely disabled
    expect(screen.getByText("Disabled")).toBeTruthy();
    expect(screen.getByText("Disabled in your settings. Its postings are kept.")).toBeTruthy();
    expect(screen.queryByText(/Next due/)).toBeNull();
  });

  it("not verified: enabled but never read until its limits are verified (AC-27)", () => {
    card({ ...exampleRow(1), state: "not_verified" });
    expect(screen.getByText("Not verified")).toBeTruthy();
    expect(screen.getByText("Enabled, not read until its limits are verified.")).toBeTruthy();
  });

  it("never collected: says so with its next due time", () => {
    card({ ...healthy(), last_success_at: null, last_outcome: null, next_due_at: iso(MIN) });
    expect(screen.getByText("Not collected yet · due in 1 min")).toBeTruthy();
  });

  it("renders reasons from the API as text, never as markup", () => {
    const row = healthy();
    row.flags = [
      { kind: "failing", reason: "<img src=x onerror=alert(1)>", raised_at: iso(0), raises_marker: true },
    ];
    const { container } = card(row);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText(/<img src=x onerror=alert\(1\)>/)).toBeTruthy();
  });
});
