import { describe, expect, it } from "vitest";
import table from "../../../../server/src/modules/matching/domain/profile-rule-cases.json";
import type { Profile } from "../../api/matching";
import { validateProfile } from "./profile-rules";

// The server's AC-16 table (api-sync-report F-1): the web checks the same cases before sending.
// The table uses the server's camelCase domain names; the web works in the API's snake_case.
const toApi = (p: Record<string, unknown>) =>
  ({
    skills: p.skills,
    years: p.years,
    seniority: p.seniority,
    role_types: p.roleTypes,
    min_salary: p.minSalary,
    engagement_forms: p.engagementForms,
  }) as Profile;
const FIELD: Record<string, string> = {
  skills: "skills",
  years: "years",
  seniority: "seniority",
  roleTypes: "role_types",
  minSalary: "min_salary",
  engagementForms: "engagement_forms",
};

describe("validateProfile on the web (AC-16, F-1)", () => {
  for (const c of table.cases) {
    it(c.name, () => {
      const errors = validateProfile(toApi({ ...table.base, ...c.change }));
      if (c.field === null) expect(errors).toEqual([]);
      else expect(errors.map((e) => e.field)).toContain(FIELD[c.field]);
    });
  }

  it("uses the server's wording", () => {
    expect(validateProfile(toApi({ ...table.base, skills: [{ name: "React", core: false }] }))).toEqual([
      { field: "skills", message: "Skills: mark at least one skill as core." },
    ]);
  });
});
