import { mkdirSync, appendFileSync } from "fs";
import { join } from "path";

const LOG_DIR = join(import.meta.dir, "../../../logs");

export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

let globalMinLevel: LogLevel = "INFO";

export function setGlobalLogLevel(level: LogLevel) {
  globalMinLevel = level;
}

export function createLogger(module: string) {
  mkdirSync(LOG_DIR, { recursive: true });
  const logFile = join(LOG_DIR, `${module}.log`);

  function formatMessage(level: LogLevel, msg: string, ctx?: Record<string, unknown>): string {
    const ts = new Date().toISOString();
    const ctxStr = ctx ? ` ${JSON.stringify(ctx)}` : "";
    return `[${ts}] [${level}] [${module}] ${msg}${ctxStr}`;
  }

  function log(level: LogLevel, msg: string, ctx?: Record<string, unknown>) {
    if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[globalMinLevel]) return;
    const formatted = formatMessage(level, msg, ctx);
    const line = formatted + "\n";

    if (level === "ERROR") {
      console.error(formatted);
    } else if (level === "WARN") {
      console.warn(formatted);
    } else {
      console.log(formatted);
    }

    try {
      appendFileSync(logFile, line);
    } catch {
      // Silently ignore write failures
    }
  }

  return {
    debug: (msg: string, ctx?: Record<string, unknown>) => log("DEBUG", msg, ctx),
    info: (msg: string, ctx?: Record<string, unknown>) => log("INFO", msg, ctx),
    warn: (msg: string, ctx?: Record<string, unknown>) => log("WARN", msg, ctx),
    error: (msg: string, ctx?: Record<string, unknown>) => log("ERROR", msg, ctx),
  };
}
