/**
 * Agents Router - Hero management, skills, and Claude Code monitoring
 */

import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import fs from "fs";
import path from "path";
import os from "os";

// ─── Types ────────────────────────────────────────────────────────────────────

export type HeroClass = "warrior" | "mage" | "cleric";
export type HeroState =
  | "idle"
  | "walking"
  | "fighting"
  | "casting"
  | "resting"
  | "shopping"
  | "hurt";
export type DungeonRoom =
  | "boss_arena"
  | "church"
  | "shop"
  | "rest_area"
  | "corridor";

export interface ActiveTool {
  id: string;
  name: string;
  status: string;
  startedAt: number;
}

export interface Hero {
  id: number;
  name: string;
  heroClass: HeroClass;
  state: HeroState;
  position: { x: number; y: number };
  room: DungeonRoom;
  activeTools: ActiveTool[];
  subAgentTools: Record<string, ActiveTool[]>;
  toolCount: { bash: number; read: number; write: number; web: number };
  isWaiting: boolean;
  skills: string[];
  level: number;
  exp: number;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  projectPath?: string;
}

export interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  icon: string;
  type: "attack" | "magic" | "defense" | "utility";
}

// ─── Skill Definitions ────────────────────────────────────────────────────────

export const SKILL_DEFINITIONS: SkillDefinition[] = [
  {
    id: "power_strike",
    name: "Power Strike",
    description: "Bash commands ignite with fire aura",
    icon: "⚔️",
    type: "attack",
  },
  {
    id: "arcane_boost",
    name: "Arcane Boost",
    description: "Web search & analysis enhanced by magic orb",
    icon: "🔮",
    type: "magic",
  },
  {
    id: "divine_shield",
    name: "Divine Shield",
    description: "Error recovery wrapped in golden shield",
    icon: "🛡️",
    type: "defense",
  },
  {
    id: "shadow_step",
    name: "Shadow Step",
    description: "File navigation accelerated with shadow trail",
    icon: "👟",
    type: "utility",
  },
  {
    id: "battle_cry",
    name: "Battle Cry",
    description: "Rally all heroes with orange horn fanfare",
    icon: "📯",
    type: "attack",
  },
  {
    id: "mystic_sight",
    name: "Mystic Sight",
    description: "Reveal hidden patterns with all-seeing eye",
    icon: "👁️",
    type: "magic",
  },
];

// ─── Room Positions ───────────────────────────────────────────────────────────

export const ROOM_POSITIONS: Record<DungeonRoom, { x: number; y: number }> = {
  boss_arena: { x: 400, y: 280 },
  church: { x: 155, y: 185 },
  shop: { x: 645, y: 185 },
  rest_area: { x: 400, y: 490 },
  corridor: { x: 400, y: 380 },
};

// ─── Persistence Helpers ──────────────────────────────────────────────────────

const DATA_DIR = path.join(os.homedir(), ".claude-pixel-agent");
const HEROES_PATH = path.join(DATA_DIR, "heroes.json");
const GLOBAL_SKILLS_PATH = path.join(os.homedir(), ".claude", "skills.json");

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadHeroes(): Hero[] {
  ensureDataDir();
  try {
    if (fs.existsSync(HEROES_PATH)) {
      return JSON.parse(fs.readFileSync(HEROES_PATH, "utf-8"));
    }
  } catch {}
  return [];
}

function saveHeroes(heroes: Hero[]) {
  ensureDataDir();
  try {
    fs.writeFileSync(HEROES_PATH, JSON.stringify(heroes, null, 2));
  } catch (e) {
    console.error("[Heroes] Save failed:", e);
  }
}

function loadGlobalSkills(): string[] {
  try {
    if (fs.existsSync(GLOBAL_SKILLS_PATH)) {
      const data = JSON.parse(fs.readFileSync(GLOBAL_SKILLS_PATH, "utf-8"));
      return Array.isArray(data.skills) ? data.skills : [];
    }
  } catch {}
  return [];
}

function saveGlobalSkills(skills: string[]) {
  try {
    const dir = path.dirname(GLOBAL_SKILLS_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(GLOBAL_SKILLS_PATH, JSON.stringify({ skills }, null, 2));
  } catch (e) {
    console.error("[Skills] Save global failed:", e);
  }
}

function loadProjectSkills(projectPath: string): string[] {
  try {
    const p = path.join(projectPath, ".claude", "skills.json");
    if (fs.existsSync(p)) {
      const data = JSON.parse(fs.readFileSync(p, "utf-8"));
      return Array.isArray(data.skills) ? data.skills : [];
    }
  } catch {}
  return [];
}

function saveProjectSkills(projectPath: string, skills: string[]) {
  try {
    const dir = path.join(projectPath, ".claude");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "skills.json"),
      JSON.stringify({ skills }, null, 2)
    );
  } catch (e) {
    console.error("[Skills] Save project failed:", e);
  }
}

