import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, parseSettings, sourceState } from "./settings.js";
import { sourceById } from "./sources.js";

describe("built-in default settings (AC-27)", () => {
  it("enables every source except We Work Remotely", () => {
    expect(DEFAULT_SETTINGS.sources.jobicy.enabled).toBe(true);
    expect(DEFAULT_SETTINGS.sources.himalayas.enabled).toBe(true);
    expect(DEFAULT_SETTINGS.sources.remotive.enabled).toBe(true);
    expect(DEFAULT_SETTINGS.sources.weworkremotely.enabled).toBe(false);
  });

  it("has a tech category list for every enabled source", () => {
    expect(DEFAULT_SETTINGS.sources.jobicy.categories).toContain("Software Engineering");
    expect(DEFAULT_SETTINGS.sources.remotive.categories).toContain("Software Development");
    expect(DEFAULT_SETTINGS.sources.himalayas.categories).toContain("Developer");
  });
});

describe("parsing the settings file (AC-27)", () => {
  const valid = {
    sources: {
      jobicy: { enabled: true, categories: ["Software Engineering"] },
      himalayas: { enabled: false, categories: ["Developer"] },
      remotive: { enabled: true, categories: ["Software Development", "Devops"] },
      weworkremotely: { enabled: false, categories: [] },
    },
  };

  it("accepts a valid file", () => {
    const result = parseSettings(JSON.stringify(valid));
    expect(result).toEqual({ ok: true, settings: valid });
  });

  it("fills a source the file leaves out with its built-in default", () => {
    const { weworkremotely: _omit, ...rest } = valid.sources;
    const result = parseSettings(JSON.stringify({ sources: rest }));
    expect(result.ok && result.settings.sources.weworkremotely).toEqual(
      DEFAULT_SETTINGS.sources.weworkremotely,
    );
  });

  it("treats invalid JSON as unreadable with a plain reason", () => {
    const result = parseSettings("{ sources: ");
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toMatch(/not valid JSON/);
  });

  it("treats an unknown source as making the whole file unreadable", () => {
    const result = parseSettings(
      JSON.stringify({ sources: { ...valid.sources, remoteok: { enabled: true, categories: [] } } }),
    );
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toMatch(/unknown source "remoteok"/);
  });

  it.each([
    ["enabled is not true or false", { jobicy: { enabled: "yes", categories: [] } }, /enabled/],
    ["categories is not a list", { jobicy: { enabled: true, categories: "dev" } }, /categories/],
    ["a category is empty", { jobicy: { enabled: true, categories: [""] } }, /categories/],
    ["an unexpected key", { jobicy: { enabled: true, categories: [], extra: 1 } }, /unexpected key "extra"/],
  ])("treats a file where %s as unreadable", (_case, sources, reason) => {
    const result = parseSettings(JSON.stringify({ sources }));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toMatch(reason);
  });

  it("treats a file without a sources object as unreadable", () => {
    expect(parseSettings("[]").ok).toBe(false);
    expect(parseSettings(JSON.stringify({ other: {} })).ok).toBe(false);
  });
});

describe("a source's state (AC-26, AC-27)", () => {
  it("is disabled when the owner disabled it", () => {
    const settings = { sources: { ...DEFAULT_SETTINGS.sources, jobicy: { enabled: false, categories: [] } } };
    expect(sourceState(settings, sourceById("jobicy"))).toBe("disabled");
  });

  it("is enabled when enabled and readable", () => {
    expect(sourceState(DEFAULT_SETTINGS, sourceById("remotive"))).toBe("enabled");
  });

  it("is not_verified when the owner enables a source whose allowed rate is 0", () => {
    const settings = {
      sources: { ...DEFAULT_SETTINGS.sources, weworkremotely: { enabled: true, categories: [] } },
    };
    expect(sourceState(settings, sourceById("weworkremotely"))).toBe("not_verified");
  });
});
