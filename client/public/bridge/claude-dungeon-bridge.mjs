#!/usr/bin/env node
/**
 * Claude Dungeon Bridge Script
 *
 * Run this on your LOCAL machine to push Claude Code activity
 * to the cloud-hosted Claude Dungeon web app.
 *
 * Usage:
 *   node claude-dungeon-bridge.mjs --server https://claudepixl-kuk4sjxk.manus.space --key YOUR_API_KEY
 *
 * Or set environment variables:
 *   CLAUDE_DUNGEON_SERVER=https://claudepixl-kuk4sjxk.manus.space
 *   CLAUDE_DUNGEON_API_KEY=cpab_xxxxx
 *   node claude-dungeon-bridge.mjs
 *
 * How to get your API key:
 *   1. Open the Claude Dungeon web app
 *   2. Click "⚙️ Config" in the header
 *   3. Copy the Bridge API Key shown there
 *
 * Requirements: Node.js 18+, no npm install needed (uses built-in modules)
 */

import fs from "fs";
import path from "path";
import os from "os";
import { createHash } from "crypto";

// ─── Configuration ─────────────────────────────────────────────────────────────

const args = parseArgs(process.argv.slice(2));

const CONFIG = {
  server:
    args.server ||
    process.env.CLAUDE_DUNGEON_SERVER ||
    "https://claudepixl-kuk4sjxk.manus.space",
  apiKey: args.key || process.env.CLAUDE_DUNGEON_API_KEY || "",
  claudeDir:
    args["claude-dir"] ||
    process.env.CLAUDE_DIR ||
    path.join(os.homedir(), ".claude"),
  pollIntervalMs: parseInt(args["poll-interval"] || "1000", 10),
  pushIntervalMs: parseInt(args["push-interval"] || "2000", 10),
  verbose: args.verbose || process.env.VERBOSE === "1" || false,
};

const PROJECTS_DIR = path.join(CONFIG.claudeDir, "projects");

// ─── State ─────────────────────────────────────────────────────────────────────

const heroes = new Map(); // heroId → hero object
const fileToHeroId = new Map(); // filePath → heroId
const fileOffsets = new Map(); // heroId → file offset
const idleTimers = new Map(); // heroId → timeout
let nextHeroId = 1;
let pushTimer = null;
let pendingPush = false;

// ─── Arg Parser ────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        result[key] = next;
        i++;
      } else {
        result[key] = true;
      }
    }
  }
  return result;
}

// ─── Logging ──────────────────────────────────────────────────────────────────

function log(msg) {
  const time = new Date().toLocaleTimeString();
  console.log(`[${time}] ${msg}`);
}

function debug(msg) {
  if (CONFIG.verbose) log(`[DEBUG] ${msg}`);
}

// ─── Path Helpers ──────────────────────────────────────────────────────────────

function decodeProjectPath(encodedName) {
  // Claude encodes: /home/user/myproject → -home-user-myproject
  return encodedName.replace(/^-/, "/").replace(/-/g, "/");
}

function projectNameFromPath(realPath) {
  const parts = realPath.split("/").filter(Boolean);
  return parts[parts.length - 1] || realPath;
}

function heroIdFromFile(filePath) {
  // Generate a stable numeric ID from the file path
  const hash = createHash("md5").update(filePath).digest("hex");
  return parseInt(hash.slice(0, 8), 16) % 100000;
}

// ─── Hero Class Detection ──────────────────────────────────────────────────────

function detectHeroClass(toolCount) {
  const { bash, write, web, read } = toolCount;
  const total = bash + write + web + read || 1;
  if ((bash + write) / total > 0.5) return "warrior";
  if (web / total > 0.3) return "mage";
  return "cleric";
}

// ─── Room/State Mapping ────────────────────────────────────────────────────────

function toolNameToRoom(toolName) {
  const lower = toolName.toLowerCase();
  if (lower.includes("plan") || lower.includes("think")) return "shop";
  return "boss_arena";
}

function toolNameToState(toolName) {
  const lower = toolName.toLowerCase();
  if (lower.includes("bash") || lower.includes("execute")) return "fighting";
  if (lower.includes("write") || lower.includes("edit")) return "fighting";
  if (lower.includes("web") || lower.includes("search")) return "casting";
  if (lower.includes("read") || lower.includes("view")) return "casting";
  if (lower.includes("task") || lower.includes("agent")) return "fighting";
  return "fighting";
}

