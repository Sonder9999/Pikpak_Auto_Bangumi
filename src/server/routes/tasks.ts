import { Elysia, t } from "elysia";
import { getAllTasks, getTasksByStatus } from "../../core/pikpak/task-manager.ts";
import { createLogger } from "../../core/logger.ts";

const logger = createLogger("api-tasks");

export const tasksRoutes = new Elysia({ prefix: "/api/tasks" })
  .get("/", ({ query }) => {
    logger.debug("GET /api/tasks", { status: query.status });
    if (query.status) {
      return getTasksByStatus(query.status);
    }
    return getAllTasks();
  }, {
    query: t.Object({
      status: t.Optional(t.String()),
    }),
  });
