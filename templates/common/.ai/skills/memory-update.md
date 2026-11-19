# 记忆更新协议（工程节点）

## 触发时机

只在信息对后续会话仍有价值时写入：

1. 完成一个可独立验收的功能、阶段或发布节点。
2. 做出会约束后续实现的关键决策，或推翻已有决策。
3. 需求/设计/实现/交付状态变化。
4. 发现需要跨会话保留的风险、故障原因或踩坑。
5. 会话中断、上下文压缩或跨工具切换前。

不要因为写了一个测试、修改一个私有函数、执行一次命令或完成细碎 plan item 单独更新记忆。

S 级改动按 `.ai/skills/risk-levels.md` 的退出条件判断：只有项目状态真实变化时才写入，纯局部修复不写记忆。

## Git worktree 并行开发

- 多个需求从约定基线（例如 `dev`）分别创建分支与 worktree；在各自工作区维护当前需求的状态、需求文档与过程记录。将当前需求登记为唯一的 `in-progress` 后，用 `ai-memory worktree select --point <需求点>` 将就绪和契约门禁限定于该点；未选择时仍检查全部 `in-progress`。不要擅自修改其他需求状态。
- 选择保存在当前工作区 `.ai/runs/active-point.json`，不进入 Git；需要切换时重新选择，`ai-memory worktree status` 查看，`ai-memory worktree clear` 恢复检查全部。所选点不再为 `in-progress` 时不会被默认门禁检查；配置损坏、点被删除或重名时门禁阻塞并要求修正。
- 每个 worktree 的 `.ai/` 由该分支的文件决定，不会自动同步；未纳入 Git 的 `.ai/runs/` 回执只属于当前 worktree。不要用符号链接将多个 worktree 的用户资产连到一起。
- 合并前在需求分支运行 `ai-memory gate contract --base dev --point <需求点>`；此检查只比较共同祖先到当前 HEAD 的已提交改动，工作区及暂存区另行检查。基线不是 `dev` 时明确替换为实际分支。
- 合并或 rebase 出现 iterations、session-log 或知识页冲突时，结合两个需求的真实状态和验收证据人工处理，不丢弃任一方或自动猜测语义；合并后在目标分支执行 `ai-memory kb build`、`ai-memory kb check` 并审查 diff。

## 需求点落地后的知识合并

需求点满足 `.ai/skills/risk-levels.md` 的退出条件但尚未发布或启用时，在 iterations 中标为 `accepted`；已验收不等于已生效。实际生效后才执行知识合并并标为 `done`。无需独立发布或启用的改动可以验收后直接进入 `done`。
先按 `.ai/skills/knowledge-structure.md` 判断归属,再按顺序:

1. **合并改写**最终行为进对应入口页或领域页:写成当前状态,不写「本次新增」「改为」这类相对表述;同一处的旧描述被替换,不并列保留两个版本。
2. 契约在实现前已按 `.ai/skills/interface-contract.md` 更新,此处只引用位置,不重复抄写字段。
3. 出现会约束后续实现的决策时,在 `.ai/knowledge/decisions/` 新增记录;被推翻的旧决策标记为**已取代**并保留,不删除。
4. 在 `.ai/knowledge/iterations.md` 把该需求点标记为 `done`。
5. 删除只在本次开发中有用的临时进度信息:session-log 里已被当前知识取代的条目压缩为一行结论。
6. 运行 `ai-memory kb build` 重新生成索引与领域页横向视图,再运行 `ai-memory kb check` 确认没有断链与悬空引用;生成区块内的内容一律不手工编辑。
7. 以 **diff 形式交用户确认**,不要写完就当作结束。

## 写入路由

| 内容 | 去处 |
|---|---|
| 用户明确表达的稳定背景、沟通/决策偏好、跨项目约束 | `user-profile.md` 对应字段 |
| 用户明确纠正且可跨项目复用的 Agent 行为规则 | `feedback.md` 去重后新增或替换 |
| 工程节点、当前进度、下一步、阻塞 | `session-log.md` 追加 |
| 需求点、设计或交付状态 | `.ai/knowledge/iterations.md` 对应行 |
| 功能行为、业务规则、实体与状态流转 | 按 `.ai/skills/knowledge-structure.md` 判断归属,写入 `.ai/knowledge/` 对应页面 |
| 会约束后续实现的决策 | `.ai/knowledge/decisions/` 新增记录 |
| 新增记忆文件 | `MEMORY.md` 加索引 |

## 用户级记忆判定

1. 只记录用户明确说出、确认或纠正的长期信息；不得根据对话风格、代码水平、姓名或项目类型推断画像。
2. 先判断作用域：跨项目才进入 `user-profile.md` / `feedback.md`；当前项目事实进入 `.ai/knowledge/`；一次性要求不落盘。
3. `user-profile.md` 记录“用户是谁、偏好怎样协作”；`feedback.md` 记录“Agent 以后具体必须怎样做”，不得重复抄写。
4. 身份、联系方式、健康、财务等敏感信息默认不写；只有用户明确要求并确认仓库可见性后才允许记录必要的最小范围。密钥、令牌和凭据永不写入。
5. 用户撤回或修改偏好时更新旧条目，不并列保留相互冲突的规则。

## 约束

- 写前读取目标文件，只记录增量和新事实，不复制需求/设计/测试输出。
- 将同一工程节点内的相关小步骤合并为一条，避免流水噪声。
- session-log 超约 200 行时，把旧条目压缩进 `.ai/knowledge/iterations.md` 的「已归档」。
- 跨工具切换前确认关键状态已落盘；记忆变更随对应代码或文档一起 commit。
