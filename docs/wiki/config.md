# 配置说明

配置文件为项目根目录的 `config.json`（不提交到版本控制）。

## 完整配置结构

```json
{
  "general": { ... },
  "pikpak": { ... },
  "rss": { ... },
  "rename": { ... },
  "dandanplay": { ... },
  "tmdb": { ... }
}
```

---

## `general` — 通用设置

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `mode` | `"server"` \| `"cli"` | `"server"` | 运行模式 |
| `port` | number | `7810` | HTTP 服务端口 |
| `dbPath` | string | `"data/pikpak-bangumi.db"` | SQLite 数据库路径 |
| `logLevel` | `"DEBUG"` \| `"INFO"` \| `"WARN"` \| `"ERROR"` | `"INFO"` | 日志级别 |
| `jwtSecret` | string | `""` | JWT 签名密钥（留空则禁用认证） |

---

## `pikpak` — PikPak 设置

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `username` | string | `""` | PikPak 账号邮箱 |
| `password` | string | `""` | PikPak 账号密码 |
| `cloudBasePath` | string | `"/Anime"` | 云端根目录路径 |
| `preferWebMode` | boolean | `true` | 优先使用 WEB 模式认证 |
| `refreshToken` | string | `""` | 手动指定 refresh token（可选） |
| `deviceId` | string | `""` | 设备 ID（可选，留空自动生成） |
| `tokenCachePath` | string | `"data/pikpak_token.json"` | token 缓存文件路径 |

---

## `rss` — RSS 订阅设置

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `defaultPollIntervalMs` | number | `300000` | 轮询间隔（毫秒），默认 5 分钟 |
| `requestTimeoutMs` | number | `30000` | 请求超时（毫秒） |
| `maxConsecutiveFailures` | number | `10` | 最大连续失败次数 |

---

## `rename` — 重命名设置

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `enabled` | boolean | `true` | 是否启用自动重命名 |
| `method` | `"pn"` \| `"advance"` \| `"none"` | `"advance"` | 重命名方式 |
| `template` | string | `"{title} S{season}E{episode}.{ext}"` | 文件名模板 |
| `folderPattern` | string | `"{title} ({year})/Season {season}"` | 子文件夹结构模板 |
| `maxRetries` | number | `3` | 重命名失败最大重试次数 |
| `retryBaseDelayMs` | number | `1000` | 重试基础延迟（毫秒） |

### 重命名方式

- **`advance`**（推荐）：通过 TMDB 获取官方中文名称和首播年份，用于文件名和文件夹
- **`pn`**：使用从 torrent 标题解析出的番剧名，不调用 TMDB
- **`none`**：不重命名，保留原始文件名

### 模板变量

| 变量 | 说明 | 示例 |
|------|------|------|
| `{title}` | 番剧标题（advance 模式为 TMDB 官方名） | `黑猫与魔女的教室` |
| `{season}` | 季度，两位补零 | `01` |
| `{episode}` | 集数，两位补零 | `05` |
| `{year}` | 首播年份（advance 模式从 TMDB 获取） | `2026` |
| `{ext}` | 文件扩展名 | `mkv` |

---

## `dandanplay` — 弹幕设置

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `enabled` | boolean | `false` | 是否启用弹幕自动下载 |
| `appId` | string | `""` | DanDanPlay API appId |
| `appSecret` | string | `""` | DanDanPlay API appSecret |
| `chConvert` | `0` \| `1` \| `2` | `1` | 繁简转换（0=不转，1=转简体，2=转繁体） |
| `refreshIntervalDays` | number | `7` | 已有 XML 视为过期前的天数 |

> 申请 DanDanPlay API：https://www.dandanplay.com/

---

## `bangumi` — Bangumi 设置

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `token` | string | `""` | Bangumi API Token，用于收藏看板和 subject 详情查询 |

说明：

- `CollectionBoard` 读取收藏列表依赖该 token
- `advance` 重命名模式在源已绑定 `bangumiSubjectId` 时会用它读取官方标题、年份和权威季号上下文
- 如果 Bangumi subject 具备明确季号，或存在可靠的单前传链与已知集数，运行时会据此修正 `SxxEyy`、`Season xx` 文件夹和重复判定
- 如果没有 token，或 Bangumi 上下文不完整，运行时会保守回退到原始标题解析；TMDB 只补标题与年份，不负责权威季号覆盖

---

## `tmdb` — TMDB 元数据设置

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `apiKey` | string | `""` | TMDB API Key |
| `language` | string | `"zh-CN"` | 返回标题的语言 |

> 申请 TMDB API Key：https://www.themoviedb.org/settings/api
>
> 支持语言：`zh-CN`（简体中文）、`zh-TW`（繁体中文）、`en-US`（英文）、`ja-JP`（日文）

## 优先级与运行时行为

- 配置修改通过 `PATCH /api/config` 即时生效
- 更新 `tmdb` 或 `bangumi` 配置时，服务端会重新初始化对应客户端
- 季号相关改动建议先跑 focused suite，再做 replay：`tests/core/parser.test.ts`、`tests/core/renamer.test.ts`、`tests/core/pipeline-replay.test.ts`
- `general.dbPath` 和 `pikpak.tokenCachePath` 默认位于 `data/` 下，属于运行时文件，不进入 git
