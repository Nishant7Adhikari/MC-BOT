import mineflayer, { Bot } from "mineflayer";
import pathfinderPkg from "mineflayer-pathfinder";
import minecraftData from "minecraft-data";
import type { BotConfig, BotStatus, LogEntry, LogLevel } from "./types.js";

const { pathfinder, Movements, goals } = pathfinderPkg;
const { GoalNear, GoalFollow, GoalBlock } = goals;

type Events = {
  onStatus?: (status: BotStatus) => void;
  onLog?: (entry: LogEntry) => void;
};

const HOSTILE_MOBS = new Set([
  "zombie", "skeleton", "creeper", "spider", "enderman", "witch", "phantom", "drowned",
  "husk", "stray", "pillager", "vindicator", "ravager", "blaze", "ghast", "slime",
  "magma_cube", "wither_skeleton", "guardian", "elder_guardian", "shulker", "hoglin",
  "zoglin", "piglin_brute", "cave_spider", "silverfish", "ender_dragon", "wither"
]);

export class BotManager {
  private bot: Bot | null = null;
  private readonly previewPort = 3007;
  private previewStarted = false;
  private config: BotConfig = {
    username: "AternosBot",
    host: "nishantadhikari.aternos.me",
    port: 17027,
    auth: "offline"
  };
  private logs: LogEntry[] = [];
  private status: BotStatus = {
    connected: false,
    online: false,
    task: "Idle",
    watchTarget: null,
    previewActive: false,
    previewPort: null,
    health: 0,
    food: 0,
    position: null,
    players: [],
    inventory: [],
    guardMode: false
  };
  private readonly events: Events;
  private antiAfkTimer: NodeJS.Timeout | null = null;
  private guardTimer: NodeJS.Timeout | null = null;
  private lookTimer: NodeJS.Timeout | null = null;
  private followPlayer: string | null = null;

  constructor(events: Events = {}) {
    this.events = events;
  }

  getStatus(): BotStatus {
    return this.status;
  }

  getLogs(): LogEntry[] {
    return this.logs;
  }

  getConfig(): BotConfig {
    return this.config;
  }

  setConfig(next: Partial<BotConfig>): BotConfig {
    this.config = { ...this.config, ...next };
    this.log("system", `Config updated: ${this.config.username}@${this.config.host}:${this.config.port}`);
    return this.config;
  }

  async connect(): Promise<void> {
    if (this.bot) {
      this.log("warn", "Bot is already connected or connecting.");
      return;
    }

    this.status.connected = true;
    this.status.task = "Connecting";
    this.emitStatus();

    const bot = mineflayer.createBot({
      username: this.config.username,
      host: this.config.host,
      port: this.config.port,
      auth: this.config.auth,
      version: "1.21.11"
    });

    this.bot = bot;
    bot.loadPlugin(pathfinder);

    bot.once("spawn", () => {
      this.log("success", "Bot joined the server.");
      this.status.online = true;
      this.status.task = "Idle";
      this.setupMovement(bot);
      void this.startLivePreview(bot);
      this.emitStatus();
    });

    bot.on("health", () => {
      this.status.health = bot.health ?? 0;
      this.status.food = bot.food ?? 0;
      this.emitStatus();
    });

    bot.on("move", () => {
      this.status.position = {
        x: Number(bot.entity.position.x.toFixed(2)),
        y: Number(bot.entity.position.y.toFixed(2)),
        z: Number(bot.entity.position.z.toFixed(2))
      };
      this.status.players = Object.values(bot.players)
        .map((p) => p.username)
        .filter((x): x is string => Boolean(x) && x !== bot.username)
        .sort((a, b) => a.localeCompare(b));
      this.status.inventory = bot.inventory.items().map((i) => ({ name: i.name, count: i.count }));
      this.emitStatus();
    });

    bot.on("chat", (username, message) => {
      if (username === bot.username) return;
      this.log("chat", `<${username}> ${message}`);
      this.followPlayer = username;
      this.status.watchTarget = username;
      this.emitStatus();
      this.handleChatCommand(username, message).catch((err) => {
        this.log("error", `Command failed: ${String(err)}`);
      });
    });

    bot.on("kicked", (reason) => {
      this.log("error", `Kicked: ${typeof reason === "string" ? reason : JSON.stringify(reason)}`);
    });

    bot.on("error", (err) => {
      this.log("error", err.message);
    });

    bot.on("end", () => {
      this.log("warn", "Bot disconnected.");
      this.cleanupRuntime();
    });
  }

