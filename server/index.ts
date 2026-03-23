import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import { WebSocketServer, WebSocket } from "ws";
import { BotManager } from "./bot.js";

const app = express();
app.use(cors());
app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const clients = new Set<WebSocket>();

const bot = new BotManager({
  onLog: (entry) => {
    broadcast({ type: "log", data: entry });
  },
  onStatus: (status) => {
    broadcast({ type: "status", data: status });
  }
});

function broadcast(payload: unknown): void {
  const raw = JSON.stringify(payload);
  for (const ws of clients) {
    if (ws.readyState === ws.OPEN) ws.send(raw);
  }
}

app.get("/api/status", (_req, res) => {
  res.json(bot.getStatus());
});

app.get("/api/logs", (_req, res) => {
  res.json(bot.getLogs());
});

app.get("/api/config", (_req, res) => {
  res.json(bot.getConfig());
});

app.post("/api/config", (req, res) => {
  const next = bot.setConfig(req.body ?? {});
  broadcast({ type: "config", data: next });
  res.json(next);
});

app.post("/api/connect", async (_req, res) => {
  await bot.connect();
  res.json({ ok: true });
});

app.post("/api/disconnect", async (_req, res) => {
  await bot.disconnect();
  res.json({ ok: true });
});

app.post("/api/command", async (req, res) => {
  const command = String(req.body?.command ?? "").trim();
  const args = Array.isArray(req.body?.args) ? req.body.args.map(String) : [];
  await bot.runCommand(command, args);
  res.json({ ok: true });
});

app.use(express.static(path.join(rootDir, "public")));

const server = app.listen(5000, () => {
  // Keep startup logs simple for easy terminal parsing.
  console.log("MinecraftBot dashboard running on http://localhost:5000");
});

const wss = new WebSocketServer({ server, path: "/ws" });
wss.on("connection", (ws) => {
  clients.add(ws);
  ws.send(JSON.stringify({ type: "status", data: bot.getStatus() }));
  ws.send(JSON.stringify({ type: "logs", data: bot.getLogs() }));
  ws.send(JSON.stringify({ type: "config", data: bot.getConfig() }));

  ws.on("message", async (raw) => {
    try {
      const msg = JSON.parse(raw.toString()) as { type?: string; data?: { command?: string; args?: string[] } };
      if (msg.type === "command" && msg.data?.command) {
        await bot.runCommand(msg.data.command, msg.data.args ?? []);
      }
    } catch {
      // ignore malformed ws messages
    }
  });

  ws.on("close", () => {
    clients.delete(ws);
  });
});
