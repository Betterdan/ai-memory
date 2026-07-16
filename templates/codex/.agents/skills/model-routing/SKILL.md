---
name: model-routing
description: 按项目模型策略路由规划、实现、测试和审查，并在跨模型阶段创建和校验结构化交接。用于准备阶段切换、选择执行代理或验证 handoff。
---

先读取 `.ai/skills/model-routing.md` 与 `.ai/config/model-routing.json`。风险流程决定阶段，模型路由只选择执行者。Codex 代理映射：premium 规划=`premium_planner`，premium 实现=`premium_implementer`，standard 实现=`standard_implementer`，economy/standard 测试=`economy_test_worker`/`standard_test_worker`，premium 审查=`premium_reviewer`。跨模型前创建并校验 handoff；失败时停止，不得用对话摘要补缺失输入。
