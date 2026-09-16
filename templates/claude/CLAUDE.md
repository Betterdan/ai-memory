# {{projectName}}

<!-- ai-memory:managed:start -->
## AI 协作框架(ai-memory)

进场先读 `.ai/README.md`,严格按其中的核心记忆与任务路由加载协议执行。
本 managed 区块由 ai-memory 更新;项目命令和自定义规则只写到下方 user 区块。

- 0→1 项目/首次架构基线/重大重构 → project-inception skill,产物在 `docs/architecture/`;普通功能不要重复触发
- 需求 what/why 与外部行为定稿 → requirements-flow skill,产物在 `docs/requirements/vX.Y.Z/{draft,final}/`
- M/L 级功能 how 与技术接口 → feature-design skill,产物在 `docs/design/vX.Y.Z/`;S 级可直接实现
- 交付前 → delivery-readiness skill,按风险验证契约、测试、迁移、回滚、性能与可观测性
- 记忆更新 → 只在可验收工程节点、关键决策、状态变化或会话切换时写;手动 /update-memory
- 反驳检查 → S 级精简自检;M/L 级或用户明确要求时用 /critic 独立审查
- 模型路由 → 读取 `.ai/config/model-routing.json`;非 inherit 时按 model-routing skill 创建/验证 handoff，再调用匹配的 planner/implementer/test-worker/reviewer

## 方案比较、实施计划与代码审查

1. final 需求已确认 what/why,不要在 how 阶段重复澄清目标与范围
2. 方案比较只在存在未决高影响选择时做一次:S 级不做,M 级限单个选择,L 级用于边界级选择
3. 实施计划只在设计无法一次性落地时生成;结论一律写入 `docs/design/`,不留独立临时产物
4. 代码审查 → code-review skill,按 `.ai/skills/code-review.md` 对照契约与验收标准,第一轮只读
<!-- ai-memory:managed:end -->

<!-- ai-memory:user:start -->
## 项目信息

- 技术栈:{{techStack}}
<!-- 在此补充启动/测试/构建命令 -->
<!-- ai-memory:user:end -->
