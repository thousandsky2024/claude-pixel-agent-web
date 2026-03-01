/**
 * Agents Router - Hero management, real Claude Code Skills CRUD, and monitoring
 *
 * Claude Code file structure:
 *   Transcripts: ~/.claude/projects/<encoded-path>/<session-id>.jsonl
 *   Global skills: ~/.claude/skills/<skill-name>/SKILL.md
 *   Project skills: <project>/.claude/skills/<skill-name>/SKILL.md
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
  sessionFile?: string;
}

/** A real Claude Code skill backed by a SKILL.md file */
export interface ClaudeSkill {
  name: string;           // folder name = slash command
  displayName: string;    // from frontmatter `name` field
  description: string;    // from frontmatter `description` field
  content: string;        // full SKILL.md content (frontmatter + body)
  scope: "global" | "project";
  projectPath?: string;   // only for project-level skills
  skillPath: string;      // absolute path to the skill directory
}

// ─── Room Positions ───────────────────────────────────────────────────────────

export const ROOM_POSITIONS: Record<DungeonRoom, { x: number; y: number }> = {
  boss_arena: { x: 400, y: 280 },
  church:     { x: 155, y: 185 },
  shop:       { x: 645, y: 185 },
  rest_area:  { x: 400, y: 490 },
  corridor:   { x: 400, y: 380 },
};

// ─── Paths ────────────────────────────────────────────────────────────────────

const HOME_DIR = os.homedir();
const CLAUDE_DIR = path.join(HOME_DIR, ".claude");
const CLAUDE_PROJECTS_DIR = path.join(CLAUDE_DIR, "projects");
const GLOBAL_SKILLS_DIR = path.join(CLAUDE_DIR, "skills");
const DATA_DIR = path.join(HOME_DIR, ".claude-pixel-agent");
const HEROES_PATH = path.join(DATA_DIR, "heroes.json");
const CONFIG_PATH = path.join(DATA_DIR, "config.json");

// ─── Config ───────────────────────────────────────────────────────────────────

export interface AppConfig {
  claudeDir: string;
  watchedProjectPaths: string[];
  theme: "dark" | "light";
}

function loadConfig(): AppConfig {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
    }
  } catch {}
  return {
    claudeDir: CLAUDE_DIR,
    watchedProjectPaths: [],
    theme: "dark",
  };
}

function saveConfig(config: AppConfig) {
  ensureDataDir();
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

// ─── Persistence Helpers ──────────────────────────────────────────────────────

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
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

// ─── Real Claude Code Skills File System ─────────────────────────────────────

/**
 * Parse SKILL.md frontmatter to extract name and description
 */
function parseSkillFrontmatter(content: string): { name: string; description: string } {
  const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!fmMatch) return { name: "", description: "" };
  const fm = fmMatch[1];
  const nameMatch = fm.match(/^name:\s*(.+)$/m);
  const descMatch = fm.match(/^description:\s*(.+)$/m);
  return {
    name: nameMatch ? nameMatch[1].trim() : "",
    description: descMatch ? descMatch[1].trim() : "",
  };
}

/**
 * Read all skills from a skills directory (global or project-level)
 */
function readSkillsFromDir(
  skillsDir: string,
  scope: "global" | "project",
  projectPath?: string
): ClaudeSkill[] {
  if (!fs.existsSync(skillsDir)) return [];
  const skills: ClaudeSkill[] = [];
  try {
    const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const skillDir = path.join(skillsDir, entry.name);
      const skillMdPath = path.join(skillDir, "SKILL.md");
      if (!fs.existsSync(skillMdPath)) continue;
      const content = fs.readFileSync(skillMdPath, "utf-8");
      const { name, description } = parseSkillFrontmatter(content);
      skills.push({
        name: entry.name,
        displayName: name || entry.name,
        description,
        content,
        scope,
        projectPath,
        skillPath: skillDir,
      });
    }
  } catch (e) {
    console.error("[Skills] Read failed:", e);
  }
  return skills;
}

/**
 * Write a skill to disk (create or update)
 * Creates: <skillsDir>/<skillName>/SKILL.md
 */
function writeSkill(skillsDir: string, skillName: string, content: string): void {
  const skillDir = path.join(skillsDir, skillName);
  if (!fs.existsSync(skillDir)) fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(path.join(skillDir, "SKILL.md"), content, "utf-8");
}

/**
 * Delete a skill directory
 */
function deleteSkill(skillsDir: string, skillName: string): void {
  const skillDir = path.join(skillsDir, skillName);
  if (fs.existsSync(skillDir)) {
    fs.rmSync(skillDir, { recursive: true, force: true });
  }
}

// ─── Real Claude Code Agents File System ──────────────────────────────────────────────────

