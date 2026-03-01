# Claude Dungeon Bridge Script

This script runs on **your local machine** and monitors your Claude Code activity,
then pushes it to the cloud-hosted Claude Dungeon web app in real-time.

## Requirements

- **Node.js 18+** (uses built-in `fetch` and `fs` modules, no npm install needed)
- Claude Code installed and at least one session run

## Quick Start

### 1. Get your API key

Open the Claude Dungeon web app → click **⚙️ Config** → copy the **Bridge API Key**.

### 2. Run the bridge

```bash
# Option A: Environment variable
CLAUDE_DUNGEON_API_KEY=cpab_xxxxx node claude-dungeon-bridge.mjs

# Option B: Command-line argument
node claude-dungeon-bridge.mjs --key cpab_xxxxx

# Option C: Custom server URL (if self-hosted)
node claude-dungeon-bridge.mjs \
  --server https://your-server.com \
  --key cpab_xxxxx
```

### 3. Start Claude Code

In another terminal, run Claude Code normally. Heroes will appear in the web app!

## Options

| Option | Env Variable | Default | Description |
|--------|-------------|---------|-------------|
| `--server URL` | `CLAUDE_DUNGEON_SERVER` | `https://claudepixl-kuk4sjxk.manus.space` | Cloud server URL |
| `--key KEY` | `CLAUDE_DUNGEON_API_KEY` | *(required)* | Bridge API key |
| `--claude-dir PATH` | `CLAUDE_DIR` | `~/.claude` | Claude config directory |
| `--poll-interval MS` | - | `1000` | File poll interval (ms) |
| `--push-interval MS` | - | `2000` | Server push interval (ms) |
| `--verbose` | `VERBOSE=1` | `false` | Enable debug logging |

## How It Works

```
Your Machine                          Cloud Server
─────────────────────────────────     ─────────────────────────────
~/.claude/projects/                   Claude Dungeon Web App
  └── -home-user-myproject/           ┌─────────────────────────┐
      └── session-abc.jsonl  ──────►  │  /api/bridge/heroes     │
                                      │  (POST with hero data)  │
Bridge Script                         │                         │
  1. Watches .jsonl files             │  WebSocket broadcast    │
  2. Parses tool use events           │  to all connected       │
  3. Creates hero objects             │  browser clients        │
  4. POSTs to /api/bridge/heroes      └─────────────────────────┘
```

## Hero Behavior

| Claude Code Activity | Hero State |
|---------------------|-----------|
| Running Bash commands | ⚔️ Fighting Boss |
| Writing/editing files | ⚔️ Fighting Boss |
| Web search/fetch | 🔮 Casting Spell |
| Reading files | 🔮 Casting Spell |
| Idle (no tools) | 💤 Resting at Church |
| Planning/thinking | 🛒 Shopping |

## Troubleshooting

**"No API key set" warning**
→ Get the key from the web app Config page and set `CLAUDE_DUNGEON_API_KEY`

**"Push failed (401)"**
→ API key is wrong. Get a fresh key from the Config page.

**"Claude projects directory not found"**
→ Make sure Claude Code is installed: `npm install -g @anthropic-ai/claude-code`
→ Run Claude Code at least once to create `~/.claude/projects/`

**Heroes not appearing**
→ Check that Claude Code is actively running (not just installed)
→ Enable verbose mode: `--verbose` to see debug output
→ Verify the server URL is correct

## Security

- The API key is stored only in your environment (not in any file)
- The bridge only sends hero state data (tool names, project paths, stats)
- No file contents or sensitive data are transmitted
- HTTPS is used for all communication with the cloud server
