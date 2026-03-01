import { useEffect, useRef, useCallback } from "react";
import {
  HERO_CLASSES,
  type HeroState,
} from "../lib/dungeonConfig";
import type { Hero } from "../hooks/useHeroSocket";

// ─── Canvas Dimensions ────────────────────────────────────────────────────────

const CANVAS_W = 1100;
const CANVAS_H = 680;

// ─── New Metroidvania Sprite Paths ───────────────────────────────────────────

const MV = {
  // Tilesets (240×160 tileable backgrounds)
  bgDungeon:   "/sprites/mv/tilesets/bg_00_dungeon.png",
  bgBossRoom:  "/sprites/mv/tilesets/bg_00_boss_room.png",
  bgWitchShop: "/sprites/mv/tilesets/bg_00_witch_shop.png",
  bgLibrary:   "/sprites/mv/tilesets/bg_00_library.png",

  // Player character (16px tall sprite sheets)
  playerIdleR:   "/sprites/mv/player/char_idle_right_anim.png",   // 96×16 = 6 frames
  playerIdleL:   "/sprites/mv/player/char_idle_left_anim.png",
  playerRunR:    "/sprites/mv/player/char_run_right_anim.png",    // 128×16 = 8 frames
  playerRunL:    "/sprites/mv/player/char_run_left_anim.png",
  playerAttackR: "/sprites/mv/player/char_attack_00_right_anim.png", // 160×16 = 10 frames
  playerAttackL: "/sprites/mv/player/char_attack_00_left_anim.png",
  playerDeath:   "/sprites/mv/player/char_death_right_anim.png",

  // Boss (48px tall sprite sheets)
  bossIdle:    "/sprites/mv/boss/lord_wizard_idle_anim.png",      // 288×48 = 6 frames
  bossAttack:  "/sprites/mv/boss/lord_wizard_attack_00_right_anim.png", // 480×48 = 10 frames
  bossStatic:  "/sprites/mv/boss/lord_wizard_static.png",         // 48×48

  // Enemies (16px tall)
  guardianIdle:   "/sprites/mv/enemies/guardian_idle_right_anim.png",   // 192×16 = 12 frames
  guardianAttack: "/sprites/mv/enemies/guardian_attack_right_anim.png", // 576×32 = 18 frames
  zombieIdle:     "/sprites/mv/enemies/zombie_idle_right_anim.png",     // 96×16 = 6 frames

  // NPCs
  witchIdle:   "/sprites/mv/npcs/witch_merchant_idle.png",        // 320×32 = 10 frames
  witchStatic: "/sprites/mv/npcs/witch_merchant_static.png",

  // Props
  torch0:  "/sprites/mv/props/light_source_00_anim.png",          // 64×16 = 4 frames
  torch1:  "/sprites/mv/props/light_source_01_anim.png",
  torch2:  "/sprites/mv/props/light_source_02_anim.png",
  torch3:  "/sprites/mv/props/light_source_03_anim.png",          // 64×48 = 4 frames (tall)
  chain:   "/sprites/mv/props/ceiling_chain_00_static.png",
  skulls:  "/sprites/mv/props/skulls_00_static.png",
  table:   "/sprites/mv/props/table_and_chair_static.png",
  painting: "/sprites/mv/props/wall_painting_00_static.png",
  tapestry: "/sprites/mv/props/wall_red_tapestry_static.png",

  // Doors
  doorScene: "/sprites/mv/doors/cross_scene_door_closed.png",     // 64×32
  doorLevel: "/sprites/mv/doors/cross_level_door_closed.png",     // 192×32

  // Save point
  benchStatic: "/sprites/mv/savepoint/goddess_bench_static.png",  // 32×32
  benchAnim:   "/sprites/mv/savepoint/goddess_bench_saving_effect.png",

  // Effects
  hitEffect: "/sprites/mv/effects/hit_effect_anim.png",
};

// ─── Image Cache ──────────────────────────────────────────────────────────────

const imgCache: Record<string, HTMLImageElement> = {};

function loadImg(src: string): HTMLImageElement {
  if (imgCache[src]) return imgCache[src];
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = src;
  imgCache[src] = img;
  return img;
}