export interface ClaudeAgent {
  name: string;           // filename without .md
  displayName: string;    // from frontmatter `name` field
  description: string;    // from frontmatter `description` field
  tools: string;          // from frontmatter `tools` field
  model: string;          // from frontmatter `model` field
  content: string;        // full .md content
  scope: "global" | "project";
  projectPath?: string;
  agentPath: string;      // absolute path to the .md file
}

/**
 * Parse agent .md frontmatter
 */
function parseAgentFrontmatter(content: string): { name: string; description: string; tools: string; model: string } {
  const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!fmMatch) return { name: "", description: "", tools: "", model: "" };
  const fm = fmMatch[1];
  const nameMatch = fm.match(/^name:\s*(.+)$/m);
  const descMatch = fm.match(/^description:\s*(.+)$/m);
  const toolsMatch = fm.match(/^tools:\s*(.+)$/m);
  const modelMatch = fm.match(/^model:\s*(.+)$/m);
  return {
    name: nameMatch ? nameMatch[1].trim() : "",
    description: descMatch ? descMatch[1].trim() : "",
    tools: toolsMatch ? toolsMatch[1].trim() : "",
    model: modelMatch ? modelMatch[1].trim() : "",
  };
}

/**
 * Read all agents from an agents directory (global or project-level)
 * Agents are stored as <agentsDir>/<agent-name>.md
 */
function readAgentsFromDir(
  agentsDir: string,
  scope: "global" | "project",
  projectPath?: string
): ClaudeAgent[] {
  if (!fs.existsSync(agentsDir)) return [];
  const agents: ClaudeAgent[] = [];
  try {
    const entries = fs.readdirSync(agentsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
      const agentPath = path.join(agentsDir, entry.name);
      const content = fs.readFileSync(agentPath, "utf-8");
      const { name, description, tools, model } = parseAgentFrontmatter(content);
      const agentName = entry.name.replace(/\.md$/, "");
      agents.push({
        name: agentName,
        displayName: name || agentName,
        description,
        tools,
        model,
        content,
        scope,
        projectPath,
        agentPath,
      });
    }
  } catch (e) {
    console.error("[Agents] Read failed:", e);
  }
  return agents;
}

/**
 * Write an agent .md file
 * Creates: <agentsDir>/<agentName>.md
 */
function writeAgent(agentsDir: string, agentName: string, content: string): void {
  if (!fs.existsSync(agentsDir)) fs.mkdirSync(agentsDir, { recursive: true });
  fs.writeFileSync(path.join(agentsDir, `${agentName}.md`), content, "utf-8");
}

/**
 * Delete an agent .md file
 */
function deleteAgent(agentsDir: string, agentName: string): void {
  const agentPath = path.join(agentsDir, `${agentName}.md`);
  if (fs.existsSync(agentPath)) {
    fs.unlinkSync(agentPath);
  }
}

/**
 * Decode Claude Code's encoded project path back to real path
 * ~/.claude/projects/-home-user-myproject → /home/user/myproject
 */
