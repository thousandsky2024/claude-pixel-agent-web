/**
 * DungeonMapPhaser – Phaser 3 渲染的地牢地图
 *
 * 替换原有的手写 Canvas 渲染，使用 Phaser 3 提供：
 * - 像素完美渲染（pixelArt: true）
 * - 相机跟随英雄
 * - 精灵动画管理（AnimationManager）
 * - 粒子效果（火把、传送门）
 * - 场景管理
 *
 * 数据桥接：React state → Phaser 通过 EventEmitter 传递
 */

import { useEffect, useRef } from "react";
import Phaser from "phaser";
import { HERO_CLASSES, type HeroState } from "../lib/dungeonConfig";
import type { Hero } from "../hooks/useHeroSocket";

// ─── Tile / Scale constants ───────────────────────────────────────────────────
const TILE = 16;
const SCALE = 3;
const TS = TILE * SCALE; // 48px per tile

const MAP_COLS = 70;
const MAP_ROWS = 40;
const CANVAS_W = MAP_COLS * TS; // 3360
const CANVAS_H = MAP_ROWS * TS; // 1920

// ─── Room definitions ─────────────────────────────────────────────────────────
const ROOMS = {
  spawn:   { c0: 0,  r0: 0,  c1: 19, r1: 19 },
  dungeon: { c0: 20, r0: 0,  c1: 39, r1: 19 },
  boss:    { c0: 40, r0: 0,  c1: 69, r1: 39 },
  shop:    { c0: 0,  r0: 20, c1: 19, r1: 39 },
  rest:    { c0: 20, r0: 20, c1: 39, r1: 39 },
} as const;

type RoomId = keyof typeof ROOMS;

const ROOM_WALKABLE: Record<RoomId, { c0: number; r0: number; c1: number; r1: number }> = {
  spawn:   { c0: 2,  r0: 2,  c1: 16, r1: 16 },
  dungeon: { c0: 22, r0: 2,  c1: 34, r1: 16 },
  boss:    { c0: 42, r0: 2,  c1: 67, r1: 37 },
  shop:    { c0: 2,  r0: 22, c1: 16, r1: 37 },
  rest:    { c0: 22, r0: 22, c1: 37, r1: 37 },
};

const ROOM_CENTERS: Record<RoomId, { col: number; row: number }> = {
  spawn:   { col: 9,  row: 9  },
  dungeon: { col: 28, row: 9  },
  boss:    { col: 57, row: 21 },
  shop:    { col: 13, row: 29 },
  rest:    { col: 29, row: 29 },
};

// ─── Walkable grid ────────────────────────────────────────────────────────────
function buildWalkableGrid(): boolean[][] {
  const grid: boolean[][] = Array.from({ length: MAP_ROWS }, () =>
    new Array(MAP_COLS).fill(false)
  );
  for (const w of Object.values(ROOM_WALKABLE)) {
    for (let r = w.r0; r <= w.r1; r++)
      for (let c = w.c0; c <= w.c1; c++)
        if (r >= 0 && r < MAP_ROWS && c >= 0 && c < MAP_COLS)
          grid[r][c] = true;
  }
  // Corridors
  for (let r = 8;  r <= 11; r++) for (let c = 16; c <= 22; c++) grid[r][c] = true;
  for (let r = 8;  r <= 11; r++) for (let c = 34; c <= 42; c++) grid[r][c] = true;
  for (let c = 7;  c <= 12; c++) for (let r = 16; r <= 22; r++) grid[r][c] = true;
  for (let c = 27; c <= 32; c++) for (let r = 16; r <= 22; r++) grid[r][c] = true;
  for (let r = 27; r <= 32; r++) for (let c = 16; c <= 22; c++) grid[r][c] = true;
  for (let r = 35; r <= 38; r++) for (let c = 37; c <= 42; c++) grid[r][c] = true;
  return grid;
}
const WALKABLE = buildWalkableGrid();

