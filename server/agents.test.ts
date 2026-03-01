import { describe, expect, it } from "vitest";
import { detectHeroClass } from "./routers/agents";

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

describe("Hero class edge cases", () => {
  it("returns mage when web is exactly 30% of total", () => {
    // web=3, total=10 => webR=0.3 => mage
    expect(detectHeroClass({ bash: 3, read: 2, write: 2, web: 3 })).toBe("mage");
  });

  it("returns cleric when read is exactly 40% of total", () => {
    // read=4, total=10 => readR=0.4 => cleric
    expect(detectHeroClass({ bash: 2, read: 4, write: 2, web: 2 })).toBe("cleric");
  });

  it("returns warrior when bash is exactly 35% of total", () => {
    // bash=7, total=20 => bashR=0.35 => warrior
    expect(detectHeroClass({ bash: 7, read: 5, write: 4, web: 4 })).toBe("warrior");
  });

  it("prefers warrior over mage when bash is higher", () => {
    expect(detectHeroClass({ bash: 8, read: 1, write: 1, web: 5 })).toBe("warrior");
  });
});
