import { describe, expect, it } from "vitest";
import { dryRunProvider, runEvaluation } from "../scripts/eval-match-score.js";
import { fakeProvider, scoreAnswer } from "./helpers/fake-provider.js";

// The evaluation script itself stays tested: its real-model run is manual (test-plan.md).
describe("eval-match-score (dry run)", () => {
  it("passes every check against the deterministic stand-in", async () => {
    const rows = await runEvaluation(dryRunProvider);
    expect(rows.map((r) => r.check)).toEqual([
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
});
