# 分阶段模型路由与交接

模型路由只选择现有阶段的执行者，不得增加或跳过 S/M/L 风险流程。读取 `.ai/config/model-routing.json`：`inherit` 保持当前模型；`balanced` 使用高级规划、中等实现、便宜测试和高级审查；`quality` 提高实现与诊断等级。

执行 CLI 时优先使用当前环境的 `ai-memory`；若命令不可用，使用 `npx --yes @betterdanlins/ai-memory@{{frameworkVersion}}`。必须固定与项目框架一致的版本，不使用未固定的 latest。

## 执行协议

1. 先由 requirements-flow / feature-design 判断是否需要该阶段，再解析模型等级。
2. 跨模型执行前，用 `ai-memory workflow prepare` 从正式需求、设计和计划生成 `.ai/runs/<feature>/handoff.json`。
3. 执行者先运行 `ai-memory workflow verify`，再读取 handoff 中的全部输入；不得用对话摘要替代正式文档。
4. 输入缺失、哈希变化、路由变化或存在未决问题时停止，不得猜测。
5. 实现结束后在同一 run 目录写 `<stage>-result.json`，记录变更文件、验收覆盖、测试、设计偏差和未决风险。
6. reviewer 第一轮只读；修复交给 implementer，修复后重新审查。

## 能力边界与升级

- `premium`：需求定稿、重大方案、计划、对抗性测试和最终审查。
- `standard`：按已批准计划实现、普通失败诊断。
- `economy`：根据明确测试矩阵补机械性测试；不得修改生产代码或重新解释契约。
- `none`：直接运行确定性命令，不调用模型。
- economy 无法理解契约或发现生产缺陷 → standard；standard 发现设计缺口或连续两次失败 → premium。
- 安全、权限、资金、隐私、数据迁移和并发问题直接使用 premium。

模型不可用时可降级为 `inherit`，但必须报告一次；不得静默把高风险阶段降为 economy。

## 交接回执最小字段

```json
{
  "stage": "implementation",
  "status": "completed",
  "changedFiles": [],
  "acceptanceCoverage": {},
  "tests": [],
  "designDeviations": [],
  "unresolvedRisks": []
}
```
