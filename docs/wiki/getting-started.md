# 快速开始

## 环境要求

- [Bun](https://bun.sh/) 1.x
- 一个可用的 PikPak 账号
- 可选：Bangumi Token、TMDB API Key、DanDanPlay API 凭证

## 安装

```bash
git clone <your-repo-url>
cd pikpak-auto-bangumi
bun install
```

## 配置

项目使用根目录的 `config.json`，该文件已被 `.gitignore` 排除。

最小配置示例：

```json
{
  "pikpak": {
    "username": "your@email.com",
    "password": "yourpassword",
    "cloudBasePath": "/ACGN/Bangumi"
  },
  "bangumi": {
    "token": ""
  },
  "tmdb": {
    "apiKey": "",
    "language": "zh-CN"
  },
  "dandanplay": {
    "enabled": false,
    "appId": "",
    "appSecret": ""
  }
}
```

说明：

- 不配置 `bangumi.token` 时，网页收藏看板无法读取 Bangumi 收藏
- 不配置 `tmdb.apiKey` 时，`advance` 重命名模式会回退到解析标题
- 不配置 `dandanplay` 时，视频下载和重命名仍然可以运行

## 启动方式

### 常规启动

```bash
bun run build:frontend
bun run start
```

或显式启动服务端入口：

```bash
bun run start:server
```

默认监听 `http://localhost:7810`，同一端口同时提供 REST API 和构建后的前端页面。

### 开发模式

```bash
# 终端 1
bun run dev

# 终端 2
bun run dev:frontend
```

### CLI 模式

```bash
bun run start:cli
```

CLI 模式会初始化配置、数据库和 PikPak 客户端，并直接启动 RSS 调度与任务轮询，适合无 Web UI 的运行场景。

## 导入 qBittorrent RSS 规则

如果你已经在 qBittorrent 里维护了 RSS 规则，可以直接导入：

```bash
bun run src/index.ts --mode cli import-qbit-rss-rules "F:/Anime/.../all_best.json"
```

也可以先打到数据库副本上做安全验证：

```bash
bun run src/index.ts --mode cli import-qbit-rss-rules \
  "F:/Anime/.../2026_SPRING/all_best.json" \
  "F:/Anime/.../2026_Winter/all_best.json" \
  --db-path "data/test-rss.db"
```

导入器行为：

- 自动从 Mikan 详情解析 `bangumiSubjectId` 和 `mikanBangumiId`
- 按 RSS URL 幂等更新已有源，不重复创建订阅
- 同步 include / exclude 规则
- 输出 JSON summary，包含 `created`、`updated`、`failed`、`duplicates`

如果服务端正在运行，CLI 导入完成后建议重启后端，或通过订阅/规则接口触发一次刷新，让内存中的调度器重新装载最新源列表。

## 通过网页界面订阅

1. 打开 `http://localhost:7810`
2. 在设置页写入 Bangumi Token 和其他可选配置
3. 在收藏看板中打开番剧详情抽屉
4. 选择一条订阅路径：
   - Mikan 字幕组订阅
   - 手动 RSS 订阅

详见 [网页界面与订阅流程](./web-ui.md)

## 推荐的第一轮验证

建议在完成配置后做以下检查：

1. 打开 `/api/health` 确认服务启动
2. 打开 Web UI，确认能进入设置页和收藏页
3. 先创建一个手动 RSS 订阅，再看 `GET /api/rss` 和 `GET /api/rules` 的结果
4. 如需导入 qBit 规则，优先使用 `--db-path` 在副本库验证一次

## PikPak 目录结构示例

默认会把视频和弹幕整理到如下路径：

```text
/ACGN/Bangumi/
  黑猫与魔女的教室 (2026)/
    Season 01/
      黑猫与魔女的教室 S01E01.mkv
      黑猫与魔女的教室 S01E01.xml
```
