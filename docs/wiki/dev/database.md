# 数据库 Schema

使用 Drizzle ORM + SQLite。数据库文件路径由 `general.dbPath` 配置（默认 `data/pikpak-bangumi.db`）。

## 表结构

### `rss_sources` — RSS 订阅源

| 列名 | 类型 | 说明 |
|------|------|------|
| `id` | INTEGER PK | 自增主键 |
| `name` | TEXT | 订阅源名称 |
| `url` | TEXT | RSS URL |
| `enabled` | INTEGER | 是否启用（0/1） |
| `pollIntervalMs` | INTEGER | 轮询间隔（毫秒） |
| `lastPolledAt` | TEXT | 最后一次成功轮询时间 |
| `consecutiveFailures` | INTEGER | 连续失败次数 |
| `bangumiSubjectId` | INTEGER \| NULL | Bangumi 条目 ID |
| `mikanBangumiId` | INTEGER \| NULL | Mikan 番剧 ID |
| `createdAt` | TEXT | 创建时间 |

### `rss_items` — RSS 条目（已处理记录）

| 列名 | 类型 | 说明 |
|------|------|------|
| `id` | INTEGER PK | 自增主键 |
| `sourceId` | INTEGER FK | 关联 rss_sources.id |
| `guid` | TEXT UNIQUE | RSS 条目唯一标识（去重用） |
| `title` | TEXT | 标题 |
| `link` | TEXT | 页面链接 |
| `torrentUrl` | TEXT | torrent 下载链接 |
| `magnetUrl` | TEXT | magnet 链接 |
| `pubDate` | TEXT | 发布日期 |
| `processedAt` | TEXT | 处理时间 |

### `filter_rules` — 过滤规则

| 列名 | 类型 | 说明 |
|------|------|------|
| `id` | INTEGER PK | 自增主键 |
| `name` | TEXT | 规则名称 |
| `pattern` | TEXT | 正则表达式 |
| `type` | TEXT | `include` 或 `exclude` |
| `sourceId` | INTEGER \| NULL | 关联源（NULL = 全局规则） |
| `enabled` | INTEGER | 是否启用（0/1） |
| `createdAt` | TEXT | 创建时间 |

### `download_tasks` — 下载任务

| 列名 | 类型 | 说明 |
|------|------|------|
| `id` | INTEGER PK | 自增主键 |
| `rssItemId` | INTEGER FK | 关联 rss_items.id |
| `pikpakTaskId` | TEXT | PikPak 任务 ID |
| `pikpakFileId` | TEXT | PikPak 文件 ID（下载完成后填写） |
| `parentFolderId` | TEXT | 目标父文件夹 ID |
| `status` | TEXT | `pending`/`completed`/`failed` |
| `originalName` | TEXT | 原始文件名 |
| `renamedName` | TEXT | 重命名后文件名 |
| `createdAt` | TEXT | 创建时间 |
| `completedAt` | TEXT | 完成时间 |

### `danmaku_episodes` — 弹幕记录

| 列名 | 类型 | 说明 |
|------|------|------|
| `id` | INTEGER PK | 自增主键 |
| `downloadTaskId` | INTEGER FK | 关联 download_tasks.id |
| `episodeId` | INTEGER | DanDanPlay 集数 ID |
| `xmlFileId` | TEXT | PikPak 上传后的 XML 文件 ID |
| `commentCount` | INTEGER | 弹幕条数 |
| `uploadedAt` | TEXT | 上传时间 |

## 迁移管理

使用 Drizzle Kit 管理迁移：

```bash
bunx drizzle-kit generate  # 生成迁移文件
bunx drizzle-kit migrate   # 应用迁移
```

迁移文件存放在 `drizzle/` 目录，会提交到版本控制。
