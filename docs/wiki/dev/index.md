# 开发指南

## 开发环境

```bash
bun install
bun run dev          # 后端监听（当前入口：src/server/main.ts）
bun run dev:frontend # 前端 Vite 开发服务器
bun run build:frontend
bun test
```

如果只需要跑后端并直接访问构建后的页面，可先执行 `bun run build:frontend`，再运行 `bun run start`。

## 测试

```bash
# 运行所有测试
bun test

# 运行特定模块测试
bun test tests/core/tmdb-client.test.ts
bun test tests/core/renamer.test.ts
bun test tests/e2e/pipeline.test.ts
bun test tests/core/mikan-routes.test.ts
bun test tests/core/subscriptions-routes.test.ts
bun test tests/core/qbit-rule-import.test.ts
bun test tests/core/pipeline-replay.test.ts
```

## 代码规范

- TypeScript 严格模式
- 模块化日志：每个模块用 `createLogger("module-name")`
- 配置通过 `getConfig()` 获取，不直接硬编码
- 敏感信息（密码、token、API key）不进入源码，通过 `config.json` 配置

## 子文档

- [网页界面与订阅流程](../web-ui.md)
- [数据库 Schema](./database.md)
- [API 接口](./api.md)
- [运行时与 qBit 导入](./runtime-and-imports.md)
- [PikPak 集成](./pikpak-integration.md)
- [TMDB 集成](./tmdb-integration.md)
- [弹幕集成](./danmaku-integration.md)

## 当前建议的开发切入点

- 调订阅或 UI：先看 `subscriptionsRoutes`、`mikanRoutes`、`frontend/src/components`
- 调历史回放或重复提交：先看 `pipeline.ts`、`item-store.ts`、`episode-state/`
- 调 qBit 导入：先看 `src/core/rss/qbit-rule-import.ts` 和 CLI 入口
- 调身份绑定问题：先看 `src/core/mikan/identity.ts` 与 `rss_sources` 上的双 ID 字段
