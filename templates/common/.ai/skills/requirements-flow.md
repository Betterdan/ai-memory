# 需求定稿流程（draft → final）

本流程只确定 what/why、范围、外部行为和验收标准，不决定模块、存储、框架等 how。技术设计交给 `feature-design`。

## 新建

1. 确认版本目录 `docs/requirements/vX.Y.Z/`，不存在则创建 `draft/` 与 `final/`。
2. 在 `draft/<需求名>.md` 记录：背景 / 想要什么 / 不确定的点。
3. 在 `project-state.md` 需求进度表登记状态 `draft`。

## 定稿

1. 读取 draft、相关功能记忆和已有外部契约。
2. 只澄清会改变目标、范围、用户可见行为或验收结果的问题；实现选择留给技术设计。
3. 按固定结构形成候选稿：
   - **目标**
   - **范围**：包含与不做什么
   - **外部行为契约**：参与者、输入、输出、失败表达、副作用、兼容性
   - **验收标准**：可观察、可验证
   - **开放问题**：不得隐藏阻塞项
   - **实现交接**：已确认决策、how 阶段待决定项、禁止重新讨论项、初步风险等级
4. 先按 `.ai/skills/risk-levels.md` 给出初步风险等级：S 级不做自检，直接写 `final/<需求名>.md`；M/L 级按 `.ai/skills/critic.md` 审查需求完整性（工具支持时使用独立 critic），逐条处理后才写 final。
5. 按下方路由选择下一步，不在本流程中比较实现方案。
6. 更新 `project-state.md` 为 `finalized`；在 `features/<需求名>.md` 记录外部契约与关键决策，并更新 MEMORY 索引。

若 `.ai/config/model-routing.json` 的 profile 不是 `inherit`，M/L 级定稿前按 `.ai/skills/model-routing.md` 为 `requirement-finalize` 准备并校验 handoff，再使用对应等级执行者；S 级不创建 handoff。模型路由不得改变下方 S/M/L 流程深度。

## 风险路由

等级判断标准、各等级退出条件与 S 级轻量路径见 `.ai/skills/risk-levels.md`；定稿时给出等级并说明理由。

| 等级 | 下一步 |
|---|---|
| S | 按轻量路径直接实现并测试；不生成技术设计，不做自检 |
| M | 执行 `feature-design`，生成精简技术设计 |
| L | 先更新项目基线，再执行完整 `feature-design`；只对未决高影响方案做一次方案比较 |

拿不准时选高一级，并在实现交接中写明原因。

## 外部行为契约边界

只写调用方或用户可观察的承诺。不要在 final 需求中固定类、函数、表结构、队列、框架或部署组件，除非它们本身就是业务约束。
