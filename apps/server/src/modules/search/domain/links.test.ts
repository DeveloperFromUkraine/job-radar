import { describe, expect, it } from "vitest";
import { safeUrl } from "./links.js";

describe("safeUrl (AC-09)", () => {
  it.each(["https://jobs.example.test/1", "http://jobs.example.test/a?b=c"])("keeps %s", (url) => {
    expect(safeUrl(url)).toBe(url);
  });

  it.each([
    "javascript:alert(1)",
    " JavaScript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "ftp://jobs.example.test/1",
    "not a url",
    "",
  ])("drops %j", (url) => {
    expect(safeUrl(url)).toBeNull();
  });
});
