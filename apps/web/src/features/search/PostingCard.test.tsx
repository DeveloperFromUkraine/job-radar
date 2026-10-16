import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { MarkedPosting, MarkedResult, Posting, PostingPage, SearchResult } from "../../api/search";
import { contractExample } from "../../test/contract";
import { PostingCard } from "./PostingCard";

const NOW = Date.parse("2026-10-05T08:00:00Z");
const found = () => contractExample<SearchResult>("runSearch", 200, "found").items[0] as Posting;
const unknownTime = () => contractExample<PostingPage>("getNextPage", 200).items[0] as Posting;

const card = (p: Posting) => render(<PostingCard posting={p} now={NOW} />);

describe("PostingCard (SCR-01)", () => {
  it("shows title, company, publication time and the New mark (AC-07, AC-14)", () => {
    card(found());
    expect(screen.getByRole("heading", { name: "Senior React Engineer" }).className).toContain("font-medium");
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
    expect(screen.getAllByRole("link")).toHaveLength(2);
  });

  it("links the title to the first open listing in a new tab, so the owner can go and apply", () => {
    const p = found();
    card(p);
    const title = screen.getByRole("link", { name: p.title });
    expect(title.closest("h3")).not.toBeNull();
    expect(title.getAttribute("href")).toBe("https://jobs.example.test/jobicy/123");
    expect(title.getAttribute("target")).toBe("_blank");
    expect(title.getAttribute("rel")).toBe("noopener noreferrer");
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

  it("keeps a short source link at least 44 px wide as well as tall", () => {
    card(found());
    const link = screen.getByRole("link", { name: "Jobicy" });
    expect(link.className).toContain("min-h-11");
    expect(link.className).toContain("min-w-11");
  });

  describe("applied-skipped additions", () => {
    const withHint = () =>
      contractExample<SearchResult>("runSearch", 200, "found_with_hint").items[0] as Posting;
    const marked = () => contractExample<MarkedResult>("runMarkedView", 200).items[0] as MarkedPosting;

    it("says when a posting looks like one the owner marked, as plain text (AC-10)", () => {
      card(withHint());
      const line = screen.getByText("You applied to a similar posting at Acme Inc on 3 Oct");
      expect(line.className).toContain("text-text-muted");
    });

    it("shows no look-alike line without a hint (AC-11)", () => {
      card({ ...withHint(), look_alike: null });
      expect(screen.queryByText(/similar posting/)).toBeNull();
    });

    it("names a skipped look-alike as skipped", () => {
      const p = withHint();
      card({ ...p, look_alike: { mark: "skipped", marked_at: "2026-10-01T10:00:00Z", company: "Acme Inc" } });
      expect(screen.getByText("You skipped a similar posting at Acme Inc on 1 Oct")).toBeTruthy();
    });

    it("shows the marked variant: mark badge and date, Closed, no New badge (AC-05)", () => {
      render(<PostingCard posting={marked()} now={NOW} />);
      expect(screen.getByText("Applied").className).toContain("border-border text-text");
      expect(screen.getByText("Applied on 3 Oct")).toBeTruthy();
      expect(screen.getByText("Closed")).toBeTruthy();
      expect(screen.queryByText("New")).toBeNull();
      expect(screen.queryByRole("link")).toBeNull();
    });

    it("labels a cleared closed posting with its removal date (AC-07)", () => {
      const p = marked();
      render(
        <PostingCard
          posting={{ ...p, mark_state: { ...p.mark_state, mark: null, removed_after: "2026-10-08" } }}
          now={NOW}
        />,
      );
      expect(screen.getByText("Cleared")).toBeTruthy();
      expect(screen.getByText("Cleared · removed after 8 Oct")).toBeTruthy();
    });

    it("labels a cleared closed posting Cleared even with no removal date (age frozen, AC-07)", () => {
      const p = marked();
      render(
        <PostingCard
          posting={{ ...p, mark_state: { ...p.mark_state, mark: null, removed_after: null } }}
          now={NOW}
        />,
      );
      expect(screen.getAllByText("Cleared")).toHaveLength(2); // the badge and the mark line
      expect(screen.queryByText("Not marked")).toBeNull();
    });

    it("renders actions and a banner at the bottom of the card", () => {
      render(
        <PostingCard
          posting={withHint()}
          now={NOW}
          banner={<p>banner</p>}
          actions={<button type="button">act</button>}
        />,
      );
      const article = screen.getByRole("article");
      expect(article.lastElementChild?.textContent).toBe("act");
      expect(screen.getByText("banner")).toBeTruthy();
    });
  });

  describe("check location (remote-filter AC-02)", () => {
    it.each([
      ["exception", "Mentions an exception"],
      ["hours_only", "Only working hours fit"],
      ["not_recognised", "Location not recognised"],
      ["not_stated", "Location not stated"],
    ] as const)("%s: the Check location badge with its reason line", (reason, line) => {
      card({ ...found(), location_check: reason });
      expect(screen.getByText("Check location").className).toContain("border-border text-text");
      expect(screen.getByText(line)).toBeTruthy();
    });

    it("shows no check mark when the posting fits or the list has no filter", () => {
      card({ ...found(), location_check: null });
      expect(screen.queryByText("Check location")).toBeNull();
    });
  });
});

describe("PostingCard reason line (realness-score SCR-01)", () => {
  const lowered = () =>
    contractExample<SearchResult>("runSearch", 200, "best_match_lowered").items.find(
      (p) => p.realness,
    ) as Posting;

  it("shows the reason under the match, prefixed for the list's order", () => {
    render(<PostingCard posting={lowered()} now={NOW} order="best_match" />);
    expect(screen.getByText("Lowered: posted 65 days ago · no salary listed")).toBeTruthy();
    expect(screen.getByText(/92/)).toBeTruthy(); // the score is unchanged
  });

  it("no realness, no line", () => {
    render(<PostingCard posting={{ ...lowered(), realness: null }} now={NOW} order="best_match" />);
    expect(screen.queryByText(/^Lowered:|^Signals:/)).toBeNull();
  });

  it("a look-alike that is reposted keeps its look-alike line and names the repost", () => {
    const p: Posting = {
      ...lowered(),
      look_alike: { mark: "skipped", company: "Example Co", marked_at: "2026-09-02T10:00:00Z" },
      realness: { penalty: 10, signals: [{ kind: "repost" }] },
    };
    render(<PostingCard posting={p} now={NOW} order="newest" />);
    expect(screen.getByText(/You skipped a similar posting at Example Co/)).toBeTruthy();
    expect(screen.getByText("Signals: reposted")).toBeTruthy();
  });

  it("never builds the line from posting text", () => {
    const p = { ...lowered(), title: "Lowered: no signals here · reposted", company: "Signals: none" };
    render(<PostingCard posting={p} now={NOW} order="best_match" />);
    expect(screen.getByText("Lowered: posted 65 days ago · no salary listed")).toBeTruthy();
  });
});
