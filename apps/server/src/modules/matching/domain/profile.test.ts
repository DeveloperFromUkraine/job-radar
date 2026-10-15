import { describe, expect, it } from "vitest";
import {
  cvHeaderName,
  findContactDetails,
  type Profile,
  profileChanged,
  toPeriod,
  validateProfile,
} from "./profile.js";
import table from "./profile-rule-cases.json" with { type: "json" };

const base = table.base as Profile;

describe("validateProfile (AC-16)", () => {
  for (const c of table.cases) {
    it(c.name, () => {
      const errors = validateProfile({ ...base, ...c.change } as Profile);
      if (c.field === null) expect(errors).toEqual([]);
      else {
        expect(errors.map((e) => e.field)).toContain(c.field);
        // The message names the field first and says what it must be (F-1 backstop).
        for (const e of errors) expect(e.message).toMatch(/^[A-Z][a-z ]+: .+\.$/);
        if ("message" in c) expect(errors.find((e) => e.field === c.field)?.message).toBe(c.message);
      }
    });
  }

  it("says what a core-less profile must be", () => {
    const [error] = validateProfile({ ...base, skills: [{ name: "React", core: false }] });
    expect(error).toEqual({ field: "skills", message: "Skills: mark at least one skill as core." });
  });

  it("says a contact detail is not allowed", () => {
    const [error] = validateProfile({
      ...base,
      skills: [...base.skills, { name: "user-0001@example.test", core: false }],
    });
    expect(error?.message).toBe("Skills: remove the email address; a profile holds no contact details.");
  });

  it("refuses an over-long skill name before the contact scan, so it stays fast (review R22)", () => {
    const started = performance.now();
    const [error] = validateProfile({ ...base, skills: [{ name: `1 A${"a".repeat(80_000)}`, core: true }] });
    expect(error?.message).toBe("Skills: use up to 50 characters per skill.");
    expect(performance.now() - started).toBeLessThan(100);
  });
});

describe("findContactDetails (AC-09)", () => {
  const cv = [
    "Test User",
    "Senior TypeScript engineer, Node.js and React",
    "Email: user-0001@example.test · Phone: +48 000 000 000",
    "Address: 1 Example Street, Warsaw",
    "https://example.test/u/0001 · linkedin.com/in/test-user · www.example.test",
  ].join("\n");

  it("finds every email, phone, address and link", () => {
    const kinds = findContactDetails(cv).map((d) => `${d.kind}:${d.text}`);
    expect(kinds).toEqual(
      expect.arrayContaining([
        "email:user-0001@example.test",
        "phone:+48 000 000 000",
        "address:1 Example Street",
        "link:https://example.test/u/0001",
        "link:linkedin.com/in/test-user",
        "link:www.example.test",
      ]),
    );
  });

  it("leaves skills such as Node.js, ASP.NET, C# and 10,000 rps alone", () => {
    expect(findContactDetails("Node.js, ASP.NET, C#, .NET 8, 10,000 rps, 2019-2024, React 19")).toEqual([]);
  });

  it("reads the name from the CV's first line only when it looks like a name", () => {
    expect(cvHeaderName(cv)).toBe("Test User");
    expect(cvHeaderName("\n  Jan Maria Kowalski-Nowak \nSenior engineer")).toBe("Jan Maria Kowalski-Nowak");
    expect(cvHeaderName("Curriculum Vitae\nTest User")).toBe(null);
    expect(cvHeaderName("Senior TypeScript engineer with 8 years")).toBe(null);
  });
});

describe("profileChanged (AC-10 note)", () => {
  it("is false for the same profile with lists in another order", () => {
    const same: Profile = {
      ...base,
      skills: [...base.skills].reverse(),
      roleTypes: ["fullstack", "backend"],
    };
    expect(profileChanged(base, same)).toBe(false);
  });

  it("is true for any profile field change", () => {
    expect(profileChanged(base, { ...base, seniority: "staff" })).toBe(true);
    expect(profileChanged(base, { ...base, years: 9 })).toBe(true);
    expect(
      profileChanged(base, {
        ...base,
        skills: [
          { name: "TypeScript", core: true },
          { name: "React", core: false },
          { name: "Node", core: false },
        ],
      }),
    ).toBe(true);
    expect(
      profileChanged(base, { ...base, minSalary: { amount: 6000, currency: "EUR", period: "year" } }),
    ).toBe(true);
  });

  it("is true for a first profile", () => {
    expect(profileChanged(null, base)).toBe(true);
  });
});

describe("toPeriod (F-6)", () => {
  it.each([
    [60, "hour", 480, "day"],
    [480, "day", 10080, "month"],
    [7000, "month", 84000, "year"],
    [84000, "year", 7000, "month"],
    [6000, "month", 6000, "month"],
  ] as const)("%d per %s is %d per %s", (amount, from, expected, to) => {
    expect(toPeriod(amount, from, to)).toBe(expected);
  });
});
