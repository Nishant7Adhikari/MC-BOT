export type LogLevel = "info" | "success" | "warn" | "error" | "chat" | "system";

export interface LogEntry {
  id: string;
  ts: number;
  level: LogLevel;
  message: string;
}

export interface BotConfig {
  username: string;
  host: string;
  port: number;
  auth: "offline" | "microsoft";
}

export interface BotStatus {
  connected: boolean;
  online: boolean;
  task: string;
  watchTarget: string | null;
  previewActive: boolean;
  previewPort: number | null;
  health: number;
  food: number;
  position: { x: number; y: number; z: number } | null;
  players: string[];
  inventory: Array<{ name: string; count: number }>;
  guardMode: boolean;
}
