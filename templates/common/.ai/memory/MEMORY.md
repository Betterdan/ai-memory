# 记忆索引与加载策略

> 会话开始只读核心记忆与当前知识入口;其余按需加载。新增文件必须在本索引登记,禁止一次性加载整个目录。

## 三类内容

| 类别 | 位置 | 性质 |
|---|---|---|
| 当前知识 | `../knowledge/` | 系统现在是什么样;agent 的默认上下文 |
| 过程记录 | 本目录 `session-log.md` | 做了什么、关键决策、下一步;只增不改 |
| 用户级记忆 | 本目录 `user-profile.md`、`feedback.md` | 跨项目的画像与协作规则 |

归属判断见 `../skills/knowledge-structure.md`。

## 核心记忆(每次会话)

1. [用户画像](user-profile.md) — 已确认的背景、沟通偏好与长期约束
2. [协作规范](feedback.md) — 用户明确反馈沉淀的可执行规则
3. [项目概览](../knowledge/overview.md) — 目标、技术栈、当前迭代、遗留问题
4. [迭代记录](../knowledge/iterations.md) — 只读进行中与下一个需求点
5. [Session 日志](session-log.md) — 只读最新条目,接续进展与下一步

## 任务知识(按需)

- 入口行为 → `../knowledge/entries/<分组>.md`
- 业务规则、实体与状态流转 → `../knowledge/domains/<领域>.md`
- 某个决定为什么这么定 → `../knowledge/decisions/`
- 命令与代码约定 → `../knowledge/conventions.md`

<!-- features/ 为过渡期遗留目录,内容将迁入 knowledge/entries 与 knowledge/domains;迁移前仍按行登记 -->
