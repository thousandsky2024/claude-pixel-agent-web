/**
 * DungeonMap – seamless castle tilemap with BFS grid pathfinding
 *
 * Layout (in tiles, TILE=16px, SCALE=3 → 48px/tile on screen):
 *
 *  ┌──────────────────────────────────────────────────────────────────────────┐
 *  │  SPAWN (library)  │  corridor  │   DUNGEON MAIN (dungeon)               │
 *  │   cols 0-14       │  15-17     │   cols 18-37                           │
 *  │   rows 0-19       │  rows 5-14 │   rows 0-19                            │
 *  ├───────────────────┴────────────┤                                        │
 *  │                                │                                        │
 *  │  WITCH SHOP (witch_shop)       ├────────────────────────────────────────┤
 *  │  cols 0-17, rows 20-34         │  BOSS ARENA (boss_room)                │
 *  │                                │  cols 38-79, rows 0-34                 │
 *  ├────────────────────────────────┤                                        │
 *  │  REST AREA (dungeon, green)    │                                        │
 *  │  cols 0-17, rows 35-49         │                                        │
 *  └────────────────────────────────┴────────────────────────────────────────┘
 *
 * All rooms share walls (no black gaps). Corridors are part of room tiles.
 * BFS pathfinding runs on the walkable tile grid.
 */

import { useCallback, useEffect, useRef } from "react";
import {
  HERO_CLASSES,
  type HeroState,
} from "../lib/dungeonConfig";
import type { Hero } from "../hooks/useHeroSocket";

// ─── Tile / Scale constants ───────────────────────────────────────────────────
const TILE = 16;   // source tile size in pixels
const SCALE = 3;   // render scale (48px per tile on screen)
const TS = TILE * SCALE; // 48 – rendered tile size

// Map dimensions in tiles
// Layout: 3 columns × 2 rows arrangement
//  [SPAWN 20w×20h] [DUNGEON 20w×20h] [BOSS ARENA 30w×40h]
//  [SHOP  20w×20h] [REST    20w×20h] [
// Total: 70 cols × 40 rows → aspect ratio 70:40 = 1.75:1 (close to 16:9)
const MAP_COLS = 70;
const MAP_ROWS = 40;

// ─── Room definitions (in tile coords) ───────────────────────────────────────
// Each room: { c0, r0, c1, r1 } – inclusive tile range

const ROOMS = {
  spawn:    { c0: 0,  r0: 0,  c1: 19, r1: 19 }, // Holy Sanctuary / spawn
  dungeon:  { c0: 20, r0: 0,  c1: 39, r1: 19 }, // Dungeon Main (transit hub)
  boss:     { c0: 40, r0: 0,  c1: 69, r1: 39 }, // Boss Arena (large, full height)
  shop:     { c0: 0,  r0: 20, c1: 19, r1: 39 }, // Witch Shop / planning
  rest:     { c0: 20, r0: 20, c1: 39, r1: 39 }, // Rest Area / tavern
} as const;

type RoomId = keyof typeof ROOMS;

// Walkable interior (2-tile margin from walls)
const WALK_MARGIN = 2;
function walkableRect(room: typeof ROOMS[RoomId]) {
  return {
    c0: room.c0 + WALK_MARGIN,
    r0: room.r0 + WALK_MARGIN,
    c1: room.c1 - WALK_MARGIN,
    r1: room.r1 - WALK_MARGIN,
  };
}

// Room center tile (for pathfinding destination)
function roomCenter(room: typeof ROOMS[RoomId]): { col: number; row: number } {
  return {
    col: Math.floor((room.c0 + room.c1) / 2),
    row: Math.floor((room.r0 + room.r1) / 2),
  };
}

const ROOM_CENTERS: Record<RoomId, { col: number; row: number }> = {
  spawn:   roomCenter(ROOMS.spawn),
  // Dungeon: heroes stop 2 tiles to the LEFT of Guardian center (in front of Guardian for dialogue)
  dungeon: { col: Math.floor((ROOMS.dungeon.c0 + ROOMS.dungeon.c1) / 2) - 2, row: Math.floor((ROOMS.dungeon.r0 + ROOMS.dungeon.r1) / 2) },
  // Boss: heroes stop 2 tiles to the LEFT of boss (close combat, col=57)
  // Boss is at col=58.6, so col=57 puts hero right next to boss
  boss:    { col: 57, row: 21 },
  // Shop: heroes stop 3 tiles to the RIGHT of witch center (witch is on the left)
  shop:    { col: Math.round((ROOMS.shop.c0 + ROOMS.shop.c1 + 1) / 2) + 3, row: Math.floor((ROOMS.shop.r0 + ROOMS.shop.r1) / 2) },
  rest:    roomCenter(ROOMS.rest),
};

// ─── Walkable grid ────────────────────────────────────────────────────────────
// Build a boolean grid: true = walkable

function buildWalkableGrid(): boolean[][] {
  const grid: boolean[][] = Array.from({ length: MAP_ROWS }, () =>
    new Array(MAP_COLS).fill(false)
  );

  // Mark each room's interior as walkable
  for (const room of Object.values(ROOMS)) {
    const w = walkableRect(room);
    for (let r = w.r0; r <= w.r1; r++) {
      for (let c = w.c0; c <= w.c1; c++) {
        if (r >= 0 && r < MAP_ROWS && c >= 0 && c < MAP_COLS) {
          grid[r][c] = true;
        }
      }
    }
  }

  // Add corridor connections between rooms (4-tile wide passages aligned with arch positions)
  // spawn ↔ dungeon: HORIZONTAL corridor at cols 17-22, rows 8-11 (arch center ~row 9-10)
  for (let r = 8; r <= 11; r++) for (let c = 17; c <= 22; c++) grid[r][c] = true;
  // dungeon ↔ boss: HORIZONTAL corridor at cols 37-42, rows 8-11
  for (let r = 8; r <= 11; r++) for (let c = 37; c <= 42; c++) grid[r][c] = true;
  // spawn ↔ shop: VERTICAL corridor at rows 17-22, cols 7-12 (arch center ~col 9-10)
  for (let c = 7; c <= 12; c++) for (let r = 17; r <= 22; r++) grid[r][c] = true;
  // dungeon ↔ rest: VERTICAL corridor at rows 17-22, cols 27-32 (arch center ~col 29-30)
  for (let c = 27; c <= 32; c++) for (let r = 17; r <= 22; r++) grid[r][c] = true;
  // shop ↔ rest: HORIZONTAL corridor at cols 17-22, rows 27-32 (arch center ~row 29-30)
  for (let r = 27; r <= 32; r++) for (let c = 17; c <= 22; c++) grid[r][c] = true;
  // boss ↔ rest: VERTICAL corridor at rows 17-22, cols 37-42
  for (let r = 17; r <= 22; r++) for (let c = 37; c <= 42; c++) grid[r][c] = true;

  return grid;
}

