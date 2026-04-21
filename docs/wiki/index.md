# Pikpak Auto Bangumi 文档

自动追番工具，将 RSS 订阅、PikPak 离线下载、云端重命名、弹幕获取整合为一体。

## 目录

- [快速开始](./getting-started.md)
- [网页界面与订阅流程](./web-ui.md)
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
| Bangumi 收藏同步 | 读取想看、在看、看过等收藏状态，并支持分页加载 |
| 网页收藏看板 | 通过 Web UI 浏览收藏、查看订阅状态、打开详情抽屉 |
| RSS 订阅 | 定时拉取 Mikan、DMHY、Nyaa 等站点 RSS |
| Mikan 辅助订阅 | 在详情抽屉中搜索 Mikan 条目、选择字幕组并查看最近资源 |
| 手动 RSS 订阅 | 无需依赖字幕组检索结果，也可直接录入 RSS 地址并附带过滤规则 |
| 已订阅视图 | 按本地 RSS 源与 Bangumi 收藏交集展示已订阅番剧 |
| 正则过滤 | 按规则筛选剧集（字幕组、分辨率等） |
| PikPak 离线下载 | 提交 magnet/torrent 到 PikPak 云端下载 |
| 云端重命名 | 下载完成后自动重命名为标准格式 |
| TMDB 元数据 | 通过 TMDB 获取官方中文名称和首播年份 |
| 弹幕下载 | 从 DanDanPlay 获取弹幕 XML 并上传到云端 |
| REST API | ElysiaJS 提供完整的管理 API |
