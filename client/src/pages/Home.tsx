import { useState, useMemo } from "react";
import DungeonMap from "@/components/DungeonMap";
import HeroPanel from "@/components/HeroPanel";
import SkillsManager from "@/components/SkillsManager";
import ConfigPanel from "@/components/ConfigPanel";
import { useHeroSocket } from "@/hooks/useHeroSocket";
import { HERO_CLASSES, STATE_COLORS, STATE_LABELS } from "@/lib/dungeonConfig";
import { trpc } from "@/lib/trpc";

export default function Home() {
  const { heroes, setHeroes, mode, connected, log, startDemo, startLive, clearHeroes } =
    useHeroSocket();
  const [selectedHeroId, setSelectedHeroId] = useState<number | null>(null);
  const [showSkillsManager, setShowSkillsManager] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [showConfig, setShowConfig] = useState(false);

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
      className="h-screen flex flex-col bg-[#06060f] text-white overflow-hidden"
      style={{ fontFamily: "'IBM Plex Mono', 'Courier New', monospace" }}
    >
      {/* ── Header ── */}
      <header className="flex items-center justify-between px-4 py-2 border-b-2 border-[#4B0082] bg-[#0d0a1a] shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 flex items-center justify-center bg-[#1a0a2e] border border-[#4B0082] rounded">
            <span className="text-lg leading-none">🏰</span>
          </div>
          <div>
            <h1 className="text-sm font-bold text-[#FFD700] uppercase tracking-widest leading-none">
              Claude Dungeon
            </h1>
            <p className="text-xs text-[#AA88FF] leading-none mt-0.5">
              Agent Visualization System
            </p>
          </div>
        </div>

        {/* Stats Bar - 更丰富的统计显示 */}
        <div className="hidden md:flex items-center gap-1">
          {[
            { label: "Heroes", value: stats.total, color: "#88AAFF", bg: "#88AAFF22", border: "#88AAFF44" },
            { label: "Fighting", value: stats.active, color: "#FF4444", bg: "#FF444422", border: "#FF444444" },
            { label: "Resting", value: stats.resting, color: "#44AA44", bg: "#44AA4422", border: "#44AA4444" },
            { label: "Planning", value: stats.planning, color: "#FFAA00", bg: "#FFAA0022", border: "#FFAA0044" },
          ].map((s) => (
            <div
              key={s.label}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded"
              style={{ backgroundColor: s.bg, border: `1px solid ${s.border}` }}
            >
              <div className="text-xs font-bold" style={{ color: s.color }}>
                {s.value}
              </div>
              <div className="text-xs text-gray-500 uppercase">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Controls */}
        <div className="flex items-center gap-1.5">
          {/* Connection status */}
          <div className="flex items-center gap-1 text-xs px-2 py-1 rounded border border-gray-700">
            <span
              className={`w-2 h-2 rounded-full ${connected ? "bg-green-400 animate-pulse" : "bg-red-500"}`}
            />
            <span className={`text-xs font-bold ${connected ? "text-green-400" : "text-red-400"}`}>
              {connected ? "ONLINE" : "OFFLINE"}
            </span>
          </div>

          {/* Mode Toggle */}
          <div className="flex border border-[#4B0082] rounded overflow-hidden">
            <button
              onClick={startDemo}
              className={`px-2.5 py-1 text-xs font-bold uppercase transition-colors ${
                mode === "demo"
                  ? "bg-[#4B0082] text-white"
                  : "text-gray-500 hover:text-gray-300"
              }`}
            >
              🎮 Demo
            </button>
            <button
              onClick={startLive}
              className={`px-2.5 py-1 text-xs font-bold uppercase transition-colors ${
                mode === "live"
                  ? "bg-[#8B0000] text-white"
                  : "text-gray-500 hover:text-gray-300"
              }`}
            >
              📡 Live
            </button>
          </div>

          <button
            onClick={() => setShowConfig(true)}
            className="px-2.5 py-1 text-xs font-bold uppercase border border-[#00AAFF] text-[#00AAFF] hover:bg-[#00AAFF] hover:text-black transition-colors rounded"
          >
            ⚙️ Config
          </button>

          <button
            onClick={() => setShowSkillsManager(true)}
            className="px-2.5 py-1 text-xs font-bold uppercase border border-[#FFAA00] text-[#FFAA00] hover:bg-[#FFAA00] hover:text-black transition-colors rounded"
          >
            ✨ Skills
          </button>

          <button
            onClick={clearHeroes}
            className="px-2.5 py-1 text-xs font-bold uppercase border border-gray-600 text-gray-400 hover:border-red-500 hover:text-red-400 transition-colors rounded"
          >
            🗑️ Clear
          </button>

          <button
            onClick={() => setShowLog(!showLog)}
            className={`px-2.5 py-1 text-xs font-bold uppercase border transition-colors rounded ${
              showLog
                ? "border-[#AA88FF] text-[#AA88FF] bg-[#AA88FF22]"
                : "border-gray-600 text-gray-400 hover:text-white"
            }`}
          >
            📜 Log
          </button>
        </div>
      </header>

      {/* ── Main Layout ── */}
      <div className="flex flex-1 overflow-hidden" style={{ minHeight: 0 }}>
        {/* Left Sidebar - Hero List (加宽) */}
        <div className="w-52 border-r border-[#4B0082] bg-[#0a0a18] flex flex-col shrink-0 overflow-hidden">
          <div className="px-3 py-2 border-b border-[#4B0082] bg-[#0d0a1a]">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#AA88FF] uppercase tracking-widest">
                ⚔️ Heroes
              </span>
              <span
                className="text-xs font-bold px-1.5 py-0.5 rounded"
                style={{
                  backgroundColor: heroes.length > 0 ? "#88AAFF22" : "#33333322",
                  color: heroes.length > 0 ? "#88AAFF" : "#555555",
                  border: `1px solid ${heroes.length > 0 ? "#88AAFF44" : "#33333344"}`,
                }}
              >
                {heroes.length}
              </span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {heroes.length === 0 ? (
              <div className="p-4 text-center">
                <div className="text-3xl mb-2 opacity-30">⚔️</div>
                <div className="text-xs text-gray-600 leading-relaxed">
                  {mode === "demo"
                    ? "Click 🎮 Demo\nto spawn heroes"
                    : "Start Claude Code\nto see heroes"}
                </div>
              </div>
            ) : (
              heroes.map((hero) => {
                const cls = HERO_CLASSES[hero.heroClass];
                const stateColor = STATE_COLORS[hero.state];
                const stateLabel = STATE_LABELS[hero.state];
                const isSelected = hero.id === selectedHeroId;
                const hpPct = Math.round((hero.hp / hero.maxHp) * 100);
                return (
                  <button
                    key={hero.id}
                    onClick={() =>
                      setSelectedHeroId(isSelected ? null : hero.id)
                    }
                    className={`w-full text-left px-3 py-2.5 border-b border-[#1a1a2e] transition-all ${
                      isSelected
                        ? "bg-[#1a0a2e] border-l-2 border-l-[#FFD700]"
                        : "hover:bg-[#1a1a2e]"
                    }`}
                  >
                    {/* Hero name row */}
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-base leading-none">{cls?.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold text-white truncate">
                          {hero.name}
                        </div>
                        <div className="text-xs" style={{ color: stateColor }}>
                          {stateLabel}
                        </div>
                      </div>
                      <div
                        className="text-xs font-bold px-1 rounded"
                        style={{ color: cls?.color, backgroundColor: (cls?.color || "#888") + "22" }}
                      >
                        Lv{hero.level}
                      </div>
                    </div>

                    {/* HP bar */}
                    <div className="h-1.5 bg-[#1a0a0a] rounded-full overflow-hidden border border-red-900/50">
                      <div
                        className="h-full transition-all duration-500"
                        style={{
                          width: `${hpPct}%`,
                          backgroundColor: hpPct > 50 ? "#FF4444" : hpPct > 25 ? "#FF8800" : "#FF2200",
                        }}
                      />
                    </div>

                    {/* Active tools indicator */}
                    {(hero.activeTools?.length || 0) > 0 && (
                      <div className="mt-1 flex gap-0.5 flex-wrap">
                        {hero.activeTools.slice(0, 3).map((t, idx) => (
                          <span
                            key={t.id ?? `${hero.id}-tool-${idx}`}
                            className="text-xs px-1 rounded"
                            style={{ backgroundColor: "#FF444433", color: "#FF9999" }}
                          >
                            {t.name.slice(0, 5)}
                          </span>
                        ))}
                        {hero.activeTools.length > 3 && (
                          <span className="text-xs text-gray-600">+{hero.activeTools.length - 3}</span>
                        )}
                      </div>
                    )}
                  </button>
                );
              })
            )}
          </div>

          {/* Mode info */}
          <div className="p-2.5 border-t border-[#4B0082] bg-[#0d0a1a]">
            {mode === "live" ? (
              <div className="text-xs">
                <div className="text-green-400 font-bold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse inline-block" />
                  LIVE MODE
                </div>
                <div className="text-gray-600 mt-0.5">Watching ~/.claude/</div>
              </div>
            ) : (
              <div className="text-xs">
                <div className="text-[#7744AA] font-bold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#7744AA] inline-block" />
                  DEMO MODE
                </div>
                <div className="text-gray-600 mt-0.5">Simulated agents</div>
              </div>
            )}
          </div>
        </div>

        {/* Center - Dungeon Map */}
        <div className="flex-1 relative bg-[#06060f] overflow-hidden" style={{ minHeight: 0 }}>
          <DungeonMap
            heroes={heroes}
            selectedHeroId={selectedHeroId}
            onHeroClick={(id) =>
              setSelectedHeroId(selectedHeroId === id ? null : id)
            }
          />

          {/* Empty state overlay - 放在右下角空白区域（Boss Arena下方），不覆盖地图内容 */}
          {heroes.length === 0 && (
            <div className="absolute bottom-4 right-4 pointer-events-none">
              <div
                className="text-center px-5 py-3 rounded-lg"
                style={{
                  backgroundColor: "rgba(6,6,15,0.9)",
                  border: "1px solid #4B0082",
                  backdropFilter: "blur(4px)",
                  maxWidth: "220px",
                }}
              >
                <div className="text-sm font-bold text-[#7744AA] uppercase tracking-widest">
                  🏰 Dungeon Awaits
                </div>
                <div className="text-xs text-gray-500 mt-1 leading-relaxed">
                  {mode === "demo"
                    ? "Click 🎮 Demo to spawn heroes"
                    : "Start Claude Code to see heroes appear"}
                </div>
              </div>
            </div>
          )}

          {/* Activity Log Overlay */}
          {showLog && (
            <div className="absolute bottom-0 left-0 right-0 h-40 bg-[#06060f]/96 border-t border-[#4B0082] overflow-y-auto p-2">
              <div className="flex items-center justify-between mb-1">
                <div className="text-xs text-[#AA88FF] font-bold uppercase">
                  📜 Activity Log
                </div>
                <button
                  onClick={() => setShowLog(false)}
                  className="text-gray-600 hover:text-gray-400 text-xs"
                >
                  ✕
                </button>
              </div>
              {log.length === 0 ? (
                <div className="text-xs text-gray-600 text-center py-2">No activity yet</div>
              ) : (
                log.slice(-30).map((entry, i) => (
                  <div key={i} className="text-xs text-gray-400 leading-relaxed py-0.5 border-b border-[#1a1a2e]">
                    {entry}
                  </div>
                ))
              )}
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

      {/* Config Panel Modal */}
      {showConfig && (
        <ConfigPanel onClose={() => setShowConfig(false)} />
      )}
    </div>
  );
}
