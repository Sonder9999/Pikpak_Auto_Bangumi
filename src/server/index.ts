import { Elysia } from "elysia";
import { createLogger } from "../core/logger.ts";
import { initCore, startPipeline, stopPipeline } from "../core/pipeline.ts";
import { getConfig } from "../core/config/config.ts";
import { rssRoutes } from "./routes/rss.ts";
import { rulesRoutes } from "./routes/rules.ts";
import { configRoutes } from "./routes/config.ts";
import { tasksRoutes } from "./routes/tasks.ts";
import { jwtAuth } from "./middleware/auth.ts";

const logger = createLogger("server");

logger.info("Starting in Server mode");

const authenticated = await initCore();
if (!authenticated) {
  logger.warn("PikPak not authenticated — running in limited mode");
}

const config = getConfig();

const app = new Elysia()
  .use(jwtAuth)
  .use(rssRoutes)
  .use(rulesRoutes)
  .use(configRoutes)
  .use(tasksRoutes)
  .get("/api/health", () => ({ status: "ok", timestamp: new Date().toISOString() }))
  .listen(config.general.port);

startPipeline();

// Graceful shutdown
const shutdown = () => {
  logger.info("Shutting down server...");
  stopPipeline();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

logger.info("Server listening", { port: config.general.port });

export { app };