// ─── BFS pathfinding ──────────────────────────────────────────────────────────
function bfsPath(
  fromCol: number, fromRow: number,
  toCol: number, toRow: number
): Array<{ col: number; row: number }> {
  if (fromCol === toCol && fromRow === toRow) return [];
  const fc = Math.max(0, Math.min(MAP_COLS - 1, fromCol));
  const fr = Math.max(0, Math.min(MAP_ROWS - 1, fromRow));
  const tc = Math.max(0, Math.min(MAP_COLS - 1, toCol));
  const tr = Math.max(0, Math.min(MAP_ROWS - 1, toRow));

  type Node = { col: number; row: number; parent: Node | null };
  const visited = new Uint8Array(MAP_ROWS * MAP_COLS);
  const queue: Node[] = [{ col: fc, row: fr, parent: null }];
  visited[fr * MAP_COLS + fc] = 1;
  const dirs = [[0,1],[0,-1],[1,0],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]];

  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (cur.col === tc && cur.row === tr) {
      const path: Array<{ col: number; row: number }> = [];
      let node: Node | null = cur;
      while (node) { path.unshift({ col: node.col, row: node.row }); node = node.parent; }
      return path.slice(1);
    }
    for (const [dc, dr] of dirs) {
      const nc = cur.col + dc, nr = cur.row + dr;
      if (nc < 0 || nc >= MAP_COLS || nr < 0 || nr >= MAP_ROWS) continue;
      if (!WALKABLE[nr][nc]) continue;
      const idx = nr * MAP_COLS + nc;
      if (visited[idx]) continue;
      visited[idx] = 1;
      queue.push({ col: nc, row: nr, parent: cur });
    }
  }
  return [{ col: tc, row: tr }];
}

function heroRoomToRoomId(room: string | undefined): RoomId {
  const map: Record<string, RoomId> = {
    church: "spawn", corridor: "dungeon", boss_arena: "boss",
    shop: "shop", rest_area: "rest",
  };
  return map[room || "church"] || "spawn";
}

// ─── Phaser Scene ─────────────────────────────────────────────────────────────

const HERO_SPEED = 2.5;
const HERO_SCALE_FACTOR = 4;
const SPAWN_DURATION = 50;

interface HeroSprite {
  sprite: Phaser.GameObjects.Sprite;
  nameTag: Phaser.GameObjects.Text;
  hpBar: Phaser.GameObjects.Graphics;
  glowCircle: Phaser.GameObjects.Graphics;
  // Movement state
  px: number;
  py: number;
  col: number;
  row: number;
  path: Array<{ col: number; row: number }>;
  pathIdx: number;
  isMoving: boolean;
  facingLeft: boolean;
  spawnPhase: "spawning" | "alive" | "despawning" | "gone";
  spawnTimer: number;
  targetRoom: RoomId;
  lastKnownRoom: RoomId;
}

class DungeonScene extends Phaser.Scene {
  private bg!: Phaser.GameObjects.Image;
  private heroSprites: Map<number, HeroSprite> = new Map();
  private heroData: Hero[] = [];
  private selectedHeroId: number | null = null;
  private onHeroClick: (id: number) => void = () => {};

  // Zoom / pan state
  private isDragging = false;
  private lastPointerX = 0;
  private lastPointerY = 0;
  private hasDragged = false;
  private readonly MIN_ZOOM = 0.25;
  private readonly MAX_ZOOM = 4;

  // NPC sprites
  private bossSprite!: Phaser.GameObjects.Sprite;
  private guardianSprite!: Phaser.GameObjects.Sprite;
  private witchSprite!: Phaser.GameObjects.Sprite;

  // Ambient effects
  private torchEmitters: Phaser.GameObjects.Particles.ParticleEmitter[] = [];
  private roomGlows: Phaser.GameObjects.Graphics[] = [];
  private roomLabels: Phaser.GameObjects.Text[] = [];
  private tick = 0;

  constructor() {
    super({ key: "DungeonScene" });
  }

