# .ai/ — 跨 Agent 知识框架({{projectName}})

本目录是 agent-agnostic 的项目知识库,Claude Code、Codex 等所有 AI 工具共享同一份内容。
由 @betterdanlins/ai-memory 生成于 {{date}}。

## 进场协议(每次会话开始)

1. 读 `memory/MEMORY.md`(记忆索引)
2. 读 `memory/session-log.md` 末尾条目(接上进度)
3. 按任务类型按需加载 `skills/` 对应方法论
4. 跨模型阶段先按 `skills/model-routing.md` 创建并校验 handoff，不用对话摘要替代正式输入

## 目录

- `ai-memory.json` — 框架版本、Schema、启用工具、文件所有权与生成基线哈希;供安全升级预检使用
- `config/model-routing.json` — 可选阶段模型策略;默认 `inherit` 不改变旧行为
- `memory/` — 记忆层:MEMORY.md 索引、project-state 全景、session-log 流水、user-profile/feedback 用户级记忆、features/ 功能档案
- `runs/` — 本地交接清单和阶段回执;默认不进入 Git
- `skills/` — 方法论层:project-inception、requirements-flow、feature-design、delivery-readiness、model-routing、architecture、code-review、critic、memory-update

## 与工具专属配置的关系

CLAUDE.md、AGENTS.md 只是薄入口;`.claude/skills/`、`.agents/skills/` 只是触发包装。
**正文永远只有本目录一份**,修改方法论只改这里,适配层不需要动。
