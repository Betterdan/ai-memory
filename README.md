# @betterdanlins/ai-memory

AI 记忆 + 需求工作流脚手架:一条命令在项目里生成跨 Claude Code / Codex 的
记忆层(.ai/memory)、方法论层(.ai/skills)、需求版本目录(docs/requirements)
与两侧薄适配层。

## 用法

```bash
npx @betterdanlins/ai-memory init
# 非交互:
npx @betterdanlins/ai-memory init --name demo --stack "PHP + Vue" --tools claude,codex --yes
# 从已有项目导入用户级记忆:
npx @betterdanlins/ai-memory init --import /path/to/other-project
```

`--import` 从已有项目导入 user-profile/feedback;目标文件已存在时按冲突策略处理(--yes 下跳过,交互下询问),绝不静默覆盖。

## 设计

- 单一源:所有正文只在 `.ai/`,`.claude/`、`.agents/` 只是触发包装
- 节点式记忆:完成任务节点立即写 session-log,跨工具切换不断档
- 需求双目录:人工粗稿 `draft/` → AI 定稿 `final/`(强制 critic 门)
- 幂等:已存在的文件逐个询问,绝不静默覆盖(`--yes` 一律跳过)

设计文档:`docs/superpowers/specs/2026-07-05-ai-memory-framework-design.md`
