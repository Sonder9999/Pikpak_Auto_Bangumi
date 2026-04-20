import { Elysia, t } from "elysia";
import {
  getAllRules, getRuleById, createRule, updateRule, deleteRule,
} from "../../core/filter/rule-crud.ts";
import { createLogger } from "../../core/logger.ts";

const logger = createLogger("api-rules");

export const rulesRoutes = new Elysia({ prefix: "/api/rules" })
  .get("/", () => {
    logger.debug("GET /api/rules");
    return getAllRules();
  })
  .get("/:id", ({ params }) => {
    const rule = getRuleById(Number(params.id));
    if (!rule) return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
    return rule;
  })
  .post("/", ({ body }) => {
    logger.info("Creating filter rule", { name: body.name });
    const rule = createRule(body);
    return rule;
  }, {
    body: t.Object({
      name: t.String(),
      pattern: t.String(),
      mode: t.Union([t.Literal("include"), t.Literal("exclude")]),
      sourceId: t.Optional(t.Nullable(t.Number())),
      enabled: t.Optional(t.Boolean()),
    }),
  })
  .patch("/:id", ({ params, body }) => {
    logger.info("Updating filter rule", { id: params.id });
    const updated = updateRule(Number(params.id), body);
    if (!updated) return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
    return updated;
  }, {
    body: t.Object({
      name: t.Optional(t.String()),
      pattern: t.Optional(t.String()),
      mode: t.Optional(t.Union([t.Literal("include"), t.Literal("exclude")])),
      sourceId: t.Optional(t.Nullable(t.Number())),
      enabled: t.Optional(t.Boolean()),
    }),
  })
  .delete("/:id", ({ params }) => {
    logger.info("Deleting filter rule", { id: params.id });
    const deleted = deleteRule(Number(params.id));
    if (!deleted) return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
    return { ok: true };
  });
