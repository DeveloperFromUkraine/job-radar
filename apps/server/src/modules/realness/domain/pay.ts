// Does a text state pay as an amount of money? (spec AC-06, ADR-0004). One rule for board pay fields,
// titles and descriptions. Pure: no I/O, no locale library.
// ponytail: hand-written patterns tuned on pay-fixtures.ts; widen them when the §7 hand check finds misses.

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
  /\b(series|seed|raised?|funding|funded|valuation|valued|worth|revenue|arr|mrr|gmv|spend|spent|transacted|paid out|earned|credit|assets|budget|stipend|allowance|reimburse\w*|meal|mobility|learning|education|training|development|professional|conference|equipment|workstation|internet|referral|relocation|bonus|equity|refresh|grant|initiative|million|billion|customer|client|business owner)s?\b|voucher/i;
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

function judge(text: string): boolean {
  const t = text.replace(NOT_AMOUNTS, " ");
  for (const m of t.matchAll(AMOUNT)) {
    const [whole, pre, num = "", mag, post] = m;
    const start = m.index;
    const end = start + whole.length;
    const rest = t.slice(end, end + 80); // only the next few words decide
    if (/^\s*%/.test(rest)) continue; // "100% remote"
    if (mag && BIG.test(mag)) continue; // salaries are never millions
    const currency = pre ?? post;
    const value = toNumber(num) * (mag ? 1000 : 1);
    // "$40-60/hr": the period after a range's upper end belongs to both ends.
    const hasPeriod = PERIOD.test(rest) || PERIOD.test(rest.replace(RANGE_END, ""));
    if (!currency && !(mag || hasPeriod)) continue; // a bare number: "280 doctors", "7 years"
    if (!currency && value < 1000) continue; // "7 years", "3 days"

    // The words right after the amount name what it is: "$2,000 learning budget", "$5M Series A",
    // "$150k base salary". After a period the amount is already pay, so ", equity" or "with a … budget"
    // only adds to it (re-review G-03); without one, "home office and learning budget" still names it.
    const named = rest.replace(new RegExp(`^\\s*(?:${CURRENCY})(?![a-z])`, "i"), " ");
    // "annual" before a noun describes it ("$1,500 annual wellness and learning stipend"); before a break
    // or at the end it is the period ("€60,000 annual, plus bonus").
    const period = PERIOD.exec(named);
    const afterPeriod =
      period !== null &&
      (!ADJECTIVE_PERIOD.test(period[1] ?? "") ||
        /^\s*(?:$|[,;.!?()]|(?:\+|plus|and|with)\s)/i.test(named.slice(period[0].length)));
    const after = (
      named
        .replace(PERIOD, " ")
        .split(
          afterPeriod
            ? /[.,;!?()]|[$€£]\s?\d|\s(?:\+|plus|and|with)\s/i
            : /[.;!?()]|[$€£]\s?\d|\s(?:\+|plus)\s|,\s*(?:and|with)\s/i,
        )[0] ?? ""
    )
      .split(/[^\p{L}\d-]+/u)
      .filter(Boolean)
      .slice(0, 6);
    const namedAs = firstCue(after);
    if (namedAs === "non_pay") continue;
    // A pay word names the amount only when it follows it directly; after a period it starts the next
    // thought ("budget of USD 2,000 per year Annual compensation review").
    if (namedAs === "pay" && !afterPeriod) return true;

    // Otherwise the nearest cue before it in the same sentence decides.
    const before =
      t
        .slice(Math.max(0, start - 70), start)
        .split(/[.!?•]\s/)
        .pop() ?? "";
    const cue = nearestCue(before);
    if (cue === "non_pay") continue;
    if (cue === "pay") return true; // "Base Salary Range 1 130 000 Kč" is a salary in koruna
    // "$3,000,000 of transactions": uncued millions with no period are company money; "¥6,000,000 per
    // year" and "1 130 000 Kč per year" are pay (re-review G-02, G-04).
    if (value >= 1_000_000 && !hasPeriod) continue;
    if (value >= 1000 || hasPeriod || mag) return true;
  }
  return false;
}

function nearestCue(before: string): "pay" | "non_pay" | null {
  return firstCue(
    before
      .split(/[^\p{L}\d-]+/u)
      .filter(Boolean)
      .reverse(),
  );
}

/** The first pay or non-pay word in `words`, in order. */
function firstCue(words: readonly string[]): "pay" | "non_pay" | null {
  for (const w of words) {
    if (NON_PAY.test(w)) return "non_pay";
    if (PAY.test(w)) return "pay";
  }
  return null;
}
