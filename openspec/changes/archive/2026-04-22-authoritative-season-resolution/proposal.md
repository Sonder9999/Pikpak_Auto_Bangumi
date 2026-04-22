## Why

已绑定 Bangumi subject 的订阅目前只能稳定拿到权威标题和年份，季号仍主要依赖原始发布标题解析。这导致同一部已绑定续作会因为字幕组命名差异而落到不同季目录，例如裸数字后缀、`2nd Season`、`4th Season` 这类标题会回落到 `Season 01`，进一步污染重命名结果、云端目录、去重键和弹幕匹配。

这个问题跨越 parser、Bangumi 集成、重命名、目录规划和回放去重，直接改代码风险较高。需要先用代表性样例建立测试矩阵，确认当前失败模式和期望行为，再进入实现，最后用聚焦回归测试验证改动没有破坏现有可解析格式。

## What Changes

- 新增“权威季号/集号解析”能力：当订阅已绑定 `bangumiSubjectId` 时，系统优先使用绑定得到的番剧上下文决定季号，原始标题解析退化为回退路径
- 为已绑定续作建立统一的 canonical episode identity，保证重命名文件名、`Season xx` 目录、delivery-state 去重键、弹幕季号输入使用同一套判定结果
- 支持处理当前高频失败格式，包括裸数字续作标题、英文序数季标题（如 `2nd Season`、`4th Season`）以及“系列累计集号”和“本季集号”并存的情况
- 在实现前先补充样例驱动测试，覆盖至少一组显式成功样例、一组当前失败样例、一组历史混合残留样例；只有这些测试先表达出期望并通过基线校验后，才进入代码改动
- 代码完成后执行同范围聚焦回归测试，并补充必要的文档，确保后续导入、绑定和运行结果都以显式的季号规则为准

## Capabilities

### New Capabilities
- `season-resolution`: 定义绑定 Bangumi 后的权威季号/集号解析、回退策略，以及统一身份在重命名和目录规划中的使用规则

### Modified Capabilities
- `bangumi-tv-integration`: 已绑定的 Bangumi 元数据不再只影响标题和年份，还要为续作条目提供权威季上下文

## Impact

- 受影响代码路径：`src/core/parser/raw-parser.ts`、`src/core/renamer/renamer.ts`、`src/core/pipeline.ts`、`src/core/episode-state/*`、`src/core/bangumi/client.ts`
- 受影响验证面：`tests/core/parser.test.ts`、`tests/core/renamer.test.ts`、`tests/core/pipeline-replay.test.ts`，以及必要的 Bangumi/弹幕相关回归测试
- 可能新增 Bangumi relations 或 episode 元数据读取逻辑，用于区分“权威季号”和“本季集号”
- 需要同步更新运行和订阅相关文档，明确“先测试样例、再实现、再回归”的交付顺序