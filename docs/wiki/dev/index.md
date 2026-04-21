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
- [PikPak 集成](./pikpak-integration.md)
- [TMDB 集成](./tmdb-integration.md)
- [弹幕集成](./danmaku-integration.md)