  async disconnect(): Promise<void> {
    if (!this.bot) return;
    const current = this.bot;
    this.cleanupRuntime();
    current.quit("Dashboard disconnect");
  }

  async runCommand(command: string, args: string[] = []): Promise<void> {
    const cmd = command.toLowerCase();
    if (!this.bot) {
      this.log("warn", "Bot is not connected.");
      return;
    }

    switch (cmd) {
      case "chat": {
        const message = args.join(" ").trim();
        if (!message) return;
        this.bot.chat(message);
        break;
      }
      case "stop": {
        this.stopMovement();
        this.status.task = "Idle";
        this.emitStatus();
        break;
      }
      case "forward":
      case "back":
      case "left":
      case "right": {
        this.stopMovement();
        this.bot.setControlState(cmd as "forward" | "back" | "left" | "right", true);
        this.status.task = `Moving ${cmd}`;
        this.emitStatus();
        break;
      }
      case "sprint": {
        this.bot.setControlState("sprint", true);
        this.log("info", "Sprint enabled.");
        break;
      }
      case "jump": {
        this.bot.setControlState("jump", true);
        setTimeout(() => this.bot?.setControlState("jump", false), 400);
        break;
      }
      case "jump_alot": {
        this.bot.setControlState("jump", true);
        this.log("info", "Continuous jump enabled.");
        break;
      }
      case "stop_jumping": {
        this.bot.setControlState("jump", false);
        break;
      }
      case "status": {
        const s = this.status;
        this.bot.chat(`HP ${s.health}/20 Food ${s.food}/20 Pos ${s.position ? `${s.position.x} ${s.position.y} ${s.position.z}` : "?"} Task ${s.task}`);
        break;
      }
      case "pos": {
        const p = this.status.position;
        this.bot.chat(p ? `Pos: ${p.x} ${p.y} ${p.z}` : "No position yet.");
        break;
      }
      case "yp": {
        const yaw = this.bot.entity.yaw.toFixed(3);
        const pitch = this.bot.entity.pitch.toFixed(3);
        this.bot.chat(`Yaw/Pitch: ${yaw} ${pitch}`);
        break;
      }
      case "attack": {
        const target = this.findNearestEntity();
        if (!target) {
          this.log("warn", "No entity nearby to attack.");
          break;
        }
        await this.bot.attack(target);
        this.log("success", `Attacked ${target.name ?? target.displayName ?? "entity"}`);
        break;
      }
      case "guard": {
        this.toggleGuardMode();
        break;
      }
      case "goto": {
        const who = args[0];
        if (!who) {
          this.log("warn", "Usage: goto <player>");
          break;
        }
        await this.goToPlayer(who);
        break;
      }
      case "come": {
        const who = args[0];
        if (!who) {
          this.log("warn", "Usage: come <player>");
          break;
        }
        await this.goToPlayer(who);
        break;
      }
      case "mine": {
        const blockName = args[0];
        if (!blockName) {
          this.log("warn", "Usage: mine <block_name>");
          break;
        }
        await this.mineBlock(blockName);
        break;
      }
      case "drop": {
        const itemName = args.join(" ").trim();
        await this.dropItem(itemName);
        break;
      }
      case "mount": {
        await this.mountNearestMinecart();
        break;
      }
      default:
        this.log("warn", `Unknown command: ${command}`);
    }
  }

