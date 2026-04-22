# 网页界面与订阅流程

本文档说明当前 Web UI 的页面结构、交互流程，以及与后端订阅模型的真实对应关系。

## 页面概览

当前网页端围绕两个核心组件展开：

- `CollectionBoard.vue`：Bangumi 收藏列表、分页、已订阅视图、抽屉入口
- `BangumiDetailDrawer.vue`：番剧详情、Mikan 搜索、字幕组订阅、手动 RSS、预览匹配结果

前端构建产物由后端直接托管，因此常规运行时使用同一个端口访问 API 与页面。

## 收藏看板

### 顶部 Tab

收藏看板当前包含：

| Tab | 含义 | 数据来源 |
|------|------|----------|
| 想看 | Bangumi 收藏类型 `1` | `GET /api/bangumi/collections` |
| 在看 | Bangumi 收藏类型 `3` | 同上 |
| 看过 | Bangumi 收藏类型 `2` | 同上 |
| 已订阅 | 本地订阅与 Bangumi 收藏的交集 | `GET /api/rss` + 收藏列表 |

### 已订阅状态判定

当前前端只根据 `bangumiSubjectId` 判定“这部番是否已订阅”。

这点很重要：

- 不再从旧字段 `bangumiId` 回退
- 不再把 Mikan ID 当成 Bangumi subject 使用
- 收藏卡片和“已订阅”页都依赖同一套 `bangumiSubjectId` 交集逻辑

### 分页行为

- 每页默认 30 条
- 页码、前后翻页、首尾禁用都在前端处理
- 切换 Tab 会回到第 1 页
- “已订阅”视图强调结果集，不使用收藏分页逻辑

## 番剧详情抽屉

抽屉左侧展示基础元信息，右侧负责订阅动作。

右侧有两条主路径：

1. Mikan 字幕组订阅
2. 手动 RSS 订阅

## Mikan 字幕组订阅

### 数据流

```text
打开抽屉
	→ GET /api/mikan/search?q=
	→ GET /api/mikan/bangumi-detail/:id
	→ 选择字幕组与规则
	→ POST /api/subscriptions
```

### 当前返回结构

服务端会把 Mikan 详情归一化为稳定结构，前端主要消费：

- `mikanId`
- `title`
- `bangumiSubjectId`
- `subgroups[]`
	- `id`
	- `name`
	- `rssUrl`
	- `episodes[]`

这意味着前端不需要再兼容“旧字段只有 latestEpisodeTitle，没有 episodes[]”的情况。

### 提交给后端的显式字段

Mikan 订阅提交时，前端会显式发送：

```json
{
	"bangumiSubjectId": 576351,
	"mikanBangumiId": 3928,
	"subgroupName": "LoliHouse",
	"rssUrl": "https://mikanani.me/RSS/Bangumi?bangumiId=3928&subgroupid=370"
}
```

后端随后会再次根据 RSS URL / Mikan ID 做身份解析，避免 UI 传错绑定关系。

## 手动 RSS 订阅

### 输入项

手动 RSS 区块当前支持：

- RSS URL
- include 规则
- exclude 规则

### 手动订阅的身份规则

手动 RSS 不会带 `mikanBangumiId`，而是明确发送：

```json
{
	"bangumiSubjectId": 576351,
	"mikanBangumiId": null,
	"rssUrl": "https://example.com/feed.xml"
}
```

对应的 RSS source 名称格式为：

```text
Manual RSS - 576351
```

### 回填与更新

- 打开抽屉时，前端会读取 `GET /api/rss` 与 `GET /api/rules`
- 如果已存在当前番剧的手动源，会回填 URL 和规则
- 更新时会带 `sourceId`，后端复用现有 source，而不是重复创建

## 规则输入语义

当前 UI 不要求用户必须写 regex。规则有两种模式：

- 普通词项模式：按空格、`&`、`&&` 分词，要求标题同时包含所有词
- regex 模式：当输入中包含 `|`、`.*`、`^`、`$`、反斜杠、量词，或者使用 `/.../flags` 字面量时，按正则处理

这同样适用于 `preview-rss` 的预览匹配结果。

## 订阅成功后的副作用

`POST /api/subscriptions` 成功后，后端会：

- 创建或更新 `rss_sources`
- 同步 include / exclude 规则
- 重新装载调度器
- 把相关 `filtered` 历史条目重新加入 replay 队列

前端随后会：

- 关闭抽屉
- 刷新收藏看板
- 更新卡片上的已订阅状态

## 当前 UI 已覆盖的关键能力

- 收藏分页浏览
- 已订阅交集视图
- Mikan 搜索与字幕组选择
- 手动 RSS 保存、回填、更新
- `preview-rss` 匹配预览
- 仅按 `bangumiSubjectId` 计算订阅态