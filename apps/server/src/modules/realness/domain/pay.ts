// Does a text state pay as an amount of money? (spec AC-06, ADR-0004). One rule for board pay fields,
// titles and descriptions. Pure: no I/O, no locale library.
// ponytail: hand-written patterns tuned on pay-fixtures.ts and pay-probes.ts; widen them when the §7 hand
// check finds misses. Known gap: Indian digit grouping ("₹15,00,000", "15 LPA") in descriptions; board
// fields carry plain digits.

const CURRENCY = String.raw`US\$|CA\$|A\$|C\$|\$|€|£|USD|EUR|PLN|GBP|CAD|AUD|CHF|CZK|zł|Kč`;
const NUMBER = String.raw`\d{1,3}(?:[ ,.\u00a0\u202f]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d+)?`;
const MAGNITUDE = "k|mm|mln|million|billion|bn|m|b|t";

// A letter, accented ones too: the "K" of "1 130 000 Kč" is not a thousand (re-review G-04).
const LETTER = String.raw`[a-z\u00c0-\u024f]`;

// [pre-currency] number [magnitude][+] [post-currency]
const AMOUNT = new RegExp(
  String.raw`(?:(${CURRENCY})\s?)?(${NUMBER})(?:\s?(${MAGNITUDE})(?!${LETTER}))?\+?(?:\s?(${CURRENCY})(?!${LETTER}))?`,
  "gi",
);
const BIG = /^(mm|mln|million|billion|bn|m|b|t)$/i;
const PERIOD =
  /^\s*(?:\+\s*)?(?:\/|per\s+|an?\s+|p\.?\s?a\.?\b)?\s*(hour|hr|h|month|mo|mies|week|day|year|yr|annum|annual|annually|hourly|monthly|yearly)\b/i;

const ADJECTIVE_PERIOD = /^(annual|monthly|yearly|hourly)$/i;

// Words that make a nearby amount not a salary: company money, budgets and perks.
const NON_PAY =
  /\b(series|seed|raised?|funding|funded|valuation|valued|worth|revenue|arr|mrr|gmv|spend|spent|transacted|paid out|earned|credit|assets|budget|stipend|allowance|reimburse\w*|meal|mobility|learning|education|training|development|professional|conference|equipment|workstation|internet|referral|relocation|wellness|health|gym|co-?working|home office|sign-?on|phone|travel|bonus|equity|refresh|grant|initiative|million|billion|customer|client|business owner)s?\b|voucher/i;
const PAY =
  /\b(salary|salaries|compensation|pay|paid|wage|wages|rate|rates|earnings|earn|ote|base|range|band|gross|net|b2b|brutto|netto|wynagrodzenie|stawka|mzda|plat)\b/i;

const RANGE_END = /^\s*[-–—]\s*(?:[$€£]\s?)?\d[\d,.]*\s?k?/i;
const NOT_AMOUNTS = /\b401\s?\(?k\)?/gi; // the US retirement plan, never money

const toNumber = (n: string) => Number(n.replace(/[ ,.\u00a0\u202f](?=\d{3}\b)/g, "").replace(",", "."));

// ponytail: process-wide memo of verdicts for long texts (sad §7 scaling threshold), dropped whole at 50k
// entries. Keyed by length and two independent 32-bit hashes, so a collision is negligible; a verdict is
// pure in the text, so it never goes stale. A list build reads the same descriptions every time.
const verdicts = new Map<string, boolean>();
function textKey(text: string): string {
  let fnv = 0x811c9dc5;
  let djb = 5381;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    fnv = Math.imul(fnv ^ c, 0x01000193);
    djb = (Math.imul(djb, 33) + c) | 0;
  }
  return `${text.length}:${fnv >>> 0}:${djb >>> 0}`;
}

export function statesPay(text: string): boolean {
  if (!/\d/.test(text)) return false; // fast path: no number, no amount
  if (text.length < 200) return judge(text);
  const key = textKey(text);
  let verdict = verdicts.get(key);
  if (verdict === undefined) {
    if (verdicts.size >= 50_000) verdicts.clear();
    verdict = judge(text);
    verdicts.set(key, verdict);
  }
  return verdict;
}