function formatToolStatus(toolName, input) {
  const lower = toolName.toLowerCase();
  if (lower.includes("bash")) {
    const cmd = (input.command || "").toString();
    return `⚔️ Running: ${cmd.slice(0, 50)}`;
  }
  if (lower.includes("read") || lower.includes("view")) {
    const file = (input.file_path || input.path || input.filename || "").toString();
    return `📖 Reading: ${path.basename(file)}`;
  }
  if (lower.includes("write") || lower.includes("edit")) {
    const file = (input.file_path || input.path || "").toString();
    return `✍️ Writing: ${path.basename(file)}`;
  }
  if (lower.includes("web") || lower.includes("search")) {
    const q = (input.query || input.url || "").toString();
    return `🔍 Searching: ${q.slice(0, 40)}`;
  }
  if (lower.includes("task")) return `⚡ Spawning Sub-Agent`;
  return `🗡️ Using: ${toolName}`;
}

// ─── Room Positions ────────────────────────────────────────────────────────────

const ROOM_POSITIONS = {
  boss_arena: { x: 490, y: 280 },
  church: { x: 260, y: 250 },
  shop: { x: 740, y: 250 },
  corridor: { x: 490, y: 480 },
  rest_area: { x: 260, y: 250 },
};

function randomOffset(pos) {
  return {
    x: pos.x + (Math.random() - 0.5) * 40,
    y: pos.y + (Math.random() - 0.5) * 30,
  };
}

// ─── Hero Management ──────────────────────────────────────────────────────────

function createHero(heroId, transcriptPath, projectRealPath) {
  const projectName = projectNameFromPath(projectRealPath);
  const name = `${projectName.slice(0, 8).toUpperCase()}-${String(heroId % 1000).padStart(3, "0")}`;
  const hero = {
    id: heroId,
    name,
    heroClass: "warrior",
    state: "idle",
    position: randomOffset(ROOM_POSITIONS.corridor),
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
    projectPath: projectRealPath,
    sessionFile: transcriptPath,
  };
  heroes.set(heroId, hero);
  fileToHeroId.set(transcriptPath, heroId);
  log(`⚔️ New hero: ${name} (${path.basename(transcriptPath)})`);
  return hero;
}

function scheduleRest(heroId) {
  const existing = idleTimers.get(heroId);
  if (existing) clearTimeout(existing);
  const t = setTimeout(() => {
    const hero = heroes.get(heroId);
    if (!hero) return;
    hero.state = "resting";
    hero.room = "rest_area";
    hero.position = randomOffset(ROOM_POSITIONS.church);
    hero.isWaiting = true;
    hero.activeTools = [];
    hero.hp = Math.min(hero.maxHp, hero.hp + 10);
    hero.mp = Math.min(hero.maxMp, hero.mp + 15);
    pendingPush = true;
    debug(`Hero ${hero.name} is now resting`);
  }, 8000);
  idleTimers.set(heroId, t);
}

// ─── JSONL Processing ──────────────────────────────────────────────────────────

