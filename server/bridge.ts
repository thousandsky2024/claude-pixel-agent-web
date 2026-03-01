/**
 * Bridge API - Receives data from local Claude Code Bridge script
 *
 * The local bridge script runs on the user's machine, watches ~/.claude/projects/
 * and POSTs hero updates to this endpoint. This allows the cloud-hosted web app
 * to display real-time Claude Code activity without direct filesystem access.
 *
 * Security: protected by a shared API key stored in ~/.claude-pixel-agent/config.json
 */

import { Router, Request, Response } from "express";
import fs from "fs";
import path from "path";
import os from "os";

const DATA_DIR = path.join(os.homedir(), ".claude-pixel-agent");
const CONFIG_PATH = path.join(DATA_DIR, "config.json");

// ─── Config helpers ───────────────────────────────────────────────────────────

interface Config {
  bridgeApiKey?: string;
  claudeDir?: string;
}

function loadConfig(): Config {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
    }
  } catch {}
  return {};
}

function saveConfig(config: Config) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

function getOrCreateApiKey(): string {
  const config = loadConfig();
  if (config.bridgeApiKey) return config.bridgeApiKey;
  // Generate a random API key
  const key = "cpab_" + Array.from({ length: 32 }, () =>
    Math.random().toString(36)[2]
  ).join("");
  saveConfig({ ...config, bridgeApiKey: key });
  return key;
}

// ─── Auth middleware ──────────────────────────────────────────────────────────

function requireBridgeKey(req: Request, res: Response, next: () => void) {
  const key = req.headers["x-bridge-api-key"] as string | undefined;
  const validKey = getOrCreateApiKey();
  if (!key || key !== validKey) {
    res.status(401).json({ error: "Invalid or missing bridge API key" });
    return;
  }
  next();
}

// ─── Bridge router ────────────────────────────────────────────────────────────

export function createBridgeRouter(
  onHeroUpdate: (hero: Record<string, unknown>) => void,
  onHeroNew: (hero: Record<string, unknown>) => void,
  onHeroesBatch: (heroes: Record<string, unknown>[]) => void,
  onHeroClear: () => void,
) {
  const router = Router();

  /**
   * GET /api/bridge/status
   * Returns bridge connection status and API key info
   */
  router.get("/status", (_req: Request, res: Response) => {
    const config = loadConfig();
    res.json({
      ok: true,
      hasApiKey: !!config.bridgeApiKey,
      apiKeyPrefix: config.bridgeApiKey ? config.bridgeApiKey.slice(0, 10) + "..." : null,
    });
  });

  /**
   * GET /api/bridge/key
   * Returns (or creates) the bridge API key — only accessible from localhost
   */
  router.get("/key", (req: Request, res: Response) => {
    const host = req.hostname;
    // Allow localhost access only
    if (host !== "localhost" && host !== "127.0.0.1" && host !== "::1") {
      res.status(403).json({ error: "API key endpoint only accessible from localhost" });
      return;
    }
    const key = getOrCreateApiKey();
    res.json({ apiKey: key });
  });

  /**
   * POST /api/bridge/heroes
   * Receive a batch of heroes from the local bridge script
   * Body: { heroes: Hero[] }
   */
  router.post("/heroes", requireBridgeKey, (req: Request, res: Response) => {
    const { heroes } = req.body as { heroes: Record<string, unknown>[] };
    if (!Array.isArray(heroes)) {
      res.status(400).json({ error: "heroes must be an array" });
      return;
    }
    onHeroesBatch(heroes);
    res.json({ ok: true, count: heroes.length });
  });

  /**
   * POST /api/bridge/hero
   * Receive a single hero update from the local bridge script
   * Body: { hero: Hero, event: "new" | "update" }
   */
  router.post("/hero", requireBridgeKey, (req: Request, res: Response) => {
    const { hero, event } = req.body as {
      hero: Record<string, unknown>;
      event: "new" | "update";
    };
    if (!hero || typeof hero !== "object") {
      res.status(400).json({ error: "hero must be an object" });
      return;
    }
    if (event === "new") {
      onHeroNew(hero);
    } else {
      onHeroUpdate(hero);
    }
    res.json({ ok: true });
  });

  /**
   * POST /api/bridge/clear
   * Clear all heroes (e.g., when bridge disconnects)
   */
  router.post("/clear", requireBridgeKey, (_req: Request, res: Response) => {
    onHeroClear();
    res.json({ ok: true });
  });

  return router;
}

export { getOrCreateApiKey, loadConfig, saveConfig };
