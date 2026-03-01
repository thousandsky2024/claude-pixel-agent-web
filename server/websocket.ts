/**
 * WebSocket Handler - Real-time Claude Code monitoring
 * Monitors JSONL transcript files and broadcasts hero state updates
 */

import { WebSocket, WebSocketServer } from "ws";
import fs from "fs";
import path from "path";
import os from "os";
import {
  Hero,
  HeroClass,
  HeroState,
  DungeonRoom,
  ActiveTool,
  ROOM_POSITIONS,
  detectHeroClass,
} from "./routers/agents";

// ─── Constants ────────────────────────────────────────────────────────────────

const CLAUDE_DIR = path.join(os.homedir(), ".claude");
const DATA_DIR = path.join(os.homedir(), ".claude-pixel-agent");
const HEROES_PATH = path.join(DATA_DIR, "heroes.json");
const POLL_INTERVAL_MS = 500;
const IDLE_DELAY_MS = 8000;
const WAITING_DELAY_MS = 3000;

// ─── State ────────────────────────────────────────────────────────────────────

let wss: WebSocketServer | null = null;
const heroes = new Map<number, Hero>();
const fileWatchers = new Map<number, fs.FSWatcher>();
const pollTimers = new Map<number, NodeJS.Timeout>();
const idleTimers = new Map<number, NodeJS.Timeout>();
const fileOffsets = new Map<number, number>();
const fileToHeroId = new Map<string, number>(); // maps transcript file path → hero id
let nextHeroId = 1;
let directoryWatcher: fs.FSWatcher | null = null;
let directoryPollTimer: NodeJS.Timeout | null = null;

// ─── Persistence ──────────────────────────────────────────────────────────────

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function persistHeroes() {
  ensureDataDir();
  try {
    fs.writeFileSync(HEROES_PATH, JSON.stringify([...heroes.values()], null, 2));
  } catch {}
}

function loadPersistedHeroes() {
  ensureDataDir();
  try {
    if (fs.existsSync(HEROES_PATH)) {
      const saved: Hero[] = JSON.parse(fs.readFileSync(HEROES_PATH, "utf-8"));
      for (const h of saved) {
        heroes.set(h.id, h);
        if (h.id >= nextHeroId) nextHeroId = h.id + 1;
      }
    }
  } catch {}
}

// ─── Tool → Room/State Mapping ────────────────────────────────────────────────

function toolNameToRoom(toolName: string): DungeonRoom {
  const lower = toolName.toLowerCase();
  if (lower.includes("bash") || lower.includes("execute") || lower.includes("run")) {
    return "boss_arena";
  }
  if (lower.includes("web") || lower.includes("search") || lower.includes("fetch")) {
    return "boss_arena";
  }
  if (lower.includes("read") || lower.includes("view")) {
    return "boss_arena";
  }
  if (lower.includes("write") || lower.includes("edit") || lower.includes("create")) {
    return "boss_arena";
  }
  return "boss_arena";
}

function toolNameToState(toolName: string): HeroState {
  const lower = toolName.toLowerCase();
  if (lower.includes("bash") || lower.includes("execute")) return "fighting";
  if (lower.includes("web") || lower.includes("search")) return "casting";
  if (lower.includes("read") || lower.includes("view")) return "casting";
  if (lower.includes("write") || lower.includes("edit")) return "fighting";
  if (lower.includes("task") || lower.includes("agent")) return "fighting";
  return "fighting";
}

function formatToolStatus(toolName: string, input: Record<string, unknown>): string {
  const lower = toolName.toLowerCase();
  if (lower.includes("bash")) {
    const cmd = (input.command as string) || "";
    return `⚔️ Running: ${cmd.slice(0, 50)}`;
  }
  if (lower.includes("read") || lower.includes("view")) {
    const file = (input.file_path || input.path || input.filename || "") as string;
    return `📖 Reading: ${path.basename(file)}`;
  }
  if (lower.includes("write") || lower.includes("edit")) {
    const file = (input.file_path || input.path || "") as string;
    return `✍️ Writing: ${path.basename(file)}`;
  }
  if (lower.includes("web") || lower.includes("search")) {
    const q = (input.query || input.url || "") as string;
    return `🔍 Searching: ${String(q).slice(0, 40)}`;
  }
  if (lower.includes("task")) {
    return `⚡ Spawning Sub-Agent`;
  }
  return `🗡️ Using: ${toolName}`;
}

