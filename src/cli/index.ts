import { createLogger } from "../core/logger.ts";
import { initCore, startPipeline, stopPipeline } from "../core/pipeline.ts";

const logger = createLogger("cli");

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
