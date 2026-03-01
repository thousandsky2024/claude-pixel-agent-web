import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { HERO_CLASSES, STATE_LABELS, STATE_COLORS, SKILLS } from "../lib/dungeonConfig";
import type { Hero } from "../hooks/useHeroSocket";

interface Props {
  hero: Hero;
  onClose: () => void;
  onSkillsUpdated: () => void;
}

export default function HeroPanel({ hero, onClose, onSkillsUpdated }: Props) {
  const [activeTab, setActiveTab] = useState<"stats" | "skills" | "tools">("stats");
  const classConfig = HERO_CLASSES[hero.heroClass];
  const stateColor = STATE_COLORS[hero.state];
  const stateLabel = STATE_LABELS[hero.state];

  const updateSkillsMutation = trpc.agents.updateHeroSkills.useMutation({
    onSuccess: onSkillsUpdated,
  });

  const toggleSkill = (skillId: string) => {
    const current = hero.skills || [];
    const updated = current.includes(skillId)
      ? current.filter((s) => s !== skillId)
      : [...current, skillId];
    updateSkillsMutation.mutate({ heroId: hero.id, skills: updated });
  };

  const hpPct = Math.round((hero.hp / hero.maxHp) * 100);
  const mpPct = Math.round((hero.mp / hero.maxMp) * 100);
  const expPct = Math.round((hero.exp / (hero.level * 100)) * 100);

  const allTools = useMemo(() => {
    const tools = [...(hero.activeTools || [])];
    for (const subTools of Object.values(hero.subAgentTools || {})) {
      tools.push(...subTools);
    }
    return tools;
  }, [hero.activeTools, hero.subAgentTools]);

  return (
    <div className="flex flex-col h-full bg-[#0d0d1a] border-l-2 border-[#4B0082] text-white font-mono">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-[#4B0082] bg-[#1a0a2e]">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{classConfig?.emoji}</span>
          <div>
            <div className="text-sm font-bold text-[#FFD700]">{hero.name}</div>
            <div className="text-xs text-[#AA88FF]">
              Lv.{hero.level} {classConfig?.name}
            </div>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white text-lg leading-none"
        >
          ✕
        </button>
      </div>

      {/* State Badge */}
      <div
        className="mx-3 mt-2 px-2 py-1 text-xs font-bold text-center rounded"
        style={{ backgroundColor: stateColor + "33", color: stateColor, border: `1px solid ${stateColor}66` }}
      >
        {stateLabel}
      </div>

      {/* Stat Bars */}
      <div className="px-3 pt-2 space-y-1">
        {/* HP */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-red-400 w-6">HP</span>
          <div className="flex-1 h-3 bg-[#1a0a0a] rounded-sm overflow-hidden border border-red-900">
            <div
              className="h-full bg-red-500 transition-all duration-500"
              style={{ width: `${hpPct}%` }}
            />
          </div>
          <span className="text-xs text-red-300 w-14 text-right">{hero.hp}/{hero.maxHp}</span>
        </div>
        {/* MP */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-blue-400 w-6">MP</span>
          <div className="flex-1 h-3 bg-[#0a0a1a] rounded-sm overflow-hidden border border-blue-900">
            <div
              className="h-full bg-blue-500 transition-all duration-500"
              style={{ width: `${mpPct}%` }}
            />
          </div>
          <span className="text-xs text-blue-300 w-14 text-right">{hero.mp}/{hero.maxMp}</span>
        </div>
        {/* EXP */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-yellow-400 w-6">EXP</span>
          <div className="flex-1 h-3 bg-[#1a1a0a] rounded-sm overflow-hidden border border-yellow-900">
            <div
              className="h-full bg-yellow-500 transition-all duration-500"
              style={{ width: `${expPct}%` }}
            />
          </div>
          <span className="text-xs text-yellow-300 w-14 text-right">{hero.exp}/{hero.level * 100}</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[#4B0082] mt-3">
        {(["stats", "skills", "tools"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-1.5 text-xs font-bold uppercase transition-colors ${
              activeTab === tab
                ? "bg-[#4B0082] text-white"
                : "text-gray-500 hover:text-gray-300"
            }`}
          >
            {tab === "stats" ? "📊 Stats" : tab === "skills" ? "✨ Skills" : "🔧 Tools"}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-3">
        {activeTab === "stats" && (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "Bash", value: hero.toolCount?.bash || 0, icon: "💻" },
                { label: "Read", value: hero.toolCount?.read || 0, icon: "📖" },
                { label: "Write", value: hero.toolCount?.write || 0, icon: "✍️" },
                { label: "Web", value: hero.toolCount?.web || 0, icon: "🌐" },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="bg-[#1a1a2e] border border-[#333366] rounded p-2 text-center"
                >
                  <div className="text-lg">{stat.icon}</div>
                  <div className="text-xs text-gray-400">{stat.label}</div>
                  <div className="text-sm font-bold text-[#88AAFF]">{stat.value}</div>
                </div>
              ))}
            </div>
            <div className="bg-[#1a1a2e] border border-[#333366] rounded p-2">
              <div className="text-xs text-gray-400 mb-1">Class Detection</div>
              <div className="text-sm font-bold" style={{ color: classConfig?.color }}>
                {classConfig?.emoji} {classConfig?.name}
              </div>
              <div className="text-xs text-gray-500 mt-1">{classConfig?.description}</div>
            </div>
            {hero.projectPath && (
              <div className="bg-[#1a1a2e] border border-[#333366] rounded p-2">
                <div className="text-xs text-gray-400 mb-1">Project</div>
                <div className="text-xs text-[#88AAFF] break-all">{hero.projectPath}</div>
              </div>
            )}
          </div>
        )}

        {activeTab === "skills" && (
          <div className="space-y-2">
            <div className="text-xs text-gray-400 mb-2">
              Click to toggle skills for this hero
            </div>
            {SKILLS.map((skill) => {
              const active = (hero.skills || []).includes(skill.id);
              return (
                <button
                  key={skill.id}
                  onClick={() => toggleSkill(skill.id)}
                  className={`w-full flex items-center gap-2 p-2 rounded border text-left transition-all ${
                    active
                      ? "border-[#FFD700] bg-[#1a1a0a]"
                      : "border-[#333366] bg-[#1a1a2e] opacity-60"
                  }`}
                >
                  <span className="text-xl">{skill.icon}</span>
                  <div className="flex-1">
                    <div className={`text-xs font-bold ${active ? "text-[#FFD700]" : "text-gray-400"}`}>
                      {skill.name}
                    </div>
                    <div className="text-xs text-gray-500">{skill.description}</div>
                  </div>
                  {active && <span className="text-green-400 text-xs">✓</span>}
                </button>
              );
            })}
          </div>
        )}

        {activeTab === "tools" && (
          <div className="space-y-2">
            {allTools.length === 0 ? (
              <div className="text-xs text-gray-500 text-center py-4">
                No active tools
              </div>
            ) : (
              allTools.map((tool) => (
                <div
                  key={tool.id}
                  className="bg-[#1a1a2e] border border-[#333366] rounded p-2"
                >
                  <div className="flex items-center gap-1 mb-1">
                    <span className="text-xs font-bold text-[#88AAFF]">{tool.name}</span>
                    <span className="text-xs text-green-400 ml-auto animate-pulse">●</span>
                  </div>
                  <div className="text-xs text-gray-400 break-all">{tool.status}</div>
                  <div className="text-xs text-gray-600 mt-1">
                    {Math.round((Date.now() - tool.startedAt) / 1000)}s ago
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
