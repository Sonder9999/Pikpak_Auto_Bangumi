# REST API 接口

默认服务地址为 `http://localhost:7810`。

本文档只记录当前实现仍然存在、且前端或运维会直接依赖的接口行为。

## 健康检查

```http
GET /api/health
```

## Bangumi 相关

### 获取收藏列表

```http
GET /api/bangumi/collections?type=3&offset=0&limit=30
```

常用查询参数：

| 参数 | 说明 |
|------|------|
| `type` | 收藏类型，常用值：`1` 想看、`2` 看过、`3` 在看 |
| `offset` | 分页偏移 |
| `limit` | 分页大小，前端默认 `30` |

### 获取单个 subject

```http
GET /api/bangumi/subjects/:id
```

这里的 `:id` 必须是 Bangumi subject ID，不是 Mikan ID。

## Mikan 相关

### 搜索条目

```http
GET /api/mikan/search?q=黑猫与魔女的教室
```

### 获取番剧详情

兼容两条路径：

```http
GET /api/mikan/bangumi/:id
GET /api/mikan/bangumi-detail/:id
```

返回重点字段：

```json
{
  "mikanId": 3928,
  "title": "黑猫与魔女的教室",
  "bangumiSubjectId": 576351,
  "bangumiTvUrl": "https://bgm.tv/subject/576351",
  "subgroups": [
    {
      "id": 370,
      "name": "LoliHouse",
      "rssUrl": "https://mikanani.me/RSS/Bangumi?bangumiId=3928&subgroupid=370",
      "episodes": [
        {
          "title": "[LoliHouse] ...",
          "size": "700.55 MB",
          "updatedAt": "2026/04/20 01:50",
          "magnet": "magnet:?xt=..."
        }
      ]
    }
  ]
}
```

说明：

- 服务端会把旧结构统一归一化为 `episodes[]`
- 返回 `bangumiSubjectId`，供前端和导入器显式区分两套 ID

## 高层订阅接口

### 创建或更新订阅

```http
POST /api/subscriptions
Content-Type: application/json
```

这个接口会同时处理：

- 创建或更新 `rss_sources`
- 同步 include / exclude 规则
- 刷新调度器
- 重新触发相关历史条目的 replay

### 推荐的 Mikan 订阅载荷

```json
{
  "bangumiSubjectId": 576351,
  "mikanBangumiId": 3928,
  "subgroupName": "LoliHouse",
  "rssUrl": "https://mikanani.me/RSS/Bangumi?bangumiId=3928&subgroupid=370",
  "regexInclude": "1080p",
  "regexExclude": "720p"
}
```

### 推荐的手动 RSS 订阅载荷

```json
{
  "bangumiSubjectId": 576351,
  "mikanBangumiId": null,
  "rssUrl": "https://example.com/manual.xml",
  "regexInclude": "1080p",
  "regexExclude": "720p"
}
```

### 更新已有订阅

```json
{
  "sourceId": 12,
  "bangumiSubjectId": 576351,
  "mikanBangumiId": null,
  "rssUrl": "https://example.com/manual-updated.xml",
  "regexInclude": "2160p"
}
```

### 兼容字段

当前后端仍接受旧字段：

- `bangumiId`
- `mikanId`

但它们只用于兼容旧客户端，新的调用方应始终发送：

- `bangumiSubjectId`
- `mikanBangumiId`

### 订阅预览接口

```http
POST /api/subscriptions/preview-rss
Content-Type: application/json
```

请求体示例：

```json
{
  "url": "https://example.com/feed.xml",
  "regexInclude": "LoliHouse 1080p",
  "regexExclude": "720p"
}
```

返回包含：

- `matched`
- `matchedGroups`
- `excluded`

## 低层 RSS 源接口

### 获取源列表

```http
GET /api/rss
GET /api/rss/:id
```

### 创建源

```http
POST /api/rss
Content-Type: application/json

{
  "name": "Manual RSS - 576351",
  "url": "https://example.com/feed.xml",
  "enabled": true,
  "pollIntervalMs": 300000,
  "bangumiSubjectId": 576351,
  "mikanBangumiId": null
}
```

### 更新或删除源

```http
PATCH /api/rss/:id
DELETE /api/rss/:id
```

## 过滤规则接口

### 获取规则

```http
GET /api/rules
GET /api/rules/:id
```

### 创建规则

```http
POST /api/rules
Content-Type: application/json

{
  "name": "LoliHouse 1080p",
  "pattern": "LoliHouse 1080p",
  "mode": "include",
  "sourceId": 1,
  "enabled": true
}
```

规则语义：

- `mode` 为 `include` 或 `exclude`
- `sourceId` 为空时表示全局规则
- 新建、更新、删除规则都会重新触发历史 replay

### 更新或删除规则

```http
PATCH /api/rules/:id
DELETE /api/rules/:id
```

## 配置接口

```http
GET /api/config
PATCH /api/config
POST /api/config/export
POST /api/config/import
```

`PATCH /api/config` 和 `POST /api/config/import` 会在服务端重新初始化 Bangumi 和 TMDB 客户端。

## 任务接口

```http
GET /api/tasks
GET /api/tasks?status=renamed
```

当前只提供列表接口，没有 `GET /api/tasks/:id`。
