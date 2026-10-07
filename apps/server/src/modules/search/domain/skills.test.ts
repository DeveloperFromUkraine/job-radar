import { describe, expect, it } from "vitest";
import { parseSkills } from "./skills.js";

describe("parseSkills (AC-05)", () => {
  it.each([
    ["", []],
    [" , , ", []],
    ["React, react , REACT", ["React"]],
    [" machine learning ", ["machine learning"]],
    ["C#, C++, .NET", ["C#", "C++", ".NET"]],
    ["Go,,TypeScript", ["Go", "TypeScript"]],
  ])("accepts %j", (text, skills) => {
    expect(parseSkills(text)).toEqual({ ok: true, skills });
  });

  it.each([
    ["#", '"#" needs at least one letter or digit.'],
    ["React, --", '"--" needs at least one letter or digit.'],
    ["a".repeat(51), `"${"a".repeat(51)}" is longer than 50 characters.`],
    [Array.from({ length: 24 }, (_, i) => `s${i}`).join(","), "24 skills entered; search takes at most 20."],
    [Array.from({ length: 21 }, (_, i) => `s${i}`).join(","), "21 skills entered; search takes at most 20."],
  ])("refuses %j", (text, message) => {
    expect(parseSkills(text)).toEqual({ ok: false, message });
  });

  it("accepts a 50-char skill and Unicode letters", () => {
    expect(parseSkills(`${"a".repeat(50)}, Ångström`)).toEqual({
      ok: true,
      skills: ["a".repeat(50), "Ångström"],
    });
  });

  it("counts the limit after dedupe", () => {
    const text = [...Array.from({ length: 20 }, (_, i) => `s${i}`), "S0"].join(",");
    expect(parseSkills(text)).toMatchObject({ ok: true });
  });
});