// ─── Hero Class Detection ─────────────────────────────────────────────────────

export function detectHeroClass(toolCount: {
  bash: number;
  read: number;
  write: number;
  web: number;
}): HeroClass {
  const total = toolCount.bash + toolCount.read + toolCount.write + toolCount.web;
  if (total === 0) return "warrior";
  const bashR = toolCount.bash / total;
  const webR = toolCount.web / total;
  const readR = toolCount.read / total;
  if (bashR >= 0.35) return "warrior";
  if (webR >= 0.3) return "mage";
  if (readR >= 0.4) return "cleric";
  if (toolCount.write / total >= 0.35) return "warrior";
  return "warrior";
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const agentsRouter = router({
  // List all heroes
  list: publicProcedure.query(() => loadHeroes()),

  // Skill definitions
  skillDefinitions: publicProcedure.query(() => SKILL_DEFINITIONS),

  // Room positions
  roomPositions: publicProcedure.query(() => ROOM_POSITIONS),

  // Global skills
  globalSkills: publicProcedure.query(() => loadGlobalSkills()),

  saveGlobalSkills: publicProcedure
    .input(z.object({ skills: z.array(z.string()) }))
    .mutation(({ input }) => {
      saveGlobalSkills(input.skills);
      return { success: true };
    }),

  // Project skills
  projectSkills: publicProcedure
    .input(z.object({ projectPath: z.string() }))
    .query(({ input }) => loadProjectSkills(input.projectPath)),

  saveProjectSkills: publicProcedure
    .input(z.object({ projectPath: z.string(), skills: z.array(z.string()) }))
    .mutation(({ input }) => {
      saveProjectSkills(input.projectPath, input.skills);
      return { success: true };
    }),

  // Update hero skills
  updateHeroSkills: publicProcedure
    .input(z.object({ heroId: z.number(), skills: z.array(z.string()) }))
    .mutation(({ input }) => {
      const heroes = loadHeroes();
      const hero = heroes.find((h) => h.id === input.heroId);
      if (hero) {
        hero.skills = input.skills;
        saveHeroes(heroes);
      }
      return { success: true };
    }),

  // Claude path info
  getClaudePath: publicProcedure.query(() => {
    const claudePath = path.join(os.homedir(), ".claude");
    const exists = fs.existsSync(claudePath);
    return {
      path: claudePath,
      exists,
      transcriptFiles: exists
        ? fs
            .readdirSync(claudePath)
            .filter((f) => f.endsWith(".jsonl"))
            .map((f) => path.join(claudePath, f))
        : [],
    };
  }),

  // Demo heroes
  createDemoHeroes: publicProcedure.mutation(() => {
    const heroes: Hero[] = [
      {
        id: 1,
        name: "Agent-Alpha",
        heroClass: "warrior",
        state: "fighting",
        position: { x: 400, y: 280 },
        room: "boss_arena",
        activeTools: [
          {
            id: "t1",
            name: "Bash",
            status: "Running: npm install",
            startedAt: Date.now() - 5000,
          },
        ],
        subAgentTools: {},
        toolCount: { bash: 12, read: 3, write: 5, web: 1 },
        isWaiting: false,
        skills: ["power_strike", "battle_cry"],
        level: 5,
        exp: 340,
        hp: 85,
        maxHp: 100,
        mp: 40,
        maxMp: 60,
      },
      {
        id: 2,
        name: "Agent-Beta",
        heroClass: "mage",
        state: "casting",
        position: { x: 155, y: 185 },
        room: "church",
        activeTools: [
          {
            id: "t2",
            name: "WebSearch",
            status: "Searching: React hooks",
            startedAt: Date.now() - 3000,
          },
        ],
        subAgentTools: {},
        toolCount: { bash: 2, read: 4, write: 3, web: 9 },
        isWaiting: false,
        skills: ["arcane_boost", "mystic_sight"],
        level: 3,
        exp: 120,
        hp: 60,
        maxHp: 70,
        mp: 90,
        maxMp: 100,
      },
      {
        id: 3,
        name: "Agent-Gamma",
        heroClass: "cleric",
        state: "resting",
        position: { x: 400, y: 490 },
        room: "rest_area",
        activeTools: [],
        subAgentTools: {},
        toolCount: { bash: 1, read: 15, write: 2, web: 2 },
        isWaiting: true,
        skills: ["divine_shield"],
        level: 2,
        exp: 80,
        hp: 100,
        maxHp: 100,
        mp: 100,
        maxMp: 100,
      },
    ];
    saveHeroes(heroes);
    return heroes;
  }),

  // Clear all heroes
  clearHeroes: publicProcedure.mutation(() => {
    saveHeroes([]);
    return { success: true };
  }),
});