function decodeProjectPath(encodedName: string): string {
  // First try to get the real path from ~/.claude.json (most accurate)
  try {
    const claudeJsonPath = path.join(HOME_DIR, ".claude.json");
    if (fs.existsSync(claudeJsonPath)) {
      const claudeJson = JSON.parse(fs.readFileSync(claudeJsonPath, "utf-8"));
      // ~/.claude.json has a `projects` object keyed by real path
      // We need to find the entry whose encoded form matches
      if (claudeJson.projects) {
        for (const realPath of Object.keys(claudeJson.projects)) {
          // Claude encodes by replacing / with - (after stripping leading /)
          const encoded = "-" + realPath.replace(/\//g, "-").replace(/^-/, "");
          if (encoded === encodedName) return realPath;
        }
      }
    }
  } catch {}

  // Fallback: reverse the encoding
  // The encoding is: strip leading /, replace all / with -, prepend -
  // Reverse: strip leading -, replace - with /, but we must be careful
  // about project names that contain hyphens.
  // Best we can do without the json: replace leading - with /, then
  // replace remaining - sequences that look like path separators.
  // Actually Claude uses a simple replace: realPath.replace(/\//g, '-')
  // So the encoded form has no way to distinguish - in dir names from /
  // We just do a best-effort decode:
  return "/" + encodedName.replace(/^-/, "").replace(/-/g, "/");
}

/**
 * Get all projects from ~/.claude/projects/
 */
function getTrackedProjects(): Array<{ encodedName: string; realPath: string; sessionCount: number }> {
  if (!fs.existsSync(CLAUDE_PROJECTS_DIR)) return [];
  try {
    const entries = fs.readdirSync(CLAUDE_PROJECTS_DIR, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory())
      .map((e) => {
        const projectDir = path.join(CLAUDE_PROJECTS_DIR, e.name);
        const sessionFiles = fs.existsSync(projectDir)
          ? fs.readdirSync(projectDir).filter((f) => f.endsWith(".jsonl"))
          : [];
        return {
          encodedName: e.name,
          realPath: decodeProjectPath(e.name),
          sessionCount: sessionFiles.length,
        };
      });
  } catch {
    return [];
  }
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const agentsRouter = router({
  // ── Heroes ──────────────────────────────────────────────────────────────────
  list: publicProcedure.query(() => loadHeroes()),

  clearHeroes: publicProcedure.mutation(() => {
    saveHeroes([]);
    return { success: true };
  }),

  createDemoHeroes: publicProcedure.mutation(() => {
    const heroes: Hero[] = [
      {
        id: 1,
        name: "Agent-Alpha",
        heroClass: "warrior",
        state: "fighting",
        position: { x: 400, y: 280 },
        room: "boss_arena",
        activeTools: [{ id: "t1", name: "Bash", status: "⚔️ Running: npm install", startedAt: Date.now() - 5000 }],
        subAgentTools: {},
        toolCount: { bash: 12, read: 3, write: 5, web: 1 },
        isWaiting: false,
        skills: [],
        level: 5,
        exp: 340,
        hp: 85,
        maxHp: 100,
        mp: 40,
        maxMp: 60,
        projectPath: "/home/user/my-project",
      },
      {
        id: 2,
        name: "Agent-Beta",
        heroClass: "mage",
        state: "casting",
        position: { x: 645, y: 185 },
        room: "shop",
        activeTools: [{ id: "t2", name: "WebSearch", status: "🔍 Searching: React hooks", startedAt: Date.now() - 3000 }],
        subAgentTools: {},
        toolCount: { bash: 2, read: 4, write: 3, web: 9 },
        isWaiting: false,
        skills: [],
        level: 3,
        exp: 120,
        hp: 60,
        maxHp: 70,
        mp: 90,
        maxMp: 100,
        projectPath: "/home/user/another-project",
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
        skills: [],
        level: 2,
        exp: 80,
        hp: 100,
        maxHp: 100,
        mp: 100,
        maxMp: 100,
        projectPath: "/home/user/docs-project",
      },
    ];
    saveHeroes(heroes);
    return heroes;
  }),

  // ── Config ───────────────────────────────────────────────────────────────────
  getConfig: publicProcedure.query(() => loadConfig()),

  saveConfig: publicProcedure
    .input(z.object({
      claudeDir: z.string().optional(),
      watchedProjectPaths: z.array(z.string()).optional(),
      theme: z.enum(["dark", "light"]).optional(),
    }))
    .mutation(({ input }) => {
      const current = loadConfig();
      const updated: AppConfig = {
        ...current,
        ...(input.claudeDir !== undefined && { claudeDir: input.claudeDir }),
        ...(input.watchedProjectPaths !== undefined && { watchedProjectPaths: input.watchedProjectPaths }),
        ...(input.theme !== undefined && { theme: input.theme }),
      };
      saveConfig(updated);
      return { success: true, config: updated };
    }),

  // ── Connection Status ─────────────────────────────────────────────────────────
  connectionStatus: publicProcedure.query(() => {
    const claudeExists = fs.existsSync(CLAUDE_DIR);
    const projectsExists = fs.existsSync(CLAUDE_PROJECTS_DIR);
    const globalSkillsExists = fs.existsSync(GLOBAL_SKILLS_DIR);

    const projects = getTrackedProjects();
    const totalSessions = projects.reduce((sum, p) => sum + p.sessionCount, 0);

    return {
      claudeDir: CLAUDE_DIR,
      claudeExists,
      projectsDir: CLAUDE_PROJECTS_DIR,
      projectsExists,
      globalSkillsDir: GLOBAL_SKILLS_DIR,
      globalSkillsExists,
      trackedProjects: projects.length,
      totalSessions,
      projects,
    };
  }),

  // ── Global Skills (real ~/.claude/skills/) ────────────────────────────────────
  globalSkills: publicProcedure.query(() => {
    return readSkillsFromDir(GLOBAL_SKILLS_DIR, "global");
  }),

  createGlobalSkill: publicProcedure
    .input(z.object({
      skillName: z.string().min(1).regex(/^[a-z0-9-_]+$/, "Skill name must be lowercase letters, numbers, hyphens, or underscores"),
      content: z.string().min(1),
    }))
    .mutation(({ input }) => {
      writeSkill(GLOBAL_SKILLS_DIR, input.skillName, input.content);
      return { success: true };
    }),

  updateGlobalSkill: publicProcedure
    .input(z.object({
      skillName: z.string(),
      content: z.string().min(1),
    }))
    .mutation(({ input }) => {
      writeSkill(GLOBAL_SKILLS_DIR, input.skillName, input.content);
      return { success: true };
    }),

  deleteGlobalSkill: publicProcedure
    .input(z.object({ skillName: z.string() }))
    .mutation(({ input }) => {
      deleteSkill(GLOBAL_SKILLS_DIR, input.skillName);
      return { success: true };
    }),

  // ── Project Skills (real <project>/.claude/skills/) ───────────────────────────
  projectSkills: publicProcedure
    .input(z.object({ projectPath: z.string() }))
    .query(({ input }) => {
      const skillsDir = path.join(input.projectPath, ".claude", "skills");
      return readSkillsFromDir(skillsDir, "project", input.projectPath);
    }),

  createProjectSkill: publicProcedure
    .input(z.object({
      projectPath: z.string(),
      skillName: z.string().min(1).regex(/^[a-z0-9-_]+$/),
      content: z.string().min(1),
    }))
    .mutation(({ input }) => {
      const skillsDir = path.join(input.projectPath, ".claude", "skills");
      writeSkill(skillsDir, input.skillName, input.content);
      return { success: true };
    }),

  updateProjectSkill: publicProcedure
    .input(z.object({
      projectPath: z.string(),
      skillName: z.string(),
      content: z.string().min(1),
    }))
    .mutation(({ input }) => {
      const skillsDir = path.join(input.projectPath, ".claude", "skills");
      writeSkill(skillsDir, input.skillName, input.content);
      return { success: true };
    }),

  deleteProjectSkill: publicProcedure
    .input(z.object({
      projectPath: z.string(),
      skillName: z.string(),
    }))
    .mutation(({ input }) => {
      const skillsDir = path.join(input.projectPath, ".claude", "skills");
      deleteSkill(skillsDir, input.skillName);
      return { success: true };
    }),

  // ── All Projects ──────────────────────────────────────────────────────────────
  trackedProjects: publicProcedure.query(() => getTrackedProjects()),

  // ── Global Agents (~/.claude/agents/) ────────────────────────────────────────
  globalAgents: publicProcedure.query(() => {
    const agentsDir = path.join(CLAUDE_DIR, "agents");
    return readAgentsFromDir(agentsDir, "global");
  }),

  createGlobalAgent: publicProcedure
    .input(z.object({
      agentName: z.string().min(1).regex(/^[a-z0-9-_]+$/, "Agent name must be lowercase letters, numbers, hyphens, or underscores"),
      content: z.string().min(1),
    }))
    .mutation(({ input }) => {
      const agentsDir = path.join(CLAUDE_DIR, "agents");
      writeAgent(agentsDir, input.agentName, input.content);
      return { success: true };
    }),

  updateGlobalAgent: publicProcedure
    .input(z.object({
      agentName: z.string(),
      content: z.string().min(1),
    }))
    .mutation(({ input }) => {
      const agentsDir = path.join(CLAUDE_DIR, "agents");
      writeAgent(agentsDir, input.agentName, input.content);
      return { success: true };
    }),

  deleteGlobalAgent: publicProcedure
    .input(z.object({ agentName: z.string() }))
    .mutation(({ input }) => {
      const agentsDir = path.join(CLAUDE_DIR, "agents");
      deleteAgent(agentsDir, input.agentName);
      return { success: true };
    }),

  // ── Project Agents (<project>/.claude/agents/) ────────────────────────────────
  projectAgents: publicProcedure
    .input(z.object({ projectPath: z.string() }))
    .query(({ input }) => {
      const agentsDir = path.join(input.projectPath, ".claude", "agents");
      return readAgentsFromDir(agentsDir, "project", input.projectPath);
    }),

  createProjectAgent: publicProcedure
    .input(z.object({
      projectPath: z.string(),
      agentName: z.string().min(1).regex(/^[a-z0-9-_]+$/),
      content: z.string().min(1),
    }))
    .mutation(({ input }) => {
      const agentsDir = path.join(input.projectPath, ".claude", "agents");
      writeAgent(agentsDir, input.agentName, input.content);
      return { success: true };
    }),

  updateProjectAgent: publicProcedure
    .input(z.object({
      projectPath: z.string(),
      agentName: z.string(),
      content: z.string().min(1),
    }))
    .mutation(({ input }) => {
      const agentsDir = path.join(input.projectPath, ".claude", "agents");
      writeAgent(agentsDir, input.agentName, input.content);
      return { success: true };
    }),

  deleteProjectAgent: publicProcedure
    .input(z.object({
      projectPath: z.string(),
      agentName: z.string(),
    }))
    .mutation(({ input }) => {
      const agentsDir = path.join(input.projectPath, ".claude", "agents");
      deleteAgent(agentsDir, input.agentName);
      return { success: true };
    }),

  // ── Update Hero Skills (visual only, stored in heroes.json) ─────────────────
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

  // ── Room Positions ────────────────────────────────────────────────────────────
  roomPositions: publicProcedure.query(() => ROOM_POSITIONS),
});