function processLine(heroId, line) {
  let record;
  try {
    record = JSON.parse(line);
  } catch {
    return;
  }

  const hero = heroes.get(heroId);
  if (!hero) return;

  const type = record.type;

  // Tool use start
  if (type === "assistant") {
    const blocks = record.message?.content || [];
    const toolUseBlocks = blocks.filter((b) => b.type === "tool_use");

    if (toolUseBlocks.length > 0) {
      hero.isWaiting = false;
      const existing = idleTimers.get(heroId);
      if (existing) { clearTimeout(existing); idleTimers.delete(heroId); }

      for (const block of toolUseBlocks) {
        const toolName = block.name || "unknown";
        const toolId = block.id || `tool-${Date.now()}`;
        const input = block.input || {};

        // Update tool counts
        const lower = toolName.toLowerCase();
        if (lower.includes("bash") || lower.includes("execute")) hero.toolCount.bash++;
        else if (lower.includes("read") || lower.includes("view")) hero.toolCount.read++;
        else if (lower.includes("write") || lower.includes("edit") || lower.includes("create")) hero.toolCount.write++;
        else if (lower.includes("web") || lower.includes("search") || lower.includes("fetch")) hero.toolCount.web++;

        const activeTool = {
          id: toolId,
          name: toolName,
          status: formatToolStatus(toolName, input),
          startedAt: Date.now(),
        };

        const parentId = record.parent_tool_use_id;
        if (parentId) {
          if (!hero.subAgentTools[parentId]) hero.subAgentTools[parentId] = [];
          hero.subAgentTools[parentId].push(activeTool);
        } else {
          hero.activeTools.push(activeTool);
        }

        // Update hero state based on first tool
        if (hero.activeTools.length === 1 || toolUseBlocks.indexOf(block) === 0) {
          const room = toolNameToRoom(toolName);
          const state = toolNameToState(toolName);
          hero.state = state;
          hero.room = room;
          hero.position = randomOffset(ROOM_POSITIONS[room] || ROOM_POSITIONS.boss_arena);
        }
      }

      hero.heroClass = detectHeroClass(hero.toolCount);

      // EXP gain
      hero.exp += toolUseBlocks.length * 5;
      if (hero.exp >= hero.level * 100) {
        hero.level++;
        hero.exp = hero.exp % (hero.level * 100);
        hero.maxHp += 10;
        hero.maxMp += 5;
        hero.hp = hero.maxHp;
        hero.mp = hero.maxMp;
        log(`🎉 ${hero.name} leveled up to Lv.${hero.level}!`);
      }

      pendingPush = true;
    }
  }

  // Tool result
  if (type === "user") {
    const blocks = record.message?.content || [];
    const resultBlocks = blocks.filter((b) => b.type === "tool_result");

    if (resultBlocks.length > 0) {
      for (const block of resultBlocks) {
        const toolUseId = block.tool_use_id;
        hero.activeTools = hero.activeTools.filter((t) => t.id !== toolUseId);
        for (const key of Object.keys(hero.subAgentTools)) {
          hero.subAgentTools[key] = hero.subAgentTools[key].filter((t) => t.id !== toolUseId);
          if (hero.subAgentTools[key].length === 0) delete hero.subAgentTools[key];
        }
      }

      if (hero.activeTools.length === 0 && Object.keys(hero.subAgentTools).length === 0) {
        scheduleRest(heroId);
      }

      pendingPush = true;
    }
  }

  // Turn end
  if (type === "result" || type === "turn_end") {
    hero.activeTools = [];
    hero.subAgentTools = {};
    scheduleRest(heroId);
    pendingPush = true;
  }

  // System init
  if (type === "system" && record.subtype === "init") {
    hero.state = "idle";
    hero.room = "corridor";
    hero.position = randomOffset(ROOM_POSITIONS.corridor);
    pendingPush = true;
  }
}

// ─── File Polling ──────────────────────────────────────────────────────────────

function pollFile(heroId, filePath) {
  try {
    const stat = fs.statSync(filePath);
    const offset = fileOffsets.get(heroId) || 0;
    if (stat.size <= offset) return;

    const fd = fs.openSync(filePath, "r");
    const buf = Buffer.alloc(stat.size - offset);
    fs.readSync(fd, buf, 0, buf.length, offset);
    fs.closeSync(fd);
    fileOffsets.set(heroId, stat.size);

    const text = buf.toString("utf-8");
    const lines = text.split("\n").filter((l) => l.trim());
    for (const line of lines) {
      processLine(heroId, line);
    }
  } catch (e) {
    debug(`Error polling ${filePath}: ${e.message}`);
  }
}

// ─── Project Scanning ──────────────────────────────────────────────────────────