  preload() {
    // Background
    this.load.image("dungeon_bg", "/sprites/mv/tilesets/dungeon_bg_v2.png");

    // Player sprites (spritesheet: frameW=16, frameH=16)
    this.load.spritesheet("player_idle_r",   "/sprites/mv/player/char_idle_right_anim.png",  { frameWidth: 16, frameHeight: 16 });
    this.load.spritesheet("player_idle_l",   "/sprites/mv/player/char_idle_left_anim.png",   { frameWidth: 16, frameHeight: 16 });
    this.load.spritesheet("player_run_r",    "/sprites/mv/player/char_run_right_anim.png",   { frameWidth: 16, frameHeight: 16 });
    this.load.spritesheet("player_run_l",    "/sprites/mv/player/char_run_left_anim.png",    { frameWidth: 16, frameHeight: 16 });
    this.load.spritesheet("player_attack_r", "/sprites/mv/player/char_attack_00_right_anim.png", { frameWidth: 16, frameHeight: 16 });
    this.load.spritesheet("player_attack_l", "/sprites/mv/player/char_attack_00_left_anim.png",  { frameWidth: 16, frameHeight: 16 });
    this.load.spritesheet("player_death",    "/sprites/mv/player/char_death_right_anim.png",  { frameWidth: 16, frameHeight: 16 });

    // Boss (48×48, 6 frames → 288×48)
    this.load.spritesheet("boss_idle",   "/sprites/mv/boss/lord_wizard_idle_anim.png",          { frameWidth: 48, frameHeight: 48 });
    this.load.spritesheet("boss_attack", "/sprites/mv/boss/lord_wizard_attack_00_right_anim.png", { frameWidth: 48, frameHeight: 48 });

    // Guardian (16×16, 12 frames → 192×16)
    this.load.spritesheet("guardian_idle",   "/sprites/mv/enemies/guardian_idle_right_anim.png",   { frameWidth: 16, frameHeight: 16 });
    this.load.spritesheet("guardian_attack", "/sprites/mv/enemies/guardian_attack_right_anim.png",  { frameWidth: 16, frameHeight: 16 });

    // Witch (32×32, 10 frames → 320×32)
    this.load.spritesheet("witch_idle", "/sprites/mv/npcs/witch_merchant_idle.png", { frameWidth: 32, frameHeight: 32 });

    // Torch (16×16, 4 frames → 64×16) and tall torch (16×48, 4 frames → 64×48)
    this.load.spritesheet("torch_s", "/sprites/mv/props/light_source_00_anim.png", { frameWidth: 16, frameHeight: 16 });
    this.load.spritesheet("torch_t", "/sprites/mv/props/light_source_03_anim.png", { frameWidth: 16, frameHeight: 48 });

    // Particle texture (small white dot) - created as canvas data URL
    const particleCanvas = document.createElement("canvas");
    particleCanvas.width = 8;
    particleCanvas.height = 8;
    const pCtx = particleCanvas.getContext("2d")!;
    const grad = pCtx.createRadialGradient(4, 4, 0, 4, 4, 4);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    pCtx.fillStyle = grad;
    pCtx.fillRect(0, 0, 8, 8);
    this.textures.addCanvas("particle", particleCanvas);
  }

