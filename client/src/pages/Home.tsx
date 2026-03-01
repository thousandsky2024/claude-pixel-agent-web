/**
 * Home Page - Claude Pixel Agent Visualizer
 * Supports both DEMO and LIVE modes with real-time Claude Code monitoring
 */

import React, { useState, useRef, useEffect } from 'react';
import { Upload, Play, Pause, RotateCcw, Clipboard, Zap } from 'lucide-react';
import { useAuth } from '@/_core/hooks/useAuth';
import PixelOffice from '@/components/PixelOffice';
import AgentPanel from '@/components/AgentPanel';
import StatsPanel from '@/components/StatsPanel';
import TranscriptInput from '@/components/TranscriptInput';
import { AgentState } from '@/lib/pixelEngine';
import { parseTranscript } from '@/lib/transcriptParser';
import { generateMultiAgentTranscript } from '@/lib/mockData';
import { trpc } from '@/lib/trpc';

const NEON_COLORS = ['#00FF41', '#00D9FF', '#FF00FF', '#FFD700', '#FF0055', '#00FF88'];

type Mode = 'demo' | 'live';

export default function Home() {
  const { user } = useAuth();
  
  const [mode, setMode] = useState<Mode>('demo');
  const [agents, setAgents] = useState<AgentState[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<AgentState | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [transcriptData, setTranscriptData] = useState<string>('');
  const [showTranscriptInput, setShowTranscriptInput] = useState(false);
  const [totalTokens, setTotalTokens] = useState(0);
  const [totalCost, setTotalCost] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const animationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // WebSocket connection for live mode
  useEffect(() => {
    if (mode !== 'live') {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      return;
    }

    // Connect to WebSocket for live monitoring
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/api/ws/agents`);

    ws.onopen = () => {
      console.log('Connected to live agent monitoring');
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'agent-update') {
          updateAgentFromLive(data.payload);
        } else if (data.type === 'agents-batch') {
          setAgents(data.payload);
          if (data.payload.length > 0) {
            setSelectedAgent(data.payload[0]);
          }
        }
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    wsRef.current = ws;

    return () => {
      ws.close();
    };
  }, [mode]);

  // Update single agent from live data
  const updateAgentFromLive = (agentData: any) => {
    setAgents((prev) => {
      const existing = prev.find((a) => a.id === agentData.id);
      if (existing) {
        return prev.map((a) =>
          a.id === agentData.id
            ? {
                ...a,
                state: agentData.state,
                position: agentData.position || a.position,
              }
            : a
        );
      }
      return [
        ...prev,
        {
          id: agentData.id,
          name: agentData.name,
          position: agentData.position || { x: 5, y: 5 },
          direction: 'down' as const,
          state: agentData.state,
          color: NEON_COLORS[prev.length % NEON_COLORS.length],
          animationFrame: 0,
        },
      ];
    });
  };

  // Handle file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setTranscriptData(content);
      parseAndVisualizeTranscript(content);
    };
    reader.readAsText(file);
  };

  // Parse transcript and create agents
  const parseAndVisualizeTranscript = (jsonlText: string) => {
    try {
      const parsed = parseTranscript(jsonlText);
      const newAgents: AgentState[] = [];

      let index = 0;
      let totalTokensCount = 0;
      let totalCostCount = 0;

      parsed.agents.forEach((agentData) => {
        const agent: AgentState = {
          id: agentData.id,
          name: agentData.name,
          position: {
            x: (index % 4) * 10 + 5,
            y: Math.floor(index / 4) * 10 + 5,
          },
          direction: 'down',
          state: agentData.state as any,
          color: NEON_COLORS[index % NEON_COLORS.length],
          animationFrame: 0,
        };
        newAgents.push(agent);
        totalTokensCount += agentData.tokenUsed;
        totalCostCount += agentData.cost;
        index++;
      });

      setAgents(newAgents);
      setTotalTokens(totalTokensCount);
      setTotalCost(totalCostCount);
      if (newAgents.length > 0) {
        setSelectedAgent(newAgents[0]);
      }
    } catch (error) {
      console.error('Failed to parse transcript:', error);
      alert('Failed to parse transcript file');
    }
  };

  // Simulate agent movement
  const simulateMovement = () => {
    setIsPlaying(!isPlaying);
  };

  // Animation loop for agent movement
  useEffect(() => {
    if (!isPlaying || agents.length === 0) {
      if (animationIntervalRef.current) {
        clearInterval(animationIntervalRef.current);
        animationIntervalRef.current = null;
      }
      return;
    }

    animationIntervalRef.current = setInterval(() => {
      setAgents((prevAgents) =>
        prevAgents.map((agent) => {
          const directions: Array<'up' | 'down' | 'left' | 'right'> = [
            'up',
            'down',
            'left',
            'right',
          ];
          const newDirection = directions[Math.floor(Math.random() * 4)];
          const moveDistance = 1;

          let newX = agent.position.x;
          let newY = agent.position.y;

          switch (newDirection) {
            case 'up':
              newY = Math.max(0, newY - moveDistance);
              break;
            case 'down':
              newY = Math.min(40, newY + moveDistance);
              break;
            case 'left':
              newX = Math.max(0, newX - moveDistance);
              break;
            case 'right':
              newX = Math.min(50, newX + moveDistance);
              break;
          }

          return {
            ...agent,
            position: { x: newX, y: newY },
            direction: newDirection,
            state: ['idle', 'typing', 'thinking', 'waiting'][Math.floor(Math.random() * 4)] as any,
          };
        })
      );
    }, 1500);

    return () => {
      if (animationIntervalRef.current) {
        clearInterval(animationIntervalRef.current);
      }
    };
  }, [isPlaying, agents.length]);

  // Load demo data
  const loadDemoData = () => {
    const demoTranscript = generateMultiAgentTranscript();
    setTranscriptData(demoTranscript);
    parseAndVisualizeTranscript(demoTranscript);
  };

  // Handle text input
  const handleTextInput = (text: string) => {
    setTranscriptData(text);
    parseAndVisualizeTranscript(text);
  };

  const getButtonClass = (isActive: boolean) => {
    if (isActive) {
      return 'bg-secondary text-background border-secondary hover:bg-background hover:text-secondary';
    }
    return 'bg-accent text-background border-accent hover:bg-background hover:text-accent';
  };

  const getModeButtonClass = (isActive: boolean) => {
    if (isActive) {
      return 'bg-accent text-background border-accent';
    }
    return 'bg-background text-foreground border-border';
  };

  return (
    <div className="min-h-screen bg-background text-foreground overflow-hidden">
      {/* Header */}
      <header className="border-b-4 border-accent bg-background px-6 py-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold neon-glow-green uppercase tracking-widest">
              CLAUDE PIXEL AGENT
            </h1>
            <p className="text-sm text-muted-foreground uppercase tracking-widest mt-1">
              Real-time Agent Visualization System
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground uppercase tracking-widest">v2.0</p>
            <p className={`text-xs uppercase tracking-widest ${mode === 'live' ? 'neon-glow-green' : 'text-muted-foreground'}`}>
              {mode === 'live' ? 'LIVE' : 'DEMO'}
            </p>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex h-[calc(100vh-100px)]">
        {/* Left Sidebar - Controls */}
        <div className="w-64 border-r-4 border-accent bg-card overflow-y-auto">
          <div className="p-4 space-y-4">
            {/* Mode Toggle */}
            <div className="pixel-panel p-4">
              <h2 className="text-sm font-bold neon-glow-blue uppercase mb-3 tracking-widest">
                MODE
              </h2>
              <div className="flex gap-2">
                <button
                  onClick={() => setMode('demo')}
                  className={`flex-1 px-3 py-2 font-bold uppercase text-xs border-2 transition-colors ${getModeButtonClass(mode === 'demo')}`}
                >
                  DEMO
                </button>
                <button
                  onClick={() => setMode('live')}
                  className={`flex-1 px-3 py-2 font-bold uppercase text-xs border-2 transition-colors flex items-center justify-center gap-1 ${getModeButtonClass(mode === 'live')}`}
                >
                  <Zap size={12} />
                  LIVE
                </button>
              </div>
            </div>

            {/* Upload Section */}
            {mode === 'demo' && (
              <div className="pixel-panel p-4">
                <h2 className="text-sm font-bold neon-glow-blue uppercase mb-3 tracking-widest">
                  LOAD TRANSCRIPT
                </h2>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full px-4 py-2 bg-accent text-background font-bold uppercase text-sm border-2 border-accent hover:bg-background hover:text-accent transition-colors mb-2 flex items-center justify-center gap-2"
                >
                  <Upload size={16} />
                  UPLOAD FILE
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".jsonl,.json,.txt"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <p className="text-xs text-muted-foreground uppercase tracking-widest mt-2">
                  Supports JSONL format
                </p>
              </div>
            )}

            {/* Control Section */}
            <div className="pixel-panel p-4">
              <h2 className="text-sm font-bold neon-glow-purple uppercase mb-3 tracking-widest">
                SIMULATION
              </h2>
              <button
                onClick={simulateMovement}
                className={`w-full px-4 py-2 font-bold uppercase text-sm border-2 transition-colors flex items-center justify-center gap-2 ${getButtonClass(
                  isPlaying
                )}`}
              >
                {isPlaying ? <Pause size={16} /> : <Play size={16} />}
                {isPlaying ? 'PAUSE' : 'PLAY'}
              </button>
              <button
                onClick={() => {
                  setAgents([]);
                  setSelectedAgent(null);
                  setIsPlaying(false);
                  setTotalTokens(0);
                  setTotalCost(0);
                }}
                className="w-full px-4 py-2 bg-destructive text-background font-bold uppercase text-sm border-2 border-destructive hover:bg-background hover:text-destructive transition-colors mt-2 flex items-center justify-center gap-2"
              >
                <RotateCcw size={16} />
                RESET
              </button>
              {mode === 'demo' && (
                <button
                  onClick={loadDemoData}
                  className="w-full px-4 py-2 bg-secondary text-background font-bold uppercase text-sm border-2 border-secondary hover:bg-background hover:text-secondary transition-colors mt-2 flex items-center justify-center gap-2"
                >
                  <Clipboard size={16} />
                  DEMO
                </button>
              )}
            </div>

            {/* Agents List */}
            <div className="pixel-panel p-4">
              <h2 className="text-sm font-bold neon-glow-green uppercase mb-3 tracking-widest">
                AGENTS ({agents.length})
              </h2>
              <div className="space-y-2">
                {agents.map((agent) => (
                  <button
                    key={agent.id}
                    onClick={() => setSelectedAgent(agent)}
                    className={`w-full text-left px-3 py-2 text-xs uppercase font-mono border-2 transition-colors ${
                      selectedAgent?.id === agent.id
                        ? 'bg-accent text-background border-accent'
                        : 'bg-background text-foreground border-border hover:border-accent'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 border border-current"
                        style={{ backgroundColor: agent.color }}
                      />
                      <span>{agent.name}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">{agent.state}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Stats */}
            <StatsPanel
              totalAgents={agents.length}
              totalTokens={totalTokens}
              totalCost={totalCost}
              activeAgents={agents.filter((a) => a.state !== 'idle').length}
            />

            {/* Paste Transcript Button */}
            {mode === 'demo' && (
              <button
                onClick={() => setShowTranscriptInput(true)}
                className="w-full px-4 py-2 bg-accent text-background font-bold uppercase text-sm border-2 border-accent hover:bg-background hover:text-accent transition-colors flex items-center justify-center gap-2"
              >
                <Clipboard size={16} />
                PASTE
              </button>
            )}
          </div>
        </div>

        {/* Center - Canvas */}
        <div className="flex-1 relative overflow-hidden bg-background">
          {agents.length > 0 ? (
            <PixelOffice
              agents={agents}
              onAgentClick={(id) => {
                const agent = agents.find((a) => a.id === id);
                if (agent) setSelectedAgent(agent);
              }}
              showGrid={true}
              width={800}
              height={600}
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center">
              <p className="text-2xl font-bold neon-glow-blue uppercase mb-4">
                {mode === 'live' ? 'WAITING FOR CLAUDE CODE...' : 'NO AGENTS LOADED'}
              </p>
              <p className="text-sm text-muted-foreground uppercase tracking-widest">
                {mode === 'live'
                  ? 'Start Claude Code to see agents appear'
                  : 'Upload a Claude Code transcript to begin'}
              </p>
            </div>
          )}
        </div>

        {/* Right Panel - Agent Details */}
        {selectedAgent && (
          <AgentPanel
            agent={selectedAgent}
            onClose={() => setSelectedAgent(null)}
            tokenUsed={Math.floor(Math.random() * 10000)}
            cost={Math.random() * 0.1}
          />
        )}
      </div>

      {/* Transcript Input Modal */}
      <TranscriptInput
        isOpen={showTranscriptInput}
        onClose={() => setShowTranscriptInput(false)}
        onSubmit={handleTextInput}
      />
    </div>
  );
}
