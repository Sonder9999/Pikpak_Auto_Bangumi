# 架构设计

## 系统概览

```text
Bangumi 收藏 / 手动 RSS / qBit JSON
              ↓
        rss_sources + filter_rules
              ↓
         RSS scheduler / replay
              ↓
     rss_items（pending / filtered / ...）
              ↓
       PikPak offline download tasks
              ↓
         云端重命名 / 元数据补全
              ↓
      episode_delivery_state 去重核验
              ↓
       DanDanPlay XML 下载与补传
```

## 关键设计原则

### 1. `rss_sources` 才是订阅实体

项目没有单独的 `subscriptions` 表。前端的“订阅”动作最终都会落到：

- `rss_sources`：订阅源本体
- `filter_rules`：include / exclude 规则

### 2. Bangumi 和 Mikan 是两套 ID

当前实现明确区分：

- `bangumiSubjectId`：Bangumi.tv `subject` 主键
- `mikanBangumiId`：Mikan 条目主键

其中：

- Bangumi 元数据查询、收藏对齐、已订阅状态都只认 `bangumiSubjectId`
- Mikan 搜索、Mikan 详情和 qBit 规则导入保留 `mikanBangumiId`
- Mikan RSS URL 仍然保留 `bangumiId=...` 参数，但这是 Mikan 命名空间，不可直接拿去查询 Bangumi subject

### 3. 历史回放是正式运行链路的一部分

当订阅或规则发生变化时，系统会把之前 `filtered` 的 `rss_items` 重新置回 `pending`，并重新走一次过滤与提交流程，而不是只处理未来新条目。

## 目录结构

```text
frontend/
└── src/
    ├── api/              # 前端请求封装
    ├── components/       # 收藏看板、详情抽屉、设置页等
    └── subscription-helpers.ts

src/
├── cli/
│   ├── index.ts
│   └── qbit-rule-import-command.ts
├── core/
│   ├── bangumi/          # Bangumi 客户端与 subject 查询
│   ├── config/           # Zod schema、导入导出、持久化
│   ├── danmaku/          # DanDanPlay 集成与 XML 处理
│   ├── db/               # Drizzle schema、SQLite 连接
│   ├── episode-state/    # 交付状态去重与云端核验
│   ├── filter/           # 规则 CRUD 与 title matcher
│   ├── mikan/            # 搜索、详情抓取、Mikan→Bangumi 解析
│   ├── parser/           # 原始标题解析
│   ├── pikpak/           # 认证、离线下载、任务轮询
│   ├── renamer/          # 重命名模板和 Bangumi/TMDB 元数据合并
│   ├── rss/              # 源管理、拉取、去重、历史回放、qBit 导入
│   ├── tmdb/             # TMDB 标题补全
│   ├── logger.ts
│   └── pipeline.ts       # 核心协调者
├── server/
│   ├── index.ts
│   ├── main.ts
│   ├── frontend-assets.ts
│   ├── middleware/
│   └── routes/
└── index.ts              # server/cli 模式分发入口
```

## 两种运行模式

### Server 模式

`src/server/main.ts` 启动 Elysia API，并通过 `@elysiajs/static` 直接托管 `frontend/dist`。

### CLI 模式

`src/index.ts --mode cli` 默认启动后台流水线，也支持 `import-qbit-rss-rules` 子命令进行批量导入。

## 核心数据流

### Web UI 订阅流

```text
CollectionBoard
  ├─ GET /api/config
  ├─ GET /api/rss
  └─ GET /api/bangumi/collections

BangumiDetailDrawer
  ├─ GET /api/mikan/search
  ├─ GET /api/mikan/bangumi-detail/:id
  ├─ POST /api/subscriptions/preview-rss
  └─ POST /api/subscriptions
```

### 新条目处理流

```text
RSS 拉取
  → rss_items 去重入库
  → filter_rules 匹配
  → duplicate / filtered / submitted 状态落库
  → PikPak 提交离线下载
  → 任务轮询
  → 重命名
  → 弹幕下载与上传
```

### 历史回放与交付状态流

```text
订阅更新 / 规则更新
  → 过滤态条目重新置为 pending
  → replayStoredItems
  → 查询 episode_delivery_state
  → 对照 PikPak 当前目录
  → 决定 duplicate / submitted
```

## 元数据来源优先级

在 `advance` 重命名模式下：

1. 如果 source 已绑定 `bangumiSubjectId`，优先使用 Bangumi subject 标题与年份
2. 如果没有可用 `bangumiSubjectId`，回退到 TMDB 搜索
3. 如果 TMDB 也没有结果，则使用解析出的原始标题

这使得 Mikan-only source 不会把 Mikan ID 错当成 Bangumi subject 去查询。

### 权威季号与集号解析

当 source 已绑定 `bangumiSubjectId` 时，运行时会先生成一份 canonical season/episode 结果，并把它复用于同一条链路上的所有消费者：

1. 先用原始标题解析基础季号与集号，支持 `Sxx`、裸续作数字、`2nd Season` 这类英文序数季名，以及中文 `第X季`
2. 如果绑定的 Bangumi subject 自身已经带季号信息，则以它覆盖原始标题里的冲突季号
3. 如果当前条目存在可靠的单前传链，且前传集数明确，则会把累计集号归一成当前季内集号
4. 如果 Bangumi 上下文不完整、前传链不唯一，或者缺少可信的集数信息，则保守回退到原始标题解析结果，不做猜测性改写

这份 canonical 结果会同时驱动：

- 重命名模板中的 `SxxEyy`
- `Season xx` 文件夹规划
- `episode_delivery_state` 的重复判定键
- 重命名后触发的弹幕季号输入

因此，绑定了正确的 Bangumi subject 之后，同一季不会再因为不同标题格式被拆进多个 `Season xx` 目录，重复判定也不会再把同一集识别成不同季。

## Season Resolution 变更流程

涉及季号解析的变更必须保持 test-first：

1. 先补样例矩阵，至少覆盖 `Sxx`、裸续作数字、英文序数季名、累计集号
2. 先把 focused parser、renamer、pipeline 回归跑通，再开始改实现
3. 实现后回跑同一组 focused suite；如果还要扩行为，再补相邻测试后继续回归
4. 能做安全 replay 或 copied-db 验证时，再补一轮真实链路确认，避免只在单元测试里成立

## qBit 导入器在整体架构中的位置

qBit 导入器属于“离线批量建模”能力：

- 输入：qBittorrent 导出的 RSS 规则 JSON
- 解析：提取 RSS URL、开关状态、mustContain、mustNotContain
- 归一化：调用 Mikan 解析器得到 `bangumiSubjectId` 和 `mikanBangumiId`
- 输出：幂等更新 `rss_sources` 与 `filter_rules`

详见 [运行时与 qBit 导入](./dev/runtime-and-imports.md)
