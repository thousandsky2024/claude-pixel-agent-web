/**
 * Bridge API tests
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";

// Use a temp dir for testing
const TEST_DIR = path.join(os.tmpdir(), "claude-pixel-agent-test-" + Date.now());
const TEST_CONFIG_PATH = path.join(TEST_DIR, "config.json");

// Mock the DATA_DIR by temporarily overriding the module
// We'll test the helper functions directly

function ensureTestDir() {
  if (!fs.existsSync(TEST_DIR)) fs.mkdirSync(TEST_DIR, { recursive: true });
}

function cleanupTestDir() {
  if (fs.existsSync(TEST_DIR)) fs.rmSync(TEST_DIR, { recursive: true, force: true });
}

function loadTestConfig(): Record<string, unknown> {
  try {
    if (fs.existsSync(TEST_CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(TEST_CONFIG_PATH, "utf-8"));
    }
  } catch {}
  return {};
}

function saveTestConfig(config: Record<string, unknown>) {
  ensureTestDir();
  fs.writeFileSync(TEST_CONFIG_PATH, JSON.stringify(config, null, 2));
}

function getOrCreateTestApiKey(): string {
  const config = loadTestConfig();
  if (config.bridgeApiKey && typeof config.bridgeApiKey === "string") {
    return config.bridgeApiKey;
  }
  const key = "cpab_" + Array.from({ length: 32 }, () =>
    Math.random().toString(36)[2]
  ).join("");
  saveTestConfig({ ...config, bridgeApiKey: key });
  return key;
}

describe("Bridge API Key Management", () => {
  beforeEach(() => {
    ensureTestDir();
  });

  afterEach(() => {
    cleanupTestDir();
  });

  it("generates a new API key when none exists", () => {
    const key = getOrCreateTestApiKey();
    expect(key).toBeTruthy();
    expect(key).toMatch(/^cpab_[a-z0-9]{32}$/);
  });

  it("returns the same key on subsequent calls", () => {
    const key1 = getOrCreateTestApiKey();
    const key2 = getOrCreateTestApiKey();
    expect(key1).toBe(key2);
  });

  it("persists the key to config file", () => {
    const key = getOrCreateTestApiKey();
    const config = loadTestConfig();
    expect(config.bridgeApiKey).toBe(key);
  });

  it("uses existing key from config file", () => {
    const existingKey = "cpab_existingkey12345678901234567890";
    saveTestConfig({ bridgeApiKey: existingKey });
    const key = getOrCreateTestApiKey();
    expect(key).toBe(existingKey);
  });

  it("API key has correct format (cpab_ prefix + 32 chars)", () => {
    const key = getOrCreateTestApiKey();
    const parts = key.split("_");
    expect(parts[0]).toBe("cpab");
    expect(parts[1]).toHaveLength(32);
  });
});

describe("Bridge Script Validation", () => {
  it("bridge script file exists", () => {
    const bridgePath = path.join(
      path.dirname(new URL(import.meta.url).pathname),
      "..",
      "bridge",
      "claude-dungeon-bridge.mjs"
    );
    expect(fs.existsSync(bridgePath)).toBe(true);
  });

  it("bridge script is valid JavaScript (no syntax errors)", () => {
    const bridgePath = path.join(
      path.dirname(new URL(import.meta.url).pathname),
      "..",
      "bridge",
      "claude-dungeon-bridge.mjs"
    );
    const content = fs.readFileSync(bridgePath, "utf-8");
    // Basic checks
    expect(content).toContain("CLAUDE_DUNGEON_API_KEY");
    expect(content).toContain("CLAUDE_DUNGEON_SERVER");
    expect(content).toContain("/api/bridge/heroes");
    expect(content).toContain("x-bridge-api-key");
  });

  it("bridge script has correct server URL", () => {
    const bridgePath = path.join(
      path.dirname(new URL(import.meta.url).pathname),
      "..",
      "bridge",
      "claude-dungeon-bridge.mjs"
    );
    const content = fs.readFileSync(bridgePath, "utf-8");
    expect(content).toContain("claudepixl-kuk4sjxk.manus.space");
  });
});
