import { useState, useMemo } from "react";
import DungeonMap from "@/components/DungeonMap";
import HeroPanel from "@/components/HeroPanel";
import SkillsManager from "@/components/SkillsManager";
import { useHeroSocket } from "@/hooks/useHeroSocket";
import { HERO_CLASSES, STATE_COLORS, STATE_LABELS } from "@/lib/dungeonConfig";
import { trpc } from "@/lib/trpc";

export default function Home() {
  const { heroes, setHeroes, mode, connected, log, startDemo, startLive, clearHeroes } =
    useHeroSocket();
  const [selectedHeroId, setSelectedHeroId] = useState<number | null>(null);
  const [showSkillsManager, setShowSkillsManager] = useState(false);
  const [showLog, setShowLog] = useState(false);

  const selectedHero = useMemo(
    () => heroes.find((h) => h.id === selectedHeroId) || null,
    [heroes, selectedHeroId]
  );

  const refetchHeroes = trpc.agents.list.useQuery(undefined, { enabled: false });
  const { data: trackedProjects } = trpc.agents.trackedProjects.useQuery(undefined, { refetchInterval: 5000 });

  const stats = useMemo(() => {
    const active = heroes.filter(
      (h) => h.state === "fighting" || h.state === "casting"
    ).length;
    const resting = heroes.filter((h) => h.state === "resting").length;
    const planning = heroes.filter((h) => h.state === "shopping").length;
    return { total: heroes.length, active, resting, planning };
  }, [heroes]);

  return (
    <div
      className="min-h-screen flex flex-col bg-[#06060f] text-white overflow-hidden"
      style={{ fontFamily: "'IBM Plex Mono', 'Courier New', monospace" }}
    >
      {/* ── Header ── */}
      <header className="flex items-center justify-between px-4 py-2 border-b-2 border-[#4B0082] bg-[#0d0a1a] shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🏰</span>
          <div>
            <h1 className="text-base font-bold text-[#FFD700] uppercase tracking-widest leading-none">
              Claude Dungeon
            </h1>
            <p className="text-xs text-[#AA88FF] leading-none mt-0.5">
              Agent Visualization System
            </p>
          </div>
        </div>

        {/* Stats Bar */}
        <div className="hidden md:flex items-center gap-4">
          {[
            { label: "Heroes", value: stats.total, color: "#88AAFF" },
            { label: "Fighting", value: stats.active, color: "#FF4444" },
            { label: "Resting", value: stats.resting, color: "#44AA44" },
            { label: "Planning", value: stats.planning, color: "#FFAA00" },
          ].map((s) => (
            <div key={s.label} className="text-center">
              <div className="text-xs text-gray-500 uppercase">{s.label}</div>
              <div className="text-sm font-bold" style={{ color: s.color }}>
                {s.value}
              </div>
            </div>
          ))}
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2">
          {/* Connection status */}
          <div className="flex items-center gap-1 text-xs">
            <span
              className={`w-2 h-2 rounded-full ${connected ? "bg-green-400 animate-pulse" : "bg-red-500"}`}
            />
            <span className={connected ? "text-green-400" : "text-red-400"}>
              {connected ? "ONLINE" : "OFFLINE"}
            </span>
          </div>

          {/* Mode Toggle */}
          <div className="flex border border-[#4B0082] rounded overflow-hidden">
            <button
              onClick={startDemo}
              className={`px-3 py-1 text-xs font-bold uppercase transition-colors ${
                mode === "demo"
                  ? "bg-[#4B0082] text-white"
                  : "text-gray-500 hover:text-gray-300"
              }`}
            >
              🎮 Demo
            </button>
            <button
              onClick={startLive}
              className={`px-3 py-1 text-xs font-bold uppercase transition-colors ${
                mode === "live"
                  ? "bg-[#8B0000] text-white"
                  : "text-gray-500 hover:text-gray-300"
              }`}
            >
              📡 Live
            </button>
          </div>

          <button
            onClick={() => setShowSkillsManager(true)}
            className="px-3 py-1 text-xs font-bold uppercase border border-[#FFAA00] text-[#FFAA00] hover:bg-[#FFAA00] hover:text-black transition-colors rounded"
          >
            ✨ Skills
          </button>

          <button
            onClick={clearHeroes}
            className="px-3 py-1 text-xs font-bold uppercase border border-gray-600 text-gray-400 hover:border-red-500 hover:text-red-400 transition-colors rounded"
          >
            🗑️ Clear
          </button>

          <button
            onClick={() => setShowLog(!showLog)}
            className="px-3 py-1 text-xs font-bold uppercase border border-gray-600 text-gray-400 hover:text-white transition-colors rounded"
          >
            📜 Log
          </button>
        </div>
      </header>

      {/* ── Main Layout ── */}
      <div className="flex flex-1 overflow-hidden" style={{ minHeight: 0 }}>
        {/* Left Sidebar - Hero List */}
        <div className="w-48 border-r border-[#4B0082] bg-[#0a0a18] flex flex-col shrink-0 overflow-hidden">
          <div className="px-3 py-2 border-b border-[#4B0082]">
            <span className="text-xs font-bold text-[#AA88FF] uppercase tracking-widest">
              ⚔️ Heroes ({heroes.length})
            </span>
          </div>
          <div className="flex-1 overflow-y-auto">
            {heroes.length === 0 ? (
              <div className="p-3 text-xs text-gray-600 text-center">
                {mode === "demo"
                  ? "Click DEMO to spawn heroes"
                  : "Waiting for Claude Code..."}
              </div>
            ) : (
              heroes.map((hero) => {
                const cls = HERO_CLASSES[hero.heroClass];
                const stateColor = STATE_COLORS[hero.state];
                const isSelected = hero.id === selectedHeroId;
                return (
                  <button
                    key={hero.id}
                    onClick={() =>
                      setSelectedHeroId(isSelected ? null : hero.id)
                    }
                    className={`w-full text-left px-3 py-2 border-b border-[#1a1a2e] transition-colors ${
                      isSelected
                        ? "bg-[#1a0a2e] border-l-2 border-l-[#FFD700]"
                        : "hover:bg-[#1a1a2e]"
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm">{cls?.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold text-white truncate">
                          {hero.name}
                        </div>
                        <div className="text-xs" style={{ color: stateColor }}>
                          {STATE_LABELS[hero.state]}
                        </div>
                      </div>
                      <div className="text-xs text-gray-500">
                        Lv{hero.level}
                      </div>
                    </div>
                    {/* Mini HP bar */}
                    <div className="mt-1 h-1 bg-[#1a0a0a] rounded overflow-hidden">
                      <div
                        className="h-full bg-red-500 transition-all"
                        style={{
                          width: `${Math.round((hero.hp / hero.maxHp) * 100)}%`,
                        }}
                      />
                    </div>
                    {/* Active tools indicator */}
                    {(hero.activeTools?.length || 0) > 0 && (
                      <div className="mt-0.5 flex gap-0.5">
                        {hero.activeTools.slice(0, 3).map((t) => (
                          <span
                            key={t.id}
                            className="text-xs bg-[#FF444433] text-red-300 px-1 rounded"
                          >
                            {t.name.slice(0, 4)}
                          </span>
                        ))}
                      </div>
                    )}
                  </button>
                );
              })
            )}
          </div>

          {/* Mode info */}
          <div className="p-2 border-t border-[#4B0082] bg-[#0d0a1a]">
            {mode === "live" ? (
              <div className="text-xs text-gray-500">
                <div className="text-green-400 font-bold">📡 LIVE MODE</div>
                <div className="mt-0.5">Watching ~/.claude/</div>
              </div>
            ) : (
              <div className="text-xs text-gray-500">
                <div className="text-[#4B0082] font-bold">🎮 DEMO MODE</div>
                <div className="mt-0.5">Simulated agents</div>
              </div>
            )}
          </div>
        </div>

        {/* Center - Dungeon Map */}
        <div className="flex-1 relative bg-[#06060f] overflow-hidden">
          <DungeonMap
            heroes={heroes}
            selectedHeroId={selectedHeroId}
            onHeroClick={(id) =>
              setSelectedHeroId(selectedHeroId === id ? null : id)
            }
          />

          {/* Empty state overlay */}
          {heroes.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <div className="text-center">
                <div className="text-6xl mb-4">🏰</div>
                <div className="text-xl font-bold text-[#4B0082] uppercase tracking-widest mb-2">
                  Dungeon Awaits
                </div>
                <div className="text-sm text-gray-600">
                  {mode === "demo"
                    ? "Click 🎮 Demo to spawn heroes"
                    : "Start Claude Code to see heroes appear"}
                </div>
              </div>
            </div>
          )}

          {/* Activity Log Overlay */}
          {showLog && (
            <div className="absolute bottom-0 left-0 right-0 h-36 bg-[#06060f]/95 border-t border-[#4B0082] overflow-y-auto p-2">
              <div className="text-xs text-[#AA88FF] font-bold mb-1 uppercase">
                📜 Activity Log
              </div>
              {log.map((entry, i) => (
                <div key={i} className="text-xs text-gray-400 leading-relaxed">
                  {entry}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Panel - Hero Details */}
        {selectedHero && (
          <div className="w-64 shrink-0 overflow-hidden">
            <HeroPanel
              hero={selectedHero}
              onClose={() => setSelectedHeroId(null)}
              onSkillsUpdated={() => {}}
            />
          </div>
        )}
      </div>

      {/* Skills Manager Modal */}
      {showSkillsManager && (
        <SkillsManager
          onClose={() => setShowSkillsManager(false)}
          projects={trackedProjects ?? []}
        />
      )}
    </div>
  );
}