// ─── Hero Management ──────────────────────────────────────────────────────────

function createHero(agentId: number, transcriptPath: string): Hero {
  const name = `Agent-${String(agentId).padStart(3, "0")}`;
  const hero: Hero = {
    id: agentId,
    name,
    heroClass: "warrior",
    state: "idle",
    position: { ...ROOM_POSITIONS.corridor },
    room: "corridor",
    activeTools: [],
    subAgentTools: {},
    toolCount: { bash: 0, read: 0, write: 0, web: 0 },
    isWaiting: false,
    skills: [],
    level: 1,
    exp: 0,
    hp: 100,
    maxHp: 100,
    mp: 100,
    maxMp: 100,
    projectPath: path.dirname(transcriptPath),
  };
  heroes.set(agentId, hero);
  persistHeroes();
  return hero;
}

function updateHeroState(hero: Hero, state: HeroState, room: DungeonRoom) {
  hero.state = state;
  hero.room = room;
  hero.position = { ...ROOM_POSITIONS[room] };
  // Add slight random offset so heroes don't stack
  hero.position.x += (Math.random() - 0.5) * 40;
  hero.position.y += (Math.random() - 0.5) * 30;
}

function setHeroIdle(heroId: number) {
  const hero = heroes.get(heroId);
  if (!hero) return;
  clearIdleTimer(heroId);
  updateHeroState(hero, "resting", "rest_area");
  hero.isWaiting = true;
  hero.hp = Math.min(hero.maxHp, hero.hp + 10);
  hero.mp = Math.min(hero.maxMp, hero.mp + 15);
  persistHeroes();
  broadcast({ type: "hero-update", payload: hero });
}

function clearIdleTimer(heroId: number) {
  const t = idleTimers.get(heroId);
  if (t) { clearTimeout(t); idleTimers.delete(heroId); }
}

function scheduleIdle(heroId: number, delay: number) {
  clearIdleTimer(heroId);
  const t = setTimeout(() => setHeroIdle(heroId), delay);
  idleTimers.set(heroId, t);
}

// ─── JSONL Processing ─────────────────────────────────────────────────────────

