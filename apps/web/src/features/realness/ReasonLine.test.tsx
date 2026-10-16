import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Realness } from "../../api/search";
import { ReasonLine } from "./ReasonLine";

const line = (realness: Realness | null, order: "newest" | "best_match" = "best_match") =>
  render(<ReasonLine realness={realness} order={order} />).container.textContent;

describe("ReasonLine (SCR-01, AC-02)", () => {
  const ac02: Realness = {
    penalty: 25,
    signals: [{ kind: "age", basis: "first_found", days: 47 }, { kind: "repost" }, { kind: "no_salary" }],
  };

  it("names every signal, Lowered in best match first and Signals in newest first", () => {
    expect(line(ac02, "best_match")).toBe("Lowered: first found 47 days ago · reposted · no salary listed");
    expect(line(ac02, "newest")).toBe("Signals: first found 47 days ago · reposted · no salary listed");
  });

  it("says posted only for the publication-time basis", () => {
    expect(line({ penalty: 20, signals: [{ kind: "age", basis: "posted", days: 65 }] })).toBe(
      "Lowered: posted 65 days ago",
    );
  });

  it("reads many boards with the first-found age", () => {
    expect(line({ penalty: 15, signals: [{ kind: "many_boards", boards: 4, days: 50 }] }, "newest")).toBe(
      "Signals: on 4 boards · first found 50 days ago",
    );
  });

  it("renders nothing without realness", () => {
    expect(line(null)).toBe("");
  });

  it("uses the muted small text token and wraps", () => {
    render(<ReasonLine realness={ac02} order="best_match" />);
    const p = screen.getByText(/^Lowered:/);
    expect(p.className).toContain("text-sm");
    expect(p.className).toContain("text-text-muted");
    expect(p.className).not.toContain("truncate");
  });
});
