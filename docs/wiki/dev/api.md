# REST API 接口

服务器默认运行在 `http://localhost:7810`。

本文档重点覆盖当前 Web UI 会直接依赖的接口，以及这次新增或调整过的接口行为。

## 健康检查

```http
GET /api/health
```

---

## Bangumi 收藏与详情

### 获取收藏列表（支持分页）

```http
GET /api/bangumi/collections?type=3&offset=0&limit=30
```

查询参数：

| 参数 | 类型 | 说明 |
|------|------|------|
| `type` | string，可选 | Bangumi 收藏类型；当前常用值为 `1`（想看）、`2`（看过）、`3`（在看） |
| `offset` | string，可选 | 从第几条开始，默认 `0` |
| `limit` | string，可选 | 单页数量，默认 `30`，服务端上限 `100` |

返回示例：

```json
{
  "data": [
    {
      "subject": {
        "id": 576351,
        "name": "Kuroneko to Majo no Kyoushitsu",
        "nameCn": "黑猫与魔女的教室"
      }
    }
  ],
  "total": 86,
  "limit": 30,
  "offset": 0
}
```

说明：

- 前端收藏分页直接依赖这个接口
- 当 Bangumi Token 未配置或失效时，会返回 `401`

### 获取单个 Bangumi 条目

```http
GET /api/bangumi/subjects/:id
```

---

## Mikan 搜索与详情

### 搜索 Mikan 条目

```http
GET /api/mikan/search?q=黑猫与魔女的教室
```

### 获取 Mikan 番剧详情

兼容路径：

```http
GET /api/mikan/bangumi/:id
GET /api/mikan/bangumi-detail/:id
```

当前前端使用的是 `bangumi-detail` 路径。

返回重点字段：

```json
{
  "mikanId": 3928,
  "title": "黑猫与魔女的教室",
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

- 服务端会把旧格式的 `latestEpisodeTitle/latestUpdatedAt` 自动归一化成 `episodes[]`
- 响应头带 `Cache-Control: no-store`，用于降低前端拿到旧资源列表的概率

---

## 高层订阅接口

### 创建或更新订阅

```http
POST /api/subscriptions
Content-Type: application/json
```

这个接口不是简单地新增一条 RSS 源，而是“按前端订阅动作”统一处理：

- 创建或更新 RSS 源
- 同步 include / exclude 规则
- 兼容字幕组订阅与手动 RSS 订阅两种路径

### 字幕组订阅示例

```json
{
  "bangumiId": 576351,
  "mikanId": "3928",
  "subgroupName": "LoliHouse",
  "rssUrl": "https://mikanani.me/RSS/Bangumi?bangumiId=3928&subgroupid=370",
  "regexInclude": "1080p",
  "regexExclude": "720p",
  "episodeOffset": 0
}
```

### 手动 RSS 订阅示例

```json
{
  "bangumiId": 576351,
  "mikanId": null,
  "rssUrl": "https://example.com/manual.xml",
  "regexInclude": "1080p",
  "regexExclude": "720p"
}
```

### 手动 RSS 更新示例

```json
{
  "bangumiId": 576351,
  "mikanId": null,
  "sourceId": 12,
  "rssUrl": "https://example.com/manual-updated.xml",
  "regexInclude": "2160p"
}
```

返回示例：

```json
{
  "success": true,
  "updated": true,
  "source": {
    "id": 12,
    "name": "Manual RSS - 576351",
    "url": "https://example.com/manual-updated.xml"
  }
}
```

说明：

- 当 `mikanId` 和 `subgroupName` 存在时，会创建字幕组命名的订阅源
- 当 `mikanId` 为 `null` 时，会走手动 RSS 路径，源名称格式为 `Manual RSS - {bangumiId}`
- 如果传入 `sourceId`，接口会尝试更新已有源，而不是重复创建

---

## RSS 源管理

`/api/rss` 是低层 CRUD 接口，前端目前主要用它来读取已有订阅源、计算“已订阅”状态，以及回填手动 RSS。

### 获取所有 RSS 源

```http
GET /api/rss
```

### 添加 RSS 源

```http
POST /api/rss
Content-Type: application/json

{
  "name": "黑猫与魔女的教室",
  "url": "https://mikanani.me/RSS/Bangumi?bangumiId=3928",
  "enabled": true,
  "pollIntervalMs": 300000,
  "bangumiSubjectId": 576351
}
```

### 更新 / 删除 RSS 源

```http
PATCH /api/rss/:id
DELETE /api/rss/:id
```

---

## 过滤规则管理

### 获取所有规则

```http
GET /api/rules
```

### 创建规则

```http
POST /api/rules
Content-Type: application/json

{
  "name": "LoliHouse 1080p",
  "pattern": "LoliHouse.*1080p",
  "mode": "include",
  "sourceId": 1,
  "enabled": true
}
```

说明：

- `mode` 取值为 `include` 或 `exclude`
- `sourceId` 为空时表示全局规则
- 手动 RSS 回填功能会通过 `GET /api/rules` 查找对应源上的 include / exclude 规则

### 更新 / 删除规则

```http
PATCH /api/rules/:id
DELETE /api/rules/:id
```

---

## 配置管理

### 获取当前配置

```http
GET /api/config
```

### 更新配置

```http
PATCH /api/config
Content-Type: application/json

{
  "rename": { "method": "advance" }
}
```

---

## 下载任务与弹幕

### 获取任务

```http
GET /api/tasks
GET /api/tasks/:id
```

### 弹幕下载

```http
POST /api/danmaku/download
GET /api/danmaku
```