  create() {
    // ── Background ──────────────────────────────────────────────────────────
    this.bg = this.add.image(0, 0, "dungeon_bg").setOrigin(0, 0);
    this.bg.setDisplaySize(CANVAS_W, CANVAS_H);

    // ── Animations ──────────────────────────────────────────────────────────
    this.createAnimations();

    // ── NPC Sprites ─────────────────────────────────────────────────────────
    const bossX = (ROOMS.boss.c0 + ROOMS.boss.c1 + 1) / 2 * TS;
    const bossY = (ROOMS.boss.r0 + ROOMS.boss.r1 + 1) / 2 * TS;
    this.bossSprite = this.add.sprite(bossX, bossY, "boss_idle")
      .setScale(5)
      .play("boss_idle");

    const guardX = (ROOMS.dungeon.c0 + ROOMS.dungeon.c1 + 1) / 2 * TS;
    const guardY = (ROOMS.dungeon.r0 + ROOMS.dungeon.r1 + 1) / 2 * TS;
    this.guardianSprite = this.add.sprite(guardX, guardY, "guardian_idle")
      .setScale(3.5)
      .play("guardian_idle");

    const witchX = (ROOMS.shop.c0 + ROOMS.shop.c1 + 1) / 2 * TS;
    const witchY = (ROOMS.shop.r0 + ROOMS.shop.r1 + 1) / 2 * TS;
    this.witchSprite = this.add.sprite(witchX, witchY, "witch_idle")
      .setScale(3.5)
      .play("witch_idle");

    // ── NPC Name Tags ───────────────────────────────────────────────────────
    this.add.text(bossX, bossY - 80, "LORD WIZARD", {
      fontSize: "14px", fontFamily: "monospace", color: "#FF4444",
      backgroundColor: "#000000cc", padding: { x: 6, y: 3 },
    }).setOrigin(0.5, 1);

    // ── Torches ─────────────────────────────────────────────────────────────
    this.createTorches();

    // ── Room Labels ─────────────────────────────────────────────────────────
    this.createRoomLabels();

    // ── Ambient Glow Graphics ───────────────────────────────────────────────
    this.createAmbientGlows();

    // ── Camera ──────────────────────────────────────────────────────────────
    this.cameras.main.setBounds(0, 0, CANVAS_W, CANVAS_H);
    this.cameras.main.setZoom(0.5);
    this.cameras.main.centerOn(CANVAS_W / 2, CANVAS_H / 2);

    // ── Input: zoom + pan ────────────────────────────────────────────────────
    // Prevent page scroll while the cursor is over the canvas
    this.sys.game.canvas.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });

    // Scroll-wheel zoom centred on the cursor position
    this.input.on('wheel', (pointer: Phaser.Input.Pointer, _gos: unknown, _dx: number, deltaY: number) => {
      const cam = this.cameras.main;
      const oldZoom = cam.zoom;
      const factor = deltaY < 0 ? 1.1 : 1 / 1.1;
      const newZoom = Phaser.Math.Clamp(oldZoom * factor, this.MIN_ZOOM, this.MAX_ZOOM);
      // World position under cursor before zoom change
      const worldX = cam.scrollX + pointer.x / oldZoom;
      const worldY = cam.scrollY + pointer.y / oldZoom;
      cam.setZoom(newZoom);
      // Re-anchor scroll so the same world point stays under the cursor
      cam.scrollX = worldX - pointer.x / newZoom;
      cam.scrollY = worldY - pointer.y / newZoom;
    });

    // Drag to pan; distinguish from a click on pointerup
    this.input.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
      this.isDragging = true;
      this.hasDragged = false;
      this.lastPointerX = ptr.x;
      this.lastPointerY = ptr.y;
      this.sys.game.canvas.style.cursor = 'grabbing';
    });

    this.input.on('pointermove', (ptr: Phaser.Input.Pointer) => {
      if (!this.isDragging) return;
      const dx = ptr.x - this.lastPointerX;
      const dy = ptr.y - this.lastPointerY;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) this.hasDragged = true;
      const cam = this.cameras.main;
      cam.scrollX -= dx / cam.zoom;
      cam.scrollY -= dy / cam.zoom;
      this.lastPointerX = ptr.x;
      this.lastPointerY = ptr.y;
    });

    this.input.on('pointerup', (ptr: Phaser.Input.Pointer) => {
      if (!this.hasDragged) {
        // Treat as click — check if a hero was hit
        const worldX = ptr.worldX;
        const worldY = ptr.worldY;
        for (const [id, hs] of this.heroSprites) {
          const dx = hs.px - worldX;
          const dy = hs.py - worldY;
          if (Math.sqrt(dx * dx + dy * dy) < 36) {
            this.onHeroClick(id);
            break;
          }
        }
      }
      this.isDragging = false;
      this.sys.game.canvas.style.cursor = 'grab';
    });
  }

  private createAnimations() {
    const anims = this.anims;

    // Player animations (96×16 → 6 frames; 128×16 → 8 frames; 160×16 → 10 frames)
    anims.create({ key: "player_idle_r",   frames: anims.generateFrameNumbers("player_idle_r",   { start: 0, end: 5 }),  frameRate: 6,  repeat: -1 });
    anims.create({ key: "player_idle_l",   frames: anims.generateFrameNumbers("player_idle_l",   { start: 0, end: 5 }),  frameRate: 6,  repeat: -1 });
    anims.create({ key: "player_run_r",    frames: anims.generateFrameNumbers("player_run_r",    { start: 0, end: 7 }),  frameRate: 12, repeat: -1 });
    anims.create({ key: "player_run_l",    frames: anims.generateFrameNumbers("player_run_l",    { start: 0, end: 7 }),  frameRate: 12, repeat: -1 });
    anims.create({ key: "player_attack_r", frames: anims.generateFrameNumbers("player_attack_r", { start: 0, end: 9 }),  frameRate: 10, repeat: -1 });
    anims.create({ key: "player_attack_l", frames: anims.generateFrameNumbers("player_attack_l", { start: 0, end: 9 }),  frameRate: 10, repeat: -1 });
    anims.create({ key: "player_death",    frames: anims.generateFrameNumbers("player_death",    { start: 0, end: 5 }),  frameRate: 8,  repeat: 0  });

    // Boss (288×48 → 6 frames idle; check attack separately)
    anims.create({ key: "boss_idle",   frames: anims.generateFrameNumbers("boss_idle",   { start: 0, end: 5 }), frameRate: 6,  repeat: -1 });
    anims.create({ key: "boss_attack", frames: anims.generateFrameNumbers("boss_attack", { start: 0, end: 5 }), frameRate: 10, repeat: -1 });

    // Guardian (192×16 → 12 frames idle; check attack separately)
    anims.create({ key: "guardian_idle",   frames: anims.generateFrameNumbers("guardian_idle",   { start: 0, end: 11 }), frameRate: 8,  repeat: -1 });
    anims.create({ key: "guardian_attack", frames: anims.generateFrameNumbers("guardian_attack", { start: 0, end: 11 }), frameRate: 10, repeat: -1 });

    // Witch (320×32 → 10 frames)
    anims.create({ key: "witch_idle", frames: anims.generateFrameNumbers("witch_idle", { start: 0, end: 9 }), frameRate: 8, repeat: -1 });

    // Torch (64×16 → 4 frames)
    anims.create({ key: "torch_s", frames: anims.generateFrameNumbers("torch_s", { start: 0, end: 3 }), frameRate: 8, repeat: -1 });
    anims.create({ key: "torch_t", frames: anims.generateFrameNumbers("torch_t", { start: 0, end: 3 }), frameRate: 8, repeat: -1 });
  }

  private createTorches() {
    const torchPositions: Array<{ x: number; y: number; tall: boolean }> = [
      // Spawn room
      { x: ROOMS.spawn.c0 * TS + 3 * TS, y: ROOMS.spawn.r0 * TS + 10 * TS, tall: false },
      { x: ROOMS.spawn.c1 * TS - 2 * TS, y: ROOMS.spawn.r0 * TS + 10 * TS, tall: false },
      // Dungeon main
      { x: ROOMS.dungeon.c0 * TS + 3 * TS, y: ROOMS.dungeon.r0 * TS + 7 * TS, tall: true },
      { x: ROOMS.dungeon.c1 * TS - 2 * TS, y: ROOMS.dungeon.r0 * TS + 7 * TS, tall: true },
      // Boss arena corners
      { x: ROOMS.boss.c0 * TS + 2 * TS, y: ROOMS.boss.r0 * TS + 3 * TS, tall: true },
      { x: ROOMS.boss.c1 * TS - 2 * TS, y: ROOMS.boss.r0 * TS + 3 * TS, tall: true },
      { x: ROOMS.boss.c0 * TS + 2 * TS, y: ROOMS.boss.r1 * TS - 3 * TS, tall: true },
      { x: ROOMS.boss.c1 * TS - 2 * TS, y: ROOMS.boss.r1 * TS - 3 * TS, tall: true },
      // Shop
      { x: ROOMS.shop.c0 * TS + 3 * TS, y: ROOMS.shop.r1 * TS - 4 * TS, tall: false },
      { x: ROOMS.shop.c1 * TS - 2 * TS, y: ROOMS.shop.r1 * TS - 4 * TS, tall: false },
      // Rest
      { x: ROOMS.rest.c0 * TS + 3 * TS, y: ROOMS.rest.r0 * TS + 6 * TS, tall: false },
      { x: ROOMS.rest.c1 * TS - 2 * TS, y: ROOMS.rest.r0 * TS + 6 * TS, tall: false },
    ];

    for (const tp of torchPositions) {
      const key = tp.tall ? "torch_t" : "torch_s";
      this.add.sprite(tp.x, tp.y, key).setScale(2.5).play(key);

      // Torch glow particle emitter
      const emitter = this.add.particles(tp.x, tp.y, "particle", {
        speed: { min: 10, max: 30 },
        angle: { min: 250, max: 290 },
        scale: { start: 0.3, end: 0 },
        alpha: { start: 0.6, end: 0 },
        tint: [0xff8822, 0xffaa44, 0xff6600],
        lifespan: { min: 300, max: 600 },
        frequency: 80,
        quantity: 1,
      });
      this.torchEmitters.push(emitter);
    }
  }

  private createRoomLabels() {
    const labelDefs: Array<{ room: RoomId; text: string; color: string }> = [
      { room: "spawn",   text: "⛪ HOLY SANCTUARY", color: "#AA88FF" },
      { room: "dungeon", text: "📜 DUNGEON MAIN",   color: "#88AAFF" },
      { room: "boss",    text: "⚔ BOSS ARENA",      color: "#FF4444" },
      { room: "shop",    text: "🔮 WITCH SHOP",      color: "#FFAA44" },
      { room: "rest",    text: "🍺 TAVERN REST",     color: "#44AA44" },
    ];

    for (const def of labelDefs) {
      const r = ROOMS[def.room];
      const lx = r.c0 * TS + 10;
      const ly = r.r0 * TS + 10;
      const label = this.add.text(lx, ly, def.text, {
        fontSize: "14px",
        fontFamily: "monospace",
        fontStyle: "bold",
        color: def.color,
        backgroundColor: "#000000bb",
        padding: { x: 6, y: 4 },
      }).setDepth(100);
      this.roomLabels.push(label);
    }
  }

  private createAmbientGlows() {
    // Spawn portal glow
    const spawnGfx = this.add.graphics().setDepth(5);
    this.roomGlows.push(spawnGfx);

    // Boss pentagram glow
    const bossGfx = this.add.graphics().setDepth(5);
    this.roomGlows.push(bossGfx);

    // Rest area glow
    const restGfx = this.add.graphics().setDepth(5);
    this.roomGlows.push(restGfx);
  }

  // Called from React to update hero data
  updateHeroes(heroes: Hero[], selectedId: number | null, onHeroClick: (id: number) => void) {
    this.heroData = heroes;
    this.selectedHeroId = selectedId;
    this.onHeroClick = onHeroClick;
  }

  update() {
    this.tick++;
    const t = this.tick;

    // ── Animate ambient glows ────────────────────────────────────────────────
    const spawnGfx = this.roomGlows[0];
    if (spawnGfx) {
      spawnGfx.clear();
      const r = ROOMS.spawn;
      const bx = (r.c0 + r.c1 + 1) / 2 * TS;
      const by = (r.r0 + r.r1 + 1) / 2 * TS * 0.84;
      const alpha = 0.25 + Math.sin(t * 0.06) * 0.1;
      spawnGfx.fillStyle(0x4488ff, alpha);
      spawnGfx.fillCircle(bx, by, 90);
    }

    const bossGfx = this.roomGlows[1];
    if (bossGfx) {
      bossGfx.clear();
      const bx = (ROOMS.boss.c0 + ROOMS.boss.c1 + 1) / 2 * TS;
      const by = (ROOMS.boss.r0 + ROOMS.boss.r1 + 1) / 2 * TS;
      const fighting = this.heroData.some(h => h.state === "fighting" || h.state === "casting");
      const alpha = fighting
        ? 0.15 + Math.sin(t * 0.1) * 0.08
        : 0.06 + Math.sin(t * 0.07) * 0.03;
      bossGfx.fillStyle(fighting ? 0xff0066 : 0xaa00ff, alpha);
      bossGfx.fillCircle(bx, by, 200);
    }

    const restGfx = this.roomGlows[2];
    if (restGfx) {
      restGfx.clear();
      const resting = this.heroData.filter(h => h.room === "rest_area");
      if (resting.length > 0) {
        const rx = (ROOMS.rest.c0 + ROOMS.rest.c1 + 1) / 2 * TS;
        const ry = (ROOMS.rest.r0 + ROOMS.rest.r1 + 1) / 2 * TS;
        const alpha = 0.18 + Math.sin(t * 0.06) * 0.08;
        restGfx.fillStyle(0x44cc44, alpha);
        restGfx.fillCircle(rx, ry, 100);
      }
    }

    // ── Boss animation ───────────────────────────────────────────────────────
    const fighting = this.heroData.some(h => h.state === "fighting" || h.state === "casting");
    const bossAnim = fighting ? "boss_attack" : "boss_idle";
    if (this.bossSprite.anims.currentAnim?.key !== bossAnim) {
      this.bossSprite.play(bossAnim);
    }

    // ── Sync heroes ──────────────────────────────────────────────────────────
    this.syncHeroes();
    this.updateHeroMovements();
    this.renderHeroSprites();
  }

  private syncHeroes() {
    const currentIds = new Set(this.heroData.map(h => h.id));

    // Add new heroes
    for (const hero of this.heroData) {
      if (!this.heroSprites.has(hero.id)) {
        this.spawnHeroSprite(hero);
      }
    }

    // Mark removed heroes for despawn
    for (const [id, hs] of this.heroSprites) {
      if (!currentIds.has(id) && hs.spawnPhase !== "despawning" && hs.spawnPhase !== "gone") {
        const spawnTile = ROOM_CENTERS.spawn;
        const path = bfsPath(hs.col, hs.row, spawnTile.col, spawnTile.row);
        hs.path = path;
        hs.pathIdx = 0;
        hs.isMoving = path.length > 0;
        hs.spawnPhase = "despawning";
        hs.spawnTimer = 0;
      }
    }
  }

  private spawnHeroSprite(hero: Hero) {
    const spawnTile = ROOM_CENTERS.spawn;
    const px = spawnTile.col * TS + TS / 2;
    const py = spawnTile.row * TS + TS / 2;

    const sprite = this.add.sprite(px, py, "player_idle_r")
      .setScale(HERO_SCALE_FACTOR)
      .setDepth(50)
      .play("player_idle_r");

    const nameTag = this.add.text(px, py - 40, hero.name.substring(0, 12), {
      fontSize: "11px",
      fontFamily: "monospace",
      fontStyle: "bold",
      color: HERO_CLASSES[hero.heroClass]?.color || "#FFFFFF",
      backgroundColor: "#000000dd",
      padding: { x: 4, y: 2 },
    }).setOrigin(0.5, 1).setDepth(60);

    const hpBar = this.add.graphics().setDepth(55);
    const glowCircle = this.add.graphics().setDepth(45);

    this.heroSprites.set(hero.id, {
      sprite, nameTag, hpBar, glowCircle,
      px, py, col: spawnTile.col, row: spawnTile.row,
      path: [], pathIdx: 0,
      isMoving: false, facingLeft: false,
      spawnPhase: "spawning", spawnTimer: 0,
      targetRoom: heroRoomToRoomId(hero.room),
      lastKnownRoom: "spawn",
    });
  }

  private updateHeroMovements() {
    const currentIds = new Set(this.heroData.map(h => h.id));

    for (const hero of this.heroData) {
      const hs = this.heroSprites.get(hero.id);
      if (!hs) continue;

      // Spawn animation
      if (hs.spawnPhase === "spawning") {
        hs.spawnTimer++;
        if (hs.spawnTimer >= SPAWN_DURATION) {
          hs.spawnPhase = "alive";
          const targetRoom = heroRoomToRoomId(hero.room);
          if (targetRoom !== "spawn") {
            const dest = ROOM_CENTERS[targetRoom];
            hs.path = bfsPath(hs.col, hs.row, dest.col, dest.row);
            hs.pathIdx = 0;
            hs.isMoving = hs.path.length > 0;
            hs.targetRoom = targetRoom;
          }
        }
        continue;
      }

      // Room change → recalculate BFS
      const targetRoom = heroRoomToRoomId(hero.room);
      if (targetRoom !== hs.targetRoom && hs.spawnPhase === "alive") {
        const dest = ROOM_CENTERS[targetRoom];
        hs.path = bfsPath(hs.col, hs.row, dest.col, dest.row);
        hs.pathIdx = 0;
        hs.isMoving = hs.path.length > 0;
        hs.targetRoom = targetRoom;
      }

      // Walk along BFS path
      if (hs.isMoving && hs.pathIdx < hs.path.length) {
        const nextTile = hs.path[hs.pathIdx];
        const targetPx = { x: nextTile.col * TS + TS / 2, y: nextTile.row * TS + TS / 2 };
        const dx = targetPx.x - hs.px;
        const dy = targetPx.y - hs.py;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < HERO_SPEED + 0.5) {
          hs.px = targetPx.x;
          hs.py = targetPx.y;
          hs.col = nextTile.col;
          hs.row = nextTile.row;
          hs.pathIdx++;
          if (hs.pathIdx >= hs.path.length) {
            hs.isMoving = false;
            hs.lastKnownRoom = hs.targetRoom;
            // Face toward NPC
            if (hs.targetRoom === "boss")    hs.facingLeft = false;
            else if (hs.targetRoom === "shop") hs.facingLeft = true;
            else if (hs.targetRoom === "dungeon") {
              const guardX = (ROOMS.dungeon.c0 + ROOMS.dungeon.c1 + 1) / 2 * TS;
              hs.facingLeft = hs.px > guardX;
            }
          }
        } else {
          hs.px += (dx / dist) * HERO_SPEED;
          hs.py += (dy / dist) * HERO_SPEED;
          hs.facingLeft = dx < 0;
        }
      }
    }

    // Update despawning heroes
    for (const [id, hs] of this.heroSprites) {
      if (currentIds.has(id)) continue;
      if (hs.spawnPhase === "despawning") {
        if (hs.isMoving && hs.pathIdx < hs.path.length) {
          const nextTile = hs.path[hs.pathIdx];
          const targetPx = { x: nextTile.col * TS + TS / 2, y: nextTile.row * TS + TS / 2 };
          const dx = targetPx.x - hs.px;
          const dy = targetPx.y - hs.py;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < HERO_SPEED * 2 + 0.5) {
            hs.px = targetPx.x; hs.py = targetPx.y;
            hs.col = nextTile.col; hs.row = nextTile.row;
            hs.pathIdx++;
            if (hs.pathIdx >= hs.path.length) hs.isMoving = false;
          } else {
            hs.px += (dx / dist) * HERO_SPEED * 2;
            hs.py += (dy / dist) * HERO_SPEED * 2;
            hs.facingLeft = dx < 0;
          }
        } else {
          hs.spawnTimer++;
          if (hs.spawnTimer >= SPAWN_DURATION) hs.spawnPhase = "gone";
        }
      }

      if (hs.spawnPhase === "gone") {
        hs.sprite.destroy();
        hs.nameTag.destroy();
        hs.hpBar.destroy();
        hs.glowCircle.destroy();
        this.heroSprites.delete(id);
      }
    }
  }

  private renderHeroSprites() {
    for (const [id, hs] of this.heroSprites) {
      if (hs.spawnPhase === "gone") continue;

      const hero = this.heroData.find(h => h.id === id);
      const state = (hero?.state || "walking") as HeroState;
      const isSelected = id === this.selectedHeroId;

      // Alpha for spawn/despawn
      let alpha = 1;
      if (hs.spawnPhase === "spawning") {
        alpha = hs.spawnTimer / SPAWN_DURATION;
      } else if (hs.spawnPhase === "despawning") {
        alpha = 1 - hs.spawnTimer / SPAWN_DURATION;
      }

      // Update sprite position
      hs.sprite.setPosition(hs.px, hs.py);
      hs.sprite.setAlpha(alpha);

      // Update animation
      let animKey: string;
      if (hs.isMoving) {
        animKey = hs.facingLeft ? "player_run_l" : "player_run_r";
      } else if (state === "fighting" || state === "casting") {
        animKey = hs.facingLeft ? "player_attack_l" : "player_attack_r";
      } else {
        animKey = hs.facingLeft ? "player_idle_l" : "player_idle_r";
      }
      if (hs.sprite.anims.currentAnim?.key !== animKey) {
        hs.sprite.play(animKey);
      }

      // Selection glow
      hs.glowCircle.clear();
      if (isSelected) {
        hs.glowCircle.lineStyle(3, 0xFFD700, 0.9);
        hs.glowCircle.strokeCircle(hs.px, hs.py, 28);
        hs.glowCircle.fillStyle(0xFFD700, 0.15);
        hs.glowCircle.fillCircle(hs.px, hs.py, 28);
      }
      // State glow
      if (state === "fighting" || state === "casting") {
        hs.glowCircle.fillStyle(0xff2200, 0.12 + Math.sin(this.tick * 0.1) * 0.06);
        hs.glowCircle.fillCircle(hs.px, hs.py, 40);
      } else if (state === "resting") {
        hs.glowCircle.fillStyle(0x44cc44, 0.1);
        hs.glowCircle.fillCircle(hs.px, hs.py, 35);
      }

      // Name tag
      hs.nameTag.setPosition(hs.px, hs.py - 40);
      hs.nameTag.setAlpha(alpha);

      // HP bar
      hs.hpBar.clear();
      if (hero) {
        const hpPct = hero.hp / hero.maxHp;
        const barW = 48, barH = 5;
        const bx = hs.px - barW / 2, by = hs.py - 55;
        hs.hpBar.fillStyle(0x330000, 0.8);
        hs.hpBar.fillRect(bx, by, barW, barH);
        const hpColor = hpPct > 0.5 ? 0xff4444 : hpPct > 0.25 ? 0xff8800 : 0xff2200;
        hs.hpBar.fillStyle(hpColor, 1);
        hs.hpBar.fillRect(bx, by, barW * hpPct, barH);
        hs.hpBar.setAlpha(alpha);
      }
    }
  }
}

