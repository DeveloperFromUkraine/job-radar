// AC-02 / AC-06: which of the owner's skills a posting mentions, and whether in a title. Pure.
// A skill matches its exact text, any letter case, with no letter or digit directly before it and no
// letter, digit, `#` or `+` directly after it (sad §8) — so "C" does not match "C#" or "C++".

export interface ListingText {
  title: string;
  description: string;
}

export interface MatchedSkill {
  skill: string;
  in_title: boolean;
}

// Owner input is literal text, never a pattern (spec §6.1). Only syntax characters are escaped:
// the `u` flag rejects needless escapes like `\-`.
const literal = (s: string) => s.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");

/** Compile once per search, then call `match` per posting with its open listings only. */
export function compileMatcher(skills: string[]) {
  const patterns = skills.map((skill) => ({
    skill,
    re: new RegExp(`(?<![\\p{L}\\p{N}])${literal(skill)}(?![\\p{L}\\p{N}#+])`, "iu"),
  }));
  return {
    match(listings: ListingText[]): MatchedSkill[] {
      const matched: MatchedSkill[] = [];
      for (const { skill, re } of patterns) {
        if (listings.some((l) => re.test(l.title))) matched.push({ skill, in_title: true });
        else if (listings.some((l) => re.test(l.description))) matched.push({ skill, in_title: false });
      }
      return matched;
    },
  };
}
