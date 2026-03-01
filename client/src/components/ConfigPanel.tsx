/**
 * ConfigPanel - Bridge configuration and connection status
 * Shows the Bridge API Key and instructions for running the local bridge script
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";

interface ConfigPanelProps {
  onClose: () => void;
}

export default function ConfigPanel({ onClose }: ConfigPanelProps) {
  const [copied, setCopied] = useState<string | null>(null);
  const { data: bridgeData, isLoading: keyLoading } = trpc.agents.bridgeApiKey.useQuery();
  const { data: status } = trpc.agents.connectionStatus.useQuery();

  const serverUrl = window.location.origin;

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // fallback
      const el = document.createElement("textarea");
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setCopied(label);
      setTimeout(() => setCopied(null), 2000);
    }
  };

  const bridgeCommand = bridgeData?.apiKey
    ? `CLAUDE_DUNGEON_SERVER=${serverUrl} CLAUDE_DUNGEON_API_KEY=${bridgeData.apiKey} node claude-dungeon-bridge.mjs`
    : "Loading...";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-[680px] max-h-[85vh] overflow-y-auto rounded border-2 border-[#4B0082] bg-[#0d0a1a] text-white"
        style={{ fontFamily: "'IBM Plex Mono', monospace" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#4B0082]">
          <div className="flex items-center gap-2">
            <span className="text-xl">⚙️</span>
            <h2 className="text-base font-bold text-[#FFD700] uppercase tracking-widest">
              Bridge Configuration
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-white text-lg leading-none"
          >
            ✕
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Connection Status */}
          <section>
            <h3 className="text-xs font-bold text-[#AA88FF] uppercase tracking-widest mb-3">
              📡 Server Status
            </h3>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {[
                { label: "Server URL", value: serverUrl, ok: true },
                { label: "Claude Dir", value: status?.claudeDir || "~/.claude", ok: status?.claudeExists },
                { label: "Projects Dir", value: status?.projectsDir || "~/.claude/projects", ok: status?.projectsExists },
                { label: "Tracked Projects", value: String(status?.trackedProjects ?? 0), ok: (status?.trackedProjects ?? 0) > 0 },
                { label: "Total Sessions", value: String(status?.totalSessions ?? 0), ok: (status?.totalSessions ?? 0) > 0 },
              ].map((item) => (
                <div key={item.label} className="flex items-start gap-2 bg-[#0a0a18] px-3 py-2 rounded">
                  <span className={item.ok ? "text-green-400" : "text-yellow-500"}>
                    {item.ok ? "✓" : "○"}
                  </span>
                  <div className="min-w-0">
                    <div className="text-gray-500 text-xs">{item.label}</div>
                    <div className="text-white truncate text-xs">{item.value}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Bridge API Key */}
          <section>
            <h3 className="text-xs font-bold text-[#AA88FF] uppercase tracking-widest mb-3">
              🔑 Bridge API Key
            </h3>
            <p className="text-xs text-gray-400 mb-3">
              Use this key to authenticate the local bridge script running on your machine.
            </p>
            {keyLoading ? (
              <div className="text-xs text-gray-500 animate-pulse">Generating key...</div>
            ) : (
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-[#0a0a18] border border-[#4B0082] px-3 py-2 text-xs text-[#FFD700] rounded font-mono break-all">
                  {bridgeData?.apiKey || "Loading..."}
                </code>
                <button
                  onClick={() => bridgeData?.apiKey && copyToClipboard(bridgeData.apiKey, "key")}
                  className="shrink-0 px-3 py-2 text-xs border border-[#4B0082] text-[#AA88FF] hover:bg-[#4B0082] hover:text-white rounded transition-colors"
                >
                  {copied === "key" ? "✓ Copied!" : "Copy"}
                </button>
              </div>
            )}
          </section>

          {/* Quick Start */}
          <section>
            <h3 className="text-xs font-bold text-[#AA88FF] uppercase tracking-widest mb-3">
              🚀 Quick Start
            </h3>
            <div className="space-y-3">
              <div>
                <div className="text-xs text-gray-500 mb-1">1. Download the bridge script:</div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-[#0a0a18] border border-[#1a1a2e] px-3 py-2 text-xs text-green-300 rounded">
                    curl -O {serverUrl}/bridge/claude-dungeon-bridge.mjs
                  </code>
                  <button
                    onClick={() => copyToClipboard(`curl -O ${serverUrl}/bridge/claude-dungeon-bridge.mjs`, "download")}
                    className="shrink-0 px-3 py-2 text-xs border border-[#4B0082] text-[#AA88FF] hover:bg-[#4B0082] hover:text-white rounded transition-colors"
                  >
                    {copied === "download" ? "✓" : "Copy"}
                  </button>
                </div>
              </div>

              <div>
                <div className="text-xs text-gray-500 mb-1">2. Run the bridge (Node.js 18+ required):</div>
                <div className="flex items-start gap-2">
                  <code className="flex-1 bg-[#0a0a18] border border-[#1a1a2e] px-3 py-2 text-xs text-green-300 rounded break-all leading-relaxed">
                    {bridgeCommand}
                  </code>
                  <button
                    onClick={() => copyToClipboard(bridgeCommand, "cmd")}
                    className="shrink-0 px-3 py-2 text-xs border border-[#4B0082] text-[#AA88FF] hover:bg-[#4B0082] hover:text-white rounded transition-colors"
                  >
                    {copied === "cmd" ? "✓" : "Copy"}
                  </button>
                </div>
              </div>

              <div>
                <div className="text-xs text-gray-500 mb-1">3. Start Claude Code in any project:</div>
                <code className="block bg-[#0a0a18] border border-[#1a1a2e] px-3 py-2 text-xs text-green-300 rounded">
                  claude  # or claude-code
                </code>
              </div>

              <div className="bg-[#0a1a0a] border border-[#1a3a1a] px-3 py-2 rounded text-xs text-green-400">
                ✅ Heroes will automatically appear in the dungeon map when Claude Code is active!
              </div>
            </div>
          </section>

          {/* How It Works */}
          <section>
            <h3 className="text-xs font-bold text-[#AA88FF] uppercase tracking-widest mb-3">
              ℹ️ How It Works
            </h3>
            <div className="text-xs text-gray-400 space-y-2 leading-relaxed">
              <div className="flex gap-2">
                <span className="text-[#4B0082] shrink-0">▶</span>
                <span>The bridge script monitors <code className="text-[#FFD700]">~/.claude/projects/</code> on your local machine</span>
              </div>
              <div className="flex gap-2">
                <span className="text-[#4B0082] shrink-0">▶</span>
                <span>It reads Claude Code's JSONL transcript files to detect tool usage</span>
              </div>
              <div className="flex gap-2">
                <span className="text-[#4B0082] shrink-0">▶</span>
                <span>Tool events are mapped to hero states: Bash → ⚔️ Fighting, WebSearch → 🔮 Casting, Idle → 💤 Resting</span>
              </div>
              <div className="flex gap-2">
                <span className="text-[#4B0082] shrink-0">▶</span>
                <span>Hero data is pushed to this cloud server via the Bridge API every 2 seconds</span>
              </div>
              <div className="flex gap-2">
                <span className="text-[#4B0082] shrink-0">▶</span>
                <span>The web app receives updates via WebSocket and animates heroes in real-time</span>
              </div>
            </div>
          </section>

          {/* Tracked Projects */}
          {status?.projects && status.projects.length > 0 && (
            <section>
              <h3 className="text-xs font-bold text-[#AA88FF] uppercase tracking-widest mb-3">
                📁 Tracked Projects ({status.projects.length})
              </h3>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {status.projects.map((p) => (
                  <div key={p.encodedName} className="flex items-center justify-between bg-[#0a0a18] px-3 py-1.5 rounded text-xs">
                    <span className="text-white truncate flex-1">{p.realPath}</span>
                    <span className="text-gray-500 shrink-0 ml-2">{p.sessionCount} session{p.sessionCount !== 1 ? "s" : ""}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[#4B0082] flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold uppercase border border-[#4B0082] text-[#AA88FF] hover:bg-[#4B0082] hover:text-white rounded transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
