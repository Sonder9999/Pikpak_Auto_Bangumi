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

复制配置模板并填写必要字段：

```bash
cp config.example.json config.json
```

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

### Server 模式（推荐）

```bash
bun run src/index.ts
```

服务器在 `http://localhost:7810` 启动，通过 REST API 管理 RSS 订阅和过滤规则。

### CLI 模式

```bash
bun run src/index.ts --mode cli
```

直接在终端运行，适合简单场景或调试。

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
  -d '{"name":"LoliHouse 1080p","pattern":"LoliHouse.*- 01 ","type":"include","sourceId":1}'
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
