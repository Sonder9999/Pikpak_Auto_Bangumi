## ADDED Requirements

### Requirement: Bangumi.tv 番剧海报获取
系统 SHALL 通过 Bangumi.tv API 获取番剧封面海报用于前端展示。海报 SHALL 在 Web UI 番组看板页和番剧详情页中展示。

#### Scenario: 看板页展示海报
- **WHEN** 用户访问看板页
- **THEN** 每个收藏条目的海报通过 Bangumi.tv API 的 `images.large` 字段获取并展示

#### Scenario: 搜索无结果
- **WHEN** Bangumi.tv 无法匹配番剧标题
- **THEN** 使用默认占位图，允许用户手动指定 bangumiSubjectId

### Requirement: Bangumi.tv 元数据补充
系统 SHALL 从 Bangumi.tv 获取番剧的中文名（`name_cn`）、日文名（`name`）、集数总数、放送日期和年份，并在订阅已绑定 `bangumiSubjectId` 时获取或推导用于判定续作季序和本季集号的权威上下文，用于前端展示、重命名优先来源和 canonical season/episode 解析。

#### Scenario: bangumiId 绑定后优先使用 Bangumi 标题、年份和季上下文
- **WHEN** 订阅记录的 `bangumiSubjectId` 已绑定
- **THEN** 重命名和 season-resolution 管道 SHALL 优先调用 Bangumi.tv 获取 `name_cn`（或退化到 `name`）、放送年份以及可用的季上下文
- **THEN** 在 Bangumi 数据可用时，系统 SHALL 跳过仅依赖 TMDB 或原始标题的季号判定路径

#### Scenario: `name_cn` 为空时退化
- **WHEN** Bangumi.tv 的 `name_cn` 字段为空字符串或 null
- **THEN** 系统 SHALL 使用 `name`（日文原名），再退化到现有 TMDB `searchAnime()` 路径

#### Scenario: bangumiId 未绑定时退化
- **WHEN** 订阅记录没有绑定 bangumiSubjectId
- **THEN** 重命名和 season-resolution 管道 SHALL 继续使用现有 TMDB `searchAnime()` 与原始标题解析路径，行为保持兼容

#### Scenario: Bangumi context is incomplete for season or episode normalization
- **WHEN** 订阅已绑定 `bangumiSubjectId`
- **AND** Bangumi 返回的数据不足以推导可信的续作季号或本季集号
- **THEN** 系统 SHALL 保留 Bangumi 可提供的标题和年份补全结果
- **THEN** 系统 SHALL 对未解析出的 season/episode 字段回退到原始标题解析结果
