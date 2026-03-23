# Minecraft Bot — Full Documentation

## What Was Built

A full-stack web control panel for a Minecraft bot that connects to your Aternos server (`nishantadhikari.aternos.me:17027`). Built using **mineflayer** (the same library used by the working reference bot) with a real-time web dashboard.

---

## Architecture

```
Browser (Dashboard UI)
        │
        │  WebSocket (/ws) — real-time status + logs
        │  HTTP REST (/api/...) — connect, disconnect, commands
        │
Express Server (Node.js — port 5000)
        │
        ├── server/bot.ts       ← BotManager (all bot logic)
        ├── server/routes.ts    ← API routes + WebSocket server
        │
        └── mineflayer Bot ─── TCP ──→ nishantadhikari.aternos.me:17027
```

---

## Tech Stack

node bot.js

## Version Fix

Your Aternos server runs **Minecraft 1.21.11** with **ViaVersion** installed.

auto verson + manual support
| Version `1.20.1` | Server rejected — wrong version |
| Auto-detect | Bot joined briefly but timed out (protocol 774 unsupported by mineflayer) |

**Solution:** Force `version: "1.21.4"` in `mineflayer.createBot()`. ViaVersion on the server handles the translation.

---

## Bot Features

### Anti-AFK
Automatically jumps every **5 seconds** after spawning to prevent the server from kicking the bot for inactivity.

```
setInterval(() => {
  jump → wait 500ms → stop jumping
}, 5000)
```

### Watch Target
The bot continuously **looks at the last player who sent a chat message**, updating 20 times per second (every 50ms).

### Pathfinding
Uses `mineflayer-pathfinder` with `GoalNear` to navigate to player positions and `GoalBlock` to walk up to mineable blocks.

---

## All Commands

### In-Game Chat Commands
Type these in Minecraft chat (with or without the `!` prefix):

| Command | What it does |
|---------|-------------|
| `!come` / `!goto` | Bot pathfinds to your current position or defined position as go to -64 67 100|
| `!stop` | Cancels all movement and clears control states |
| `!forward` | Move forward |
| `!back` | Move backward |
| `!left` | Strafe left |
| `!right` | Strafe right |
| `!sprint` | Enable sprint |
| `!jump` | Single jump |
| `!jump a lot` | Hold jump continuously |
| `!stop jumping` | Release jump |
| `!attack` | Attack the nearest entity |
| `!status` | Reports HP, food, position, inventory count, current task |
| `!pos` | Shows exact coordinates |
| `!yp` | Shows yaw and pitch |
| `!drop [item]` | Drops a specific item (e.g. `!drop diamond`) |
| `!drop all` | Drops the entire inventory |
| `!guard` | Toggles guard mode — attacks hostile mobs within 10 blocks |
| `!mine [block]` | Finds and mines a specific block type within 64 blocks |

### Dashboard Buttons
All commands above are also available from the web dashboard:

- **Arrow buttons** — forward, back, left, right
- **⚡ (Sprint)** — enable sprint
- **↑ (Jump)** — single jump
- **■ (Stop)** — stop all movement
- **Guard** — toggle guard mode (pulses green when active)
- **Attack** — attack nearest entity
- **Status** — report status in chat
- **Mount** — mount nearest minecart
- **Go to player** — type a player name → bot pathfinds to them
- **Mine block** — type a block name → bot finds and mines it
- **Drop item** — type item name or `all` → bot drops it
- **Chat input** — send messages in-game from the dashboard

---

## Guard Mode

When guard mode is active, the bot scans every **600ms** for hostile mobs within **10 blocks** and attacks the nearest one.

**Mobs that trigger guard:**
zombie, skeleton, creeper, spider, enderman, witch, phantom, drowned, husk, stray, pillager, vindicator, ravager, blaze, ghast, slime, magma_cube, wither_skeleton, guardian, elder_guardian, shulker, hoglin, zoglin, piglin_brute, cave_spider, silverfish, ender_dragon, wither

---

## Mining