function scanProjects() {
  if (!fs.existsSync(PROJECTS_DIR)) {
    debug(`Projects dir not found: ${PROJECTS_DIR}`);
    return;
  }

  let projectDirs;
  try {
    projectDirs = fs.readdirSync(PROJECTS_DIR);
  } catch {
    return;
  }

  for (const encodedName of projectDirs) {
    const projectDir = path.join(PROJECTS_DIR, encodedName);
    let stat;
    try {
      stat = fs.statSync(projectDir);
    } catch {
      continue;
    }
    if (!stat.isDirectory()) continue;

    const realPath = decodeProjectPath(encodedName);

    let files;
    try {
      files = fs.readdirSync(projectDir);
    } catch {
      continue;
    }

    for (const file of files) {
      if (!file.endsWith(".jsonl")) continue;
      const filePath = path.join(projectDir, file);

      // Skip very old files (> 24 hours)
      try {
        const fstat = fs.statSync(filePath);
        const ageMs = Date.now() - fstat.mtimeMs;
        if (ageMs > 24 * 60 * 60 * 1000) continue;
      } catch {
        continue;
      }

      if (!fileToHeroId.has(filePath)) {
        const heroId = heroIdFromFile(filePath);
        if (!heroes.has(heroId)) {
          createHero(heroId, filePath, realPath);
          // Read existing content
          try {
            const size = fs.statSync(filePath).size;
            fileOffsets.set(heroId, 0);
            pollFile(heroId, filePath);
          } catch {}
        }
      } else {
        const heroId = fileToHeroId.get(filePath);
        pollFile(heroId, filePath);
      }
    }
  }
}

// ─── HTTP Push ─────────────────────────────────────────────────────────────────

async function pushHeroes() {
  if (!pendingPush) return;
  if (!CONFIG.apiKey) {
    debug("No API key set, skipping push");
    return;
  }

  pendingPush = false;
  const heroList = [...heroes.values()];

  try {
    const url = `${CONFIG.server}/api/bridge/heroes`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-bridge-api-key": CONFIG.apiKey,
      },
      body: JSON.stringify({ heroes: heroList }),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      const text = await res.text();
      log(`❌ Push failed (${res.status}): ${text}`);
    } else {
      debug(`✅ Pushed ${heroList.length} heroes to server`);
    }
  } catch (e) {
    log(`❌ Push error: ${e.message}`);
    pendingPush = true; // retry next cycle
  }
}

// ─── Main Loop ─────────────────────────────────────────────────────────────────

async function main() {
  console.log("╔════════════════════════════════════════╗");
  console.log("║     Claude Dungeon Bridge v1.0         ║");
  console.log("╚════════════════════════════════════════╝");
  console.log("");
  console.log(`  Server:    ${CONFIG.server}`);
  console.log(`  API Key:   ${CONFIG.apiKey ? CONFIG.apiKey.slice(0, 15) + "..." : "⚠️  NOT SET"}`);
  console.log(`  Claude Dir: ${CONFIG.claudeDir}`);
  console.log(`  Projects:  ${PROJECTS_DIR}`);
  console.log("");

  if (!CONFIG.apiKey) {
    console.log("⚠️  WARNING: No API key set!");
    console.log("   Get your key from the web app → Config → Bridge API Key");
    console.log("   Then run: CLAUDE_DUNGEON_API_KEY=cpab_xxx node claude-dungeon-bridge.mjs");
    console.log("");
  }

  if (!fs.existsSync(PROJECTS_DIR)) {
    console.log(`⚠️  Claude projects directory not found: ${PROJECTS_DIR}`);
    console.log("   Make sure Claude Code is installed and has been run at least once.");
    console.log("");
  }

  log("🏰 Bridge started. Watching for Claude Code activity...");
  log("   Press Ctrl+C to stop.");
  console.log("");

  // Initial scan
  scanProjects();
  if (pendingPush) await pushHeroes();

  // Poll loop
  setInterval(() => {
    scanProjects();
  }, CONFIG.pollIntervalMs);

  // Push loop
  setInterval(async () => {
    await pushHeroes();
  }, CONFIG.pushIntervalMs);

  // Graceful shutdown
  process.on("SIGINT", async () => {
    console.log("\n🛑 Shutting down bridge...");
    // Clear all heroes on the server
    if (CONFIG.apiKey) {
      try {
        await fetch(`${CONFIG.server}/api/bridge/clear`, {
          method: "POST",
          headers: { "x-bridge-api-key": CONFIG.apiKey },
          signal: AbortSignal.timeout(5000),
        });
        log("✅ Cleared heroes on server");
      } catch {}
    }
    process.exit(0);
  });
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
