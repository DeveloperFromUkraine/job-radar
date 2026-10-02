import { describe, expect, it } from "vitest";
import type { RawListing } from "./adapter.js";
import { filterByCategories, normalizeListing, toLocationRestriction, toPlainText } from "./listing.js";

const raw = (over: Partial<RawListing> = {}): RawListing => ({
  sourceItemId: "item-1",
  url: "https://jobs.example.test/1",
  title: "Senior Backend Engineer",
  company: "Example Co",
  description: "<p>Build things.</p>",
  locationRestriction: "Worldwide",
  categories: ["Software Engineering"],
  publishedAt: 1_790_000_000_000,
  expiresAt: null,
  ...over,
});

describe("plain text (sad §8 untrusted content, spec §6.1)", () => {
  it("drops script blocks and tags from a title", () => {
    expect(toPlainText("<script>alert(1)</script>Senior <b>Dev</b>", { singleLine: true })).toBe(
      "Senior Dev",
    );
  });

  it("decodes entities", () => {
    expect(
      toPlainText("R&amp;D &lt;Team&gt; &#8211; &quot;core&quot; &#x27;x&#x27;", { singleLine: true }),
    ).toBe("R&D <Team> – \"core\" 'x'");
  });

  it("keeps paragraph breaks in a description but no markup", () => {
    expect(toPlainText("<p>One</p><p>Two<br>Three</p><ul><li>A</li><li>B</li></ul>")).toBe(
      "One\nTwo\nThree\nA\nB",
    );
  });

  it("collapses whitespace", () => {
    expect(toPlainText("  a \n\n\n  b  ", { singleLine: true })).toBe("a b");
  });
});

describe("location restriction (AC-21, AC-22)", () => {
  it("keeps a stated restriction exactly as stated", () => {
    expect(toLocationRestriction("USA, Canada")).toBe("USA, Canada");
    expect(toLocationRestriction("Worldwide")).toBe("Worldwide");
  });

  it("joins a list of stated places in the source's order", () => {
    expect(toLocationRestriction(["Poland", "Germany", "UTC+1"])).toBe("Poland, Germany, UTC+1");
  });

  it.each([[null], [undefined], [""], ["   "], [[]], [["", " "]]])(
    "records %j as unknown, never anywhere",
    (value) => {
      expect(toLocationRestriction(value)).toBeNull();
    },
  );
});

describe("normalizing a listing", () => {
  it("turns a raw listing into plain text fields named after the source", () => {
    const listing = normalizeListing(
      "jobicy",
      raw({
        title: "<b>Senior</b> Backend Engineer",
        company: "Example &amp; Co",
        locationRestriction: ["EU"],
      }),
    );
    expect(listing).toEqual({
      sourceId: "jobicy",
      sourceItemId: "item-1",
      url: "https://jobs.example.test/1",
      title: "Senior Backend Engineer",
      company: "Example & Co",
      description: "Build things.",
      locationRestriction: "EU",
      categories: ["Software Engineering"],
      publishedAt: 1_790_000_000_000,
      expiresAt: null,
    });
  });
});

describe("category filter (AC-23)", () => {
  const owner = ["Software Engineering", "DevOps & Infrastructure"];

  it("keeps a listing in one of the owner's categories", () => {
    const { kept } = filterByCategories([normalizeListing("jobicy", raw())], owner);
    expect(kept).toHaveLength(1);
  });

  it("keeps a listing in several categories if at least one is listed", () => {
    const listing = normalizeListing(
      "jobicy",
      raw({ categories: ["Marketing & Sales", "DevOps & Infrastructure"] }),
    );
    expect(filterByCategories([listing], owner).kept).toHaveLength(1);
  });

  it("drops a listing whose categories are all off the list", () => {
    const listing = normalizeListing("jobicy", raw({ categories: ["Marketing & Sales"] }));
    expect(filterByCategories([listing], owner)).toEqual({ kept: [], noCategory: 0 });
  });

  it("drops and counts a listing with no category", () => {
    const listing = normalizeListing("jobicy", raw({ categories: [] }));
    expect(filterByCategories([listing], owner)).toEqual({ kept: [], noCategory: 1 });
  });
});