function processLine(heroId: number, line: string) {
  let record: Record<string, unknown>;
  try {
    record = JSON.parse(line);
  } catch {
    return;
  }

  const hero = heroes.get(heroId);
  if (!hero) return;

  const type = record.type as string;

  if (type === "assistant") {
    const message = record.message as { content?: unknown[] } | undefined;
    const blocks = message?.content || [];
    const toolUseBlocks = (blocks as Record<string, unknown>[]).filter(
      (b) => b.type === "tool_use"
    );

    if (toolUseBlocks.length > 0) {
      clearIdleTimer(heroId);
      hero.isWaiting = false;

      for (const block of toolUseBlocks) {
        const toolName = (block.name as string) || "Unknown";
        const toolInput = (block.input as Record<string, unknown>) || {};
        const toolId = (block.id as string) || `t-${Date.now()}`;
        const status = formatToolStatus(toolName, toolInput);

        // Update tool counts for class detection
        const lower = toolName.toLowerCase();
        if (lower.includes("bash") || lower.includes("execute")) hero.toolCount.bash++;
        else if (lower.includes("web") || lower.includes("search")) hero.toolCount.web++;
        else if (lower.includes("read") || lower.includes("view")) hero.toolCount.read++;
        else if (lower.includes("write") || lower.includes("edit")) hero.toolCount.write++;

        // Update hero class
        hero.heroClass = detectHeroClass(hero.toolCount);

        // Add active tool
        const activeTool: ActiveTool = {
          id: toolId,
          name: toolName,
          status,
          startedAt: Date.now(),
        };

        // Check if it's a sub-agent tool (Task tool)
        const isSubAgent = lower.includes("task") || lower.includes("subagent");
        if (isSubAgent) {
          if (!hero.subAgentTools[toolId]) {
            hero.subAgentTools[toolId] = [];
          }
        } else {
          hero.activeTools = hero.activeTools.filter((t) => t.id !== toolId);
          hero.activeTools.push(activeTool);
        }

        // Update state
        const newState = toolNameToState(toolName);
        const newRoom = toolNameToRoom(toolName);
        updateHeroState(hero, newState, newRoom);

        // Gain EXP
        hero.exp += 5;
        if (hero.exp >= hero.level * 100) {
          hero.exp = 0;
          hero.level++;
          hero.maxHp += 10;
          hero.maxMp += 5;
          hero.hp = hero.maxHp;
          hero.mp = hero.maxMp;
          broadcast({ type: "hero-levelup", payload: { heroId, level: hero.level } });
        }

        broadcast({ type: "hero-tool-start", payload: { heroId, tool: activeTool } });
      }

      persistHeroes();
      broadcast({ type: "hero-update", payload: hero });
    } else {
      // Text response - hero is thinking/planning
      if (!hero.isWaiting) {
        updateHeroState(hero, "shopping", "shop");
        persistHeroes();
        broadcast({ type: "hero-update", payload: hero });
      }
    }
  } else if (type === "user") {
    const message = record.message as { content?: unknown[] } | undefined;
    const blocks = (message?.content || []) as Record<string, unknown>[];
    const toolResults = blocks.filter((b) => b.type === "tool_result");

    for (const result of toolResults) {
      const toolUseId = result.tool_use_id as string;
      hero.activeTools = hero.activeTools.filter((t) => t.id !== toolUseId);
      delete hero.subAgentTools[toolUseId];
      broadcast({ type: "hero-tool-done", payload: { heroId, toolId: toolUseId } });
    }

    if (hero.activeTools.length === 0 && Object.keys(hero.subAgentTools).length === 0) {
      scheduleIdle(heroId, WAITING_DELAY_MS);
    }

    persistHeroes();
    broadcast({ type: "hero-update", payload: hero });
  } else if (type === "system") {
    const subtype = record.subtype as string;
    if (subtype === "turn_duration" || subtype === "turn_end") {
      hero.activeTools = [];
      hero.subAgentTools = {};
      scheduleIdle(heroId, IDLE_DELAY_MS);
      persistHeroes();
      broadcast({ type: "hero-update", payload: hero });
    }
  }
}

function readNewLines(heroId: number, filePath: string) {
  try {
    const stat = fs.statSync(filePath);
    const offset = fileOffsets.get(heroId) || 0;

    if (stat.size <= offset) return;

    const fd = fs.openSync(filePath, "r");
    const buf = Buffer.alloc(stat.size - offset);
    fs.readSync(fd, buf, 0, buf.length, offset);
    fs.closeSync(fd);

    fileOffsets.set(heroId, stat.size);

    const newContent = buf.toString("utf-8");
    const lines = newContent.split("\n").filter((l) => l.trim());
    for (const line of lines) {
      processLine(heroId, line);
    }
  } catch {}
}

// ─── File Watching ────────────────────────────────────────────────────────────

function startWatchingFile(heroId: number, filePath: string) {
  // Stop existing watchers
  const existing = fileWatchers.get(heroId);
  if (existing) { try { existing.close(); } catch {} }
  const existingPoll = pollTimers.get(heroId);
  if (existingPoll) { clearInterval(existingPoll); }

  fileOffsets.set(heroId, 0);

  // Primary: fs.watch
  try {
    const watcher = fs.watch(filePath, () => {
      readNewLines(heroId, filePath);
    });
    fileWatchers.set(heroId, watcher);
  } catch {}

  // Secondary: polling (macOS reliability)
  const poll = setInterval(() => {
    readNewLines(heroId, filePath);
  }, POLL_INTERVAL_MS);
  pollTimers.set(heroId, poll);
}