const WALKABLE = buildWalkableGrid();

// ─── BFS pathfinding ──────────────────────────────────────────────────────────

function bfsPath(
  fromCol: number, fromRow: number,
  toCol: number, toRow: number
): Array<{ col: number; row: number }> {
  if (fromCol === toCol && fromRow === toRow) return [];

  // Clamp to valid range
  const fc = Math.max(0, Math.min(MAP_COLS - 1, fromCol));
  const fr = Math.max(0, Math.min(MAP_ROWS - 1, fromRow));
  const tc = Math.max(0, Math.min(MAP_COLS - 1, toCol));
  const tr = Math.max(0, Math.min(MAP_ROWS - 1, toRow));

  type Node = { col: number; row: number; parent: Node | null };
  const visited = new Uint8Array(MAP_ROWS * MAP_COLS);
  const queue: Node[] = [{ col: fc, row: fr, parent: null }];
  visited[fr * MAP_COLS + fc] = 1;

  const dirs = [
    [0, 1], [0, -1], [1, 0], [-1, 0],
    [1, 1], [1, -1], [-1, 1], [-1, -1], // diagonals for smoother paths
  ];

  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (cur.col === tc && cur.row === tr) {
      // Reconstruct path
      const path: Array<{ col: number; row: number }> = [];
      let node: Node | null = cur;
      while (node) { path.unshift({ col: node.col, row: node.row }); node = node.parent; }
      return path.slice(1); // exclude start
    }
    for (const [dc, dr] of dirs) {
      const nc = cur.col + dc;
      const nr = cur.row + dr;
      if (nc < 0 || nc >= MAP_COLS || nr < 0 || nr >= MAP_ROWS) continue;
      if (!WALKABLE[nr][nc]) continue;
      const idx = nr * MAP_COLS + nc;
      if (visited[idx]) continue;
      visited[idx] = 1;
      queue.push({ col: nc, row: nr, parent: cur });
    }
  }

  // Fallback: direct line (shouldn't happen if grid is connected)
  return [{ col: tc, row: tr }];
}

// ─── Sprite paths ─────────────────────────────────────────────────────────────

const CASTLE_BG_URL = "https://d2xsxph8kpxj0f.cloudfront.net/310519663321243150/kUk4sJXkGLHTnK5J3QqqXR/dungeon_bg_v3_filled_30ca2d41.png";

const MV = {
  bgDungeon:   "/sprites/mv/tilesets/bg_00_dungeon.png",
  bgBossRoom:  "/sprites/mv/tilesets/bg_00_boss_room.png",
  bgWitchShop: "/sprites/mv/tilesets/bg_00_witch_shop.png",
  bgLibrary:   "/sprites/mv/tilesets/bg_00_library.png",
  bgCastle:    CASTLE_BG_URL,

  playerIdleR:   "/sprites/mv/player/char_idle_right_anim.png",
  playerIdleL:   "/sprites/mv/player/char_idle_left_anim.png",
  playerRunR:    "/sprites/mv/player/char_run_right_anim.png",
  playerRunL:    "/sprites/mv/player/char_run_left_anim.png",
  playerAttackR: "/sprites/mv/player/char_attack_00_right_anim.png",
  playerAttackL: "/sprites/mv/player/char_attack_00_left_anim.png",
  playerDeath:   "/sprites/mv/player/char_death_right_anim.png",

  bossIdle:    "/sprites/mv/boss/lord_wizard_idle_anim.png",
  bossAttack:  "/sprites/mv/boss/lord_wizard_attack_00_right_anim.png",
  bossStatic:  "/sprites/mv/boss/lord_wizard_static.png",

  guardianIdle:   "/sprites/mv/enemies/guardian_idle_right_anim.png",
  guardianAttack: "/sprites/mv/enemies/guardian_attack_right_anim.png",
  zombieIdle:     "/sprites/mv/enemies/zombie_idle_right_anim.png",

  witchIdle:   "/sprites/mv/npcs/witch_merchant_idle.png",
  witchStatic: "/sprites/mv/npcs/witch_merchant_static.png",

  torch0:  "/sprites/mv/props/light_source_00_anim.png",
  torch3:  "/sprites/mv/props/light_source_03_anim.png",
  chain:   "/sprites/mv/props/ceiling_chain_00_static.png",
  skulls:  "/sprites/mv/props/skulls_00_static.png",
  table:   "/sprites/mv/props/table_and_chair_static.png",
  painting: "/sprites/mv/props/wall_painting_00_static.png",
  tapestry: "/sprites/mv/props/wall_red_tapestry_static.png",

  doorScene: "/sprites/mv/doors/cross_scene_door_closed.png",
  doorLevel: "/sprites/mv/doors/cross_level_door_closed.png",

  benchStatic: "/sprites/mv/savepoint/goddess_bench_static.png",
  benchAnim:   "/sprites/mv/savepoint/goddess_bench_saving_effect.png",

  hitEffect:   "/sprites/mv/effects/hit_effect_anim.png",
  itemOrb:     "/sprites/mv/npcs/item_sell_orb.png",
};

// ─── Image cache ──────────────────────────────────────────────────────────────

const imgCache: Record<string, HTMLImageElement> = {};
function loadImg(src: string): HTMLImageElement {
  if (imgCache[src]) return imgCache[src];
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = src;
  imgCache[src] = img;
  return img;
}
Object.values(MV).forEach(loadImg);

// ─── Drawing helpers ──────────────────────────────────────────────────────────

function drawSprite(
  ctx: CanvasRenderingContext2D,
  src: string, frameW: number, frameH: number, frame: number,
  dx: number, dy: number, scale = 3,
) {
  const img = loadImg(src);
  if (!img.complete || img.naturalWidth === 0) return;
  const dw = frameW * scale;
  const dh = frameH * scale;
  ctx.drawImage(img, frame * frameW, 0, frameW, frameH, dx - dw / 2, dy - dh / 2, dw, dh);
}

