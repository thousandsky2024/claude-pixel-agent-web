import { useEffect, useRef, useState, useCallback } from "react";
import type { HeroClass, HeroState, DungeonRoom } from "../lib/dungeonConfig";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ActiveTool {
  id: string;
  name: string;
  status: string;
  startedAt: number;
}

export interface Hero {
  id: number;
  name: string;
  heroClass: HeroClass;
  state: HeroState;
  position: { x: number; y: number };
  room: DungeonRoom;
  activeTools: ActiveTool[];
  subAgentTools: Record<string, ActiveTool[]>;
  toolCount: { bash: number; read: number; write: number; web: number };
  isWaiting: boolean;
  skills: string[];
  level: number;
  exp: number;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  projectPath?: string;
}

export type AppMode = "demo" | "live";

interface WsMessage {
  type: string;
  payload: unknown;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useHeroSocket() {
  const [heroes, setHeroes] = useState<Hero[]>([]);
  const [mode, setMode] = useState<AppMode>("demo");
  const [connected, setConnected] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<NodeJS.Timeout | null>(null);

  const addLog = useCallback((msg: string) => {
    const time = new Date().toLocaleTimeString();
    setLog((prev) => [`[${time}] ${msg}`, ...prev].slice(0, 50));
  }, []);

  const send = useCallback((msg: WsMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${protocol}//${window.location.host}/api/ws/agents`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      addLog("Connected to dungeon server");
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }
    };

    ws.onmessage = (event) => {
      try {
        const msg: WsMessage = JSON.parse(event.data);
        handleMessage(msg);
      } catch {}
    };

    ws.onclose = () => {
      setConnected(false);
      addLog("Disconnected from server, reconnecting...");
      reconnectTimer.current = setTimeout(connect, 3000);
    };

    ws.onerror = () => {
      addLog("WebSocket error");
    };
  }, [addLog]);

  const handleMessage = useCallback((msg: WsMessage) => {
    switch (msg.type) {
      case "heroes-batch": {
        const batch = msg.payload as Hero[];
        setHeroes(batch);
        addLog(`Loaded ${batch.length} heroes`);
        break;
      }
      case "hero-new": {
        const hero = msg.payload as Hero;
        setHeroes((prev) => {
          if (prev.find((h) => h.id === hero.id)) return prev;
          addLog(`⚔️ New hero appeared: ${hero.name} (${hero.heroClass})`);
          return [...prev, hero];
        });
        break;
      }
      case "hero-update": {
        const updated = msg.payload as Hero;
        setHeroes((prev) =>
          prev.map((h) => (h.id === updated.id ? updated : h))
        );
        break;
      }
      case "hero-tool-start": {
        const { heroId, tool } = msg.payload as { heroId: number; tool: ActiveTool };
        addLog(`🗡️ Hero #${heroId}: ${tool.status}`);
        break;
      }
      case "hero-tool-done": {
        const { heroId, toolId } = msg.payload as { heroId: number; toolId: string };
        setHeroes((prev) =>
          prev.map((h) =>
            h.id === heroId
              ? { ...h, activeTools: h.activeTools.filter((t) => t.id !== toolId) }
              : h
          )
        );
        break;
      }
      case "hero-levelup": {
        const { heroId, level } = msg.payload as { heroId: number; level: number };
        addLog(`🎉 Hero #${heroId} leveled up to Lv.${level}!`);
        break;
      }
    }
  }, [addLog]);

  // Connect on mount
  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const startDemo = useCallback(() => {
    setMode("demo");
    send({ type: "demo-start", payload: null });
    addLog("🎮 Demo mode started");
  }, [send, addLog]);

  const startLive = useCallback(() => {
    setMode("live");
    send({ type: "demo-stop", payload: null });
    addLog("📡 Live mode - watching Claude Code...");
  }, [send, addLog]);

  const clearHeroes = useCallback(() => {
    send({ type: "clear-heroes", payload: null });
    setHeroes([]);
    addLog("🗑️ Cleared all heroes");
  }, [send, addLog]);

  return {
    heroes,
    setHeroes,
    mode,
    connected,
    log,
    startDemo,
    startLive,
    clearHeroes,
  };
}
