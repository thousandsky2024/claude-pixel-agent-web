import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { SKILLS } from "../lib/dungeonConfig";

interface Props {
  onClose: () => void;
}

export default function SkillsManager({ onClose }: Props) {
  const [projectPath, setProjectPath] = useState("");
  const [activeTab, setActiveTab] = useState<"global" | "project">("global");

  const { data: globalSkills = [], refetch: refetchGlobal } =
    trpc.agents.globalSkills.useQuery();

  const { data: projectSkills = [], refetch: refetchProject } =
    trpc.agents.projectSkills.useQuery(
      { projectPath },
      { enabled: !!projectPath }
    );

  const saveGlobal = trpc.agents.saveGlobalSkills.useMutation({
    onSuccess: () => refetchGlobal(),
  });

  const saveProject = trpc.agents.saveProjectSkills.useMutation({
    onSuccess: () => refetchProject(),
  });

  const toggleGlobal = (skillId: string) => {
    const updated = globalSkills.includes(skillId)
      ? globalSkills.filter((s) => s !== skillId)
      : [...globalSkills, skillId];
    saveGlobal.mutate({ skills: updated });
  };

  const toggleProject = (skillId: string) => {
    const updated = projectSkills.includes(skillId)
      ? projectSkills.filter((s) => s !== skillId)
      : [...projectSkills, skillId];
    saveProject.mutate({ projectPath, skills: updated });
  };

  const activeSkills = activeTab === "global" ? globalSkills : projectSkills;
  const toggle = activeTab === "global" ? toggleGlobal : toggleProject;

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
      <div className="bg-[#0d0d1a] border-2 border-[#4B0082] rounded-lg w-[480px] max-h-[80vh] flex flex-col font-mono text-white">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#4B0082] bg-[#1a0a2e]">
          <div>
            <h2 className="text-[#FFD700] font-bold text-lg">✨ Skills Manager</h2>
            <p className="text-xs text-gray-400">Configure skills for Claude Code agents</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl">✕</button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[#4B0082]">
          <button
            onClick={() => setActiveTab("global")}
            className={`flex-1 py-2 text-xs font-bold uppercase transition-colors ${
              activeTab === "global" ? "bg-[#4B0082] text-white" : "text-gray-500 hover:text-gray-300"
            }`}
          >
            🌍 Global Skills
          </button>
          <button
            onClick={() => setActiveTab("project")}
            className={`flex-1 py-2 text-xs font-bold uppercase transition-colors ${
              activeTab === "project" ? "bg-[#4B0082] text-white" : "text-gray-500 hover:text-gray-300"
            }`}
          >
            📁 Project Skills
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {activeTab === "global" && (
            <div className="mb-3 p-2 bg-[#1a1a2e] border border-[#333366] rounded text-xs text-gray-400">
              Global skills apply to <span className="text-[#88AAFF]">all Claude Code agents</span>.
              Saved to <code className="text-[#FFD700]">~/.claude/skills.json</code>
            </div>
          )}

          {activeTab === "project" && (
            <div className="mb-3 space-y-2">
              <div className="p-2 bg-[#1a1a2e] border border-[#333366] rounded text-xs text-gray-400">
                Project skills apply to agents in a <span className="text-[#88AAFF]">specific project</span>.
                Saved to <code className="text-[#FFD700]">{"{project}"}/.claude/skills.json</code>
              </div>
              <input
                type="text"
                value={projectPath}
                onChange={(e) => setProjectPath(e.target.value)}
                placeholder="/path/to/your/project"
                className="w-full bg-[#1a1a2e] border border-[#333366] rounded px-3 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-[#4B0082]"
              />
            </div>
          )}

          {(activeTab === "global" || projectPath) && (
            <div className="space-y-2">
              {SKILLS.map((skill) => {
                const active = activeSkills.includes(skill.id);
                return (
                  <button
                    key={skill.id}
                    onClick={() => toggle(skill.id)}
                    className={`w-full flex items-center gap-3 p-3 rounded border text-left transition-all ${
                      active
                        ? "border-[#FFD700] bg-[#1a1a0a]"
                        : "border-[#333366] bg-[#1a1a2e] opacity-60 hover:opacity-80"
                    }`}
                  >
                    <span className="text-2xl">{skill.icon}</span>
                    <div className="flex-1">
                      <div className={`text-sm font-bold ${active ? "text-[#FFD700]" : "text-gray-300"}`}>
                        {skill.name}
                      </div>
                      <div className="text-xs text-gray-500">{skill.description}</div>
                      <div className="text-xs mt-1">
                        <span
                          className="px-1 rounded"
                          style={{
                            backgroundColor:
                              skill.type === "attack" ? "#FF444433" :
                              skill.type === "magic" ? "#8844FF33" :
                              skill.type === "defense" ? "#FFAA0033" : "#44888833",
                            color:
                              skill.type === "attack" ? "#FF8888" :
                              skill.type === "magic" ? "#CC88FF" :
                              skill.type === "defense" ? "#FFCC44" : "#88CCAA",
                          }}
                        >
                          {skill.type.toUpperCase()}
                        </span>
                      </div>
                    </div>
                    <div className={`w-6 h-6 rounded border flex items-center justify-center text-xs ${
                      active ? "border-[#FFD700] bg-[#FFD700]22 text-[#FFD700]" : "border-gray-600"
                    }`}>
                      {active ? "✓" : ""}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-[#4B0082] bg-[#1a0a2e]">
          <div className="text-xs text-gray-500 text-center">
            {activeSkills.length} skill{activeSkills.length !== 1 ? "s" : ""} active
            {activeTab === "global" ? " globally" : " for this project"}
          </div>
        </div>
      </div>
    </div>
  );
}
