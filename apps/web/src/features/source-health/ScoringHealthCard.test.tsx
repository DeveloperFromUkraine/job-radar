import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import type { ScoringHealth } from "../../api/matching";
import { contractExample } from "../../test/contract";
import { ScoringHealthCard } from "./ScoringHealthCard";

const NOW = Date.parse("2026-10-15T09:00:00Z");
const example = (name: string) => contractExample<ScoringHealth>("getScoringHealth", 200, name);

const card = (props: Partial<Parameters<typeof ScoringHealthCard>[0]>) =>
  render(
    <MemoryRouter>
      <ScoringHealthCard hasProfile now={NOW} onRetry={() => {}} {...props} />
    </MemoryRouter>,
  );

describe("ScoringHealthCard (SCR-02)", () => {
  it("loading: one card-shaped placeholder", () => {
    const { container } = card({ loading: true });
    expect(container.querySelector("[data-testid=skeleton-row]")).toBeTruthy();
  });

  it("healthy: last success, spend against the cap, pending with the oldest age, could-not-score count (AC-14, AC-18)", () => {
    card({ health: example("healthy") });
    expect(screen.getByRole("heading", { name: "Scoring" })).toBeTruthy();
    expect(screen.getByText("Working")).toBeTruthy();
    expect(screen.getByText("Last scored 5 min ago")).toBeTruthy();
    expect(screen.getByText("$1.20 of $5.00 this month")).toBeTruthy();
    expect(screen.getByText("3 pending · oldest 10 min")).toBeTruthy();
    expect(screen.getByText("1 could not be scored this month")).toBeTruthy();
  });

  it("key refused: the reason in plain words and when scoring last succeeded, never the key (AC-14)", () => {
    const { container } = card({ health: example("key_refused") });
    expect(screen.getByText("Not scoring").className).toContain("text-danger");
    expect(
      screen.getByText(
        "The language-model provider refused job-radar's key. Set a valid key and restart job-radar.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("Last scored 12 h ago")).toBeTruthy();
    expect(container.textContent).not.toMatch(/sk-/);
  });

  it("cap reached: when scoring resumes, with Change cap (AC-12)", () => {
    card({ health: example("cap_reached") });
    expect(screen.getByText("Cap reached")).toBeTruthy();
    expect(screen.getByText("$4.98 of $5.00 — resumes on 1 November")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Change cap" }).getAttribute("href")).toBe("/profile");
  });

  it("no profile: scoring starts once a profile is set up", () => {
    card({ health: example("healthy"), hasProfile: false });
    expect(screen.getByText("Scoring starts once you set up your profile.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Set up profile" }).getAttribute("href")).toBe("/profile");
  });

  it("error: the API message with Retry", () => {
    const onRetry = vi.fn();
    card({ error: "Internal server error", onRetry });
    expect(screen.getByRole("alert").textContent).toContain("Internal server error");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalled();
  });

  it("never scored yet", () => {
    card({ health: { ...example("healthy"), last_success_at: null, could_not_score_count: 0 } });
    expect(screen.getByText("Not scored anything yet")).toBeTruthy();
    expect(screen.queryByText(/could not be scored/)).toBeNull();
  });
});