When you send `!mine diamond_ore` (or any block name):

1. Bot looks up the block ID from `minecraft-data`
2. Searches within **64 blocks** using `bot.findBlock()`
3. Pathfinds to the block using `mineflayer-pathfinder`
4. Checks it can dig the block with current tool
5. Digs it and reports success in chat

**Example block names:**
- `diamond_ore`, `deepslate_diamond_ore`
- `iron_ore`, `deepslate_iron_ore`
- `coal_ore`, `gold_ore`
- `ancient_debris`
- `oak_log`, `stone`

---

## Real-Time Dashboard

### Status Panel (left)
- Current bot task
- Health bar (red, out of 20)
- Hunger bar (yellow, out of 20)
- XYZ position
- Online player list (click arrow to send bot to them)
- Inventory contents with item counts

### Console Log (center)
Color-coded log stream:

| Color | Meaning |
|-------|---------|
| Blue | Info messages |
| Green | Success / joined / mined |
| Yellow | Warnings (no path, item not found, died) |
| Red | Errors (kicked, connection failure) |
| Purple | In-game chat messages |
| Gray | System events |

### Command Panel (right)
- D-pad movement controls
- Action buttons (guard, attack, status, mount)
- Input fields for goto, mine, drop
- In-game command reference card

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/status` | Current bot status JSON |
| `GET` | `/api/logs` | All log entries |
| `GET` | `/api/config` | Bot configuration |
| `POST` | `/api/config` | Update config `{username, host, port, auth}` |
| `POST` | `/api/connect` | Start the bot |
| `POST` | `/api/disconnect` | Stop the bot |
| `POST` | `/api/command` | Run a command `{command, args[]}` |
| `WS` | `/ws` | Real-time event stream |

### WebSocket Message Types

**Server → Browser:**
```json
{ "type": "status", "data": { ...BotStatus } }
{ "type": "log",    "data": { ...LogEntry  } }
{ "type": "logs",   "data": [ ...LogEntry  ] }
{ "type": "config", "data": { ...BotConfig } }
```

**Browser → Server:**
```json
{ "type": "command", "data": { "command": "mine", "args": ["diamond_ore"] } }
```

---

## Configuration

Edit from the gear icon (⚙) in the top-right:

| Setting | Default | Notes |
|---------|---------|-------|
| Username | `AternosBot` | The bot's in-game name |
| Host | `nishantadhikari.aternos.me` | Aternos server address |
| Port | `17027` | Your server's port |
| Auth | `offline` | Use `offline` for cracked servers |

**Version is fixed at `1.21.4`** in code — do not change. ViaVersion handles the rest.

---

## Key Files

```
server/
  bot.ts          ← BotManager class (all bot logic, commands, events)
  routes.ts       ← Express routes + WebSocket server setup
  index.ts        ← Server entry point

client/src/
  pages/Dashboard.tsx   ← Entire dashboard UI
  index.css             ← Dark theme CSS variables
  App.tsx               ← Router

shared/
  schema.ts       ← TypeScript types (users schema, not used by bot)
```

---

## How the WebSocket Works

1. Browser connects to `ws://host/ws` on page load
2. Server immediately sends current `status`, `logs`, and `config`
3. Every time the bot fires a health/move/chat/etc. event → server broadcasts `status` update to all connected browsers
4. Every new log line → server broadcasts `log` to all browsers
5. Browser → server messages send commands directly to the bot
6. If WebSocket drops, the browser auto-reconnects every 3 seconds

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `ECONNRESET` | Aternos server is sleeping | Start the server from aternos.org first |
| `Timed out` | Version mismatch / packet error | Fixed by forcing `1.21.4` |
| `Can't find you` | Player outside render distance | Stand within ~32 blocks of the bot's spawn |
| `No path found` | Pathfinding blocked | Use `!stop` and try again from a different angle |
| Bot not responding to chat | Commands case-sensitive | Use lowercase commands |
| Guard mode not working | Mob out of range | Mobs must be within 10 blocks |
