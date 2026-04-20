# REST API 接口

服务器默认运行在 `http://localhost:7810`。

## RSS 订阅源管理

### 获取所有订阅源
```
GET /api/rss
```

### 添加订阅源
```
POST /api/rss
Content-Type: application/json

{
  "name": "黑猫与魔女的教室",
  "url": "https://mikanani.me/RSS/Bangumi?bangumiId=3928",
  "enabled": true,
  "pollIntervalMs": 300000
}
```

### 更新订阅源
```
PATCH /api/rss/:id
```

### 删除订阅源
```
DELETE /api/rss/:id
```

### 手动触发轮询
```
POST /api/rss/:id/poll
```

---

## 过滤规则管理

### 获取所有规则
```
GET /api/rules
```

### 添加规则
```
POST /api/rules
Content-Type: application/json

{
  "name": "LoliHouse 1080p",
  "pattern": "LoliHouse.*- 01 ",
  "type": "include",
  "sourceId": 1,
  "enabled": true
}
```

`type` 字段：`include`（白名单）或 `exclude`（黑名单）
`sourceId`：关联订阅源 ID，省略则为全局规则

### 更新/删除规则
```
PATCH /api/rules/:id
DELETE /api/rules/:id
```

---

## 配置管理

### 获取当前配置（敏感字段脱敏）
```
GET /api/config
```

### 更新配置
```
PATCH /api/config
Content-Type: application/json

{ "rename": { "method": "advance" } }
```

---

## 下载任务

### 获取所有任务
```
GET /api/tasks
```

### 获取任务详情
```
GET /api/tasks/:id
```

---

## 弹幕

### 手动触发弹幕下载
```
POST /api/danmaku/download
Content-Type: application/json

{
  "animeTitle": "黑猫与魔女的教室",
  "episodeNumber": 1,
  "pikpakFileId": "file_id",
  "parentFolderId": "folder_id",
  "videoFileName": "黑猫与魔女的教室 S01E01.mkv"
}
```

### 获取弹幕记录
```
GET /api/danmaku
```
