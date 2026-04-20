# 架构设计

## 系统概览

```
RSS 订阅源 → RSS 调度器 → 过滤引擎 → PikPak 下载 → 任务轮询
                                                        ↓
                                               云端重命名 (TMDB)
                                                        ↓
                                               弹幕下载 (DanDanPlay)
                                                        ↓
                                               上传弹幕 XML 到 PikPak
```

## 目录结构

```
src/
├── core/
│   ├── config/         # 配置加载、Schema (Zod)、导入导出
│   ├── danmaku/        # DanDanPlay 客户端、XML 生成、下载服务
│   ├── db/             # Drizzle ORM Schema、数据库初始化
│   ├── filter/         # 正则过滤规则引擎
│   ├── logger.ts       # 模块化日志（带日志级别）
│   ├── parser/         # 番剧标题解析（从 torrent 名提取元数据）
│   ├── pikpak/         # PikPak API 客户端、认证、任务管理器
│   ├── pipeline.ts     # 核心流水线协调（RSS→下载→重命名→弹幕）
│   ├── renamer/        # 重命名模板渲染
│   ├── rss/            # RSS 拉取、解析、条目存储、调度器
│   └── tmdb/           # TMDB API 客户端（官方标题 + 年份）
├── server/
│   ├── index.ts        # ElysiaJS 服务器入口
│   └── routes/         # API 路由（rss, rules, config, tasks, danmaku）
├── cli/                # CLI 模式入口
└── index.ts            # 主入口（模式分发）
```

## 核心模块

### pipeline.ts

流水线的协调者，连接所有核心模块：

1. `initCore()` — 加载配置、初始化 DB、认证 PikPak、初始化 TMDB
2. `startPipeline()` — 注册 RSS 调度器、启动任务轮询、注册重命名/弹幕回调
3. `handleNewItems()` — 处理新 RSS 条目：过滤 → TMDB 查询 → 创建文件夹 → 提交下载

### PikPak 认证流程

```
启动时读取 data/pikpak_token.json
         ↓
  尝试 refresh token 刷新
         ↓
  失败 → WEB 模式账号密码登录 (SALTS 签名)
         ↓
  失败 → LIB 模式回退
```

### 文件夹结构创建

```
cloudBasePath (/ACGN/Bangumi)
└── folderPattern ({title} ({year})/Season {season})
    → 黑猫与魔女的教室 (2026)/Season 01/
```

使用 `ensurePath()` 逐层 find-or-create，避免重复创建。

### 重命名流程

```
任务轮询检测到 PHASE_TYPE_COMPLETE
      ↓
  rawParser 解析文件名（标题、季度、集数）
      ↓
  advance 模式: searchAnime(title) → TMDB 官方名 + 年份
      ↓
  renderTemplate("{title} S{season}E{episode}.{ext}")
      ↓
  PikPak file PATCH rename API
      ↓
  触发弹幕下载回调
```

### 弹幕下载流程

```
重命名成功后触发
      ↓
  DandanPlay /search/episodes → 匹配集数 ID
      ↓
  DandanPlay /comment/{episodeId} → 获取弹幕列表
      ↓
  生成 XML 文件（兼容 dandanplay 格式）
      ↓
  PikPak uploadSmallFile (Aliyun OSS)
      ↓
  上传到与视频相同目录
```

## 数据库 Schema

详见 [dev/database.md](./dev/database.md)

## API 接口

详见 [dev/api.md](./dev/api.md)
