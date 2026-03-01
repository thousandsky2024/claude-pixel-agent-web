import { useEffect, useRef, useCallback } from "react";
import {
  ROOMS,
  HERO_CLASSES,
  STATE_COLORS,
  STATE_LABELS,
  ASSETS,
  type HeroState,
} from "../lib/dungeonConfig";
import type { Hero } from "../hooks/useHeroSocket";

// ─── Canvas Dimensions ────────────────────────────────────────────────────────

const CANVAS_W = 800;
const CANVAS_H = 600;

// ─── Hero Sprite Rendering ────────────────────────────────────────────────────

const heroImages: Record<string, HTMLImageElement> = {};

function loadImage(src: string): HTMLImageElement {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = src;
  return img;
}

const dungeonBgImage = loadImage(ASSETS.dungeonMap);

function getHeroImage(heroClass: string): HTMLImageElement {
  if (!heroImages[heroClass]) {
    heroImages[heroClass] = loadImage(
      heroClass === "warrior"
        ? ASSETS.heroWarrior
        : heroClass === "mage"
        ? ASSETS.heroMage
        : ASSETS.heroCleric
    );
  }
  return heroImages[heroClass];
}

// ─── Pixel Hero Sprite (fallback) ─────────────────────────────────────────────

function drawPixelHero(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  heroClass: string,
  state: HeroState,
  tick: number,
  selected: boolean
) {
  const classConfig = HERO_CLASSES[heroClass as keyof typeof HERO_CLASSES];
  const color = classConfig?.color || "#FF4444";
  const stateColor = STATE_COLORS[state];

  const bobY = Math.sin(tick * 0.1) * 2;
  const px = Math.round(x);
  const py = Math.round(y + bobY);

  // Selection ring
  if (selected) {
    ctx.strokeStyle = "#FFD700";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(px, py + 8, 18, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Shadow
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.beginPath();
  ctx.ellipse(px, py + 18, 10, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  // Body
  ctx.fillStyle = color;
  ctx.fillRect(px - 7, py - 4, 14, 16);

  // Head
  ctx.fillStyle = "#FFCC99";
  ctx.fillRect(px - 5, py - 14, 10, 10);

  // Class-specific details
  if (heroClass === "warrior") {
    // Sword
    ctx.fillStyle = "#CCCCCC";
    ctx.fillRect(px + 7, py - 2, 3, 12);
    // Shield
    ctx.fillStyle = "#884400";
    ctx.fillRect(px - 11, py - 2, 4, 10);
  } else if (heroClass === "mage") {
    // Staff
    ctx.fillStyle = "#8844FF";
    ctx.fillRect(px + 7, py - 8, 3, 20);
    // Orb
    ctx.fillStyle = "#CC88FF";
    ctx.beginPath();
    ctx.arc(px + 8, py - 10, 4, 0, Math.PI * 2);
    ctx.fill();
  } else if (heroClass === "cleric") {
    // Cross symbol
    ctx.fillStyle = "#FFD700";
    ctx.fillRect(px - 2, py - 20, 4, 10);
    ctx.fillRect(px - 6, py - 17, 12, 4);
  }

  // State indicator
  if (state === "fighting" || state === "casting") {
    const sparkTick = Math.floor(tick / 3) % 4;
    ctx.fillStyle = stateColor;
    ctx.globalAlpha = 0.8;
    for (let i = 0; i < sparkTick; i++) {
      ctx.beginPath();
      ctx.arc(
        px + Math.cos((i * Math.PI * 2) / 4) * 16,
        py + Math.sin((i * Math.PI * 2) / 4) * 16 - 4,
        2,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  if (state === "resting") {
    // Zzz bubbles
    ctx.fillStyle = "#88CCFF";
    ctx.font = "bold 10px monospace";
    ctx.fillText("z", px + 8, py - 16 + Math.sin(tick * 0.05) * 3);
    ctx.fillText("Z", px + 14, py - 22 + Math.sin(tick * 0.05 + 1) * 3);
  }

  if (state === "shopping") {
    // Coin sparkle
    ctx.fillStyle = "#FFD700";
    ctx.font = "10px monospace";
    ctx.fillText("$", px + 8, py - 16);
  }

  // Name tag
  ctx.fillStyle = "rgba(0,0,0,0.7)";
  ctx.fillRect(px - 22, py - 28, 44, 12);
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "8px monospace";
  ctx.textAlign = "center";
  ctx.fillText(
    heroClass === "warrior" ? "⚔️" : heroClass === "mage" ? "🔮" : "✨",
    px,
    py - 18
  );
  ctx.textAlign = "left";
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

  const drawFrame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    tickRef.current++;
    const tick = tickRef.current;

    // Background
    ctx.fillStyle = "#0a0a1a";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Draw dungeon background image
    if (dungeonBgImage.complete && dungeonBgImage.naturalWidth > 0) {
      ctx.globalAlpha = 0.6;
      ctx.drawImage(dungeonBgImage, 0, 0, CANVAS_W, CANVAS_H);
      ctx.globalAlpha = 1;
    }

    // Draw room overlays
    for (const room of Object.values(ROOMS)) {
      // Room background
      ctx.fillStyle = room.color + "33";
      ctx.fillRect(room.x, room.y, room.width, room.height);

      // Room border
      ctx.strokeStyle = room.color + "88";
      ctx.lineWidth = 2;
      ctx.strokeRect(room.x, room.y, room.width, room.height);

      // Room label
      ctx.fillStyle = room.color + "CC";
      ctx.font = "bold 11px monospace";
      ctx.fillText(`${room.icon} ${room.name}`, room.x + 8, room.y + 18);

      // Count heroes in room
      const roomHeroes = heroes.filter((h) => h.room === room.id);
      if (roomHeroes.length > 0) {
        ctx.fillStyle = "#FFFFFF88";
        ctx.font = "9px monospace";
        ctx.fillText(`${roomHeroes.length} hero${roomHeroes.length > 1 ? "es" : ""}`, room.x + 8, room.y + room.height - 6);
      }
    }

    // Draw boss in arena when heroes are fighting
    const fightingHeroes = heroes.filter(
      (h) => h.state === "fighting" || h.state === "casting"
    );
    if (fightingHeroes.length > 0) {
      const bossX = ROOMS.boss_arena.x + ROOMS.boss_arena.width / 2;
      const bossY = ROOMS.boss_arena.y + ROOMS.boss_arena.height / 2 + 20;

      // Boss glow
      const gradient = ctx.createRadialGradient(bossX, bossY, 0, bossX, bossY, 40);
      gradient.addColorStop(0, "rgba(255,0,0,0.4)");
      gradient.addColorStop(1, "rgba(255,0,0,0)");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(bossX, bossY, 40, 0, Math.PI * 2);
      ctx.fill();

      // Boss body (pixel dragon)
      const bossScale = 1 + Math.sin(tick * 0.05) * 0.05;
      ctx.save();
      ctx.translate(bossX, bossY);
      ctx.scale(bossScale, bossScale);

      ctx.fillStyle = "#CC0000";
      ctx.fillRect(-15, -20, 30, 30);
      ctx.fillStyle = "#880000";
      ctx.fillRect(-20, -10, 10, 20);
      ctx.fillRect(10, -10, 10, 20);
      ctx.fillStyle = "#FF4444";
      ctx.fillRect(-10, -30, 20, 15);

      // Boss eyes
      ctx.fillStyle = "#FFFF00";
      ctx.fillRect(-8, -18, 5, 5);
      ctx.fillRect(3, -18, 5, 5);

      // HP bar
      ctx.fillStyle = "#FF0000";
      ctx.fillRect(-20, 15, 40, 5);
      ctx.fillStyle = "#00FF00";
      const bossHpRatio = 0.3 + Math.sin(tick * 0.02) * 0.2;
      ctx.fillRect(-20, 15, 40 * bossHpRatio, 5);

      ctx.restore();

      // Boss label
      ctx.fillStyle = "#FF4444";
      ctx.font = "bold 10px monospace";
      ctx.textAlign = "center";
      ctx.fillText("💀 TASK BOSS", bossX, bossY - 35);
      ctx.textAlign = "left";
    }

    // Draw church priest when heroes are resting
    const restingHeroes = heroes.filter((h) => h.state === "resting" || h.state === "hurt");
    if (restingHeroes.length > 0) {
      const priestX = ROOMS.church.x + ROOMS.church.width / 2;
      const priestY = ROOMS.church.y + ROOMS.church.height / 2 + 10;

      // Priest glow
      const gradient = ctx.createRadialGradient(priestX, priestY, 0, priestX, priestY, 30);
      gradient.addColorStop(0, "rgba(255,255,100,0.4)");
      gradient.addColorStop(1, "rgba(255,255,100,0)");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(priestX, priestY, 30, 0, Math.PI * 2);
      ctx.fill();

      // Priest body
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(priestX - 8, priestY - 10, 16, 20);
      ctx.fillStyle = "#FFCC99";
      ctx.fillRect(priestX - 5, priestY - 20, 10, 12);
      // Cross
      ctx.fillStyle = "#FFD700";
      ctx.fillRect(priestX - 2, priestY - 35, 4, 12);
      ctx.fillRect(priestX - 7, priestY - 30, 14, 4);

      // Healing particles
      for (let i = 0; i < 3; i++) {
        const angle = (tick * 0.05 + (i * Math.PI * 2) / 3);
        const px2 = priestX + Math.cos(angle) * 20;
        const py2 = priestY + Math.sin(angle) * 20;
        ctx.fillStyle = "#FFFF88";
        ctx.globalAlpha = 0.7;
        ctx.beginPath();
        ctx.arc(px2, py2, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      ctx.fillStyle = "#FFD700";
      ctx.font = "bold 9px monospace";
      ctx.textAlign = "center";
      ctx.fillText("✨ PRIEST", priestX, priestY - 38);
      ctx.textAlign = "left";
    }

    // Draw merchant when heroes are shopping
    const shoppingHeroes = heroes.filter((h) => h.state === "shopping");
    if (shoppingHeroes.length > 0) {
      const merchantX = ROOMS.shop.x + ROOMS.shop.width / 2;
      const merchantY = ROOMS.shop.y + ROOMS.shop.height / 2 + 10;

      ctx.fillStyle = "#884400";
      ctx.fillRect(merchantX - 8, merchantY - 10, 16, 20);
      ctx.fillStyle = "#FFCC99";
      ctx.fillRect(merchantX - 5, merchantY - 20, 10, 12);
      ctx.fillStyle = "#FF8800";
      ctx.fillRect(merchantX - 10, merchantY - 25, 20, 8);

      // Coin sparkles
      for (let i = 0; i < 4; i++) {
        const coinTick = (tick + i * 15) % 60;
        if (coinTick < 30) {
          ctx.fillStyle = "#FFD700";
          ctx.font = "12px monospace";
          ctx.textAlign = "center";
          ctx.fillText("💰", merchantX + (i - 1.5) * 12, merchantY - 30 - coinTick * 0.3);
        }
      }
      ctx.textAlign = "left";

      ctx.fillStyle = "#FFAA00";
      ctx.font = "bold 9px monospace";
      ctx.textAlign = "center";
      ctx.fillText("🏪 MERCHANT", merchantX, merchantY - 38);
      ctx.textAlign = "left";
    }

    // Draw heroes
    for (const hero of heroes) {
      drawPixelHero(
        ctx,
        hero.position.x,
        hero.position.y,
        hero.heroClass,
        hero.state,
        tick,
        hero.id === selectedHeroId
      );
    }

    // Scanline effect
    ctx.fillStyle = "rgba(0,0,0,0.03)";
    for (let y = 0; y < CANVAS_H; y += 4) {
      ctx.fillRect(0, y, CANVAS_W, 2);
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
        const dx = hero.position.x - mx;
        const dy = hero.position.y - my;
        if (Math.sqrt(dx * dx + dy * dy) < 20) {
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