  private setupMovement(bot: Bot): void {
    const movements = new Movements(bot);
    bot.pathfinder.setMovements(movements);

    if (this.antiAfkTimer) clearInterval(this.antiAfkTimer);
    this.antiAfkTimer = setInterval(() => {
      if (!this.bot) return;
      this.bot.setControlState("jump", true);
      setTimeout(() => this.bot?.setControlState("jump", false), 500);
    }, 5000);

    if (this.lookTimer) clearInterval(this.lookTimer);
    this.lookTimer = setInterval(() => {
      if (!this.bot || !this.followPlayer) return;
      const target = this.bot.players[this.followPlayer]?.entity;
      if (!target) return;
      this.bot.lookAt(target.position.offset(0, 1.6, 0), true).catch(() => undefined);
    }, 50);
  }

  private async handleChatCommand(username: string, rawMessage: string): Promise<void> {
    const text = rawMessage.trim();
    const normalized = text.startsWith("!") ? text.slice(1) : text;
    const [cmd, ...args] = normalized.toLowerCase().split(/\s+/g);

    if (!cmd) return;
    const map: Record<string, string> = {
      "jump": "jump",
      "jump a lot": "jump_alot",
      "stop jumping": "stop_jumping"
    };

    if (normalized === "jump a lot" || normalized === "!jump a lot") {
      await this.runCommand("jump_alot", []);
      return;
    }
    if (normalized === "stop jumping" || normalized === "!stop jumping") {
      await this.runCommand("stop_jumping", []);
      return;
    }

    if (cmd === "come" || cmd === "goto") {
      await this.runCommand("goto", [username]);
      return;
    }

    if (cmd === "drop" && args.length === 0) {
      this.log("warn", "Usage: !drop <item|all>");
      return;
    }

    const resolved = map[cmd] ?? cmd;
    await this.runCommand(resolved, args);
  }

  private stopMovement(): void {
    if (!this.bot) return;
    for (const state of ["forward", "back", "left", "right", "sprint", "jump"] as const) {
      this.bot.setControlState(state, false);
    }
    this.bot.pathfinder.stop();
  }

  private findNearestEntity() {
    if (!this.bot) return null;
    return this.bot.nearestEntity((e) => e.type === "mob" || e.type === "player");
  }

  private toggleGuardMode(): void {
    this.status.guardMode = !this.status.guardMode;
    this.emitStatus();

    if (!this.bot) return;

    if (this.status.guardMode) {
      this.log("success", "Guard mode enabled.");
      if (this.guardTimer) clearInterval(this.guardTimer);
      this.guardTimer = setInterval(async () => {
        if (!this.bot) return;
        const target = this.bot.nearestEntity((e) => {
          if (e.type !== "mob") return false;
          if (!e.name || !HOSTILE_MOBS.has(e.name)) return false;
          return e.position.distanceTo(this.bot!.entity.position) <= 10;
        });
        if (!target) return;
        try {
          await this.bot.attack(target);
        } catch {
          // ignore rapid attack race
        }
      }, 600);
      return;
    }

    this.log("info", "Guard mode disabled.");
    if (this.guardTimer) {
      clearInterval(this.guardTimer);
      this.guardTimer = null;
    }
  }

  private async goToPlayer(playerName: string): Promise<void> {
    if (!this.bot) return;
    const player = this.bot.players[playerName]?.entity;
    if (!player) {
      this.log("warn", `Can't find player ${playerName}`);
      return;
    }
    this.status.task = `Going to ${playerName}`;
    this.emitStatus();
    const goal = new GoalNear(player.position.x, player.position.y, player.position.z, 1);
    await this.bot.pathfinder.goto(goal);
    this.status.task = "Idle";
    this.emitStatus();
  }