// Preload all sprites immediately
Object.values(MV).forEach(loadImg);

// ─── Drawing Helpers ──────────────────────────────────────────────────────────

function drawSprite(
  ctx: CanvasRenderingContext2D,
  src: string,
  frameW: number,
  frameH: number,
  frame: number,
  dx: number,
  dy: number,
  scale = 3,
  flipH = false
) {
  const img = loadImg(src);
  if (!img.complete || img.naturalWidth === 0) return;
  const dw = frameW * scale;
  const dh = frameH * scale;
  ctx.save();
  if (flipH) {
    ctx.translate(dx, dy - dh / 2);
    ctx.scale(-1, 1);
    ctx.drawImage(img, frame * frameW, 0, frameW, frameH, -dw / 2, 0, dw, dh);
  } else {
    ctx.drawImage(img, frame * frameW, 0, frameW, frameH, dx - dw / 2, dy - dh / 2, dw, dh);
  }
  ctx.restore();
}

function drawTiledBg(
  ctx: CanvasRenderingContext2D,
  src: string,
  rx: number, ry: number, rw: number, rh: number,
  alpha = 1
) {
  const img = loadImg(src);
  if (!img.complete || img.naturalWidth === 0) return;
  const tw = img.naturalWidth;
  const th = img.naturalHeight;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.rect(rx, ry, rw, rh);
  ctx.clip();
  for (let x = rx; x < rx + rw; x += tw) {
    for (let y = ry; y < ry + rh; y += th) {
      ctx.drawImage(img, x, y, tw, th);
    }
  }
  ctx.restore();
}

function drawStaticImg(
  ctx: CanvasRenderingContext2D,
  src: string,
  dx: number, dy: number,
  dw: number, dh: number
) {
  const img = loadImg(src);
  if (!img.complete || img.naturalWidth === 0) return;
  ctx.drawImage(img, dx, dy, dw, dh);
}

// ─── Map Layout ───────────────────────────────────────────────────────────────
// Layout (1100×680):
//
//  [LIBRARY]──H-CORRIDOR──[DUNGEON MAIN]──H-CORRIDOR──[BOSS ARENA]
//                               │
//                          V-CORRIDOR
//                               │
//                        [MERCHANT SHOP]
//                               │
//                          V-CORRIDOR
//                               │
//                          [TAVERN REST]
//

const ROOM_LIBRARY    = { x: 20,  y: 60,  w: 220, h: 200 };
const ROOM_DUNGEON    = { x: 330, y: 60,  w: 240, h: 200 };
const ROOM_BOSS       = { x: 660, y: 60,  w: 420, h: 280 };
const ROOM_SHOP       = { x: 330, y: 360, w: 240, h: 160 };
const ROOM_TAVERN     = { x: 330, y: 580, w: 240, h: 100 };

// Corridors (horizontal and vertical connections)
const CORR_LIB_DUN   = { x: 240, y: 130, w: 90,  h: 60  }; // Library → Dungeon
const CORR_DUN_BOSS  = { x: 570, y: 130, w: 90,  h: 60  }; // Dungeon → Boss
const CORR_DUN_SHOP  = { x: 390, y: 260, w: 60,  h: 100 }; // Dungeon → Shop
const CORR_SHOP_TAV  = { x: 390, y: 520, w: 60,  h: 60  }; // Shop → Tavern

// Door positions (center of each corridor entrance)
const DOORS = [
  { x: 240, y: 160, horiz: true  }, // Library exit
  { x: 330, y: 160, horiz: true  }, // Dungeon left entrance
  { x: 570, y: 160, horiz: true  }, // Dungeon right exit
  { x: 660, y: 160, horiz: true  }, // Boss left entrance
  { x: 420, y: 260, horiz: false }, // Dungeon bottom exit
  { x: 420, y: 360, horiz: false }, // Shop top entrance
  { x: 420, y: 520, horiz: false }, // Shop bottom exit
  { x: 420, y: 580, horiz: false }, // Tavern top entrance
];

