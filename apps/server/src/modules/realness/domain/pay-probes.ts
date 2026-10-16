// Hand-written probes for the salary rule, collected over the three realness-score review rounds of
// 2026-10-16 (_review/review-2026-10-16*.md). Unlike PAY_FIXTURES (real excerpts, ≥ 95% right), every probe
// must be decided right: each one is a case a change to pay.ts has already got wrong once. A wrong
// "no salary" is the harmful direction (spec §1); a false pay only avoids a lowering (spec §6.1).
import type { PayFixture } from "./pay-fixtures.js";

const text = (statesPay: boolean, ...texts: string[]): PayFixture[] =>
  texts.map((t) => ({ source: "review probe", kind: "text", text: t, statesPay }));
const field = (statesPay: boolean, ...texts: string[]): PayFixture[] =>
  texts.map((t) => ({ source: "review probe", kind: "pay_field", text: t, statesPay }));

export const PAY_PROBES: PayFixture[] = [
  // A salary, then perks or add-ons: still a salary (F-01, H-01).
  ...text(
    true,
    "Salary: $120,000 per year with a professional development budget",
    "€60,000 a year and great equipment",
    "$120k for this role, and a training budget",
    "Compensation is $95,000, plus a $2,000 learning budget",
    "USD 80,000 per year, equity and a home office stipend",
    "$150k base salary with equity",
    "$150,000 and equity",
    "$150k with equity",
    "$90,000, equity",
    "$120K and a bonus",
    "$90,000 with an annual bonus",
    "Salary: $150,000 and equity",
    "Base salary of $150k and equity",
    "Base: $165,000 with equity and benefits",
    "Pay: €70,000 with a training budget",
    "USD 150,000 - 180,000 and equity",
    "120,000 - 150,000 EUR and equity",
    "20 000 – 25 000 PLN with a learning budget",
    "$95,000 – $120,000 with stock options",
    "salary of $85k with a $3k home office budget",
    "$70k and great benefits",
    "$100k with full benefits",
    "€50,000 and a €5,000 relocation package",
    "$4,000/month and equipment",
    "$90k-$110k, plus bonus",
    "€60,000 annual, plus bonus",
    "$100k annual salary",
    "$80,000 annually and equity",
  ),
  // Line breaks and bullets end a clause (H-01).
  ...text(
    true,
    "Base salary: $150,000\nBonus: 10% target",
    "Salary: $120,000\n• Equity",
    "Salary: €70,000\nTraining budget: €1,000",
  ),
  // High-nominal and Czech salaries (G-02, G-04).
  ...text(
    true,
    "¥6,000,000 per year",
    "1 130 000 Kč – 1 410 000 Kč per year",
    "Base Salary Range 1 130 000 Kč—1 410 000 Kč CZK",
    "Mzda 1 130 000 Kč ročně",
    "€1,200,000 a year",
    "$999,999 per year",
  ),
  // Other ISO codes, and a pay word before a bare amount (H-02).
  ...text(
    true,
    "Salary: SGD 8,000",
    "Salary range: NZD 120,000 - 140,000",
    "120,000 - 140,000 NZD per year",
    "50 000 SEK per month",
    "10,000 BRL per month",
    "Salary: 6,000,000 JPY per year",
    "Salary: 120,000",
  ),
  // Amounts that name only perks or company money (F-01, G-03, H-03).
  ...text(
    false,
    "The team handles $3,000,000 of transactions",
    "We processed €12,500,000 last year",
    "$500 home office stipend",
    "$1,000 per year for equipment",
    "a $2,000 annual learning budget",
    "A $2,000 home office and learning budget",
    "$1,200 gym and wellness allowance per year",
    "$5,000 with a laptop and conference budget",
    "$2,000, for your learning budget",
    "$1,200,000 seed round",
    "$1,500 annual wellness and learning stipend",
    "$10,000 relocation and visa support",
    "Personal learning and development budget of USD 2,000 per year Annual compensation review",
    "$5,000 signing bonus",
    "$300 monthly internet allowance",
    "Up to $2,500,000 in funding",
    "2 weeks paid vacation, $1,000 for conferences",
    "$2,500 home office setup and equipment budget",
    "We have 3,000 customers and $20M ARR",
    "$500 per month for coworking",
    "$1,000 per year for health and wellness",
    "$75/month wellness",
    "$2,500 home office setup",
    "$5,000 sign-on",
    "$1,500 yearly travel",
    // Three capitals beside a number are not always a currency (re-review 2 fix, R09).
    "ISO 27001 certified",
    "SOC 2 and ISO 9001 audits",
  ),
  // A board's own pay field (F-02, G-02, G-06).
  ...field(
    true,
    "60000–80000",
    "50–70",
    "USD 60000–80000 per year",
    "JPY 6000000–8000000 per year",
    "HUF 1200000–1500000 per month",
    "INR 1500000–2500000 per year",
    "KRW 60000000–90000000 per year",
    "8,000 SGD per month",
    "$50-$75 /hour",
  ),
  ...field(false, "", "0", "1", "1-2", "5 day", "5 days a week", "competitive", "DOE"),
];