// A board's structured pay field holds only amounts, with any ISO code the board gave ("60000–80000",
// "INR 1500000–2500000 per year"): any real amount there is pay. Case-sensitive, so "5 day" is no code.
const CODE = `[A-Z]{3}|${CURRENCY}`;
const AMOUNTS_ONLY = new RegExp(
  String.raw`^\s*(?:(?:${CODE})\s?)?[\d\s,.–-]*\d[\d\s,.–-]*(?:\s?(?:${CODE}))?(?:\s*per\s+\w+)?\s*$`,
);

/** statesPay for a board's own pay field: a bare amount there is pay even without a currency (review F-02);
 * "0", "1" or "1-2" is not an amount (re-review G-06). */
export const fieldStatesPay = (field: string): boolean =>
  (AMOUNTS_ONLY.test(field) && /\d{2}/.test(field) && /[1-9]/.test(field)) || statesPay(field);

// A currency's ISO code beside a number is a currency in text too ("SGD 8,000", "50 000 SEK per month")
// (re-review 2 H-02). A list, not any three capitals: "ISO 27001" and "SOC 2" are not money.
const ISO_CODES = new Set(
  "USD EUR GBP CHF CAD AUD NZD SGD HKD JPY CNY INR KRW SEK NOK DKK ISK PLN CZK HUF RON BGN UAH TRY ILS AED SAR BRL MXN ARS CLP COP PEN ZAR NGN KES EGP PHP IDR MYR THB VND TWD".split(
    " ",
  ),
);
const CODE_BEFORE = /(?:^|[^A-Za-z])([A-Z]{3})\s?$/;
const CODE_AFTER = /^\s?([A-Z]{3})(?![A-Za-z])/;
const isCode = (c: string | undefined): c is string => c !== undefined && ISO_CODES.has(c);
// Nouns that name an amount as a perk even further along the clause ("$2,000, for your learning budget").
const ADD_ON = /^(equity|bonus|bonuses|stock|stocks|options)$/i;
const PERK_NOUN = /\b(budget|stipend|allowance|reimburse\w*|voucher)s?\b/i;

