/**
 * SkillsManager - Manage real Claude Code Agents and Skills
 *
 * Agents: ~/.claude/agents/<name>.md (global) and <project>/.claude/agents/<name>.md (project)
 * Skills: ~/.claude/skills/<name>/SKILL.md (global) and <project>/.claude/skills/<name>/SKILL.md (project)
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  X, Plus, Trash2, Edit3, Save, RefreshCw, Globe, FolderOpen,
  Bot, Zap, ChevronDown, ChevronRight, Copy, AlertCircle
} from "lucide-react";

const DEFAULT_AGENT_TEMPLATE = `---
name: my-agent
description: A specialized agent for specific tasks
tools: Read, Write, Bash
model: sonnet
---

You are a specialized assistant. Your role is to...

## Capabilities
- Describe what this agent can do

## Instructions
- Provide specific instructions here
`;

const DEFAULT_SKILL_TEMPLATE = `---
name: my-skill
description: Describe when Claude should use this skill automatically
---

## Instructions

Write your skill instructions here. Claude will follow these when the skill is invoked.

### Example usage
- Step 1: ...
- Step 2: ...
`;

interface AgentEditorProps {
  initialContent?: string;
  onSave: (content: string) => void;
  onCancel: () => void;
  title: string;
}

function ItemEditor({ initialContent, onSave, onCancel, title }: AgentEditorProps) {
  const [content, setContent] = useState(initialContent || DEFAULT_AGENT_TEMPLATE);
  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-[#0d0d1a] border-2 border-[#4B0082] rounded-lg w-full max-w-3xl flex flex-col font-mono text-white" style={{ maxHeight: "90vh" }}>
        <div className="flex items-center justify-between p-4 border-b border-[#4B0082] bg-[#1a0a2e]">
          <h3 className="text-[#FFD700] font-bold text-sm uppercase tracking-widest">{title}</h3>
          <button onClick={onCancel} className="text-gray-400 hover:text-white"><X size={18} /></button>
        </div>
        <div className="flex-1 p-4 overflow-hidden flex flex-col gap-3">
          <div className="text-xs text-gray-400 bg-[#1a1a2e] border border-[#333366] rounded p-2">
            <strong className="text-[#88AAFF]">Format:</strong> YAML frontmatter between <code>---</code> markers, then Markdown system prompt.
          </div>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="flex-1 bg-[#0a0a14] border border-[#333366] rounded p-3 text-xs text-[#00FF88] font-mono resize-none focus:outline-none focus:border-[#4B0082]"
            style={{ minHeight: "320px" }}
            spellCheck={false}
          />
        </div>
        <div className="flex gap-2 p-4 border-t border-[#4B0082] bg-[#1a0a2e]">
          <button
            onClick={() => onSave(content)}
            className="flex items-center gap-2 px-4 py-2 bg-[#4B0082] hover:bg-[#6a00b8] text-white text-sm font-bold rounded transition-colors"
          >
            <Save size={14} /> Save
          </button>
          <button
            onClick={onCancel}
            className="flex items-center gap-2 px-4 py-2 border border-[#333366] text-gray-400 hover:text-white text-sm rounded transition-colors"
          >
            <X size={14} /> Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

interface SkillsManagerProps {
  onClose: () => void;
  projects: Array<{ encodedName: string; realPath: string; sessionCount: number }>;
}

export default function SkillsManager({ onClose, projects }: SkillsManagerProps) {
  const [activeTab, setActiveTab] = useState<"agents" | "skills">("agents");
  const [scope, setScope] = useState<"global" | "project">("global");
  const [selectedProject, setSelectedProject] = useState<string>(projects[0]?.realPath || "");
  const [showEditor, setShowEditor] = useState(false);
  const [editingItem, setEditingItem] = useState<{ name: string; content: string } | null>(null);
  const [newItemName, setNewItemName] = useState("");
  const [expandedItem, setExpandedItem] = useState<string | null>(null);

  // ── Agents Queries ──────────────────────────────────────────────────────────
  const globalAgents = trpc.agents.globalAgents.useQuery(undefined, { refetchInterval: 3000 });
  const projectAgents = trpc.agents.projectAgents.useQuery(
    { projectPath: selectedProject },
    { enabled: scope === "project" && !!selectedProject, refetchInterval: 3000 }
  );

  // ── Skills Queries ──────────────────────────────────────────────────────────
  const globalSkills = trpc.agents.globalSkills.useQuery(undefined, { refetchInterval: 3000 });
  const projectSkills = trpc.agents.projectSkills.useQuery(
    { projectPath: selectedProject },
    { enabled: scope === "project" && !!selectedProject, refetchInterval: 3000 }
  );

  // ── Agent Mutations ─────────────────────────────────────────────────────────
  const createGlobalAgent = trpc.agents.createGlobalAgent.useMutation({
    onSuccess: () => { globalAgents.refetch(); toast.success("Agent created!"); setShowEditor(false); setNewItemName(""); },
    onError: (e) => toast.error(e.message),
  });
  const updateGlobalAgent = trpc.agents.updateGlobalAgent.useMutation({
    onSuccess: () => { globalAgents.refetch(); toast.success("Agent updated!"); setShowEditor(false); setEditingItem(null); },
    onError: (e) => toast.error(e.message),
  });
  const deleteGlobalAgent = trpc.agents.deleteGlobalAgent.useMutation({
    onSuccess: () => { globalAgents.refetch(); toast.success("Agent deleted!"); },
    onError: (e) => toast.error(e.message),
  });
  const createProjectAgent = trpc.agents.createProjectAgent.useMutation({
    onSuccess: () => { projectAgents.refetch(); toast.success("Project agent created!"); setShowEditor(false); setNewItemName(""); },
    onError: (e) => toast.error(e.message),
  });
  const updateProjectAgent = trpc.agents.updateProjectAgent.useMutation({
    onSuccess: () => { projectAgents.refetch(); toast.success("Project agent updated!"); setShowEditor(false); setEditingItem(null); },
    onError: (e) => toast.error(e.message),
  });
  const deleteProjectAgent = trpc.agents.deleteProjectAgent.useMutation({
    onSuccess: () => { projectAgents.refetch(); toast.success("Project agent deleted!"); },
    onError: (e) => toast.error(e.message),
  });

  // ── Skill Mutations ─────────────────────────────────────────────────────────
  const createGlobalSkill = trpc.agents.createGlobalSkill.useMutation({
    onSuccess: () => { globalSkills.refetch(); toast.success("Skill created!"); setShowEditor(false); setNewItemName(""); },
    onError: (e) => toast.error(e.message),
  });
  const updateGlobalSkill = trpc.agents.updateGlobalSkill.useMutation({
    onSuccess: () => { globalSkills.refetch(); toast.success("Skill updated!"); setShowEditor(false); setEditingItem(null); },
    onError: (e) => toast.error(e.message),
  });
  const deleteGlobalSkill = trpc.agents.deleteGlobalSkill.useMutation({
    onSuccess: () => { globalSkills.refetch(); toast.success("Skill deleted!"); },
    onError: (e) => toast.error(e.message),
  });
  const createProjectSkill = trpc.agents.createProjectSkill.useMutation({
    onSuccess: () => { projectSkills.refetch(); toast.success("Project skill created!"); setShowEditor(false); setNewItemName(""); },
    onError: (e) => toast.error(e.message),
  });
  const updateProjectSkill = trpc.agents.updateProjectSkill.useMutation({
    onSuccess: () => { projectSkills.refetch(); toast.success("Project skill updated!"); setShowEditor(false); setEditingItem(null); },
    onError: (e) => toast.error(e.message),
  });
  const deleteProjectSkill = trpc.agents.deleteProjectSkill.useMutation({
    onSuccess: () => { projectSkills.refetch(); toast.success("Project skill deleted!"); },
    onError: (e) => toast.error(e.message),
  });

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleSave = (content: string) => {
    if (editingItem) {
      if (activeTab === "agents") {
        if (scope === "global") updateGlobalAgent.mutate({ agentName: editingItem.name, content });
        else updateProjectAgent.mutate({ projectPath: selectedProject, agentName: editingItem.name, content });
      } else {
        if (scope === "global") updateGlobalSkill.mutate({ skillName: editingItem.name, content });
        else updateProjectSkill.mutate({ projectPath: selectedProject, skillName: editingItem.name, content });
      }
    } else {
      if (!newItemName.trim()) { toast.error("Name is required"); return; }
      const safeName = newItemName.trim().toLowerCase().replace(/[^a-z0-9-_]/g, "-");
      if (activeTab === "agents") {
        if (scope === "global") createGlobalAgent.mutate({ agentName: safeName, content });
        else createProjectAgent.mutate({ projectPath: selectedProject, agentName: safeName, content });
      } else {
        if (scope === "global") createGlobalSkill.mutate({ skillName: safeName, content });
        else createProjectSkill.mutate({ projectPath: selectedProject, skillName: safeName, content });
      }
    }
  };

  const handleDelete = (name: string) => {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    if (activeTab === "agents") {
      if (scope === "global") deleteGlobalAgent.mutate({ agentName: name });
      else deleteProjectAgent.mutate({ projectPath: selectedProject, agentName: name });
    } else {
      if (scope === "global") deleteGlobalSkill.mutate({ skillName: name });
      else deleteProjectSkill.mutate({ projectPath: selectedProject, skillName: name });
    }
  };

  const currentItems = activeTab === "agents"
    ? (scope === "global" ? globalAgents.data : projectAgents.data) ?? []
    : (scope === "global" ? globalSkills.data : projectSkills.data) ?? [];

  const isLoading = activeTab === "agents"
    ? (scope === "global" ? globalAgents.isLoading : projectAgents.isLoading)
    : (scope === "global" ? globalSkills.isLoading : projectSkills.isLoading);

  const pathInfo = activeTab === "agents"
    ? (scope === "global" ? "~/.claude/agents/<name>.md" : `<project>/.claude/agents/<name>.md`)
    : (scope === "global" ? "~/.claude/skills/<name>/SKILL.md" : `<project>/.claude/skills/<name>/SKILL.md`);

  return (
    <>
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-40 p-4">
        <div className="bg-[#0d0d1a] border-2 border-[#4B0082] rounded-lg w-full max-w-4xl flex flex-col font-mono text-white" style={{ maxHeight: "90vh" }}>
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-[#4B0082] bg-[#1a0a2e]">
            <div>
              <h2 className="text-[#FFD700] font-bold text-lg">⚔️ Claude Code Manager</h2>
              <p className="text-xs text-gray-400 mt-0.5">{pathInfo}</p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-white text-xl"><X size={20} /></button>
          </div>

          {/* Tab Bar */}
          <div className="flex border-b border-[#4B0082]">
            <button
              onClick={() => setActiveTab("agents")}
              className={`flex items-center gap-2 px-6 py-3 text-xs font-bold uppercase border-b-2 transition-colors ${
                activeTab === "agents"
                  ? "border-[#FFD700] text-[#FFD700]"
                  : "border-transparent text-gray-500 hover:text-gray-300"
              }`}
            >
              <Bot size={14} /> Agents
            </button>
            <button
              onClick={() => setActiveTab("skills")}
              className={`flex items-center gap-2 px-6 py-3 text-xs font-bold uppercase border-b-2 transition-colors ${
                activeTab === "skills"
                  ? "border-[#FFD700] text-[#FFD700]"
                  : "border-transparent text-gray-500 hover:text-gray-300"
              }`}
            >
              <Zap size={14} /> Skills
            </button>
          </div>

          {/* Scope Selector */}
          <div className="flex items-center gap-4 px-4 py-3 border-b border-[#4B0082]/30 bg-black/30">
            <div className="flex gap-2">
              <button
                onClick={() => setScope("global")}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold uppercase rounded transition-colors ${
                  scope === "global" ? "bg-[#4B0082] text-white" : "bg-[#1a1a2e] text-gray-400 hover:text-white"
                }`}
              >
                <Globe size={12} /> Global
              </button>
              <button
                onClick={() => setScope("project")}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold uppercase rounded transition-colors ${
                  scope === "project" ? "bg-[#4B0082] text-white" : "bg-[#1a1a2e] text-gray-400 hover:text-white"
                }`}
              >
                <FolderOpen size={12} /> Project
              </button>
            </div>

            {scope === "project" && (
              <select
                value={selectedProject}
                onChange={(e) => setSelectedProject(e.target.value)}
                className="bg-[#1a1a2e] border border-[#333366] text-gray-300 text-xs px-2 py-1.5 rounded focus:outline-none focus:border-[#4B0082] flex-1 max-w-xs"
              >
                {projects.length === 0 ? (
                  <option value="">No projects detected yet</option>
                ) : (
                  projects.map((p) => (
                    <option key={p.encodedName} value={p.realPath}>
                      {p.realPath.split("/").pop() || p.realPath} ({p.sessionCount} sessions)
                    </option>
                  ))
                )}
              </select>
            )}

            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={() => {
                  if (activeTab === "agents") scope === "global" ? globalAgents.refetch() : projectAgents.refetch();
                  else scope === "global" ? globalSkills.refetch() : projectSkills.refetch();
                }}
                className="text-gray-500 hover:text-[#FFD700] p-1"
                title="Refresh"
              >
                <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
              </button>
              <button
                onClick={() => { setEditingItem(null); setShowEditor(true); }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-green-700 text-white text-xs font-bold uppercase rounded hover:bg-green-600"
              >
                <Plus size={12} /> New {activeTab === "agents" ? "Agent" : "Skill"}
              </button>
            </div>
          </div>

          {/* New Item Name Input */}
          {showEditor && !editingItem && (
            <div className="px-4 py-2 bg-black/50 border-b border-[#4B0082]/20 flex items-center gap-2">
              <span className="text-gray-400 text-xs">Name:</span>
              <input
                type="text"
                value={newItemName}
                onChange={(e) => setNewItemName(e.target.value.toLowerCase().replace(/[^a-z0-9-_]/g, ""))}
                placeholder={activeTab === "agents" ? "my-agent" : "my-skill"}
                className="bg-black border border-[#333366] text-[#00FF88] text-xs px-2 py-1 rounded focus:outline-none focus:border-[#4B0082] w-48"
                autoFocus
                onKeyDown={(e) => e.key === "Escape" && setShowEditor(false)}
              />
              <span className="text-gray-600 text-xs">.md</span>
            </div>
          )}

          {/* Items List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {scope === "project" && !selectedProject && (
              <div className="flex items-center gap-2 text-yellow-600 text-xs p-4 bg-yellow-900/20 rounded border border-yellow-700/30">
                <AlertCircle size={14} />
                No project selected. Start Claude Code in a project to see it here.
              </div>
            )}

            {currentItems.length === 0 && !isLoading && (
              <div className="text-center py-12">
                <div className="text-4xl mb-3">{activeTab === "agents" ? "🤖" : "⚡"}</div>
                <p className="text-gray-500 text-xs uppercase">
                  No {activeTab} found in {scope} scope
                </p>
                <p className="text-gray-600 text-xs mt-1">{pathInfo}</p>
              </div>
            )}

            {currentItems.map((item: any) => (
              <div
                key={item.name}
                className="bg-black/40 border border-[#333366] rounded-lg overflow-hidden hover:border-[#4B0082]/50 transition-colors"
              >
                <div
                  className="flex items-center justify-between p-3 cursor-pointer"
                  onClick={() => setExpandedItem(expandedItem === item.name ? null : item.name)}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-[#FFD700] text-sm">{activeTab === "agents" ? "🤖" : "⚡"}</span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[#00FF88] text-sm font-bold">{item.name}</span>
                        {item.model && (
                          <span className="text-gray-600 text-xs bg-[#1a1a2e] px-1.5 py-0.5 rounded">{item.model}</span>
                        )}
                      </div>
                      <p className="text-gray-500 text-xs truncate mt-0.5">{item.description || "No description"}</p>
                      {item.tools && (
                        <p className="text-blue-500 text-xs mt-0.5">Tools: {item.tools}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-2 shrink-0">
                    <button
                      onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(item.content); toast.success("Copied!"); }}
                      className="text-gray-600 hover:text-gray-400 p-1" title="Copy content"
                    >
                      <Copy size={13} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setEditingItem({ name: item.name, content: item.content }); setShowEditor(true); }}
                      className="text-gray-600 hover:text-[#FFD700] p-1" title="Edit"
                    >
                      <Edit3 size={13} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(item.name); }}
                      className="text-gray-600 hover:text-red-400 p-1" title="Delete"
                    >
                      <Trash2 size={13} />
                    </button>
                    {expandedItem === item.name
                      ? <ChevronDown size={14} className="text-gray-500" />
                      : <ChevronRight size={14} className="text-gray-500" />
                    }
                  </div>
                </div>

                {expandedItem === item.name && (
                  <div className="border-t border-[#333366]/50 p-3">
                    <pre className="text-[#00FF88]/70 text-xs overflow-x-auto whitespace-pre-wrap bg-black/50 p-3 rounded max-h-48 overflow-y-auto">
                      {item.content}
                    </pre>
                    <p className="text-gray-600 text-xs mt-2">
                      📁 {item.agentPath || item.skillPath}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Editor Modal */}
      {showEditor && (
        <ItemEditor
          title={editingItem
            ? `Edit ${activeTab === "agents" ? "Agent" : "Skill"}: ${editingItem.name}`
            : `New ${activeTab === "agents" ? "Agent" : "Skill"}`}
          initialContent={editingItem?.content || (activeTab === "agents" ? DEFAULT_AGENT_TEMPLATE : DEFAULT_SKILL_TEMPLATE)}
          onSave={handleSave}
          onCancel={() => { setShowEditor(false); setEditingItem(null); setNewItemName(""); }}
        />
      )}
    </>
  );
}