function drawTiledBg(
  ctx: CanvasRenderingContext2D,
  src: string, px: number, py: number, pw: number, ph: number,
  alpha = 1
) {
  const img = loadImg(src);
  if (!img.complete || img.naturalWidth === 0) return;
  const tw = img.naturalWidth;
  const th = img.naturalHeight;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.rect(px, py, pw, ph);
  ctx.clip();
  for (let x = px; x < px + pw; x += tw) {
    for (let y = py; y < py + ph; y += th) {
      ctx.drawImage(img, x, y, tw, th);
    }
  }
  ctx.restore();
}

function drawStaticImg(
  ctx: CanvasRenderingContext2D,
  src: string, dx: number, dy: number, dw: number, dh: number
) {
  const img = loadImg(src);
  if (!img.complete || img.naturalWidth === 0) return;
  ctx.drawImage(img, dx, dy, dw, dh);
}

// Convert tile coords to screen pixels (top-left of tile)
function tileToScreen(col: number, row: number): { x: number; y: number } {
  return { x: col * TS, y: row * TS };
}

// Convert tile coords to screen center of tile
function tileCenter(col: number, row: number): { x: number; y: number } {
  return { x: col * TS + TS / 2, y: row * TS + TS / 2 };
}

// ─── Torch helper ─────────────────────────────────────────────────────────────