// Biased to pay (re-review 2): a wrong "no salary" is the sharpest failure (spec §1), a false pay only
// avoids a lowering (spec §6.1). So a pay word before the amount always wins; only the words right after
// it can name it a perk; a perk noun later in the clause counts only with no period and no pay word; and
// add-ons after a salary ("and equity", "with a bonus") never cancel it.
function judge(text: string): boolean {
  const t = text.replace(NOT_AMOUNTS, " ");
  for (const m of t.matchAll(AMOUNT)) {
    const [whole, pre, num = "", mag, post] = m;
    const start = m.index;
    const end = start + whole.length;
    let rest = t.slice(end, end + 80); // only the next few words decide
    if (/^\s*%/.test(rest)) continue; // "100% remote"
    if (mag && BIG.test(mag)) continue; // salaries are never millions
    const codeBefore = CODE_BEFORE.exec(t.slice(Math.max(0, start - 5), start))?.[1];
    const codeAfter = post || pre ? undefined : CODE_AFTER.exec(rest)?.[1];
    if (isCode(codeAfter)) rest = rest.replace(CODE_AFTER, " ");
    const currency =
      pre ?? post ?? (isCode(codeBefore) ? codeBefore : isCode(codeAfter) ? codeAfter : undefined);
    const value = toNumber(num) * (mag ? 1000 : 1);
    // "$40-60/hr": the period after a range's upper end belongs to both ends.
    const hasPeriod = PERIOD.test(rest) || PERIOD.test(rest.replace(RANGE_END, ""));
    // A range's upper end ("20 000 – 25 000 PLN …") or lower end: perk amounts are single figures.
    const inRange =
      RANGE_END.test(rest) || /[-–—]\s*(?:[$€£]\s?)?$/.test(t.slice(Math.max(0, start - 3), start));

    // The words right after the amount name what it is: "$2,000 learning budget", "$5M Series A",
    // "$150k base salary". "annual" before a noun describes it ("$1,500 annual wellness stipend"); before a
    // break or at the end it is the period ("€60,000 annual, plus bonus").
    const named = rest.replace(new RegExp(`^\\s*(?:${CURRENCY})(?![a-z])`, "i"), " ");
    const period = PERIOD.exec(named);
    const afterPeriod =
      period !== null &&
      (!ADJECTIVE_PERIOD.test(period[1] ?? "") ||
        /^\s*(?:$|[,;.!?()\n]|(?:\+|plus|and|with)\s)/i.test(named.slice(period[0].length)));
    const clause = named.replace(PERIOD, " ").split(/[.;!?()\n•]|[$€£]\s?\d/)[0] ?? "";
    const [head = "", ...tail] = clause.split(/,|\s(?:\+|plus|and|with)\s/i);
    const headWords = head
      .split(/[^\p{L}\d-]+/u)
      .filter(Boolean)
      .slice(0, 6);
    // The nearest cue before it in the same clause: "Salary: $150,000 and equity" is pay.
    const before =
      t
        .slice(Math.max(0, start - 70), start)
        .split(/[.!?•;,]\s|\n/)
        .pop() ?? "";
    const cue = cueBefore(before);
    // A bare number after a pay word is pay only as an amount: "Salary: 120,000", not "Rate limit of
    // 10,000 requests", "Pay transparency: see 2024 report" or "user base of 1,500,000 people" (J-03).
    const nextWord = /^\s*(\p{L}+)/u.exec(rest)?.[1];
    const bareAmount =
      value >= 1000 &&
      !/^(19|20)\d\d$/.test(num) &&
      (!nextWord || /^(to|and|or|with|plus)$/i.test(nextWord) || PAY.test(nextWord) || hasPeriod) &&
      (value < 1_000_000 || hasPeriod);
    // A perk noun right after the amount names it even after a pay word ("Competitive pay and a $2,000
    // learning budget"); an add-on there does not cancel a salary ("Salary: $120k equity 0.1%").
    const namedAs = firstCue(headWords);
    const addOnOnly =
      headWords.some((w) => ADD_ON.test(w)) &&
      headWords.every((w) => !NON_PAY.test(w) || ADD_ON.test(w)) &&
      !/home office/i.test(head);
    if (namedAs === "non_pay" && !(cue === "pay" && addOnOnly)) continue;
    if (cue === "pay" && (currency || bareAmount)) return true; // "Salary: 120,000", "salary: $1"
    // A role or company noun before a range is the job, not a perk ("Senior Engineer, Health Platform —
    // $140k-$170k"): perk amounts are single figures (J-01).
    if (cue === "non_pay" && !inRange) continue; // "budget of USD 2,000 per year"
    if (!currency && !(mag || hasPeriod)) continue; // a bare number: "280 doctors", "7 years"
    if (!currency && value < 1000) continue; // "7 years", "3 days"

    // A pay word names the amount only when it follows it directly; after a period it starts the next
    // thought ("budget of USD 2,000 per year Annual compensation review").
    if (namedAs === "pay" && !afterPeriod) return true;
    // Nothing named the amount before the conjunction: a perk noun further on does ("$5,000 with a laptop
    // and conference budget"); "$120k for this role, and a training budget" stays pay.
    // A salary-sized amount keeps it: "$95k, with a learning budget" (J-02).
    if (
      !afterPeriod &&
      !inRange &&
      value < 10_000 &&
      headWords.length === 0 &&
      PERK_NOUN.test(tail.join(" "))
    )
      continue;

    // "$3,000,000 of transactions": uncued millions with no period are company money; "¥6,000,000 per
    // year" and "1 130 000 Kč per year" are pay (re-review G-02, G-04).
    if (value >= 1_000_000 && !hasPeriod) continue;
    if (value >= 1000 || hasPeriod || mag) return true;
  }
  return false;
}

/** The cue before an amount, in its clause: any pay word there wins, however far back ("The salary range
 * for this Customer Success Manager role is $70,000"), so a role or company noun in between never cancels
 * it (re-review 3 J-01); otherwise the nearest non-pay word. "paid out" is company money. */
function cueBefore(before: string): "pay" | "non_pay" | null {
  const words = before
    .replace(/\bpaid out\b/gi, "transacted")
    .split(/[^\p{L}\d-]+/u)
    .filter(Boolean);
  if (words.some((w) => PAY.test(w))) return "pay";
  return firstCue(words.reverse(), true);
}

/** The first pay or non-pay word in `words`, in order; two-word perks too ("home office", "paid out"). */
function firstCue(words: readonly string[], reversed = false): "pay" | "non_pay" | null {
  for (let i = 0; i < words.length; i++) {
    const w = words[i] as string;
    const next = words[i + 1];
    const pair = next === undefined ? "" : reversed ? `${next} ${w}` : `${w} ${next}`;
    if (NON_PAY.test(w) || (pair && /^(?:home office|paid out|business owner)$/i.test(pair)))
      return "non_pay";
    if (PAY.test(w)) return "pay";
  }
  return null;
}