// ─── React Component ──────────────────────────────────────────────────────────

interface Props {
  heroes: Hero[];
  selectedHeroId: number | null;
  onHeroClick: (id: number) => void;
}

export default function DungeonMapPhaser({ heroes, selectedHeroId, onHeroClick }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const sceneRef = useRef<DungeonScene | null>(null);

  // Initialize Phaser once
  useEffect(() => {
    if (!containerRef.current || gameRef.current) return;

    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      width: CANVAS_W,
      height: CANVAS_H,
      backgroundColor: "#0a0810",
      parent: containerRef.current,
      pixelArt: true,
      antialias: false,
      roundPixels: true,
      render: {
        antialias: false,
        pixelArt: true,
        roundPixels: true,
      },
      scale: {
        mode: Phaser.Scale.NONE,
        width: CANVAS_W,
        height: CANVAS_H,
      },
      scene: [DungeonScene],
    };

    const game = new Phaser.Game(config);
    gameRef.current = game;

    // Get scene reference after it's created
    game.events.on("ready", () => {
      const scene = game.scene.getScene("DungeonScene") as DungeonScene;
      sceneRef.current = scene;
    });

    // Apply CSS scaling to fit container
    setTimeout(() => {
      const canvas = containerRef.current?.querySelector("canvas");
      if (canvas) {
        canvas.style.width = `${CANVAS_W * 0.5}px`;
        canvas.style.height = `${CANVAS_H * 0.5}px`;
        canvas.style.imageRendering = "pixelated";
        canvas.style.display = "block";
        canvas.style.cursor = "grab";
      }
    }, 200);

    return () => {
      game.destroy(true);
      gameRef.current = null;
      sceneRef.current = null;
    };
  }, []);

  // Sync hero data to Phaser scene on every render
  useEffect(() => {
    if (sceneRef.current) {
      sceneRef.current.updateHeroes(heroes, selectedHeroId, onHeroClick);
    }
  }, [heroes, selectedHeroId, onHeroClick]);

  // Apply canvas CSS after Phaser creates it
  useEffect(() => {
    const applyStyle = () => {
      if (containerRef.current) {
        const canvas = containerRef.current.querySelector("canvas");
        if (canvas) {
          canvas.style.width = `${CANVAS_W * 0.5}px`;
          canvas.style.height = `${CANVAS_H * 0.5}px`;
          canvas.style.imageRendering = "pixelated";
          canvas.style.display = "block";
          canvas.style.flexShrink = "0";
          canvas.style.cursor = "grab";
        }
      }
    };
    const timer1 = setTimeout(applyStyle, 300);
    const timer2 = setTimeout(applyStyle, 1000);
    return () => { clearTimeout(timer1); clearTimeout(timer2); };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        cursor: "grab",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        backgroundColor: "#0a0810",
        display: "block",
        lineHeight: 0,
        fontSize: 0,
      }}
    />
  );
}