// Room id → room rect mapping
const ROOM_RECTS: Record<string, { x: number; y: number; w: number; h: number }> = {
  church:     ROOM_LIBRARY,
  corridor:   ROOM_DUNGEON,
  boss_arena: ROOM_BOSS,
  shop:       ROOM_SHOP,
  rest_area:  ROOM_TAVERN,
};

// ─── Torch / Light Prop ───────────────────────────────────────────────────────

function drawTorch(ctx: CanvasRenderingContext2D, x: number, y: number, tick: number, tall = false) {
  const src = tall ? MV.torch3 : MV.torch0;
  const frameH = tall ? 48 : 16;
  const frame = Math.floor(tick / 7) % 4;
  drawSprite(ctx, src, 16, frameH, frame, x, y, 2);
  // Warm glow
  const glow = ctx.createRadialGradient(x, y - 6, 0, x, y - 6, 22);
  glow.addColorStop(0, `rgba(255,160,50,${0.3 + Math.sin(tick * 0.25) * 0.12})`);
  glow.addColorStop(1, "rgba(255,80,0,0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y - 6, 22, 0, Math.PI * 2);
  ctx.fill();
}

// ─── Boss Rendering ───────────────────────────────────────────────────────────

function drawBoss(ctx: CanvasRenderingContext2D, tick: number, heroesInBoss: Hero[]) {
  const r = ROOM_BOSS;
  const bx = r.x + r.w / 2 + 60;
  const by = r.y + r.h / 2 + 20;

  const isFighting = heroesInBoss.some(h => h.state === "fighting" || h.state === "casting");

  // Boss glow
  const glowR = isFighting ? 70 : 40;
  const glowAlpha = isFighting ? 0.45 + Math.sin(tick * 0.08) * 0.15 : 0.2;
  const bg = ctx.createRadialGradient(bx, by, 0, bx, by, glowR);
  bg.addColorStop(0, `rgba(180,0,255,${glowAlpha})`);
  bg.addColorStop(1, "rgba(100,0,200,0)");
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.arc(bx, by, glowR, 0, Math.PI * 2);
  ctx.fill();

  // Draw boss sprite (48px tall, scale 2.5x = 120px)
  const src = isFighting ? MV.bossAttack : MV.bossIdle;
  const frameCount = isFighting ? 10 : 6;
  const fps = isFighting ? 10 : 5;
  const frame = Math.floor(tick / (60 / fps)) % frameCount;
  const pulse = 1 + Math.sin(tick * 0.05) * 0.02;
  ctx.save();
  ctx.translate(bx, by);
  ctx.scale(pulse, pulse);
  ctx.translate(-bx, -by);
  drawSprite(ctx, src, 48, 48, frame, bx, by, 2.5);
  ctx.restore();

  // Boss name tag
  ctx.fillStyle = "rgba(0,0,0,0.7)";
  ctx.fillRect(bx - 52, by - 80, 104, 16);
  ctx.fillStyle = isFighting ? "#FF44FF" : "#AA44FF";
  ctx.font = "bold 9px monospace";
  ctx.textAlign = "center";
  ctx.fillText("⚡ LORD WIZARD", bx, by - 68);
  ctx.textAlign = "left";

  // Boss HP bar (animated)
  const hp = isFighting
    ? Math.max(0.1, 0.8 - (tick % 400) / 400 * 0.6)
    : 0.85 + Math.sin(tick * 0.01) * 0.1;
  ctx.fillStyle = "rgba(0,0,0,0.7)";
  ctx.fillRect(bx - 52, by - 58, 104, 8);
  const hpGrad = ctx.createLinearGradient(bx - 52, 0, bx + 52, 0);
  hpGrad.addColorStop(0, "#FF0044");
  hpGrad.addColorStop(1, "#FF44FF");
  ctx.fillStyle = hpGrad;
  ctx.fillRect(bx - 52, by - 58, 104 * hp, 8);
  ctx.strokeStyle = "#AA0066";
  ctx.lineWidth = 1;
  ctx.strokeRect(bx - 52, by - 58, 104, 8);
}

// ─── Guardian Enemy ───────────────────────────────────────────────────────────

function drawGuardian(ctx: CanvasRenderingContext2D, x: number, y: number, tick: number) {
  const frame = Math.floor(tick / 6) % 12;
  drawSprite(ctx, MV.guardianIdle, 16, 16, frame, x, y, 2.5);
}

// ─── Witch Merchant NPC ───────────────────────────────────────────────────────

function drawWitch(ctx: CanvasRenderingContext2D, x: number, y: number, tick: number) {
  const frame = Math.floor(tick / 8) % 10;
  drawSprite(ctx, MV.witchIdle, 32, 32, frame, x, y, 2.5);
}

// ─── Hero Rendering ───────────────────────────────────────────────────────────

function getPlayerSprite(state: HeroState, facingLeft: boolean): { src: string; frameW: number; frameCount: number; fps: number } {
  if (state === "fighting" || state === "casting") {
    return { src: facingLeft ? MV.playerAttackL : MV.playerAttackR, frameW: 16, frameCount: 10, fps: 10 };
  }
  if (state === "walking") {
    return { src: facingLeft ? MV.playerRunL : MV.playerRunR, frameW: 16, frameCount: 8, fps: 12 };
  }
  return { src: facingLeft ? MV.playerIdleL : MV.playerIdleR, frameW: 16, frameCount: 6, fps: 6 };
}

function drawHero(
  ctx: CanvasRenderingContext2D,
  hero: Hero,
  tick: number,
  selected: boolean
) {
  const x = Math.round(hero.position.x);
  const y = Math.round(hero.position.y);
  const state = hero.state as HeroState;
  const facingLeft = hero.room === "shop" || hero.room === "boss_arena";

  const { src, frameW, frameCount, fps } = getPlayerSprite(state, facingLeft);
  const frame = Math.floor(tick / (60 / fps)) % frameCount;

  // Selection ring
  if (selected) {
    ctx.strokeStyle = "#FFD700";
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.arc(x, y + 4, 26, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Shadow
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.beginPath();
  ctx.ellipse(x, y + 26, 14, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Draw player sprite (scale 3×: 16px → 48px)
  drawSprite(ctx, src, frameW, 16, frame, x, y + 8, 3);

  // State effects
  if (state === "fighting") {
    for (let i = 0; i < 4; i++) {
      const angle = tick * 0.09 + (i * Math.PI * 2) / 4;
      const sx2 = x + Math.cos(angle) * 22;
      const sy2 = y + Math.sin(angle) * 14;
      ctx.fillStyle = "#FF4444";
      ctx.globalAlpha = 0.6 + Math.sin(tick * 0.2 + i) * 0.3;
      ctx.beginPath();
      ctx.arc(sx2, sy2, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  if (state === "casting") {
    for (let i = 0; i < 5; i++) {
      const angle = tick * 0.07 + (i * Math.PI * 2) / 5;
      const sx2 = x + Math.cos(angle) * 20;
      const sy2 = y + Math.sin(angle) * 12;
      ctx.fillStyle = "#AA44FF";
      ctx.globalAlpha = 0.7 + Math.sin(tick * 0.15 + i) * 0.25;
      ctx.beginPath();
      ctx.arc(sx2, sy2, 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  if (state === "resting") {
    ctx.fillStyle = "#88CCFF";
    ctx.font = "bold 10px monospace";
    ctx.fillText("z", x + 12, y - 16 + Math.sin(tick * 0.05) * 3);
    ctx.fillText("Z", x + 18, y - 23 + Math.sin(tick * 0.05 + 1) * 3);
  }

  // Name tag
  const classConfig = HERO_CLASSES[hero.heroClass as keyof typeof HERO_CLASSES];
  const nameColor = classConfig?.color || "#FFFFFF";
  const label = hero.name.substring(0, 10);

  ctx.fillStyle = "rgba(0,0,0,0.8)";
  const labelW = label.length * 6 + 10;
  ctx.fillRect(x - labelW / 2, y - 42, labelW, 14);
  ctx.fillStyle = nameColor;
  ctx.font = "bold 8px monospace";
  ctx.textAlign = "center";
  ctx.fillText(label, x, y - 31);
  ctx.textAlign = "left";
}

// ─── Draw Corridors ───────────────────────────────────────────────────────────

function drawCorridors(ctx: CanvasRenderingContext2D, tick: number) {
  const corridors = [CORR_LIB_DUN, CORR_DUN_BOSS, CORR_DUN_SHOP, CORR_SHOP_TAV];
  for (const c of corridors) {
    // Corridor background (dungeon tiles)
    drawTiledBg(ctx, MV.bgDungeon, c.x, c.y, c.w, c.h, 0.7);
    // Corridor border
    ctx.strokeStyle = "#333355";
    ctx.lineWidth = 1;
    ctx.strokeRect(c.x, c.y, c.w, c.h);
  }

  // Draw doors at corridor entrances
  for (const d of DOORS) {
    const img = loadImg(MV.doorScene);
    if (img.complete && img.naturalWidth > 0) {
      if (d.horiz) {
        ctx.drawImage(img, 0, 0, 64, 32, d.x - 16, d.y - 16, 32, 32);
      } else {
        // Rotate 90° for vertical corridors
        ctx.save();
        ctx.translate(d.x, d.y);
        ctx.rotate(Math.PI / 2);
        ctx.drawImage(img, 0, 0, 64, 32, -16, -16, 32, 32);
        ctx.restore();
      }
    }
  }

  // Torch in horizontal corridors
  const midLibDun = { x: CORR_LIB_DUN.x + CORR_LIB_DUN.w / 2, y: CORR_LIB_DUN.y + 10 };
  const midDunBoss = { x: CORR_DUN_BOSS.x + CORR_DUN_BOSS.w / 2, y: CORR_DUN_BOSS.y + 10 };
  drawTorch(ctx, midLibDun.x, midLibDun.y + 20, tick);
  drawTorch(ctx, midDunBoss.x, midDunBoss.y + 20, tick);
}

// ─── Draw Rooms ───────────────────────────────────────────────────────────────

function drawRooms(ctx: CanvasRenderingContext2D, heroList: Hero[], tick: number) {
  // ── LIBRARY / SANCTUARY ──────────────────────────────────────────────────────
  {
    const r = ROOM_LIBRARY;
    drawTiledBg(ctx, MV.bgLibrary, r.x, r.y, r.w, r.h, 0.9);
    ctx.strokeStyle = "#5522AA";
    ctx.lineWidth = 2;
    ctx.strokeRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = "rgba(70,20,130,0.12)";
    ctx.fillRect(r.x, r.y, r.w, r.h);

    // Room label
    ctx.fillStyle = "rgba(0,0,0,0.65)";
    ctx.fillRect(r.x + 4, r.y + 4, 120, 14);
    ctx.fillStyle = "#AA88FF";
    ctx.font = "bold 9px monospace";
    ctx.fillText("⛪ HOLY SANCTUARY", r.x + 8, r.y + 15);

    // Save point bench
    drawStaticImg(ctx, MV.benchStatic, r.x + r.w / 2 - 24, r.y + r.h / 2 + 10, 48, 48);
    // Bench glow
    const hasHeroes = heroList.some(h => h.room === "church");
    if (hasHeroes) {
      const pg = ctx.createRadialGradient(r.x + r.w / 2, r.y + r.h / 2 + 34, 0, r.x + r.w / 2, r.y + r.h / 2 + 34, 45);
      pg.addColorStop(0, `rgba(255,220,80,${0.3 + Math.sin(tick * 0.06) * 0.1})`);
      pg.addColorStop(1, "rgba(255,200,50,0)");
      ctx.fillStyle = pg;
      ctx.beginPath();
      ctx.arc(r.x + r.w / 2, r.y + r.h / 2 + 34, 45, 0, Math.PI * 2);
      ctx.fill();
    }

    // Wall tapestry decorations
    drawStaticImg(ctx, MV.tapestry, r.x + 8, r.y + 30, 16, 48);
    drawStaticImg(ctx, MV.tapestry, r.x + r.w - 24, r.y + 30, 16, 48);

    // Candles near bench
    drawTorch(ctx, r.x + r.w / 2 - 40, r.y + r.h - 30, tick);
    drawTorch(ctx, r.x + r.w / 2 + 40, r.y + r.h - 30, tick);

    // Hero count
    const cnt = heroList.filter(h => h.room === "church").length;
    if (cnt > 0) {
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(r.x + r.w - 28, r.y + 4, 24, 14);
      ctx.fillStyle = "#FFFFFF";
      ctx.font = "bold 8px monospace";
      ctx.textAlign = "right";
      ctx.fillText(`${cnt}×`, r.x + r.w - 6, r.y + 15);
      ctx.textAlign = "left";
    }
  }

  // ── DUNGEON MAIN ─────────────────────────────────────────────────────────────
  {
    const r = ROOM_DUNGEON;
    drawTiledBg(ctx, MV.bgDungeon, r.x, r.y, r.w, r.h, 0.85);
    ctx.strokeStyle = "#334466";
    ctx.lineWidth = 2;
    ctx.strokeRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = "rgba(20,30,60,0.15)";
    ctx.fillRect(r.x, r.y, r.w, r.h);

    // Room label
    ctx.fillStyle = "rgba(0,0,0,0.65)";
    ctx.fillRect(r.x + 4, r.y + 4, 110, 14);
    ctx.fillStyle = "#88AAFF";
    ctx.font = "bold 9px monospace";
    ctx.fillText("🗡 DUNGEON MAIN", r.x + 8, r.y + 15);

    // Ceiling chains
    drawStaticImg(ctx, MV.chain, r.x + 40, r.y, 16, 32);
    drawStaticImg(ctx, MV.chain, r.x + r.w - 56, r.y, 16, 32);

    // Guardian enemy (patrols dungeon)
    const guardX = r.x + 60 + Math.floor(Math.sin(tick * 0.02) * 30);
    drawGuardian(ctx, guardX, r.y + r.h - 30, tick);

    // Wall torches
    drawTorch(ctx, r.x + 16, r.y + 50, tick, true);
    drawTorch(ctx, r.x + r.w - 16, r.y + 50, tick, true);

    // Skulls decoration
    drawStaticImg(ctx, MV.skulls, r.x + r.w / 2 - 8, r.y + r.h - 20, 16, 16);

    // Hero count
    const cnt = heroList.filter(h => h.room === "corridor").length;
    if (cnt > 0) {
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(r.x + r.w - 28, r.y + 4, 24, 14);
      ctx.fillStyle = "#FFFFFF";
      ctx.font = "bold 8px monospace";
      ctx.textAlign = "right";
      ctx.fillText(`${cnt}×`, r.x + r.w - 6, r.y + 15);
      ctx.textAlign = "left";
    }
  }

  // ── BOSS ARENA ───────────────────────────────────────────────────────────────
  {
    const r = ROOM_BOSS;
    drawTiledBg(ctx, MV.bgBossRoom, r.x, r.y, r.w, r.h, 0.9);
    ctx.strokeStyle = "#660022";
    ctx.lineWidth = 3;
    ctx.strokeRect(r.x, r.y, r.w, r.h);

    // Pulsing red overlay when fighting
    const fighting = heroList.filter(h => h.state === "fighting" || h.state === "casting");
    if (fighting.length > 0) {
      ctx.fillStyle = `rgba(120,0,0,${0.1 + Math.sin(tick * 0.1) * 0.05})`;
      ctx.fillRect(r.x, r.y, r.w, r.h);
    }

    // Room label
    ctx.fillStyle = "rgba(0,0,0,0.65)";
    ctx.fillRect(r.x + 4, r.y + 4, 100, 14);
    ctx.fillStyle = "#FF4444";
    ctx.font = "bold 9px monospace";
    ctx.fillText("⚔ BOSS ARENA", r.x + 8, r.y + 15);

    // Corner torches (tall)
    drawTorch(ctx, r.x + 20, r.y + 60, tick, true);
    drawTorch(ctx, r.x + r.w - 20, r.y + 60, tick, true);
    drawTorch(ctx, r.x + 20, r.y + r.h - 40, tick, true);
    drawTorch(ctx, r.x + r.w - 20, r.y + r.h - 40, tick, true);

    // Wall paintings
    drawStaticImg(ctx, MV.painting, r.x + 60, r.y + 10, 32, 32);
    drawStaticImg(ctx, MV.painting, r.x + r.w - 92, r.y + 10, 32, 32);

    // Draw boss
    const bossHeroes = heroList.filter(h => h.room === "boss_arena");
    drawBoss(ctx, tick, bossHeroes);

    // Hero count
    const cnt = bossHeroes.length;
    if (cnt > 0) {
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(r.x + r.w - 28, r.y + 4, 24, 14);
      ctx.fillStyle = "#FF4444";
      ctx.font = "bold 8px monospace";
      ctx.textAlign = "right";
      ctx.fillText(`${cnt}×`, r.x + r.w - 6, r.y + 15);
      ctx.textAlign = "left";
    }
  }

  // ── MERCHANT SHOP ────────────────────────────────────────────────────────────
  {
    const r = ROOM_SHOP;
    drawTiledBg(ctx, MV.bgWitchShop, r.x, r.y, r.w, r.h, 0.9);
    ctx.strokeStyle = "#886622";
    ctx.lineWidth = 2;
    ctx.strokeRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = "rgba(80,50,10,0.1)";
    ctx.fillRect(r.x, r.y, r.w, r.h);

    // Room label
    ctx.fillStyle = "rgba(0,0,0,0.65)";
    ctx.fillRect(r.x + 4, r.y + 4, 120, 14);
    ctx.fillStyle = "#FFAA44";
    ctx.font = "bold 9px monospace";
    ctx.fillText("🏪 MERCHANT SHOP", r.x + 8, r.y + 15);

    // Witch merchant NPC
    drawWitch(ctx, r.x + r.w / 2, r.y + r.h / 2 + 10, tick);

    // Table and chair
    drawStaticImg(ctx, MV.table, r.x + 20, r.y + r.h - 40, 40, 32);

    // Candles on counter
    drawTorch(ctx, r.x + r.w / 2 - 50, r.y + r.h - 20, tick);
    drawTorch(ctx, r.x + r.w / 2 + 50, r.y + r.h - 20, tick);

    // Hero count
    const cnt = heroList.filter(h => h.room === "shop").length;
    if (cnt > 0) {
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(r.x + r.w - 28, r.y + 4, 24, 14);
      ctx.fillStyle = "#FFAA44";
      ctx.font = "bold 8px monospace";
      ctx.textAlign = "right";
      ctx.fillText(`${cnt}×`, r.x + r.w - 6, r.y + 15);
      ctx.textAlign = "left";
    }
  }

  // ── TAVERN REST ──────────────────────────────────────────────────────────────
  {
    const r = ROOM_TAVERN;
    drawTiledBg(ctx, MV.bgDungeon, r.x, r.y, r.w, r.h, 0.6);
    ctx.strokeStyle = "#224422";
    ctx.lineWidth = 2;
    ctx.strokeRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = "rgba(20,50,20,0.2)";
    ctx.fillRect(r.x, r.y, r.w, r.h);

    // Room label
    ctx.fillStyle = "rgba(0,0,0,0.65)";
    ctx.fillRect(r.x + 4, r.y + 4, 90, 14);
    ctx.fillStyle = "#44AA44";
    ctx.font = "bold 9px monospace";
    ctx.fillText("🍺 TAVERN REST", r.x + 8, r.y + 15);

    // Table
    drawStaticImg(ctx, MV.table, r.x + r.w / 2 - 20, r.y + 20, 40, 32);

    // Candles
    drawTorch(ctx, r.x + 20, r.y + 30, tick);
    drawTorch(ctx, r.x + r.w - 20, r.y + 30, tick);

    // Healing glow when heroes resting
    const resting = heroList.filter(h => h.room === "rest_area");
    if (resting.length > 0) {
      const hg = ctx.createRadialGradient(r.x + r.w / 2, r.y + r.h / 2, 0, r.x + r.w / 2, r.y + r.h / 2, 50);
      hg.addColorStop(0, `rgba(80,200,80,${0.2 + Math.sin(tick * 0.06) * 0.08})`);
      hg.addColorStop(1, "rgba(40,120,40,0)");
      ctx.fillStyle = hg;
      ctx.beginPath();
      ctx.arc(r.x + r.w / 2, r.y + r.h / 2, 50, 0, Math.PI * 2);
      ctx.fill();
    }

    // Hero count
    const cnt = resting.length;
    if (cnt > 0) {
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(r.x + r.w - 28, r.y + 4, 24, 14);
      ctx.fillStyle = "#44AA44";
      ctx.font = "bold 8px monospace";
      ctx.textAlign = "right";
      ctx.fillText(`${cnt}×`, r.x + r.w - 6, r.y + 15);
      ctx.textAlign = "left";
    }
  }
}

// ─── Hero Position Mapping ────────────────────────────────────────────────────

/**
 * Map hero room to a position within that room.
 * Multiple heroes in the same room are spread out.
 */
function getRoomPosition(room: string, heroIndex: number, totalInRoom: number): { x: number; y: number } {
  const rect = ROOM_RECTS[room] || ROOM_RECTS["corridor"];
  const { x, y, w, h } = rect;

  // Spread heroes horizontally within the room
  const margin = 40;
  const usableW = w - margin * 2;
  const cols = Math.min(totalInRoom, 4);
  const col = heroIndex % cols;
  const row = Math.floor(heroIndex / cols);

  const px = x + margin + (cols > 1 ? (col / (cols - 1)) * usableW : usableW / 2);
  const py = y + h * 0.55 + row * 50;

  return { x: Math.round(px), y: Math.round(py) };
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

  // Compute stable positions for heroes grouped by room
  const heroPositions = useRef<Map<number, { x: number; y: number }>>(new Map());

  const drawFrame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    tickRef.current++;
    const tick = tickRef.current;

    // Update hero positions (only when room changes)
    const roomGroups = new Map<string, Hero[]>();
    for (const hero of heroes) {
      const room = hero.room || "corridor";
      if (!roomGroups.has(room)) roomGroups.set(room, []);
      roomGroups.get(room)!.push(hero);
    }
    for (const [room, roomHeroes] of roomGroups) {
      roomHeroes.forEach((hero, idx) => {
        const existing = heroPositions.current.get(hero.id);
        const target = getRoomPosition(room, idx, roomHeroes.length);
        if (!existing || existing.x !== target.x || existing.y !== target.y) {
          heroPositions.current.set(hero.id, target);
        }
      });
    }

    // Assign positions to heroes
    const heroesWithPos = heroes.map(hero => ({
      ...hero,
      position: heroPositions.current.get(hero.id) || { x: 450, y: 160 },
    }));

    // ── Render ─────────────────────────────────────────────────────────────────

    // Dark base
    ctx.fillStyle = "#08080f";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Draw corridors first (behind rooms)
    drawCorridors(ctx, tick);

    // Draw rooms
    drawRooms(ctx, heroesWithPos, tick);

    // Draw heroes on top
    for (const hero of heroesWithPos) {
      drawHero(ctx, hero, tick, hero.id === selectedHeroId);
    }

    // Subtle scanline overlay
    ctx.fillStyle = "rgba(0,0,0,0.018)";
    for (let scanY = 0; scanY < CANVAS_H; scanY += 4) {
      ctx.fillRect(0, scanY, CANVAS_W, 2);
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
      const scaleX = CANVAS_W / rect.width;
      const scaleY = CANVAS_H / rect.height;
      const mx = (e.clientX - rect.left) * scaleX;
      const my = (e.clientY - rect.top) * scaleY;

      for (const hero of heroes) {
        const pos = heroPositions.current.get(hero.id) || hero.position;
        const dx = pos.x - mx;
        const dy = pos.y - my;
        if (Math.sqrt(dx * dx + dy * dy) < 28) {
          onHeroClick(hero.id);
          return;
        }
      }
    },
    [heroes, onHeroClick]
  );

  return (
    <canvas
      ref={canvasRef}
      width={CANVAS_W}
      height={CANVAS_H}
      onClick={handleClick}
      className="w-full h-full cursor-pointer"
      style={{ imageRendering: "pixelated" }}
    />
  );
}
