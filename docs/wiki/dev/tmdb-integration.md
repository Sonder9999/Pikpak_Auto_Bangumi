# TMDB 集成

## 概述

在 `advance` 重命名模式下，通过 TMDB（The Movie Database）API 获取番剧的官方本地化标题和首播年份，用于生成文件名和文件夹名。

## 配置

```json
{
  "tmdb": {
    "apiKey": "your_api_key_here",
    "language": "zh-CN"
  }
}
```

申请 API Key：https://www.themoviedb.org/settings/api（免费）

## 工作原理

1. 从 torrent 标题中解析出番剧名（英文或罗马音）
2. 调用 TMDB `/search/tv` API，language 参数指定返回语言
3. 取第一个结果的 `name`（本地化名称）和 `first_air_date`（年份）
4. 用官方名称替换原始解析名，用于文件名和文件夹

## 缓存

同一个会话内，同一标题只会调用一次 TMDB API，结果缓存在内存中。

pipeline 在创建文件夹时调用一次，renamer 重命名时再次调用时会命中缓存，不产生额外请求。

## 示例

```
输入（torrent 名）：[LoliHouse] Kuroneko to Majo no Kyoushitsu - 01 [WebRip 1080p]
解析标题：Kuroneko to Majo no Kyoushitsu

TMDB 查询（zh-CN）：
  → officialTitle: 黑猫与魔女的教室
  → year: 2026

输出文件夹：黑猫与魔女的教室 (2026)/Season 01/
输出文件名：黑猫与魔女的教室 S01E01.mkv
```

## 降级处理

- 若未配置 `apiKey`：跳过 TMDB 查询，使用解析出的原始标题
- 若 TMDB 无搜索结果：使用解析出的原始标题，year 为 null（`{year}` 占位符自动移除括号）
- 若 TMDB API 请求失败（网络问题）：同上，记录警告日志

## 相关代码

- `src/core/tmdb/client.ts` — TMDB API 调用 + 内存缓存
- `src/core/tmdb/index.ts` — 导出接口
- `src/core/pipeline.ts` — 调用 `initTmdb()` 初始化，`advance` 模式查询
- `src/core/renamer/renamer.ts` — `buildRenamedName` 中查询 TMDB（命中缓存）
