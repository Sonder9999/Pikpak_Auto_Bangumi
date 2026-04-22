# 运行时与 qBit 导入

本文档覆盖三类经常被漏写、但对排障和运维最重要的能力：

1. 后台运行模式
2. 历史回放与交付状态去重
3. qBittorrent RSS 规则 JSON 导入

## 运行模式

### Server 模式

```bash
bun run start
```

特点：

- 暴露 REST API
- 托管前端页面
- 启动 RSS 调度器、PikPak 任务轮询、重命名和弹幕回调

### CLI 模式

```bash
bun run start:cli
```

特点：

- 不提供 Web UI
- 直接启动后台流水线
- 适合无浏览器场景或纯终端部署

### qBit 导入子命令

```bash
bun run src/index.ts --mode cli import-qbit-rss-rules <json...> [--db-path <copy.db>]
```

## RSS 调度与 replay

### 实时调度

`startScheduler()` 会：

- 读取所有启用的 `rss_sources`
- 立即执行一次拉取
- 再按 `poll_interval_ms` 建立定时器

### replay 触发时机

以下动作会触发历史回放：

- 新建订阅
- 更新订阅
- 新建规则
- 更新规则
- 删除规则
- 启动时恢复
- PikPak 认证恢复后

### replay 状态语义

`rss_items.replay_status` 取值：

| 状态 | 含义 |
|------|------|
| `pending` | 等待 replay 或实时处理 |
| `filtered` | 被规则过滤掉 |
| `submitted` | 已提交 PikPak |
| `duplicate` | 已判定与云端或本地任务重复 |
| `error` | 处理失败，可再次 replay |

### 重新入队规则

当前实现只会把 `filtered` 条目重新置回 `pending`。这保证了：

- 已提交或已判重的历史条目不会被无脑重推
- 规则变更只重放“过去因为规则而没进队”的条目

## 交付状态去重

`episode_delivery_state` 是避免重复下载的核心表。

在 replay / 实时提交前，系统会：

1. 根据解析结果构造集级 identity
2. 查询 `episode_delivery_state`
3. 读取 PikPak 目标目录当前文件列表
4. 优先用精确文件名匹配
5. 匹配不到时，再用同番同季同集的原始名回退判断

结果可能是：

- 仍然视为已交付，标记 `duplicate`
- 云端状态漂移，重置为 `missing` 并重新提交

## DanDanPlay XML 刷新

Danmaku 并不是“传过一次就永久跳过”。当前逻辑会结合：

- `episode_delivery_state.danmaku_status`
- `dandanplay.refreshIntervalDays`

来决定：

- 继续沿用现有 XML
- 删除旧 XML 并重新下载上传
- 标记缺失或错误，等待后续重试

## qBit JSON 导入器

### 输入来源

导入器直接读取 qBittorrent RSS 规则导出的 JSON。每个条目主要使用：

- `affectedFeeds[0]`
- `enabled`
- `mustContain`
- `mustNotContain`

### 导入流程

```text
读取 JSON
  → 提取 RSS URL 与规则
  → 解析 Mikan identity
  → 选择要更新的 rss_source
  → 同步 include / exclude 规则
  → 输出 summary
```

### 幂等策略

导入器按 RSS URL 查找已有源：

- 没有匹配时创建 source
- 有一个匹配时更新该 source
- 有多个匹配时优先保留 Bangumi / Mikan 双 ID 都正确的 source
- 其余命中只记为 warning，不会自动删除

summary 字段：

- `created`
- `updated`
- `skipped`
- `failed`
- `duplicates`

### 安全验证方式

推荐先在数据库副本上运行：

```bash
bun run src/index.ts --mode cli import-qbit-rss-rules \
  "F:/Anime/.../2026_SPRING/all_best.json" \
  "F:/Anime/.../2026_Winter/all_best.json" \
  --db-path "data/test-rss.db"
```

### 生产库导入后的注意事项

CLI 导入直接修改数据库，不会通知已运行中的服务进程刷新内存态调度器。

因此如果服务正在运行，导入后建议：

1. 重启服务
2. 或通过订阅 / 规则接口触发一次服务内刷新

## 排障建议

### 订阅成功但不开始轮询

优先检查：

- 导入是不是通过独立 CLI 进程完成
- 服务是否重启
- `rss_sources.enabled` 是否为 `true`

### 同一集重复推送

优先检查：

- `episode_delivery_state` 是否缺失对应记录
- 目标目录里的文件名是否发生漂移
- `rawParser` 是否正确解析出季和集

### Bangumi 绑定错位

优先检查：

- `rss_sources.bangumi_subject_id` 是否真的是 Bangumi subject
- `rss_sources.mikan_bangumi_id` 是否与 RSS URL 中的 Mikan ID 一致
- 前端或导入器是否仍在发送旧字段 `bangumiId` / `mikanId`