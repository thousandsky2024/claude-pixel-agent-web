/**
 * WebSocket Handler - Real-time agent monitoring
 * Monitors Claude Code transcript files and broadcasts updates to connected clients
 */

import { WebSocket, WebSocketServer } from 'ws';
import { watch } from 'fs';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import { parseTranscript } from '../client/src/lib/transcriptParser';

interface AgentUpdate {
  type: 'agent-update' | 'agents-batch';
  payload: any;
}

const CLAUDE_CODE_DIR = join(homedir(), '.claude');
const TRANSCRIPT_FILE = join(CLAUDE_CODE_DIR, 'transcript.jsonl');

let wss: WebSocketServer | null = null;
let fileWatcher: any = null;
let lastTranscriptContent = '';

export function initializeWebSocket(server: any) {
  wss = new WebSocketServer({ server, path: '/api/ws/agents' });

  wss.on('connection', (ws: any) => {
    console.log('[WebSocket] Client connected');

    // Send initial agent list
    sendInitialAgents(ws);

    ws.on('close', () => {
      console.log('[WebSocket] Client disconnected');
    });

    ws.on('error', (error: any) => {
      console.error('[WebSocket] Error:', error);
    });
  });

  // Start monitoring Claude Code directory
  startFileMonitoring();
}

function startFileMonitoring() {
  if (fileWatcher) {
    fileWatcher.close();
  }

  try {
    fileWatcher = watch(CLAUDE_CODE_DIR, async (eventType, filename) => {
      if (filename === 'transcript.jsonl' && eventType === 'change') {
        try {
          const content = await readFile(TRANSCRIPT_FILE, 'utf-8');

          // Only process if content has changed
          if (content !== lastTranscriptContent) {
            lastTranscriptContent = content;
            const agents = parseTranscriptAndExtractAgents(content);
            broadcastToClients({
              type: 'agents-batch',
              payload: agents,
            });
          }
        } catch (error) {
          console.error('[File Monitor] Error reading transcript:', error);
        }
      }
    });

    console.log('[File Monitor] Started watching Claude Code directory');
  } catch (error) {
    console.error('[File Monitor] Failed to start watching:', error);
  }
}

function parseTranscriptAndExtractAgents(jsonlContent: string) {
  try {
    const lines = jsonlContent.split('\n').filter((line) => line.trim());
    const agents = new Map<string, any>();

    lines.forEach((line) => {
      try {
        const entry = JSON.parse(line);

        if (entry.agent_id && entry.agent_name) {
          if (!agents.has(entry.agent_id)) {
            agents.set(entry.agent_id, {
              id: entry.agent_id,
              name: entry.agent_name,
              state: 'idle',
              position: {
                x: Math.random() * 50,
                y: Math.random() * 40,
              },
            });
          }

          // Update agent state based on entry type
          const agent = agents.get(entry.agent_id);
          if (entry.type === 'message' && entry.role === 'assistant') {
            agent.state = 'typing';
          } else if (entry.type === 'tool_use') {
            agent.state = 'thinking';
          } else if (entry.type === 'tool_result') {
            agent.state = 'waiting';
          }
        }
      } catch (error) {
        // Skip invalid JSON lines
      }
    });

    return Array.from(agents.values());
  } catch (error) {
    console.error('[Parser] Error parsing transcript:', error);
    return [];
  }
}

function sendInitialAgents(ws: WebSocket) {
  try {
    const agents = parseTranscriptAndExtractAgents(lastTranscriptContent);
    ws.send(
      JSON.stringify({
        type: 'agents-batch',
        payload: agents,
      })
    );
  } catch (error) {
    console.error('[WebSocket] Error sending initial agents:', error);
  }
}

function broadcastToClients(message: AgentUpdate) {
  if (!wss) return;

  wss.clients.forEach((client: any) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  });
}

export function stopWebSocketMonitoring() {
  if (fileWatcher) {
    fileWatcher.close();
    fileWatcher = null;
  }

  if (wss) {
    wss.close();
    wss = null;
  }
}
