## Context

当前系统在订阅已绑定 `bangumiSubjectId` 的情况下，只会把 Bangumi 元数据用于标题和年份补全，季号仍由 `rawParser()` 从原始发布标题中推导。这个设计对显式 `S02`、`Season 2`、`第二季` 的标题表现尚可，但对裸数字续作名、英文序数季标题和跨季累计集号的发布格式会回落到 `season = 1`，从而把错误季号传播到云端目录、重命名文件名、delivery-state 去重键以及弹幕季号输入。

问题涉及 parser、Bangumi API 客户端、重命名、目录规划、回放去重和弹幕集成，属于跨模块行为修改。用户还要求把“先测试几种情况，确认样例覆盖和基线通过后再写代码，最后再进行回归测试”写成明确流程，而不是实现过程中的口头约定。

## Goals / Non-Goals

**Goals:**
- 为已绑定 `bangumiSubjectId` 的条目建立权威季号解析，避免 parser 未识别时退化到 `Season 01`
- 为重命名、目录规划、delivery-state 和弹幕输入提供统一的 canonical episode identity
- 在 Bangumi 可提供足够上下文时，优先把系列累计集号转换为本季集号；无法可靠转换时保守回退
- 把测试前置流程写入 change：先建立样例矩阵和保护性测试，再实现，再做聚焦回归验证

**Non-Goals:**
- 本 change 不负责自动清理云盘中已经存在的历史错误文件或目录
- 本 change 不尝试为未绑定 `bangumiSubjectId` 的所有番剧引入联网季号推断
- 本 change 不重构整个 parser 框架；parser 增强只服务于权威季号解析的回退路径

## Decisions

### 1. 引入独立的 canonical season/episode 解析层，而不是继续把季号逻辑散落在 parser 和 renamer 中

在实现阶段，应把“已绑定条目的季号/集号判定”抽成独立解析步骤，输入包括原始标题解析结果、`bangumiSubjectId` 以及可选的 Bangumi relation/episode 上下文，输出统一的 canonical identity。后续 rename、folder planning、delivery-state 和 danmaku 都只消费这一份结果。

选择这个方案，是因为只修 `rawParser()` 只能覆盖部分命名格式，不能解决“已绑定 subject 但官方标题本身不带季号”以及“不同字幕组对同一季使用不同命名风格”这类问题。

备选方案：
- 只扩充 parser 正则：可以修掉一部分 `2nd Season` / `4th Season` / 裸数字标题，但不能让绑定后的条目拥有权威季号
- 只在 renamer 中覆写季号：目录规划、delivery-state 和弹幕仍会继续吃旧 season，结果继续分裂

### 2. 把 Bangumi 绑定作为权威季号来源，原始标题解析作为回退来源

当 `bangumiSubjectId` 已绑定时，系统应优先尝试从该 subject 及其关联关系、章节信息或其他可验证的 Bangumi 上下文中推导季序；只有在 Bangumi 无法提供足够信息时，才退回到原始标题解析结果。

这样做的原因是，绑定已经解决了“这是哪一部番”这个身份问题，后续季号不应继续完全受字幕组命名风格支配。

备选方案：
- 始终以标题解析为准：与绑定语义冲突，无法解决当前核心问题
- 手工维护每部番的季号映射：短期可行，但维护成本高，不适合先作为默认主路径

### 3. 对集号采用“能可靠归一就归一，不能可靠归一就保守回退”的策略

像“公主大人‘拷问’的时间到了 第二季”这类样例说明，仅修季号还不够，发布标题可能继续使用系列累计集号。实现时应优先利用 Bangumi episode 数据或明确映射把它转换为本季集号；如果缺乏足够证据，就保留原始集号，避免凭空猜测。

备选方案：
- 一律强行把累计集号减去前季集数：对总集数拆分不规则、篇章拆分或 SP/特别篇场景有风险
- 完全不处理集号：会继续出现 `Season 02/S01E17` 这种半正确结果

### 4. 把测试前置写成交付门槛，而不是实现后的补充工作

实现前先完成三类验证：
- 已支持格式的保护性测试，确认基线没有先坏掉
- 当前失败样例的显式测试，覆盖裸数字续作、英文序数季和累计集号案例
- 跨阶段一致性测试，确认 rename、folder、delivery-state 使用同一 canonical identity

只有样例矩阵和前置测试完成后，才进入代码改动；代码完成后必须回跑同一批聚焦测试和受影响回归测试。

## Risks / Trade-offs

- Bangumi 关系或章节数据不完整 → 需要明确回退到原始标题解析，并保留可观测日志或状态
- 同一 subject 的旧任务可能已经用错误季号落盘 → 本 change 不自动修复历史文件，可能在短期内同时存在新旧命名结果
- 额外的 Bangumi 查询会增加运行时依赖和延迟 → 需要限制查询时机，并尽量复用已有 subject 数据
- 集号归一规则过于激进会引入误判 → 先以“可靠才归一”为原则，优先 correctness over coverage

## Migration Plan

1. 先补充样例矩阵和保护性测试，记录当前成功/失败分布
2. 在不改变外部接口的前提下，引入 canonical season/episode 解析层，并接入 rename、folder planning、delivery-state、danmaku
3. 对代表性绑定样例执行聚焦回归测试，确认此前失败的续作不再落到 `Season 01`
4. 更新运行文档，说明权威季号解析的优先级、回退策略和验证步骤

如需回滚，可移除 canonical 解析层，让流程重新退回当前“parser 为主、Bangumi 只补标题年份”的行为。

## Open Questions

- 仅靠 Bangumi subject relations 是否足以稳定推导季序，还是还需要显式读取 episode 列表
- 对“系列累计集号”番剧，第一版是否要求全部转换为本季集号，还是允许部分样例先走保守回退
- 后续是否需要为少数 Bangumi 数据不完整的条目提供人工 override 配置