function drawTorch(ctx: CanvasRenderingContext2D, x: number, y: number, tick: number, tall = false) {
  const src = tall ? MV.torch3 : MV.torch0;
  const frameH = tall ? 48 : 16;
  const frame = Math.floor(tick / 7) % 4;
  drawSprite(ctx, src, 16, frameH, frame, x, y, 2.5);
  const glow = ctx.createRadialGradient(x, y, 0, x, y, 55 + Math.sin(tick * 0.08) * 8);
  glow.addColorStop(0, `rgba(255,160,40,${0.22 + Math.sin(tick * 0.1) * 0.07})`);
  glow.addColorStop(1, "rgba(255,100,20,0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, 60, 0, Math.PI * 2);
  ctx.fill();
}

// ─── NPC helpers ──────────────────────────────────────────────────────────────

function drawWitch(ctx: CanvasRenderingContext2D, x: number, y: number, tick: number, heroesPresent = false) {
  const frame = Math.floor(tick / 8) % 10;
  drawSprite(ctx, MV.witchIdle, 32, 32, frame, x, y, 3.5);
  const mg = ctx.createRadialGradient(x, y + 10, 0, x, y + 10, 45);
  mg.addColorStop(0, `rgba(180,80,255,${0.18 + Math.sin(tick * 0.07) * 0.07})`);
  mg.addColorStop(1, "rgba(100,40,180,0)");
  ctx.fillStyle = mg;
  ctx.beginPath();
  ctx.arc(x, y + 10, 45, 0, Math.PI * 2);
  ctx.fill();

  if (heroesPresent) {
    // Show item sell orb floating above witch when heroes are shopping
    const orbY = y - 60 + Math.sin(tick * 0.08) * 8;
    drawSprite(ctx, MV.itemOrb, 16, 32, 0, x + 30, orbY, 2.5);
    // Shop sparkle effect
    for (let i = 0; i < 4; i++) {
      const angle = (tick * 0.06 + i * Math.PI / 2);
      const r = 35 + Math.sin(tick * 0.1 + i) * 8;
      ctx.fillStyle = `rgba(255,200,50,${0.5 + Math.sin(tick * 0.15 + i) * 0.3})`;
      ctx.beginPath();
      ctx.arc(x + Math.cos(angle) * r, y + Math.sin(angle) * r * 0.5 - 10, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // "SHOP" label above witch
    ctx.fillStyle = "rgba(0,0,0,0.75)";
    ctx.beginPath();
    ctx.roundRect(x - 28, y - 90, 56, 22, 5);
    ctx.fill();
    ctx.fillStyle = "#FFAA44";
    ctx.font = "bold 11px monospace";
    ctx.textAlign = "center";
    ctx.fillText("SHOP!", x, y - 73);
    ctx.textAlign = "left";
  }
}

function drawGuardian(ctx: CanvasRenderingContext2D, x: number, y: number, tick: number, _heroesPresent: boolean) {
  // Guardian always uses idle animation - only boss fight uses attack animations
  if (false) {
    // (reserved for future use)
    const frame = Math.floor(tick / 6) % 18;
    drawSprite(ctx, MV.guardianAttack, 32, 32, frame, x, y, 3.5);
    // Alert glow
    const ag = ctx.createRadialGradient(x, y, 0, x, y, 50);
    ag.addColorStop(0, `rgba(255,200,50,${0.15 + Math.sin(tick * 0.1) * 0.07})`);
    ag.addColorStop(1, "rgba(255,150,0,0)");
    ctx.fillStyle = ag;
    ctx.beginPath();
    ctx.arc(x, y, 50, 0, Math.PI * 2);
    ctx.fill();
    // Speech bubble / talk indicator
    ctx.fillStyle = "rgba(0,0,0,0.75)";
    ctx.beginPath();
    ctx.roundRect(x - 22, y - 75, 44, 22, 5);
    ctx.fill();
    ctx.fillStyle = "#FFD700";
    ctx.font = "bold 12px monospace";
    ctx.textAlign = "center";
    ctx.fillText("...", x, y - 58);
    ctx.textAlign = "left";
  } else {
    // Guardian idle - 12 frames, frameW=16
    const frame = Math.floor(tick / 6) % 12;
    drawSprite(ctx, MV.guardianIdle, 16, 16, frame, x, y, 3.5);
  }
}

// ─── NPC/Boss screen positions (pixel coords, used for hero facing direction) ──
// Boss is at the ACTUAL pentagram center in the background image
// Measured by pixel analysis: canvas px=(2813, 985) = tile(col=58.6, row=20.5)
// Background image (2752x1536) is scaled to canvas (3360x1920), scale=(1.221, 1.25)
const BOSS_SCREEN_X = 2813;
const BOSS_SCREEN_Y = 985;
// Guardian is at center of dungeon room
const GUARDIAN_SCREEN_X = ((ROOMS.dungeon.c0 + ROOMS.dungeon.c1 + 1) / 2) * TS;
const GUARDIAN_SCREEN_Y = ((ROOMS.dungeon.r0 + ROOMS.dungeon.r1 + 1) / 2) * TS;
// Witch is at center of shop room
const WITCH_SCREEN_X = ((ROOMS.shop.c0 + ROOMS.shop.c1 + 1) / 2) * TS;
const WITCH_SCREEN_Y = ((ROOMS.shop.r0 + ROOMS.shop.r1 + 1) / 2) * TS;

function drawBoss(ctx: CanvasRenderingContext2D, tick: number, heroesInRoom: Hero[]) {
  // Boss is exactly at the center of the boss room
  const bx = BOSS_SCREEN_X;
  const by = BOSS_SCREEN_Y;
  const isFighting = heroesInRoom.some(h => h.state === "fighting" || h.state === "casting");

  if (isFighting) {
    const frame = Math.floor(tick / 5) % 10;
    drawSprite(ctx, MV.bossAttack, 48, 48, frame, bx, by, 5);
    const rg = ctx.createRadialGradient(bx, by, 0, bx, by, 100);
    rg.addColorStop(0, `rgba(255,0,0,${0.12 + Math.sin(tick * 0.1) * 0.06})`);
    rg.addColorStop(1, "rgba(255,0,0,0)");
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.arc(bx, by, 100, 0, Math.PI * 2);
    ctx.fill();
  } else {
    const frame = Math.floor(tick / 10) % 6;
    drawSprite(ctx, MV.bossIdle, 48, 48, frame, bx, by, 5);
  }

  ctx.fillStyle = "rgba(0,0,0,0.8)";
  ctx.fillRect(bx - 60, by - 95, 120, 20);
  ctx.fillStyle = "#FF4444";
  ctx.font = "bold 12px monospace";
  ctx.textAlign = "center";
  ctx.fillText("LORD WIZARD", bx, by - 79);
  ctx.textAlign = "left";

  const bossHp = isFighting ? 0.5 + Math.sin(tick * 0.03) * 0.2 : 1.0;
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(bx - 50, by - 72, 100, 12);
  ctx.fillStyle = bossHp > 0.5 ? "#FF4444" : "#FF8800";
  ctx.fillRect(bx - 49, by - 71, 98 * bossHp, 10);
}

// ─── Room label ───────────────────────────────────────────────────────────────

function drawRoomLabel(
  ctx: CanvasRenderingContext2D,
  text: string, color: string,
  px: number, py: number,
  cnt: number, cntColor: string
) {
  const labelW = text.length * 7.5 + 14;
  ctx.fillStyle = "rgba(0,0,0,0.75)";
  ctx.fillRect(px + 6, py + 6, labelW, 18);
  ctx.fillStyle = color;
  ctx.font = "bold 11px monospace";
  ctx.fillText(text, px + 10, py + 19);
  if (cnt > 0) {
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    ctx.fillRect(px + labelW + 10, py + 6, 28, 18);
    ctx.fillStyle = cntColor;
    ctx.font = "bold 10px monospace";
    ctx.textAlign = "center";
    ctx.fillText(`${cnt}×`, px + labelW + 24, py + 19);
    ctx.textAlign = "left";
  }
}

// ─── Draw the full tilemap ────────────────────────────────────────────────────

function drawCastle(ctx: CanvasRenderingContext2D, heroes: Hero[], tick: number) {
  const canvasW = MAP_COLS * TS;
  const canvasH = MAP_ROWS * TS;
  const r = ROOMS;

  // 1. Draw AI-generated castle background image (fills entire canvas)
  const bgImg = loadImg(MV.bgCastle);
  if (bgImg.complete && bgImg.naturalWidth > 0) {
    ctx.drawImage(bgImg, 0, 0, canvasW, canvasH);
  } else {
    // Fallback: dark stone fill while image loads
    ctx.fillStyle = "#1a1520";
    ctx.fillRect(0, 0, canvasW, canvasH);
  }

  // 2. Overlay dynamic effects per room (no background redraw)

  // SPAWN – glowing portal effect
  {
    const px = r.spawn.c0 * TS, py = r.spawn.r0 * TS;
    const pw = (r.spawn.c1 - r.spawn.c0 + 1) * TS;
    const ph = (r.spawn.r1 - r.spawn.r0 + 1) * TS;

    const cnt = heroes.filter(h => h.room === "church").length;
    drawRoomLabel(ctx, "⛪ HOLY SANCTUARY", "#AA88FF", px, py, cnt, "#FFFFFF");

    // Spawn portal glow - at exact center of spawn room
    const bx = px + pw * 0.5, by = py + ph * 0.5;
    const pg = ctx.createRadialGradient(bx, by, 0, bx, by, 70);
    pg.addColorStop(0, `rgba(120,80,255,${0.25 + Math.sin(tick * 0.06) * 0.1})`);
    pg.addColorStop(0.5, `rgba(80,40,200,${0.12 + Math.sin(tick * 0.04) * 0.06})`);
    pg.addColorStop(1, "rgba(40,20,100,0)");
    ctx.fillStyle = pg;
    ctx.beginPath();
    ctx.arc(bx, by, 70, 0, Math.PI * 2);
    ctx.fill();
    // Animated torches
    drawTorch(ctx, px + pw * 0.2, py + ph * 0.75, tick);
    drawTorch(ctx, px + pw * 0.8, py + ph * 0.75, tick);
  }

  // DUNGEON MAIN – guardian + torches
  {
    const px = r.dungeon.c0 * TS, py = r.dungeon.r0 * TS;
    const pw = (r.dungeon.c1 - r.dungeon.c0 + 1) * TS;
    const ph = (r.dungeon.r1 - r.dungeon.r0 + 1) * TS;

    const cnt = heroes.filter(h => h.room === "corridor").length;
    drawRoomLabel(ctx, "📜 DUNGEON MAIN", "#88AAFF", px, py, cnt, "#FFFFFF");

    // Guardian fixed at room center - reacts when heroes are in dungeon
    const dungeonHeroes = heroes.filter(h => h.room === "corridor");
    drawGuardian(ctx, GUARDIAN_SCREEN_X, GUARDIAN_SCREEN_Y, tick, dungeonHeroes.length > 0);
    drawTorch(ctx, px + pw * 0.15, py + ph * 0.35, tick, true);
    drawTorch(ctx, px + pw * 0.85, py + ph * 0.35, tick, true);
  }

  // BOSS ARENA – boss + fight glow
  {
    const px = r.boss.c0 * TS, py = r.boss.r0 * TS;
    const pw = (r.boss.c1 - r.boss.c0 + 1) * TS;
    const ph = (r.boss.r1 - r.boss.r0 + 1) * TS;

    const fighting = heroes.filter(h => h.state === "fighting" || h.state === "casting");
    if (fighting.length > 0) {
      ctx.fillStyle = `rgba(120,0,0,${0.12 + Math.sin(tick * 0.1) * 0.06})`;
      ctx.fillRect(px, py, pw, ph);
    }

    const cnt = heroes.filter(h => h.room === "boss_arena").length;
    drawRoomLabel(ctx, "⚔ BOSS ARENA", "#FF4444", px, py, cnt, "#FF4444");

    drawTorch(ctx, px + pw * 0.08, py + ph * 0.18, tick, true);
    drawTorch(ctx, px + pw * 0.92, py + ph * 0.18, tick, true);
    drawTorch(ctx, px + pw * 0.08, py + ph * 0.82, tick, true);
    drawTorch(ctx, px + pw * 0.92, py + ph * 0.82, tick, true);

    const bossHeroes = heroes.filter(h => h.room === "boss_arena");
    drawBoss(ctx, tick, bossHeroes);
  }

  // WITCH SHOP – witch NPC + glow
  {
    const px = r.shop.c0 * TS, py = r.shop.r0 * TS;
    const pw = (r.shop.c1 - r.shop.c0 + 1) * TS;
    const ph = (r.shop.r1 - r.shop.r0 + 1) * TS;

    const cnt = heroes.filter(h => h.room === "shop").length;
    drawRoomLabel(ctx, "🔮 WITCH SHOP", "#FFAA44", px, py, cnt, "#FFAA44");

    // Witch fixed at room center - reacts when heroes are shopping
    const shopHeroes = heroes.filter(h => h.room === "shop");
    drawWitch(ctx, WITCH_SCREEN_X, WITCH_SCREEN_Y, tick, shopHeroes.length > 0);
    drawTorch(ctx, px + pw * 0.15, py + ph * 0.8, tick);
    drawTorch(ctx, px + pw * 0.85, py + ph * 0.8, tick);
  }

  // REST AREA – rest glow when heroes present
  {
    const px = r.rest.c0 * TS, py = r.rest.r0 * TS;
    const pw = (r.rest.c1 - r.rest.c0 + 1) * TS;
    const ph = (r.rest.r1 - r.rest.r0 + 1) * TS;

    const resting = heroes.filter(h => h.room === "rest_area");
    drawRoomLabel(ctx, "🍺 TAVERN REST", "#44AA44", px, py, resting.length, "#44AA44");

    drawTorch(ctx, px + pw * 0.15, py + ph * 0.3, tick);
    drawTorch(ctx, px + pw * 0.85, py + ph * 0.3, tick);

    if (resting.length > 0) {
      const hg = ctx.createRadialGradient(px + pw / 2, py + ph / 2, 0, px + pw / 2, py + ph / 2, 80);
      hg.addColorStop(0, `rgba(80,200,80,${0.22 + Math.sin(tick * 0.06) * 0.09})`);
      hg.addColorStop(1, "rgba(40,120,40,0)");
      ctx.fillStyle = hg;
      ctx.beginPath();
      ctx.arc(px + pw / 2, py + ph / 2, 80, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawPassageArch(ctx: CanvasRenderingContext2D, x: number, y: number, horizontal: boolean) {
  const w = horizontal ? TS * 3 : TS * 1.5;
  const h = horizontal ? TS * 1.5 : TS * 3;
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillRect(x - w / 2, y - h / 2, w, h);
  ctx.strokeStyle = "rgba(200,180,100,0.6)";
  ctx.lineWidth = 2;
  ctx.strokeRect(x - w / 2, y - h / 2, w, h);
  // Arch top
  ctx.fillStyle = "rgba(100,80,40,0.4)";
  if (horizontal) {
    ctx.beginPath();
    ctx.arc(x, y - h / 2, w / 2, Math.PI, 0);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.arc(x, y - h / 2, h / 3, Math.PI, 0);
    ctx.fill();
  }
}

// ─── Hero movement state ──────────────────────────────────────────────────────

interface HeroMovement {
  // Current pixel position (screen coords)
  px: number;
  py: number;
  // BFS path: list of tile coords to walk through
  path: Array<{ col: number; row: number }>;
  pathIdx: number;
  // Current tile position
  col: number;
  row: number;
  // Visual state
  isMoving: boolean;
  facingLeft: boolean;
  spawnPhase: "spawning" | "alive" | "despawning" | "gone";
  spawnTimer: number;
  lastKnownRoom: RoomId;
  targetRoom: RoomId;
}

const HERO_SPEED = 2.0; // pixels per frame (screen pixels)
const SPAWN_DURATION = 50;
const HERO_SCALE = 4;

function heroRoomToRoomId(room: string | undefined): RoomId {
  const map: Record<string, RoomId> = {
    church: "spawn",
    corridor: "dungeon",
    boss_arena: "boss",
    shop: "shop",
    rest_area: "rest",
  };
  return map[room || "church"] || "spawn";
}

// ─── Hero sprite selection ────────────────────────────────────────────────────

function getPlayerSprite(state: HeroState, isMoving: boolean, facingLeft: boolean) {
  if (isMoving) {
    return { src: facingLeft ? MV.playerRunL : MV.playerRunR, frameW: 16, frameCount: 8, fps: 12 };
  }
  // Only use attack animation when actually fighting the boss
  if (state === "fighting" || state === "casting") {
    return { src: facingLeft ? MV.playerAttackL : MV.playerAttackR, frameW: 16, frameCount: 10, fps: 10 };
  }
  // Talking, shopping, resting → idle pose (hero faces NPC, not attacking)
  return { src: facingLeft ? MV.playerIdleL : MV.playerIdleR, frameW: 16, frameCount: 6, fps: 6 };
}

// ─── Draw hero ────────────────────────────────────────────────────────────────

function drawHero(
  ctx: CanvasRenderingContext2D,
  hero: Hero,
  mv: HeroMovement,
  tick: number,
  selected: boolean
) {
  if (mv.spawnPhase === "gone") return;

  const x = Math.round(mv.px);
  const y = Math.round(mv.py);
  const state = hero.state as HeroState;

  let alpha = 1;
  let scale = HERO_SCALE;

  // Spawn / despawn portal
  if (mv.spawnPhase === "spawning") {
    const t = mv.spawnTimer / SPAWN_DURATION;
    alpha = t;
    scale = (HERO_SCALE - 1) + t;
    const portalR = 40 * (1 - t);
    const pg = ctx.createRadialGradient(x, y + 12, 0, x, y + 12, portalR);
    pg.addColorStop(0, `rgba(255,220,80,${0.7 * (1 - t)})`);
    pg.addColorStop(0.5, `rgba(200,100,255,${0.5 * (1 - t)})`);
    pg.addColorStop(1, "rgba(100,50,200,0)");
    ctx.fillStyle = pg;
    ctx.beginPath();
    ctx.arc(x, y + 12, portalR, 0, Math.PI * 2);
    ctx.fill();
  } else if (mv.spawnPhase === "despawning") {
    const t = mv.spawnTimer / SPAWN_DURATION;
    alpha = 1 - t;
    scale = HERO_SCALE - t;
    const portalR = 40 * t;
    const pg = ctx.createRadialGradient(x, y + 12, 0, x, y + 12, portalR);
    pg.addColorStop(0, `rgba(255,220,80,${0.7 * t})`);
    pg.addColorStop(0.5, `rgba(200,100,255,${0.5 * t})`);
    pg.addColorStop(1, "rgba(100,50,200,0)");
    ctx.fillStyle = pg;
    ctx.beginPath();
    ctx.arc(x, y + 12, portalR, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.save();
  ctx.globalAlpha = alpha;

  // Selection ring
  if (selected) {
    ctx.strokeStyle = "#FFD700";
    ctx.lineWidth = 2.5;
    ctx.setLineDash([5, 3]);
    ctx.beginPath();
    ctx.arc(x, y + 6, 34, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    const sg = ctx.createRadialGradient(x, y + 6, 20, x, y + 6, 44);
    sg.addColorStop(0, "rgba(255,215,0,0.15)");
    sg.addColorStop(1, "rgba(255,215,0,0)");
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.arc(x, y + 6, 44, 0, Math.PI * 2);
    ctx.fill();
  }

  // Shadow
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.beginPath();
  ctx.ellipse(x, y + 32, 20, 7, 0, 0, Math.PI * 2);
  ctx.fill();

  // Sprite
  const { src, frameW, frameCount, fps } = getPlayerSprite(state, mv.isMoving, mv.facingLeft);
  const frame = Math.floor(tick / (60 / fps)) % frameCount;
  const img = loadImg(src);
  if (img.complete && img.naturalWidth > 0) {
    const dw = frameW * scale;
    const dh = 16 * scale;
    ctx.drawImage(img, frame * frameW, 0, frameW, 16, x - dw / 2, y + 10 - dh / 2, dw, dh);
  }

  // State effects
  if (!mv.isMoving) {
    if (state === "fighting") {
      // Attack particles orbiting hero during boss fight
      for (let i = 0; i < 5; i++) {
        const angle = tick * 0.09 + (i * Math.PI * 2) / 5;
        ctx.fillStyle = "#FF4444";
        ctx.globalAlpha = alpha * (0.6 + Math.sin(tick * 0.2 + i) * 0.3);
        ctx.beginPath();
        ctx.arc(x + Math.cos(angle) * 30, y + Math.sin(angle) * 18, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
      // Hit effect sprite flashing near hero
      if (Math.floor(tick / 8) % 3 === 0) {
        ctx.globalAlpha = alpha * 0.85;
        const hf = Math.floor(tick / 4) % 4;
        drawSprite(ctx, MV.hitEffect, 16, 16, hf, x + 28, y - 5, 2.5);
      }
    }
    if (state === "casting") {
      // Magic particles for casting
      for (let i = 0; i < 6; i++) {
        const angle = tick * 0.07 + (i * Math.PI * 2) / 6;
        ctx.fillStyle = "#AA44FF";
        ctx.globalAlpha = alpha * (0.7 + Math.sin(tick * 0.15 + i) * 0.25);
        ctx.beginPath();
        ctx.arc(x + Math.cos(angle) * 28, y + Math.sin(angle) * 17, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (state === "shopping") {
      // Gold coin sparkles for shopping
      for (let i = 0; i < 4; i++) {
        const angle = tick * 0.08 + (i * Math.PI / 2);
        ctx.fillStyle = "#FFD700";
        ctx.globalAlpha = alpha * (0.7 + Math.sin(tick * 0.18 + i) * 0.25);
        ctx.beginPath();
        ctx.arc(x + Math.cos(angle) * 22, y + Math.sin(angle) * 14 - 8, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
      // Floating coin above hero
      ctx.globalAlpha = alpha;
      ctx.fillStyle = "#FFD700";
      ctx.font = "bold 14px monospace";
      ctx.textAlign = "center";
      ctx.fillText("¥", x, y - 68 + Math.sin(tick * 0.07) * 5);
      ctx.textAlign = "left";
    }
    if (state === "idle" && mv.lastKnownRoom === "dungeon") {
      // Speech bubble for idle heroes in dungeon (talking to Guardian)
      ctx.globalAlpha = alpha;
      const bubbleX = x + 18;
      const bubbleY = y - 72;
      ctx.fillStyle = "rgba(0,0,0,0.8)";
      ctx.beginPath();
      ctx.roundRect(bubbleX - 18, bubbleY - 10, 36, 20, 6);
      ctx.fill();
      ctx.strokeStyle = "#88CCFF";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(bubbleX - 18, bubbleY - 10, 36, 20, 6);
      ctx.stroke();
      // Animated dots
      const dotCount = Math.floor(tick / 20) % 4;
      ctx.fillStyle = "#88CCFF";
      ctx.font = "bold 12px monospace";
      ctx.textAlign = "center";
      ctx.fillText(".".repeat(dotCount + 1), bubbleX, bubbleY + 5);
      ctx.textAlign = "left";
    }
    if (state === "resting") {
      ctx.globalAlpha = alpha;
      ctx.fillStyle = "#88CCFF";
      ctx.font = "bold 13px monospace";
      ctx.fillText("z", x + 18, y - 20 + Math.sin(tick * 0.05) * 5);
      ctx.fillText("Z", x + 25, y - 30 + Math.sin(tick * 0.05 + 1) * 5);
    }
  }

  ctx.globalAlpha = alpha;

  // Name tag
  const classConfig = HERO_CLASSES[hero.heroClass as keyof typeof HERO_CLASSES];
  const nameColor = classConfig?.color || "#FFFFFF";
  const label = hero.name.substring(0, 12);
  const charW = 7;
  const labelW = label.length * charW + 16;
  const labelH = 18;
  const labelX = x - labelW / 2;
  const labelY = y - 58;

  ctx.fillStyle = "rgba(0,0,0,0.88)";
  ctx.beginPath();
  ctx.roundRect(labelX, labelY, labelW, labelH, 4);
  ctx.fill();
  ctx.strokeStyle = nameColor + "99";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(labelX, labelY, labelW, labelH, 4);
  ctx.stroke();
  ctx.fillStyle = nameColor;
  ctx.font = "bold 10px monospace";
  ctx.textAlign = "center";
  ctx.fillText(label, x, labelY + 13);
  ctx.textAlign = "left";

  if (classConfig?.emoji) {
    ctx.font = "10px monospace";
    ctx.fillText(classConfig.emoji, labelX - 14, labelY + 13);
  }

  ctx.restore();
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  heroes: Hero[];
  selectedHeroId: number | null;
  onHeroClick: (id: number) => void;
}

export default function DungeonMap({ heroes, selectedHeroId, onHeroClick }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tickRef = useRef(0);
  const animFrameRef = useRef<number>(0);
  const movementRef = useRef<Map<number, HeroMovement>>(new Map());
  const prevHeroIdsRef = useRef<Set<number>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);

  // Fixed canvas size - no scaling. Canvas is always 3360x1920 (70x40 tiles at 48px each).
  // Container scrolls to view the full map. This ensures pixel-perfect positions for
  // Boss, heroes, walls, and all game elements.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const CANVAS_W = MAP_COLS * TS; // 3360
    const CANVAS_H = MAP_ROWS * TS; // 1920
    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;
    // CSS size matches internal resolution exactly - no scaling
    canvas.style.width = `${CANVAS_W}px`;
    canvas.style.height = `${CANVAS_H}px`;
  }, []);

  const drawFrame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;

    tickRef.current++;
    const tick = tickRef.current;
    const movements = movementRef.current;

    // ── Update hero movement ──────────────────────────────────────────────────
    const currentIds = new Set(heroes.map(h => h.id));
    const prevIds = prevHeroIdsRef.current;

    // New heroes → spawn at sanctuary center (exact center, no random offset)
    for (const hero of heroes) {
      if (!movements.has(hero.id)) {
        const spawnTile = ROOM_CENTERS.spawn;
        const spawnPx = tileCenter(spawnTile.col, spawnTile.row);
        movements.set(hero.id, {
          px: spawnPx.x,
          py: spawnPx.y,
          path: [],
          pathIdx: 0,
          col: spawnTile.col,
          row: spawnTile.row,
          isMoving: false,
          facingLeft: false,
          spawnPhase: "spawning",
          spawnTimer: 0,
          lastKnownRoom: "spawn",
          targetRoom: heroRoomToRoomId(hero.room),
        });
      }
    }

    // Removed heroes → walk back to spawn, then despawn
    for (const prevId of prevIds) {
      if (!currentIds.has(prevId)) {
        const mv = movements.get(prevId);
        if (mv && mv.spawnPhase !== "despawning" && mv.spawnPhase !== "gone") {
          const spawnTile = ROOM_CENTERS.spawn;
          const path = bfsPath(mv.col, mv.row, spawnTile.col, spawnTile.row);
          mv.path = path;
          mv.pathIdx = 0;
          mv.isMoving = path.length > 0;
          mv.spawnPhase = "despawning";
          mv.spawnTimer = 0;
        }
      }
    }
    prevHeroIdsRef.current = currentIds;

    // Update each alive hero
    for (const hero of heroes) {
      const mv = movements.get(hero.id);
      if (!mv) continue;

      // Spawn animation
      if (mv.spawnPhase === "spawning") {
        mv.spawnTimer++;
        if (mv.spawnTimer >= SPAWN_DURATION) {
          mv.spawnPhase = "alive";
          const targetRoom = heroRoomToRoomId(hero.room);
          if (targetRoom !== "spawn") {
            const dest = ROOM_CENTERS[targetRoom];
            const path = bfsPath(mv.col, mv.row, dest.col, dest.row);
            mv.path = path;
            mv.pathIdx = 0;
            mv.isMoving = path.length > 0;
            mv.targetRoom = targetRoom;
          }
        }
        continue;
      }

      // Room change → recalculate BFS path
      const targetRoom = heroRoomToRoomId(hero.room);
      if (targetRoom !== mv.targetRoom && mv.spawnPhase === "alive") {
        const dest = ROOM_CENTERS[targetRoom];
        const path = bfsPath(mv.col, mv.row, dest.col, dest.row);
        mv.path = path;
        mv.pathIdx = 0;
        mv.isMoving = path.length > 0;
        mv.targetRoom = targetRoom;
      }

      // Walk along BFS path
      if (mv.isMoving && mv.pathIdx < mv.path.length) {
        const nextTile = mv.path[mv.pathIdx];
        const targetPx = tileCenter(nextTile.col, nextTile.row);
        const dx = targetPx.x - mv.px;
        const dy = targetPx.y - mv.py;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < HERO_SPEED + 0.5) {
          mv.px = targetPx.x;
          mv.py = targetPx.y;
          mv.col = nextTile.col;
          mv.row = nextTile.row;
          mv.pathIdx++;
          if (mv.pathIdx >= mv.path.length) {
            mv.isMoving = false;
            mv.lastKnownRoom = mv.targetRoom;
            // Spread heroes in room (offset from NPC/Boss position)
            const heroesInRoom = heroes.filter(h => heroRoomToRoomId(h.room) === mv.targetRoom);
            const idx = heroesInRoom.findIndex(h => h.id === hero.id);
            if (heroesInRoom.length > 1 && idx >= 0) {
              const room = ROOMS[mv.targetRoom];
              const w = walkableRect(room);
              const usableW = (w.c1 - w.c0) * TS;
              const cols = Math.min(heroesInRoom.length, 4);
              const col = idx % cols;
              const spreadX = w.c0 * TS + TS + (cols > 1 ? (col / (cols - 1)) * usableW : usableW / 2);
              mv.px = spreadX;
            }
            // Face toward NPC/Boss after arriving
            // Heroes stop to the LEFT of boss/NPC, so they face RIGHT toward them
            if (mv.targetRoom === "boss") {
              // Heroes are to the left of boss, so face right (toward boss)
              mv.facingLeft = false;
            } else if (mv.targetRoom === "shop") {
              // Heroes are to the RIGHT of witch, so face LEFT (toward witch)
              mv.facingLeft = true;
            } else if (mv.targetRoom === "dungeon") {
              // Heroes face toward guardian (dynamic based on position)
              mv.facingLeft = mv.px > GUARDIAN_SCREEN_X;
            } else if (mv.targetRoom === "spawn") {
              // In sanctuary, face right (toward the exit)
              mv.facingLeft = false;
            } else if (mv.targetRoom === "rest") {
              // In rest area, face right
              mv.facingLeft = false;
            }
          }
        } else {
          mv.px += (dx / dist) * HERO_SPEED;
          mv.py += (dy / dist) * HERO_SPEED;
          mv.facingLeft = dx < 0;
        }
      }
    }

    // Update despawning heroes
    for (const [id, mv] of movements) {
      if (currentIds.has(id)) continue;
      if (mv.spawnPhase === "despawning") {
        if (mv.isMoving && mv.pathIdx < mv.path.length) {
          const nextTile = mv.path[mv.pathIdx];
          const targetPx = tileCenter(nextTile.col, nextTile.row);
          const dx = targetPx.x - mv.px;
          const dy = targetPx.y - mv.py;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < HERO_SPEED * 2 + 0.5) {
            mv.px = targetPx.x;
            mv.py = targetPx.y;
            mv.col = nextTile.col;
            mv.row = nextTile.row;
            mv.pathIdx++;
            if (mv.pathIdx >= mv.path.length) mv.isMoving = false;
          } else {
            mv.px += (dx / dist) * HERO_SPEED * 2;
            mv.py += (dy / dist) * HERO_SPEED * 2;
            mv.facingLeft = dx < 0;
          }
        } else {
          mv.spawnTimer++;
          if (mv.spawnTimer >= SPAWN_DURATION) mv.spawnPhase = "gone";
        }
      }
      if (mv.spawnPhase === "gone") movements.delete(id);
    }

    // ── Render ────────────────────────────────────────────────────────────────
    ctx.fillStyle = "#0a0810";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    drawCastle(ctx, heroes, tick);

    // Draw all heroes (including despawning)
    for (const [id, mv] of movements) {
      const hero = heroes.find(h => h.id === id);
      const heroObj = hero || {
        id, name: "???", heroClass: "warrior" as const,
        state: "walking" as HeroState, room: "church",
        position: { x: mv.px, y: mv.py },
        activeTools: [], subAgentTools: {}, toolCount: { bash: 0, read: 0, write: 0, web: 0 },
        isWaiting: false, skills: [], level: 1, exp: 0,
        hp: 100, maxHp: 100, mp: 100, maxMp: 100,
      };
      drawHero(ctx, heroObj, mv, tick, id === selectedHeroId);
    }

    // Debug: show walkable grid (toggle with URL ?debug=1)
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debug') === '1') {
      for (let row = 0; row < MAP_ROWS; row++) {
        for (let col = 0; col < MAP_COLS; col++) {
          if (WALKABLE[row][col]) {
            ctx.fillStyle = 'rgba(0,255,0,0.25)';
          } else {
            ctx.fillStyle = 'rgba(255,0,0,0.12)';
          }
          ctx.fillRect(col * TS, row * TS, TS, TS);
        }
      }
      // Draw grid lines
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 0.5;
      for (let col = 0; col <= MAP_COLS; col++) {
        ctx.beginPath(); ctx.moveTo(col * TS, 0); ctx.lineTo(col * TS, MAP_ROWS * TS); ctx.stroke();
      }
      for (let row = 0; row <= MAP_ROWS; row++) {
        ctx.beginPath(); ctx.moveTo(0, row * TS); ctx.lineTo(MAP_COLS * TS, row * TS); ctx.stroke();
      }
    }

    // Subtle scanline overlay
    ctx.fillStyle = "rgba(0,0,0,0.015)";
    for (let scanY = 0; scanY < canvas.height; scanY += 4) {
      ctx.fillRect(0, scanY, canvas.width, 2);
    }

    animFrameRef.current = requestAnimationFrame(drawFrame);
  }, [heroes, selectedHeroId]);

  useEffect(() => {
    animFrameRef.current = requestAnimationFrame(drawFrame);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [drawFrame]);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      // Canvas is fixed 1:1 with CSS pixels (no scaling), so no conversion needed
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      // Debug: log canvas coordinates on click when ?debug=1
      if (new URLSearchParams(window.location.search).get('debug') === '1') {
        const col = Math.floor(mx / TS);
        const row = Math.floor(my / TS);
        console.log(`[DEBUG CLICK] px=(${Math.round(mx)}, ${Math.round(my)}) tile=(col=${col}, row=${row})`);
        alert(`Canvas click: px=(${Math.round(mx)}, ${Math.round(my)})\ntile=(col=${col}, row=${row})`);
        return;
      }

      for (const hero of heroes) {
        const mv = movementRef.current.get(hero.id);
        if (!mv) continue;
        const dx = mv.px - mx;
        const dy = mv.py - my;
        if (Math.sqrt(dx * dx + dy * dy) < 36) {
          onHeroClick(hero.id);
          return;
        }
      }
    },
    [heroes, onHeroClick]
  );

  return (
    <div ref={containerRef} className="w-full h-full overflow-auto bg-[#0a0810]">
      <canvas
        ref={canvasRef}
        onClick={handleClick}
        className="cursor-pointer block"
        style={{ imageRendering: "pixelated" }}
      />
    </div>
  );
}
