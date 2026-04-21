import { createLogger } from "../core/logger.ts";
import { initCore, startPipeline, stopPipeline } from "../core/pipeline.ts";
import { runQbitRuleImportCommand } from "./qbit-rule-import-command.ts";

const logger = createLogger("cli");

const rawArgs = process.argv.slice(2);
const commandArgs: string[] = [];

for (let index = 0; index < rawArgs.length; index += 1) {
  if (rawArgs[index] === "--mode") {
    index += 1;
    continue;
  }

  commandArgs.push(rawArgs[index]!);
}

if (commandArgs[0] === "import-qbit-rss-rules") {
  logger.info("Starting qBit RSS rule import command", { fileCount: Math.max(commandArgs.length - 1, 0) });

  try {
    await runQbitRuleImportCommand(commandArgs.slice(1));
    process.exit(0);
  } catch (error) {
    logger.error("qBit RSS rule import command failed", { error: String(error) });
    process.exit(1);
  }
}

logger.info("Starting in CLI mode");

const authenticated = await initCore();
if (!authenticated) {
  logger.warn("PikPak not authenticated — running in limited mode");
}

startPipeline();

// Graceful shutdown
const shutdown = () => {
  logger.info("Shutting down CLI...");
  stopPipeline();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

logger.info("CLI mode running. Press Ctrl+C to stop.");
