# {{projectName}}

<!-- ai-memory:managed:start -->
## AI 协作框架(ai-memory)

进场先读 `.ai/memory/MEMORY.md`,随后遵循 `.ai/README.md` 的进场协议。
本 managed 区块由 ai-memory 更新;项目命令和自定义规则只写到下方 user 区块。

- 0→1 项目/首次架构基线/重大重构 → project-inception skill,产物在 `docs/architecture/`;普通功能不要重复触发
- 需求 what/why 与外部行为定稿 → requirements-flow skill,产物在 `docs/requirements/vX.Y.Z/{draft,final}/`
- M/L 级功能 how 与技术接口 → feature-design skill,产物在 `docs/design/vX.Y.Z/`;S 级可直接实现
- 交付前 → delivery-readiness skill,按风险验证契约、测试、迁移、回滚、性能与可观测性
- 记忆更新 → 只在可验收工程节点、关键决策、状态变化或会话切换时写
- 反驳检查 → S 级精简自检;M/L 级或用户明确要求时用 critic skill
- 模型路由 → 读取 `.ai/config/model-routing.json`;非 inherit 时按 model-routing skill 创建/验证 handoff，再调用 `.codex/agents/` 中匹配的执行者

## 与 superpowers 的编排(未安装则忽略本节)

1. final 需求已经确认 what/why,不要用 brainstorming 重复澄清目标与范围
2. S 级跳过 brainstorming/writing-plans;M 级只对未决高影响 how 选择性使用;L 级可使用完整流程
3. 所有 Superpowers 结论必须回写 `docs/design/`,临时 spec/plan 不是唯一事实源
4. code review 使用适合风险等级的流程,叠加 `.ai/skills/code-review.md` 的项目检查项
<!-- ai-memory:managed:end -->

<!-- ai-memory:user:start -->
## 项目信息

- 技术栈:{{techStack}}
<!-- 在此补充启动/测试/构建命令 -->
<!-- ai-memory:user:end -->