function stopWatchingFile(heroId: number) {
  const watcher = fileWatchers.get(heroId);
  if (watcher) { try { watcher.close(); } catch {} fileWatchers.delete(heroId); }
  const poll = pollTimers.get(heroId);
  if (poll) { clearInterval(poll); pollTimers.delete(heroId); }
  clearIdleTimer(heroId);
  fileOffsets.delete(heroId);
}

function watchClaudeDirectory() {
  if (!fs.existsSync(CLAUDE_DIR)) {
    // Poll for directory creation
    directoryPollTimer = setInterval(() => {
      if (fs.existsSync(CLAUDE_DIR)) {
        clearInterval(directoryPollTimer!);
        directoryPollTimer = null;
        watchClaudeDirectory();
      }
    }, 2000);
    return;
  }

  // Watch for new JSONL files
  try {
    directoryWatcher = fs.watch(CLAUDE_DIR, (event, filename) => {
      if (filename && filename.endsWith(".jsonl")) {
        const fullPath = path.join(CLAUDE_DIR, filename);
        handleNewTranscriptFile(fullPath);
      }
    });
    console.log("[File Monitor] Watching:", CLAUDE_DIR);
  } catch (e) {
    console.error("[File Monitor] Failed to start watching:", e);
  }

  // Scan existing JSONL files
  try {
    const files = fs.readdirSync(CLAUDE_DIR).filter((f) => f.endsWith(".jsonl"));
    for (const file of files) {
      handleNewTranscriptFile(path.join(CLAUDE_DIR, file));
    }
  } catch {}
}

function handleNewTranscriptFile(filePath: string) {
  // Each JSONL file = one hero (one Claude Code session)
  let heroId: number | null = fileToHeroId.get(filePath) ?? null;

  if (heroId === null) {
    heroId = nextHeroId++;
    const hero = createHero(heroId, filePath);
    fileToHeroId.set(filePath, heroId);
    broadcast({ type: "hero-new", payload: hero });
    console.log(`[File Monitor] New hero created: ${hero.name} for ${filePath}`);
  }

  startWatchingFile(heroId, filePath);
}

// ─── Broadcast ────────────────────────────────────────────────────────────────

function broadcast(message: { type: string; payload: unknown }) {
  if (!wss) return;
  const data = JSON.stringify(message);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      try { client.send(data); } catch {}
    }
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function initializeWebSocket(server: unknown) {
  wss = new WebSocketServer({ server: server as any, path: "/api/ws/agents" });

  loadPersistedHeroes();

  wss.on("connection", (ws) => {
    console.log("[WebSocket] Client connected");

    // Send current state
    ws.send(JSON.stringify({
      type: "heroes-batch",
      payload: [...heroes.values()],
    }));

    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());
        handleClientMessage(msg);
      } catch {}
    });

    ws.on("close", () => console.log("[WebSocket] Client disconnected"));
    ws.on("error", (e) => console.error("[WebSocket] Error:", e));
  });

  watchClaudeDirectory();
}

function handleClientMessage(msg: { type: string; payload?: unknown }) {
  if (msg.type === "demo-start") {
    startDemo();
  } else if (msg.type === "demo-stop") {
    stopDemo();
  } else if (msg.type === "clear-heroes") {
    clearAllHeroes();
  }
}

// ─── Demo Mode ────────────────────────────────────────────────────────────────

let demoInterval: NodeJS.Timeout | null = null;
let demoHeroIds: number[] = [];

const DEMO_TOOLS = [
  { name: "Bash", input: { command: "npm run build" } },
  { name: "Read", input: { file_path: "src/components/App.tsx" } },
  { name: "Write", input: { file_path: "src/utils/helpers.ts" } },
  { name: "WebSearch", input: { query: "React hooks best practices" } },
  { name: "Bash", input: { command: "git commit -m 'feat: add dungeon ui'" } },
  { name: "Read", input: { file_path: "package.json" } },
];

