import { describe, expect, it } from "vitest";
import { boardPage, findBoards, nameKey, rolesOf, slugGuesses } from "./ats.js";

describe("company job boards", () => {
  it("finds each board linked from a text once, whatever the link's form", () => {
    const text = `
      Apply: https://job-boards.greenhouse.io/Vercel/jobs/6136160004
      <iframe src="https://boards.greenhouse.io/embed/job_board?for=airbnb"></iframe>
      https://boards.greenhouse.io/vercel and https://jobs.lever.co/spotify/223f9722
      https://jobs.eu.lever.co/toptal https://jobs.ashbyhq.com/linear/d3bc1ced`;
    expect(findBoards(text)).toEqual([
      { ats: "greenhouse", slug: "vercel" },
      { ats: "greenhouse", slug: "airbnb" },
      { ats: "lever", slug: "spotify" },
      { ats: "lever", slug: "toptal" },
      { ats: "ashby", slug: "linear" },
    ]);
    expect(findBoards("https://boards.greenhouse.io/embed/")).toEqual([]);
    expect(findBoards("Apply at https://jobs.lever.co/peerspace.")).toEqual([
      { ats: "lever", slug: "peerspace" },
    ]);
  });

  it("guesses board names from a company name, legal forms dropped", () => {
    expect(slugGuesses("Lemon.io")).toEqual(["lemonio", "lemon-io"]);
    expect(slugGuesses("Pivotal Health, Inc.")).toEqual(["pivotalhealth", "pivotal-health"]);
    expect(slugGuesses("Airbnb")).toEqual(["airbnb"]);
    expect(slugGuesses("Example Sp. z o.o.")).toEqual(["example"]);
    expect(slugGuesses("—")).toEqual([]);
  });

  it("compares company names by letters and digits only", () => {
    expect(nameKey("Lemon.io")).toBe(nameKey("lemon io"));
    expect(nameKey("Zürich AG")).toBe("zürichag");
  });

  it("sorts a title into the roles it names", () => {
    expect(rolesOf("Senior Frontend Engineer (React)")).toEqual(["frontend"]);
    expect(rolesOf("Senior / Staff Fullstack Engineer")).toEqual(["fullstack"]);
    expect(rolesOf("React Native Developer")).toEqual(["mobile"]);
    expect(rolesOf("Senior Software Engineer, Payments")).toEqual(["software"]);
    expect(rolesOf("Senior Data Engineer")).toEqual([]);
    expect(rolesOf("Account Executive, Commercial")).toEqual([]);
  });

  it("links a board to the page a person opens", () => {
    expect(boardPage({ ats: "ashby", slug: "linear" })).toBe("https://jobs.ashbyhq.com/linear");
  });
});
