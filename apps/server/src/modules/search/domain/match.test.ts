import { describe, expect, it } from "vitest";
import { compileMatcher } from "./match.js";

// The fixed AC-02 example list: [skill, text, matches].
const EXAMPLES: [string, string, boolean][] = [
  ["Go", "Senior Go engineer", true],
  ["Go", "Work at Google", false],
  ["Go", "MongoDB admin", false],
  ["Go", "go-to-market lead", true], // accepted noise
  ["Java", "Java developer", true],
  ["Java", "JavaScript developer", false],
  ["C#", "C# developer", true],
  ["C", "C# developer", false],
  ["C", "C++ developer", false],
  ["C", "Embedded C developer", true],
  [".NET", ".NET developer", true],
  [".NET", "ASP.NET developer", false],
  ["Node.js", "Node.js backend", true],
  ["Node.js", "Node backend", false],
  ["machine learning", "Machine Learning engineer", true],
  ["machine learning", "machine-learning engineer", false],
  ["machine learning", "machine  learning engineer", false],
  ["react", "REACT native", true],
  ["C++", "C++ developer", true],
  ["C++", "C developer", false],
  [".*", "anything at all", false],
  [".*", "regex .* fan", true],
  ["(", "a ( b", true],
  ["(", "no paren", false],
  ["%", "100% remote", false], // digit directly before
  ["%", "save 20 % now", true],
  ["%", "remote", false],
  ["Ångström", "ångström lab", true],
];

describe("compileMatcher (AC-02)", () => {
  it.each(EXAMPLES)("%j in a title of %j → %s", (skill, text, matches) => {
    const result = compileMatcher([skill]).match([{ title: text, description: "" }]);
    expect(result).toEqual(matches ? [{ skill, in_title: true }] : []);
  });

  it.each(EXAMPLES)("%j in a description of %j → %s", (skill, text, matches) => {
    const result = compileMatcher([skill]).match([{ title: "", description: text }]);
    expect(result).toEqual(matches ? [{ skill, in_title: false }] : []);
  });

  it("returns [] for no skills", () => {
    expect(compileMatcher([]).match([{ title: "React", description: "Go" }])).toEqual([]);
  });
});

describe("matched skills and in-title flags (AC-06)", () => {
  it("names matched skills in the owner's spelling and search order, title flag on React only", () => {
    const result = compileMatcher(["React", "TypeScript", "Go"]).match([
      { title: "Senior react engineer", description: "We use typescript daily." },
    ]);
    expect(result).toEqual([
      { skill: "React", in_title: true },
      { skill: "TypeScript", in_title: false },
    ]);
  });

  it("counts a skill as in-title when any listing's title has it (merged posting)", () => {
    const result = compileMatcher(["React"]).match([
      { title: "Frontend engineer", description: "React" },
      { title: "React engineer", description: "" },
    ]);
    expect(result).toEqual([{ skill: "React", in_title: true }]);
  });

  it("matches across listings: description in one, nothing in the other", () => {
    const result = compileMatcher(["Go"]).match([
      { title: "Backend", description: "" },
      { title: "Backend", description: "Go services" },
    ]);
    expect(result).toEqual([{ skill: "Go", in_title: false }]);
  });
});
