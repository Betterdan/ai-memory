# {{projectName}}

<!-- ai-memory:managed:start -->
## AI 协作框架(ai-memory)

进场先读 `.ai/README.md`,严格按其中的核心记忆与任务路由加载协议执行。
本 managed 区块由 ai-memory 更新;项目命令和自定义规则只写到下方 user 区块。
下表只做路由,具体流程一律以 `.ai/skills/` 为准。

- 风险等级与退出条件 → `.ai/skills/risk-levels.md`
- 对外接口变更 → `.ai/skills/interface-contract.md`
- 0→1 项目/首次架构基线/重大重构 → project-inception skill,产物在 `docs/architecture/`
- 需求定稿 → requirements-flow skill,产物在 `docs/requirements/vX.Y.Z/{draft,final}/`
- 功能 how 与技术接口 → feature-design skill,产物在 `docs/design/vX.Y.Z/`
- 代码审查 → code-review skill
- 交付前 → delivery-readiness skill
- 当前知识 → `.ai/knowledge/`,归属见 `.ai/skills/knowledge-structure.md`;写完运行 `ai-memory kb build` 与 `kb check`
- 记忆更新 → memory-update skill,手动 /update-memory
- 反驳检查 → critic skill 或 /critic
- 模型路由 → `.ai/config/model-routing.json` + model-routing skill,执行者为 `.claude/agents/` 中匹配的 agent
<!-- ai-memory:managed:end -->

<!-- ai-memory:user:start -->
## 项目信息

- 技术栈:{{techStack}}
<!-- 在此补充启动/测试/构建命令 -->
<!-- ai-memory:user:end -->
