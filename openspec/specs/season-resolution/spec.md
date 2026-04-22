## ADDED Requirements

### Requirement: Bound subscriptions SHALL use authoritative season resolution
当 RSS 条目所属订阅已绑定 `bangumiSubjectId` 时，系统 SHALL 在目录规划、重命名、去重和弹幕处理之前先解析 canonical season number，而不是直接沿用原始标题解析得到的季号。

#### Scenario: Bound sequel title falls back away from Season 01
- **WHEN** 订阅已绑定 `bangumiSubjectId`
- **AND** 原始发布标题没有被 parser 识别出正确季号
- **AND** 绑定的 Bangumi 上下文可以确认该条目属于续作季
- **THEN** 系统 SHALL 使用绑定得到的 canonical season number
- **THEN** 系统 SHALL NOT 因为 parser 回退而把该条目默认写入 `Season 01`

#### Scenario: Bound subject overrides contradictory raw season
- **WHEN** 原始发布标题解析得到的季号与绑定 subject 的 canonical season number 不一致
- **THEN** 系统 SHALL 以绑定 subject 的 canonical season number 为准

#### Scenario: Unbound or unresolved items fall back safely
- **WHEN** 订阅未绑定 `bangumiSubjectId`
- **OR** 绑定的 Bangumi 上下文不足以推导可信的 canonical season number
- **THEN** 系统 SHALL 回退到原始标题解析结果和现有默认值

### Requirement: Canonical episode identity SHALL be reused across pipeline stages
系统 SHALL 复用同一套 canonical title/season/episode identity，用于重命名文件名、`Season xx` 目录规划、delivery-state 去重和弹幕季号输入。

#### Scenario: Rename and folder planning stay consistent
- **WHEN** 系统已经解析出 canonical season/episode identity
- **THEN** 重命名文件名中的季号 SHALL 与目标 `Season xx` 目录一致
- **THEN** delivery-state 和后续弹幕输入 SHALL 使用同一组 season/episode 值

#### Scenario: Mixed release naming converges to one identity
- **WHEN** 同一已绑定番剧同时出现显式 `S02` 标题和未显式写季号的续作标题
- **THEN** 这些发布项在解析后 SHALL 收敛到同一 canonical season identity
- **THEN** 系统 SHALL NOT 因为命名风格差异把同季内容拆到不同季目录或不同去重键

### Requirement: Season-local episode numbering SHALL prefer authoritative mapping when available
当发布标题使用系列累计集号时，系统 SHALL 在可验证的情况下优先转换为本季集号；无法可靠转换时，系统 SHALL 保守保留原始集号。

#### Scenario: Cumulative numbering is normalized when mapping is available
- **WHEN** 发布标题携带的是系列累计集号
- **AND** Bangumi episode 数据或其他权威映射能够确认该条目的本季集号
- **THEN** 系统 SHALL 使用本季集号生成文件名、目录匹配和去重身份

#### Scenario: Episode numbering remains conservative when mapping is unavailable
- **WHEN** 系统无法从权威上下文中推导可信的本季集号
- **THEN** 系统 SHALL 保留原始标题解析得到的集号
- **THEN** 系统 SHALL NOT 凭空推断新的集号值