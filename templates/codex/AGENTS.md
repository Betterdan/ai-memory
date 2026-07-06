# {{projectName}}

## AI 协作框架(ai-memory)

进场先读 `.ai/memory/MEMORY.md`,随后遵循 `.ai/README.md` 的进场协议。

- 需求文档工作(新建/定稿)→ requirements-flow skill,产物在 `docs/requirements/vX.Y.Z/{draft,final}/`
- 记忆更新 → 节点式(完成任务节点立即写),协议见 `.ai/skills/memory-update.md`
- 反驳检查 → critic skill 或定稿流程内强制触发;同上下文自检,刻意抵制自我辩护(见 `.ai/skills/critic.md` 纪律)

## 与 superpowers 的编排(未安装则忽略本节)

1. 需求定稿(what/why)走 requirements-flow;实现设计(how)走 brainstorming,以 `docs/requirements/*/final/*.md` 为输入
2. code review 走 superpowers 流程,叠加 `.ai/skills/code-review.md` 的项目检查项

## 项目信息

- 技术栈:{{techStack}}
<!-- 在此补充启动/测试/构建命令 -->