  private async mineBlock(blockName: string): Promise<void> {
    if (!this.bot) return;
    const mcData = minecraftData(this.bot.version);
    const targetBlock = Object.values(mcData.blocksByName).find((b) => b.name === blockName);
    if (!targetBlock) {
      this.log("warn", `Unknown block: ${blockName}`);
      return;
    }

    const block = this.bot.findBlock({
      matching: targetBlock.id,
      maxDistance: 64
    });

    if (!block) {
      this.log("warn", `No ${blockName} within 64 blocks.`);
      return;
    }

    this.status.task = `Mining ${blockName}`;
    this.emitStatus();

    await this.bot.pathfinder.goto(new GoalBlock(block.position.x, block.position.y, block.position.z));

    if (!this.bot.canDigBlock(block)) {
      this.log("warn", `Can't dig ${blockName} with current tool.`);
      this.status.task = "Idle";
      this.emitStatus();
      return;
    }

    await this.bot.dig(block);
    this.log("success", `Mined ${blockName}`);
    this.status.task = "Idle";
    this.emitStatus();
  }

  private async dropItem(itemName: string): Promise<void> {
    if (!this.bot) return;
    if (!itemName) {
      this.log("warn", "Usage: drop <item|all>");
      return;
    }

    if (itemName.toLowerCase() === "all") {
      for (const item of this.bot.inventory.items()) {
        await this.bot.tossStack(item);
      }
      this.log("success", "Dropped entire inventory.");
      return;
    }

    const item = this.bot.inventory.items().find((i) => i.name.includes(itemName));
    if (!item) {
      this.log("warn", `Item not found: ${itemName}`);
      return;
    }

    await this.bot.toss(item.type, null, item.count);
    this.log("success", `Dropped ${item.count}x ${item.name}`);
  }

  private async mountNearestMinecart(): Promise<void> {
    if (!this.bot) return;
    const minecart = this.bot.nearestEntity((e) => Boolean(e.name && e.name.includes("minecart")));
    if (!minecart) {
      this.log("warn", "No minecart nearby.");
      return;
    }
    await this.bot.mount(minecart);
    this.log("success", "Mounted minecart.");
  }

  private async startLivePreview(bot: Bot): Promise<void> {
    if (this.previewStarted) return;

    try {
      const viewerModule = await import("prismarine-viewer");
      const mineflayerViewer = (viewerModule as any).mineflayer ?? (viewerModule as any).default?.mineflayer;
      if (typeof mineflayerViewer !== "function") {
        this.log("warn", "Live preview plugin loaded but mineflayer viewer entry is missing.");
        return;
      }

      mineflayerViewer(bot, {
        port: this.previewPort,
        firstPerson: true,
        viewDistance: 8
      });

      this.previewStarted = true;
      this.status.previewActive = true;
      this.status.previewPort = this.previewPort;
      this.emitStatus();
      this.log("info", `Live preview is available on port ${this.previewPort}.`);
    } catch {
      this.status.previewActive = false;
      this.status.previewPort = null;
      this.emitStatus();
      this.log("warn", "Live preview unavailable (failed to load prismarine-viewer).");
    }
  }

  private cleanupRuntime(): void {
    if (this.antiAfkTimer) {
      clearInterval(this.antiAfkTimer);
      this.antiAfkTimer = null;
    }
    if (this.guardTimer) {
      clearInterval(this.guardTimer);
      this.guardTimer = null;
    }
    if (this.lookTimer) {
      clearInterval(this.lookTimer);
      this.lookTimer = null;
    }
    this.bot = null;
    this.followPlayer = null;
    this.previewStarted = false;
    this.status = {
      connected: false,
      online: false,
      task: "Idle",
      watchTarget: null,
      previewActive: false,
      previewPort: null,
      health: 0,
      food: 0,
      position: null,
      players: [],
      inventory: [],
      guardMode: false
    };
    this.emitStatus();
  }

  private log(level: LogLevel, message: string): void {
    const entry: LogEntry = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      ts: Date.now(),
      level,
      message
    };
    this.logs.push(entry);
    if (this.logs.length > 600) this.logs.shift();
    this.events.onLog?.(entry);
  }

  private emitStatus(): void {
    this.events.onStatus?.(this.status);
  }
}
