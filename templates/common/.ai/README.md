# .ai/ — 跨 Agent 知识框架({{projectName}})

本目录是 agent-agnostic 的项目知识库,Claude Code、Codex 等所有 AI 工具共享同一份内容。
由 @betterdanlins/ai-memory 生成于 {{date}}。

## 进场协议(每次会话开始)

1. 读 `memory/MEMORY.md`,再依次加载 `memory/user-profile.md` 当前画像、`memory/feedback.md` 当前规则、`knowledge/overview.md` 项目概览、`knowledge/iterations.md` 进行中的需求点与 `memory/session-log.md` 最新条目；历史归档只在追溯时读取。
2. 先用核心记忆校准沟通方式、用户长期约束、项目现状和上次进度；文件为空时直接继续，不臆测补全。
3. 按任务路由只加载当前需要的方法论和正式产物，禁止一次性读取整个 `.ai/` 与 `docs/`。
4. 跨模型阶段先按 `skills/model-routing.md` 创建并校验 handoff，不用对话摘要替代正式输入。

核心记忆只保留当前有效的精简结论；过期偏好应替换，历史 session 应归档，不以无限增长换取“记得更多”。

## 任务加载路由

| 任务 | 必读增量 |
|---|---|
| 判断风险等级、确认是否算完成 | `skills/risk-levels.md`(各等级流程深度与退出条件的单一事实源) |
| 改动对外接口 | `skills/interface-contract.md` + `docs/architecture/interfaces.md` |
| 开始实现前 | 需求点须标为 `in-progress` 且定稿通过 `ai-memory gate ready` |
| 改完提交前 | `ai-memory gate contract` 核对契约声明与实际改动是否一致 |
| 想看项目全貌 | `ai-memory kb export` 生成 `knowledge.html`,双击打开;含 mermaid 图时首次需联网取一次渲染器 |
| 了解系统现状 | `knowledge/overview.md` + 相关 `knowledge/entries/`、`knowledge/domains/` |
| 写入知识 | `skills/knowledge-structure.md` 判断归属与 frontmatter,写完运行 `ai-memory kb build` 再 `kb check` |
| 0→1、首次基线、重大重构 | `skills/project-inception.md` + 现有 `docs/architecture/` |
| 新建需求集合 / 定稿需求点 | `skills/requirements-flow.md` + 相关入口页、领域页与需求文档 |
| M/L 功能 how | `skills/feature-design.md` + final 需求、相关架构基线与入口页、领域页 |
| 实现或修复 | final 需求、适用设计/计划；跨模型时再读 `skills/model-routing.md` |
| Review | `skills/code-review.md` + 契约、diff 与验证证据 |
| 交付/发布 | `skills/delivery-readiness.md` + final 需求、设计、架构基线与差异 |
| 更新记忆 | `skills/memory-update.md`；按内容归属选择目标文件 |

## 目录

- `ai-memory.json` — 框架版本、Schema、启用工具、文件所有权与生成基线哈希;供安全升级预检使用
- `config/model-routing.json` — 可选阶段模型策略;默认 `inherit` 不改变旧行为
- `knowledge/` — 当前知识:overview 概览、entries/ 入口页、domains/ 领域页、decisions/ 决策记录、iterations 迭代记录、conventions 开发约定
- `memory/` — 过程记录与用户级记忆:MEMORY.md 索引、session-log 流水、user-profile/feedback
- `hooks/` — 跨工具门禁样例;`ai-memory hooks install` 显式安装,框架不会替你装
- `knowledge.html` — `kb export` 生成的自包含项目 wiki(含架构基线、需求定稿与技术设计);是生成物,要不要进 Git 由你决定
- `runs/` — 本地交接清单和阶段回执;默认不进入 Git
- `skills/` — 方法论层:risk-levels、interface-contract、knowledge-structure、project-inception、requirements-flow、feature-design、delivery-readiness、model-routing、code-review、critic、memory-update

## 与工具专属配置的关系

CLAUDE.md、AGENTS.md 只是薄入口;`.claude/`、`.agents/`、`.codex/` 只是触发包装。
**正文永远只有本目录一份**,修改方法论只改这里,适配层不需要动。

适配层的边界:

| 留在适配层 | 推回 `.ai/` |
|---|---|
| 触发条件(frontmatter 的 description、argument-hint) | 等级判断与流程深度 |
| 工具原生映射(subagent 名、model 别名、reasoning effort、$ARGUMENTS、tools) | 门槛、步骤与纪律措辞 |
| 一句指向 `.ai/skills/<名称>.md` 的指令 | 任何「必须 / 不得 / 不允许」类规则 |

入口受管区块同理:只做「任务 → skill + 产物位置」的路由,不复述流程。
