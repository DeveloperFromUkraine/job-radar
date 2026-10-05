import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Posting, PostingPage, SearchResult } from "../../api/search";
import { contractExample } from "../../test/contract";
import { PostingCard } from "./PostingCard";

const NOW = Date.parse("2026-10-05T08:00:00Z");
const found = () => contractExample<SearchResult>("runSearch", 200, "found").items[0] as Posting;
const unknownTime = () => contractExample<PostingPage>("getNextPage", 200).items[0] as Posting;

const card = (p: Posting) => render(<PostingCard posting={p} now={NOW} />);

describe("PostingCard (SCR-01)", () => {
  it("shows title, company, publication time and the New mark (AC-07, AC-14)", () => {
    card(found());
    expect(screen.getByText("Senior React Engineer").className).toContain("font-medium");
    expect(screen.getByText("Example Co").className).toContain("text-text-muted");
    const time = screen.getByText(/^Published 2 days ago$/);
    expect(time.tagName).toBe("TIME");
    expect(time.getAttribute("datetime")).toBe("2026-10-03T08:00:00Z");
    expect(time.getAttribute("title")).toBe("Sat, 03 Oct 2026 08:00:00 GMT");
    expect(screen.getByText("New").className).toContain("bg-accent text-accent-contrast");
  });

  it("says when the publication time is unknown, with when it was first seen (AC-03, AC-07)", () => {
    card(unknownTime());
    expect(screen.getByText("Publication time unknown · first seen 1 Oct")).toBeTruthy();
    expect(screen.queryByText("New")).toBeNull();
  });

  it("shows matched skills in the owner's spelling and order, in-title marked, never others (AC-06)", () => {
    const { container } = card(found());
    const chips = [...container.querySelectorAll("[data-skill]")].map((c) => c.textContent);
    expect(chips).toEqual(["React · title", "TypeScript"]);
    expect(screen.queryByText(/^Go/)).toBeNull();
  });

  it("shows no chips in the feed (AC-10)", () => {
    const { container } = card({ ...found(), matched_skills: [] });
    expect(container.querySelectorAll("[data-skill]")).toHaveLength(0);
  });

  it("names every source: an open listing linked in a new tab, a closed one marked without a link (AC-07, AC-08)", () => {
    card(found());
    const link = screen.getByRole("link", { name: "Jobicy" });
    expect(link.getAttribute("href")).toBe("https://jobs.example.test/jobicy/123");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(link.className).toContain("min-h-11");
    expect(link.parentElement?.textContent).toContain("Jobicy — Europe");

    const himalayas = screen.getByText("closed at Himalayas");
    expect(himalayas.className).toContain("text-text-muted");
    expect(himalayas.parentElement?.textContent).toContain("Himalayas — unknown");
    expect(screen.queryByRole("link", { name: "Himalayas" })).toBeNull();
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });

  it("names an open listing without a safe link, and an unknown source by its id (AC-09)", () => {
    const p = unknownTime();
    card({
      ...p,
      listings: [
        ...p.listings,
        { source_id: "remoteok", status: "open", url: null, location_restriction: null },
      ],
    });
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(screen.getByText(/Remotive — Worldwide/)).toBeTruthy();
    expect(screen.getByText(/remoteok — unknown/)).toBeTruthy();
  });

  it("renders hostile source text as plain text, never as markup (AC-09)", () => {
    const hostile = '<img src=x onerror="alert(1)">';
    const { container } = card({
      ...found(),
      title: hostile,
      company: "<script>alert(1)</script>",
      listings: [
        {
          source_id: "jobicy",
          status: "open",
          url: "https://jobs.example.test/1",
          location_restriction: "<b>EU</b>",
        },
      ],
    });
    expect(container.querySelector("img, script, b")).toBeNull();
    expect(screen.getByText(hostile)).toBeTruthy();
    expect(within(container).getByText(/<b>EU<\/b>/)).toBeTruthy();
  });

  it("wraps long text instead of scrolling sideways at 360 px", () => {
    const { container } = card({ ...found(), title: "x".repeat(300) });
    expect((container.firstElementChild as HTMLElement).className).toContain("break-words");
  });
});
