# Pikpak Auto Bangumi 文档

Pikpak Auto Bangumi 是一个以 Bun + Elysia + SQLite 为核心的自动追番系统。它把 Bangumi 收藏同步、RSS 订阅、历史回放、PikPak 离线下载、云端重命名、弹幕补传和 Web UI 管理整合在一起。

## 文档目录

- [快速开始](./getting-started.md)
- [网页界面与订阅流程](./web-ui.md)
- [配置说明](./config.md)
- [架构设计](./architecture.md)
- [开发指南](./dev/index.md)
  - [数据库 Schema](./dev/database.md)
  - [API 接口](./dev/api.md)
  - [运行时与 qBit 导入](./dev/runtime-and-imports.md)
  - [PikPak 集成](./dev/pikpak-integration.md)
  - [TMDB 集成](./dev/tmdb-integration.md)
  - [弹幕集成](./dev/danmaku-integration.md)

## 当前能力总览

| 能力 | 说明 |
|------|------|
| Bangumi 收藏同步 | 读取 Bangumi 收藏，支持分页、已订阅交集视图和详情抽屉 |
| 双 ID 订阅模型 | 明确区分 `bangumiSubjectId` 与 `mikanBangumiId`，避免两套 ID 混用 |
| Mikan 辅助订阅 | 搜索 Mikan 条目，选择字幕组，查看最近资源并直接订阅 |
| 手动 RSS 订阅 | 直接录入 RSS 地址，并绑定 Bangumi subject 与过滤规则 |
| 规则匹配 | 支持普通关键词 AND 匹配，也支持显式 regex 模式 |
| 历史回放 | 新建或更新订阅、修改规则后可重放历史 RSS 条目 |
| 交付状态去重 | 使用 `episode_delivery_state` 避免同集重复推送到 PikPak |
| 云端重命名 | 下载完成后结合 Bangumi 或 TMDB 元数据进行标准化命名 |
| 弹幕刷新与补传 | 下载 DanDanPlay XML，按过期策略刷新并上传到同目录 |
| qBittorrent 规则导入 | 直接导入 qBit RSS 规则 JSON，并幂等更新 RSS 源与过滤规则 |
| REST API + Web UI | 后端 API 和前端管理界面使用同一套订阅模型 |

## 推荐阅读路径

如果你是第一次接手这个仓库，建议按以下顺序阅读：

1. 先看 [快速开始](./getting-started.md)，了解运行模式和最小配置
2. 再看 [架构设计](./architecture.md)，建立模块边界和数据流概念
3. 如果要改前端订阅流程，看 [网页界面与订阅流程](./web-ui.md)
4. 如果要改接口或数据库，分别看 [API 接口](./dev/api.md) 和 [数据库 Schema](./dev/database.md)
5. 如果要处理运行时、历史回放或 qBit 导入，看 [运行时与 qBit 导入](./dev/runtime-and-imports.md)
