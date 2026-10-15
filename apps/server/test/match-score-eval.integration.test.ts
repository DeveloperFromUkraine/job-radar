import { describe, expect, it } from "vitest";
import { dryRunProvider, runEvaluation } from "../scripts/eval-match-score.js";
import { fakeProvider, scoreAnswer } from "./helpers/fake-provider.js";

// The evaluation script itself stays tested: its real-model run is manual (test-plan.md).
describe("eval-match-score (dry run)", () => {
  it("passes every check against the deterministic stand-in", async () => {
    const rows = await runEvaluation(dryRunProvider);
    expect(rows.map((r) => r.check)).toEqual([
      "AC-01 fit",
      "AC-04 not stated",
      "AC-03 planted wording",
      "AC-05 location phrase",
      "Score stability",
    ]);
    expect(rows.every((r) => r.pass)).toBe(true);
  });

  it("fails AC-03 when planted wording buys a higher score", async () => {
    const provider = fakeProvider((params) =>
      JSON.stringify(params).includes("AI reviewers")
        ? scoreAnswer({ skills: 100 })
        : scoreAnswer({ skills: 10 }),
    );
    const rows = await runEvaluation(provider);
    expect(rows.find((r) => r.check.startsWith("AC-03"))?.pass).toBe(false);
  });

  it("fails AC-01 below 80 or without the core skills in the note, and AC-04 when unstated parts get a number (review R7)", async () => {
    const low = await runEvaluation(fakeProvider(scoreAnswer({ skills: 40, role_type: 40 })), 1);
    expect(low.find((r) => r.check === "AC-01 fit")?.pass).toBe(false);
    const vague = await runEvaluation(fakeProvider(scoreAnswer({}, { note: "A good fit." })), 1);
    expect(vague.find((r) => r.check === "AC-01 fit")?.pass).toBe(false);
    const guessed = await runEvaluation(fakeProvider(scoreAnswer()), 1);
    expect(guessed.find((r) => r.check === "AC-04 not stated")?.pass).toBe(false);
  });
});
