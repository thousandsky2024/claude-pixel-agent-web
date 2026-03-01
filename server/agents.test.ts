import { describe, expect, it } from "vitest";
import { detectHeroClass, SKILL_DEFINITIONS } from "./routers/agents";

describe("detectHeroClass", () => {
  it("returns warrior when bash usage is dominant", () => {
    expect(detectHeroClass({ bash: 10, read: 2, write: 3, web: 1 })).toBe("warrior");
  });

  it("returns mage when web usage is dominant", () => {
    expect(detectHeroClass({ bash: 1, read: 2, write: 1, web: 8 })).toBe("mage");
  });

  it("returns cleric when read usage is dominant", () => {
    expect(detectHeroClass({ bash: 1, read: 10, write: 2, web: 1 })).toBe("cleric");
  });

  it("defaults to warrior when no tools used", () => {
    expect(detectHeroClass({ bash: 0, read: 0, write: 0, web: 0 })).toBe("warrior");
  });

  it("returns warrior when write usage is dominant", () => {
    expect(detectHeroClass({ bash: 1, read: 2, write: 8, web: 1 })).toBe("warrior");
  });
});

describe("SKILL_DEFINITIONS", () => {
  it("has exactly 6 skills", () => {
    expect(SKILL_DEFINITIONS).toHaveLength(6);
  });

  it("all skills have required fields", () => {
    for (const skill of SKILL_DEFINITIONS) {
      expect(skill.id).toBeTruthy();
      expect(skill.name).toBeTruthy();
      expect(skill.description).toBeTruthy();
      expect(skill.icon).toBeTruthy();
      expect(["attack", "magic", "defense", "utility"]).toContain(skill.type);
    }
  });

  it("skill ids are unique", () => {
    const ids = SKILL_DEFINITIONS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
