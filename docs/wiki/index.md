# Pikpak Auto Bangumi 文档

自动追番工具，将 RSS 订阅、PikPak 离线下载、云端重命名、弹幕获取整合为一体。

## 目录

- [快速开始](./getting-started.md)
- [配置说明](./config.md)
- [架构设计](./architecture.md)
- [开发指南](./dev/index.md)
  - [数据库 Schema](./dev/database.md)
  - [API 接口](./dev/api.md)
  - [PikPak 集成](./dev/pikpak-integration.md)
  - [TMDB 集成](./dev/tmdb-integration.md)
  - [弹幕集成](./dev/danmaku-integration.md)

## 特性

| 功能 | 说明 |
|------|------|
| RSS 订阅 | 定时拉取 Mikan、DMHY、Nyaa 等站点 RSS |
| 正则过滤 | 按规则筛选剧集（字幕组、分辨率等） |
| PikPak 离线下载 | 提交 magnet/torrent 到 PikPak 云端下载 |
| 云端重命名 | 下载完成后自动重命名为标准格式 |
| TMDB 元数据 | 通过 TMDB 获取官方中文名称和首播年份 |
| 弹幕下载 | 从 DanDanPlay 获取弹幕 XML 并上传到云端 |
| REST API | ElysiaJS 提供完整的管理 API |
