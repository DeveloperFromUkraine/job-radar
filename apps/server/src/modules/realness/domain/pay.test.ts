import { describe, expect, it } from "vitest";
import { statesPay } from "./pay.js";
import { PAY_FIXTURES } from "./pay-fixtures.js";

describe("statesPay — AC-06 examples", () => {
  it.each([
    "$120k",
    "120–150K USD",
    "PLN 20 000–25 000 net B2B",
    "18 000 zł/mies.",
    "€60,000 a year",
    "30k/month",
    "$50-$75 /hour", // Remotive's own field
    "salary: $1", // accepted: it can only avoid a lowering (spec §6.1)
  ])("reads %j as pay", (text) => {
    expect(statesPay(text)).toBe(true);
  });

  it.each([
    "",
    "competitive",
    "DOE",
    "attractive package",
    "market rate",
    "$5M Series A",
    "$2,000 learning budget",
    "$1B ARR",
  ])("does not read %j as pay", (text) => {
    expect(statesPay(text)).toBe(false);
  });

  // Review F-01: only the words right after the amount name it; a perk later in the clause doesn't.
  it.each([
    "Salary: $120,000 per year with a professional development budget",
    "€60,000 a year and great equipment",
    "$120k for this role, and a training budget",
    "Compensation is $95,000, plus a $2,000 learning budget",
    "USD 80,000 per year, equity and a home office stipend",
    "Base Salary Range 1 130 000 Kč—1 410 000 Kč CZK", // a cued million is a salary in koruna
  ])("reads %j as pay despite a perk later in the clause", (text) => {
    expect(statesPay(text)).toBe(true);
  });

  it.each([
    "The team handles $3,000,000 of transactions",
    "We processed €12,500,000 last year",
    "$500 home office stipend",
    "$1,000 per year for equipment",
    "a $2,000 annual learning budget",
  ])("does not read %j as pay", (text) => {
    expect(statesPay(text)).toBe(false);
  });

  it("finds pay inside a longer description and ignores non-pay amounts around it", () => {
    expect(
      statesPay(
        "We raised a $5M Series A. Senior Engineer — salary range $145,000 - $160,000 + bonus + benefits.",
      ),
    ).toBe(true);
    expect(statesPay("Fresh off a US$75M Series C. $1500 USD annual Learning & Development budget.")).toBe(
      false,
    );
    expect(statesPay("Benefits: 401(k) match, 401k plan, 100% remote. Pay in USD 100% remote work")).toBe(
      false,
    );
  });
});

describe("statesPay — labelled set (spec §6 Salary rule accuracy)", () => {
  it("has the agreed shape: ≥ 100 postings, ≥ 20 field-only, ≥ 20 with non-pay amounts", () => {
    expect(PAY_FIXTURES.length).toBeGreaterThanOrEqual(100);
    expect(PAY_FIXTURES.filter((f) => f.kind === "pay_field").length).toBeGreaterThanOrEqual(20);
    expect(PAY_FIXTURES.filter((f) => f.kind === "non_pay_amount").length).toBeGreaterThanOrEqual(20);
  });

  it("decides at least 95% right", () => {
    const misses = PAY_FIXTURES.filter((f) => statesPay(f.text) !== f.statesPay);
    if (misses.length)
      console.log(
        "pay misses:",
        misses.map((m) => `${m.statesPay} ${m.text.slice(0, 120)}`),
      );
    expect(1 - misses.length / PAY_FIXTURES.length).toBeGreaterThanOrEqual(0.95);
  });
});
