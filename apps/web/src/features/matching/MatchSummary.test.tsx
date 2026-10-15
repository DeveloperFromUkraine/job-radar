import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Match } from "../../api/matching";
import type { MarkedResult, Posting, SearchResult } from "../../api/search";
import { contractExample } from "../../test/contract";
import { PostingCard } from "../search/PostingCard";
import { MatchSummary } from "./MatchSummary";
import { ScoreBadge } from "./ScoreBadge";

const NOW = Date.parse("2026-10-15T10:00:00Z");
const bestMatch = () => contractExample<SearchResult>("runSearch", 200, "best_match");
const scored = () => bestMatch().items[1]?.match as Match;
const pending = () => bestMatch().items[0]?.match as Match;
// The helper serves the older contracts' default examples first, so the stale card is built from
// match-score's best_match example with the getNextPage example's location check and score.
const stalePosting = (): Posting => ({
  ...(bestMatch().items[1] as Posting),
  location_check: "not_stated",
  match: {
    state: "scored",
    total: 41,
    parts: { skills: 40, role_type: 30, seniority: null, terms: null },
    note: 'Asks for TypeScript but centres on Kubernetes platform work. The posting says "US residents only".',
    claims: ["US residents only"],
    stale: "posting_changed",
    reason: null,
  },
});

const notScored = (state: Match["state"], reason: string): Match => ({
  state,
  total: null,
  parts: null,
  note: null,
  claims: [],
  stale: null,
  reason,
});

describe("ScoreBadge", () => {
  it.each([
    [88, "text-score-high"],
    [70, "text-score-high"],
    [69, "text-score-mid"],
    [40, "text-score-mid"],
    [39, "text-score-low"],
    [12, "text-score-low"],
  ])("tones %d with %s and names it for screen readers", (score, tone) => {
    render(<ScoreBadge score={score} />);
    const badge = screen.getByLabelText(`Match ${score} out of 100`);
    expect(badge.textContent).toBe(String(score));
    expect(badge.className).toContain(tone);
  });
});

describe("MatchSummary (SCR-01)", () => {
  it("scored: the number, 'match' and the fit note as plain text (AC-01)", () => {
    render(<MatchSummary match={scored()} />);
    expect(screen.getByLabelText("Match 88 out of 100")).toBeTruthy();
    expect(screen.getByText("match")).toBeTruthy();
    expect(screen.getByText(/^Matches your core TypeScript and React/)).toBeTruthy();
    expect(screen.queryByText("Skills")).toBeNull();
  });

  it("parts open in place on Details, with 'not stated' and the claims as the posting's words (AC-01, AC-03, AC-04)", () => {
    const match: Match = { ...scored(), parts: { skills: 95, role_type: 100, seniority: null, terms: 70 } };
    render(<MatchSummary match={match} />);
    const details = screen.getByRole("button", { name: "Details" });
    expect(details.className).toContain("min-h-11");
    expect(details.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(details);
    expect(screen.getByRole("button", { name: "Hide details" }).getAttribute("aria-expanded")).toBe("true");
    const rows = within(screen.getByRole("list", { name: "Score parts" }))
      .getAllByRole("listitem")
      .map((li) => li.textContent);
    expect(rows).toEqual(["Skills95", "Role type100", "Seniority not stated", "Terms70"]);
    expect(screen.getByText("The posting says: “visa sponsorship guaranteed”")).toBeTruthy();
  });

  it("renders a note with markup as literal text, never as markup (AC-03)", () => {
    const { container } = render(
      <MatchSummary
        match={{ ...scored(), note: 'Fits <b>well</b> <a href="https://evil.example.test">here</a>' }}
      />,
    );
    expect(container.querySelector("b")).toBeNull();
    expect(container.querySelector("a")).toBeNull();
    expect(screen.getByText('Fits <b>well</b> <a href="https://evil.example.test">here</a>')).toBeTruthy();
  });

  it("stale — posting changed and profile changed (AC-06, AC-10)", () => {
    const { rerender } = render(<MatchSummary match={{ ...scored(), stale: "posting_changed" }} />);
    expect(screen.getByText("Scored against an earlier version of this posting")).toBeTruthy();
    rerender(<MatchSummary match={{ ...scored(), stale: "profile_changed" }} />);
    expect(screen.getByText("Scored against your previous profile")).toBeTruthy();
    expect(screen.getByLabelText("Match 88 out of 100")).toBeTruthy();
  });

  it("pending: says it waits its turn, with no number", () => {
    render(<MatchSummary match={pending()} />);
    expect(screen.getByText("Not scored yet — waiting its turn").className).toContain("text-text-muted");
    expect(screen.queryByLabelText(/^Match \d+/)).toBeNull();
  });

  it("not scored: says why (AC-14)", () => {
    render(
      <MatchSummary
        match={notScored("not_scored", "the language-model provider can't be reached right now")}
      />,
    );
    expect(
      screen.getByText("Not scored — the language-model provider can't be reached right now"),
    ).toBeTruthy();
  });

  it("cap reached (AC-12)", () => {
    render(<MatchSummary match={notScored("cap_reached", "monthly cap reached")} />);
    expect(screen.getByText("Not scored — monthly cap reached")).toBeTruthy();
  });

  it("could not be scored, with the reason (AC-18)", () => {
    render(<MatchSummary match={notScored("could_not_score", "the fit note was longer than 40 words")} />);
    expect(screen.getByText("Could not be scored — the fit note was longer than 40 words")).toBeTruthy();
  });
});

describe("PostingCard with a match", () => {
  it("shows the match above the actions, the location check line untouched (AC-05)", () => {
    const p = stalePosting();
    render(<PostingCard posting={p} now={NOW} actions={<button type="button">Applied</button>} />);
    expect(screen.getByText("Check location")).toBeTruthy();
    expect(screen.getByLabelText("Match 41 out of 100")).toBeTruthy();
    expect(screen.getByText("Scored against an earlier version of this posting")).toBeTruthy();
    const article = screen.getByRole("article");
    const order = [...article.querySelectorAll("[data-match], button")].map((e) =>
      e.textContent?.slice(0, 7),
    );
    expect(order.at(-1)).toBe("Applied");
  });

  it("shows no match at all when match is null (no profile, AC-15)", () => {
    const p = contractExample<SearchResult>("runSearch", 200, "no_profile").items[0] as Posting;
    const { container } = render(<PostingCard posting={p} now={NOW} />);
    expect(container.querySelector("[data-match]")).toBeNull();
  });

  it("a low score is shown like any score; the card is there (AC-02)", () => {
    const p = { ...stalePosting(), match: { ...scored(), total: 12, stale: null } };
    render(<PostingCard posting={p} now={NOW} />);
    expect(screen.getByLabelText("Match 12 out of 100")).toBeTruthy();
    expect(screen.getByRole("article")).toBeTruthy();
  });

  it("the marked view shows the last score with its stale mark (AC-13 note)", () => {
    const example = contractExample<MarkedResult>("runMarkedView", 200).items[0];
    if (!example) throw new Error("no marked example");
    const marked = { ...example, match: { ...scored(), total: 76, stale: "profile_changed" as const } };
    render(<PostingCard posting={marked} now={NOW} />);
    expect(screen.getByLabelText("Match 76 out of 100")).toBeTruthy();
    expect(screen.getByText("Scored against your previous profile")).toBeTruthy();
  });
});
