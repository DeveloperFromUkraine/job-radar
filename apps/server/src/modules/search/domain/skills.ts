// The owner's skills text → a checked, deduped list (AC-05). Pure.

export const MAX_SKILLS = 20;
export const MAX_SKILL_LENGTH = 50;

export type ParsedSkills = { ok: true; skills: string[] } | { ok: false; message: string };

export function parseSkills(text: string): ParsedSkills {
  const seen = new Set<string>();
  const skills: string[] = [];
  for (const raw of text.split(",")) {
    const skill = raw.trim();
    if (!skill) continue;
    if (!/[\p{L}\p{N}]/u.test(skill))
      return { ok: false, message: `"${skill}" needs at least one letter or digit.` };
    if (skill.length > MAX_SKILL_LENGTH)
      return { ok: false, message: `"${skill}" is longer than ${MAX_SKILL_LENGTH} characters.` };
    const key = skill.toLowerCase();
    if (seen.has(key)) continue; // first spelling kept
    seen.add(key);
    skills.push(skill);
  }
  if (skills.length > MAX_SKILLS)
    return { ok: false, message: `${skills.length} skills entered; search takes at most ${MAX_SKILLS}.` };
  return { ok: true, skills };
}
