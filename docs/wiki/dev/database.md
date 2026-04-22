# 数据库 Schema

项目使用 Drizzle ORM + SQLite。数据库文件路径由 `general.dbPath` 决定，默认是 `data/pikpak-bangumi.db`。

## 设计说明

### `rss_sources` 是订阅实体

高层“订阅”动作不会写入单独的订阅表，而是落到：

- `rss_sources`
- `filter_rules`

### 双 ID 模型

`rss_sources` 当前保留两套身份字段：

- `bangumiSubjectId`：Bangumi subject 主键
- `mikanBangumiId`：Mikan 番剧主键

只有 `bangumiSubjectId` 可以用于 Bangumi 元数据查询。

## 表结构

### `rss_sources`

| 列名 | 类型 | 说明 |
|------|------|------|
| `id` | INTEGER PK | 订阅源主键 |
| `name` | TEXT | 源名称，例如 `Manual RSS - 576351` |
| `url` | TEXT | RSS 地址 |
| `enabled` | INTEGER(boolean) | 是否启用 |
| `poll_interval_ms` | INTEGER | 轮询周期 |
| `bangumi_subject_id` | INTEGER NULL | Bangumi subject ID |
| `mikan_bangumi_id` | INTEGER NULL | Mikan 番剧 ID |
| `last_success_at` | TEXT NULL | 最近成功拉取时间 |
| `last_error_at` | TEXT NULL | 最近失败时间 |
| `last_error` | TEXT NULL | 最近失败消息 |
| `consecutive_failures` | INTEGER | 连续失败次数 |
| `created_at` | TEXT | 创建时间 |
| `updated_at` | TEXT | 更新时间 |

### `filter_rules`

| 列名 | 类型 | 说明 |
|------|------|------|
| `id` | INTEGER PK | 规则主键 |
| `name` | TEXT | 规则名称 |
| `pattern` | TEXT | 原始规则字符串 |
| `mode` | TEXT | `include` 或 `exclude` |
| `source_id` | INTEGER NULL | 关联 `rss_sources.id`，为空时表示全局规则 |
| `enabled` | INTEGER(boolean) | 是否启用 |
| `created_at` | TEXT | 创建时间 |

### `rss_items`

| 列名 | 类型 | 说明 |
|------|------|------|
| `id` | INTEGER PK | 条目主键 |
| `source_id` | INTEGER FK | 来源 `rss_sources.id` |
| `guid` | TEXT | 源内唯一标识 |
| `title` | TEXT | 原始标题 |
| `link` | TEXT NULL | 条目链接 |
| `magnet_url` | TEXT NULL | magnet 地址 |
| `torrent_url` | TEXT NULL | torrent 地址 |
| `homepage` | TEXT NULL | 来源主页 |
| `processed` | INTEGER(boolean) | 是否已进入终态 |
| `replay_status` | TEXT | `pending` / `filtered` / `submitted` / `duplicate` / `error` |
| `decision_reason` | TEXT NULL | 本次决策原因 |
| `linked_task_id` | INTEGER NULL | 关联 `pikpak_tasks.id` |
| `created_at` | TEXT | 创建时间 |

### `pikpak_tasks`

| 列名 | 类型 | 说明 |
|------|------|------|
| `id` | INTEGER PK | 任务主键 |
| `rss_item_id` | INTEGER FK | 对应 `rss_items.id` |
| `magnet_url` | TEXT | 提交给 PikPak 的 magnet |
| `pikpak_task_id` | TEXT NULL | PikPak 任务 ID |
| `pikpak_file_id` | TEXT NULL | PikPak 文件 ID |
| `cloud_path` | TEXT NULL | 目标云端目录 |
| `status` | TEXT | `pending` / `downloading` / `complete` / `error` / `renamed` |
| `original_name` | TEXT NULL | 原始文件名 |
| `renamed_name` | TEXT NULL | 重命名结果 |
| `error_message` | TEXT NULL | 错误消息 |
| `created_at` | TEXT | 创建时间 |
| `updated_at` | TEXT | 更新时间 |

### `episode_delivery_state`

该表是历史回放与重复提交控制的核心。

| 列名 | 类型 | 说明 |
|------|------|------|
| `id` | INTEGER PK | 主键 |
| `normalized_title` | TEXT | 归一化标题 |
| `season_number` | INTEGER | 季 |
| `episode_number` | INTEGER | 集 |
| `cloud_path` | TEXT | 云端目录 |
| `video_status` | TEXT | `delivered` / `missing` |
| `video_file_name` | TEXT NULL | 识别到的视频文件名 |
| `video_file_id` | TEXT NULL | PikPak 文件 ID |
| `video_verified_at` | TEXT NULL | 最近核验时间 |
| `danmaku_status` | TEXT | `pending` / `fresh` / `missing` / `error` |
| `danmaku_uploaded_at` | TEXT NULL | XML 上传时间 |
| `danmaku_checked_at` | TEXT NULL | XML 核验时间 |
| `xml_file_name` | TEXT NULL | XML 文件名 |
| `xml_file_id` | TEXT NULL | XML 文件 ID |
| `created_at` | TEXT | 创建时间 |
| `updated_at` | TEXT | 更新时间 |

### `danmaku_cache`

| 列名 | 类型 | 说明 |
|------|------|------|
| `id` | INTEGER PK | 主键 |
| `episode_id` | INTEGER | DanDanPlay episode ID |
| `anime_title` | TEXT | 番剧名 |
| `episode_title` | TEXT NULL | 集标题 |
| `pikpak_file_id` | TEXT NULL | 对应视频文件 ID |
| `xml_file_id` | TEXT NULL | 已上传的 XML 文件 ID |
| `downloaded_at` | TEXT | 下载时间 |

## 迁移管理

```bash
bun run db:generate
bun run db:migrate
```

迁移文件位于 `drizzle/`，应与代码一起提交。
