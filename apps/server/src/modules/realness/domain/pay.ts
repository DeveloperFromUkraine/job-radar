// Does a text state pay as an amount of money? (spec AC-06, ADR-0004). One rule for board pay fields,
// titles and descriptions. Pure: no I/O, no locale library.
// ponytail: hand-written patterns tuned on pay-fixtures.ts; widen them when the §7 hand check finds misses.

const CURRENCY = String.raw`US\$|CA\$|A\$|C\$|\$|€|£|USD|EUR|PLN|GBP|CAD|AUD|CHF|CZK|zł|Kč`;
const NUMBER = String.raw`\d{1,3}(?:[ ,.\u00a0\u202f]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d+)?`;
const MAGNITUDE = "k|mm|mln|million|billion|bn|m|b|t";

// [pre-currency] number [magnitude][+] [post-currency]
const AMOUNT = new RegExp(
  String.raw`(?:(${CURRENCY})\s?)?(${NUMBER})(?:\s?(${MAGNITUDE})(?![a-z]))?\+?(?:\s?(${CURRENCY})(?![a-z]))?`,
  "gi",
);
const BIG = /^(mm|mln|million|billion|bn|m|b|t)$/i;
const PERIOD =
  /^\s*(?:\+\s*)?(?:\/|per\s+|an?\s+|p\.?\s?a\.?\b)?\s*(hour|hr|h|month|mo|mies|week|day|year|yr|annum|annual|annually|hourly|monthly|yearly)\b/i;

// Words that make a nearby amount not a salary: company money, budgets and perks.
const NON_PAY =
  /\b(series|seed|raised?|funding|funded|valuation|valued|worth|revenue|arr|mrr|gmv|spend|spent|transacted|paid out|earned|credit|assets|budget|stipend|allowance|reimburse\w*|meal|mobility|learning|education|training|development|professional|conference|equipment|workstation|internet|referral|bonus|equity|refresh|grant|initiative|million|billion|customer|client|business owner)s?\b|voucher/i;
const PAY =
  /\b(salary|salaries|compensation|pay|paid|wage|wages|rate|rates|earnings|earn|ote|base|range|band|gross|net|b2b|brutto|netto|wynagrodzenie|stawka)\b/i;

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

    // The words right after the amount name what it is: "$2,000 learning budget", "$5M Series A".
    const after =
      rest
        .replace(PERIOD, " ")
        .replace(new RegExp(`^\\s*(?:${CURRENCY})(?![a-z])`, "i"), " ")
        .split(/[.;!?()]|[$€£]\s?\d|\s(?:\+|plus)\s/)[0] ??
      "" // "+ equity" adds to the pay, it doesn't name it
        .trim()
        .split(/\s+/)
        .slice(0, 4)
        .join(" ");
    if (NON_PAY.test(after)) continue;

    // Otherwise the nearest cue before it in the same sentence decides.
    const before =
      t
        .slice(Math.max(0, start - 70), start)
        .split(/[.!?•]\s/)
        .pop() ?? "";
    const cue = nearestCue(before);
    if (cue === "non_pay") continue;
    if (cue === "pay") return true;
    if (value >= 1000 || hasPeriod || mag) return true;
  }
  return false;
}

function nearestCue(before: string): "pay" | "non_pay" | null {
  const words = before
    .split(/[^\p{L}\d-]+/u)
    .filter(Boolean)
    .reverse();
  for (const w of words) {
    if (NON_PAY.test(w)) return "non_pay";
    if (PAY.test(w)) return "pay";
  }
  return null;
}
