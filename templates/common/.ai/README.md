# .ai/ — 跨 Agent 知识框架({{projectName}})

本目录是 agent-agnostic 的项目知识库,Claude Code、Codex 等所有 AI 工具共享同一份内容。
由 @betterdanlins/ai-memory 生成于 {{date}}。

## 进场协议(每次会话开始)

1. 读 `memory/MEMORY.md`,再依次加载 `user-profile.md` 当前画像、`feedback.md` 当前规则、`project-state.md` 活跃区段与 `session-log.md` 最新条目；历史归档只在追溯时读取。
2. 先用核心记忆校准沟通方式、用户长期约束、项目现状和上次进度；文件为空时直接继续，不臆测补全。
3. 按任务路由只加载当前需要的方法论和正式产物，禁止一次性读取整个 `.ai/` 与 `docs/`。
4. 跨模型阶段先按 `skills/model-routing.md` 创建并校验 handoff，不用对话摘要替代正式输入。

核心记忆只保留当前有效的精简结论；过期偏好应替换，历史 session 应归档，不以无限增长换取“记得更多”。

## 任务加载路由

| 任务 | 必读增量 |
|---|---|
| 0→1、首次基线、重大重构 | `skills/project-inception.md` + 现有 `docs/architecture/` |
| 新建/定稿需求 | `skills/requirements-flow.md` + 相关 feature 记忆与需求文档 |
| M/L 功能 how | `skills/feature-design.md` + final 需求、相关架构基线与 feature 记忆 |
| 实现或修复 | final 需求、适用设计/计划；跨模型时再读 `skills/model-routing.md` |
| Review | `skills/code-review.md` + 契约、diff 与验证证据 |
| 交付/发布 | `skills/delivery-readiness.md` + final 需求、设计、架构基线与差异 |
| 更新记忆 | `skills/memory-update.md`；按内容归属选择目标文件 |

## 目录

- `ai-memory.json` — 框架版本、Schema、启用工具、文件所有权与生成基线哈希;供安全升级预检使用
- `config/model-routing.json` — 可选阶段模型策略;默认 `inherit` 不改变旧行为
- `memory/` — 记忆层:MEMORY.md 索引、project-state 全景、session-log 流水、user-profile/feedback 用户级记忆、features/ 功能档案
- `runs/` — 本地交接清单和阶段回执;默认不进入 Git
- `skills/` — 方法论层:project-inception、requirements-flow、feature-design、delivery-readiness、model-routing、code-review、critic、memory-update

## 与工具专属配置的关系

CLAUDE.md、AGENTS.md 只是薄入口;`.claude/skills/`、`.agents/skills/` 只是触发包装。
**正文永远只有本目录一份**,修改方法论只改这里,适配层不需要动。