function startDemo() {
  stopDemo();
  clearAllHeroes();

  // Create 3 demo heroes
  const classes: HeroClass[] = ["warrior", "mage", "cleric"];
  const names = ["Agent-Alpha", "Agent-Beta", "Agent-Gamma"];
  const rooms: DungeonRoom[] = ["boss_arena", "church", "rest_area"];
  const states: HeroState[] = ["fighting", "casting", "resting"];

  demoHeroIds = [];
  for (let i = 0; i < 3; i++) {
    const id = nextHeroId++;
    const hero: Hero = {
      id,
      name: names[i],
      heroClass: classes[i],
      state: states[i],
      position: { ...ROOM_POSITIONS[rooms[i]] },
      room: rooms[i],
      activeTools: [],
      subAgentTools: {},
      toolCount: { bash: 0, read: 0, write: 0, web: 0 },
      isWaiting: i === 2,
      skills: [["power_strike", "battle_cry"], ["arcane_boost", "mystic_sight"], ["divine_shield"]][i],
      level: [5, 3, 2][i],
      exp: [340, 120, 80][i],
      hp: [85, 60, 100][i],
      maxHp: [100, 70, 100][i],
      mp: [40, 90, 100][i],
      maxMp: [60, 100, 100][i],
    };
    heroes.set(id, hero);
    demoHeroIds.push(id);
    broadcast({ type: "hero-new", payload: hero });
  }

  persistHeroes();

  // Animate demo heroes
  let tick = 0;
  demoInterval = setInterval(() => {
    tick++;
    const heroId = demoHeroIds[tick % demoHeroIds.length];
    const hero = heroes.get(heroId);
    if (!hero) return;

    const tool = DEMO_TOOLS[tick % DEMO_TOOLS.length];
    const status = formatToolStatus(tool.name, tool.input);
    const state = toolNameToState(tool.name);
    const room = toolNameToRoom(tool.name);

    if (tick % 3 === 0) {
      // Rest phase
      updateHeroState(hero, "resting", "rest_area");
      hero.activeTools = [];
      hero.isWaiting = true;
      hero.hp = Math.min(hero.maxHp, hero.hp + 5);
      hero.mp = Math.min(hero.maxMp, hero.mp + 8);
    } else if (tick % 3 === 1) {
      // Shopping/planning phase
      updateHeroState(hero, "shopping", "shop");
      hero.isWaiting = false;
    } else {
      // Fighting phase
      updateHeroState(hero, state, room);
      hero.activeTools = [{ id: `demo-${tick}`, name: tool.name, status, startedAt: Date.now() }];
      hero.isWaiting = false;
      hero.mp = Math.max(0, hero.mp - 5);
    }

    hero.exp = Math.min(hero.level * 100 - 1, hero.exp + 10);
    persistHeroes();
    broadcast({ type: "hero-update", payload: hero });
  }, 2500);
}

function stopDemo() {
  if (demoInterval) { clearInterval(demoInterval); demoInterval = null; }
  for (const id of demoHeroIds) { heroes.delete(id); }
  demoHeroIds = [];
  persistHeroes();
  broadcast({ type: "heroes-batch", payload: [...heroes.values()] });
}

function clearAllHeroes() {
  for (const id of [...heroes.keys()]) {
    stopWatchingFile(id);
    clearIdleTimer(id);
  }
  heroes.clear();
  nextHeroId = 1;
  persistHeroes();
  broadcast({ type: "heroes-batch", payload: [] });
}

export function stopWebSocketMonitoring() {
  if (demoInterval) { clearInterval(demoInterval); demoInterval = null; }
  if (directoryWatcher) { try { directoryWatcher.close(); } catch {} directoryWatcher = null; }
  if (directoryPollTimer) { clearInterval(directoryPollTimer); directoryPollTimer = null; }
  for (const id of [...heroes.keys()]) stopWatchingFile(id);
  if (wss) { wss.close(); wss = null; }
}
