// ─── CDN Assets ───────────────────────────────────────────────────────────────

export const ASSETS = {
  dungeonMap: "https://d2xsxph8kpxj0f.cloudfront.net/310519663321243150/kUk4sJXkGLHTnK5J3QqqXR/dungeon-map-bg_f1179929.png",
  heroWarrior: "https://d2xsxph8kpxj0f.cloudfront.net/310519663321243150/kUk4sJXkGLHTnK5J3QqqXR/hero-warrior_393e0c49.png",
  heroMage: "https://d2xsxph8kpxj0f.cloudfront.net/310519663321243150/kUk4sJXkGLHTnK5J3QqqXR/hero-mage_6e5f2ebe.png",
  heroCleric: "https://d2xsxph8kpxj0f.cloudfront.net/310519663321243150/kUk4sJXkGLHTnK5J3QqqXR/hero-cleric_26815940.png",
  bossMonsters: "https://d2xsxph8kpxj0f.cloudfront.net/310519663321243150/kUk4sJXkGLHTnK5J3QqqXR/boss-monsters_e44f3e37.png",
  skillIcons: "https://d2xsxph8kpxj0f.cloudfront.net/310519663321243150/kUk4sJXkGLHTnK5J3QqqXR/skill-icons_ad2afd6a.png",
  uiHeroPanel: "https://d2xsxph8kpxj0f.cloudfront.net/310519663321243150/kUk4sJXkGLHTnK5J3QqqXR/ui-hero-panel_83147d36.png",
  uiActivityLog: "https://d2xsxph8kpxj0f.cloudfront.net/310519663321243150/kUk4sJXkGLHTnK5J3QqqXR/ui-activity-log_3858fb2f.png",
};

// ─── Room Definitions ─────────────────────────────────────────────────────────

export type DungeonRoom = "boss_arena" | "church" | "shop" | "rest_area" | "corridor";
export type HeroClass = "warrior" | "mage" | "cleric";
export type HeroState = "idle" | "walking" | "fighting" | "casting" | "resting" | "shopping" | "hurt";

export interface RoomConfig {
  id: DungeonRoom;
  name: string;
  description: string;
  // Position on 800x600 canvas
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  icon: string;
}

export const ROOMS: Record<DungeonRoom, RoomConfig> = {
  boss_arena: {
    id: "boss_arena",
    name: "Boss Arena",
    description: "Battle ground for epic tasks",
    x: 270, y: 170, width: 260, height: 220,
    color: "#8B0000",
    icon: "⚔️",
  },
  church: {
    id: "church",
    name: "Holy Sanctuary",
    description: "Priest blesses resting heroes",
    x: 40, y: 60, width: 200, height: 180,
    color: "#4B0082",
    icon: "⛪",
  },
  shop: {
    id: "shop",
    name: "Merchant Shop",
    description: "Planning and skill acquisition",
    x: 560, y: 60, width: 200, height: 180,
    color: "#8B6914",
    icon: "🏪",
  },
  rest_area: {
    id: "rest_area",
    name: "Tavern Rest",
    description: "Heroes recover HP/MP here",
    x: 270, y: 430, width: 260, height: 140,
    color: "#2F4F2F",
    icon: "🍺",
  },
  corridor: {
    id: "corridor",
    name: "Corridor",
    description: "Transitioning between areas",
    x: 270, y: 380, width: 260, height: 60,
    color: "#1a1a2e",
    icon: "🚶",
  },
};

// ─── Hero Class Config ────────────────────────────────────────────────────────

export interface HeroClassConfig {
  id: HeroClass;
  name: string;
  description: string;
  primaryTool: string;
  color: string;
  emoji: string;
  asset: string;
}

export const HERO_CLASSES: Record<HeroClass, HeroClassConfig> = {
  warrior: {
    id: "warrior",
    name: "Warrior",
    description: "Masters Bash commands and file writing",
    primaryTool: "Bash / Write",
    color: "#FF4444",
    emoji: "⚔️",
    asset: ASSETS.heroWarrior,
  },
  mage: {
    id: "mage",
    name: "Mage",
    description: "Specializes in web search and analysis",
    primaryTool: "WebSearch / Fetch",
    color: "#8844FF",
    emoji: "🔮",
    asset: ASSETS.heroMage,
  },
  cleric: {
    id: "cleric",
    name: "Cleric",
    description: "Reads and plans with divine insight",
    primaryTool: "Read / Plan",
    color: "#FFAA00",
    emoji: "✨",
    asset: ASSETS.heroCleric,
  },
};

// ─── State → Room Mapping ─────────────────────────────────────────────────────

export const STATE_ROOM_MAP: Record<HeroState, DungeonRoom> = {
  idle: "corridor",
  walking: "corridor",
  fighting: "boss_arena",
  casting: "boss_arena",
  resting: "rest_area",
  shopping: "shop",
  hurt: "church",
};

export const STATE_LABELS: Record<HeroState, string> = {
  idle: "Idle",
  walking: "Moving",
  fighting: "⚔️ Fighting Boss",
  casting: "🔮 Casting Spell",
  resting: "💤 Resting",
  shopping: "🛒 Planning",
  hurt: "💔 Recovering",
};

export const STATE_COLORS: Record<HeroState, string> = {
  idle: "#888888",
  walking: "#88AAFF",
  fighting: "#FF4444",
  casting: "#AA44FF",
  resting: "#44AA44",
  shopping: "#FFAA00",
  hurt: "#FF8800",
};

// ─── Skill Definitions ────────────────────────────────────────────────────────

export interface SkillDef {
  id: string;
  name: string;
  description: string;
  icon: string;
  type: "attack" | "magic" | "defense" | "utility";
  color: string;
}

export const SKILLS: SkillDef[] = [
  { id: "power_strike", name: "Power Strike", description: "Bash commands ignite with fire aura", icon: "⚔️", type: "attack", color: "#FF4444" },
  { id: "arcane_boost", name: "Arcane Boost", description: "Web search enhanced by magic orb", icon: "🔮", type: "magic", color: "#8844FF" },
  { id: "divine_shield", name: "Divine Shield", description: "Error recovery with golden shield", icon: "🛡️", type: "defense", color: "#FFAA00" },
  { id: "shadow_step", name: "Shadow Step", description: "File navigation with shadow trail", icon: "👟", type: "utility", color: "#444488" },
  { id: "battle_cry", name: "Battle Cry", description: "Rally all heroes with horn fanfare", icon: "📯", type: "attack", color: "#FF8800" },
  { id: "mystic_sight", name: "Mystic Sight", description: "Reveal patterns with all-seeing eye", icon: "👁️", type: "magic", color: "#00CCCC" },
];
