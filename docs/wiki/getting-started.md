# 快速开始

## 环境要求

- [Bun](https://bun.sh/) >= 1.0
- PikPak 账号

## 安装

```bash
git clone https://github.com/your-repo/pikpak-auto-bangumi
cd pikpak-auto-bangumi
bun install
```

## 配置

在项目根目录手动创建 `config.json`，并填写必要字段：

最小配置示例（`config.json`）：

```json
{
  "pikpak": {
    "username": "your@email.com",
    "password": "yourpassword",
    "cloudBasePath": "/ACGN/Bangumi"
  },
  "tmdb": {
    "apiKey": "your_tmdb_api_key",
    "language": "zh-CN"
  },
  "dandanplay": {
    "enabled": true,
    "appId": "your_app_id",
    "appSecret": "your_app_secret"
  }
}
```

> **注意**：`config.json` 包含敏感信息，已被 `.gitignore` 排除，不会提交到版本控制。

## 启动

### 常规启动（推荐）

先构建前端，再启动服务端：

```bash
bun run build:frontend
bun run start
```

或显式启动服务端入口：

```bash
bun run start:server
```

服务器在 `http://localhost:7810` 启动，同时提供 REST API 和构建后的网页界面。

### 开发模式

如果需要同时调试后端和前端界面，建议使用两个终端：

```bash
# 终端 1：后端监听
bun run dev

# 终端 2：前端 Vite 开发服务器
bun run dev:frontend
```

说明：

- `bun run dev` 使用 `src/server/main.ts` 作为当前服务端入口
- `bun run dev:frontend` 会启动 Vite，并把 `/api` 请求代理到 `http://localhost:7810`

### CLI 模式

```bash
bun run start:cli
```

直接在终端运行，适合简单场景或调试。

## 通过网页界面订阅番剧

现在除了直接调用 API，也可以通过 Web UI 完成收藏浏览和订阅：

1. 打开 `http://localhost:7810`
2. 配置 Bangumi Token
3. 在收藏看板中点击番剧卡片
4. 在详情抽屉中选择：
  - Mikan 字幕组订阅
  - 或手动输入 RSS 订阅

详见 [网页界面与订阅流程](./web-ui.md)

## 添加 RSS 订阅

```bash
curl -X POST http://localhost:7810/api/rss \
  -H "Content-Type: application/json" \
  -d '{"name":"黑猫与魔女的教室","url":"https://mikanani.me/RSS/Bangumi?bangumiId=3928","enabled":true}'
```

## 添加过滤规则

```bash
curl -X POST http://localhost:7810/api/rules \
  -H "Content-Type: application/json" \
  -d '{"name":"LoliHouse 1080p","pattern":"LoliHouse.*- 01 ","mode":"include","sourceId":1}'
```

## 目录结构

下载完成后，文件会按以下结构存储在 PikPak 云端：

```
/ACGN/Bangumi/
  黑猫与魔女的教室 (2026)/
    Season 01/
      黑猫与魔女的教室 S01E01.mkv
      黑猫与魔女的教室 S01E01.xml   ← 弹幕文件
```
