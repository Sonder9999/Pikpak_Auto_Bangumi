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

> 申请 DanDanPlay API：https://www.dandanplay.com/

---

## `tmdb` — TMDB 元数据设置

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `apiKey` | string | `""` | TMDB API Key |
| `language` | string | `"zh-CN"` | 返回标题的语言 |

> 申请 TMDB API Key：https://www.themoviedb.org/settings/api
>
> 支持语言：`zh-CN`（简体中文）、`zh-TW`（繁体中文）、`en-US`（英文）、`ja-JP`（日文）
