# ai-memory:AI 记忆 + 需求工作流框架 设计文档

> 日期:2026-07-05
> 状态:已与用户逐段确认

## 1. 背景与定位

单人开发者在 Claude Code 与 Codex CLI 之间切换工作时,面临三个问题:

1. **记忆断层**:session 结束后进度、决策、遗留问题丢失;换工具后状态无法衔接
2. **需求演化无结构**:人工粗稿到可执行需求之间缺少固定流程与版本管理
3. **方法论分散**:架构原则、接口契约格式、review 标准没有统一落点,且需跨技术栈复用

**产品形态:Node.js CLI 脚手架工具**,通过 `npx ai-memory init` 一次性在目标项目生成完整框架结构。init 之后项目不依赖 CLI,日常操作全部由 AI 工具内的 skill/command 驱动。

**与现有产品的差异**:记忆赛道(claude-mem、agentmemory)和规格驱动赛道(Spec Kit、OpenSpec、BMAD)各有成熟产品,但「记忆 + 需求版本化 + 方法论 + critic 反驳」的一体化组合,以及「人工粗稿 → AI 定稿」双目录演化模型,没有现成覆盖。取舍:纯 markdown 记忆换取可 git 版本化、人类可直读可改,放弃语义检索/AI 压缩(claude-mem 路线)。

参考实现:`agent-hify` 项目的 `.ai/` 框架(本设计是其模式的工具化与泛化)。

## 2. 核心决策(已确认)

| 决策点 | 结论 |
|---|---|
| 产品定位 | CLI 工具(npx 分发) |
| CLI 职责边界 | 只做 init/脚手架;语义操作交给 skill/command |
| 需求组织模型 | 版本作为迭代批次:`docs/requirements/vX.Y.Z/{draft,final}/` |
| 跨工具方案 | 单一源 `.ai/` + 薄适配层(Claude/Codex 各生成薄包装) |
| CLI 技术栈 | Node.js(零安装 `npx ai-memory init`) |
| Critic 形态 | 跨工具 skill + Claude 侧独立上下文 subagent,Codex 侧同上下文自检 |

## 3. 架构总览

```
┌─────────────────────────────────────────────────┐
│  npx ai-memory init  (Node.js CLI,只做脚手架)   │
│  · 交互式询问:项目名/技术栈/启用哪些工具        │
│  · 复制模板 + 渲染变量                           │
└────────────────┬────────────────────────────────┘
                 ▼ 在目标项目生成
┌─────────────────────────────────────────────────┐
│ .ai/                    ← 单一源(agent-agnostic)│
│   memory/               ← 记忆层                 │
│   skills/               ← 方法论层               │
│ docs/requirements/      ← 需求工作流层           │
│   vX.Y.Z/{draft,final}/                          │
├─────────────────────────────────────────────────┤
│ 薄适配层(触发条件 + 指向 .ai/ 正文)            │
│   Claude Code: CLAUDE.md + .claude/{skills,      │
│                commands,agents,settings.json}    │
│   Codex:       AGENTS.md + .agents/skills/       │
└─────────────────────────────────────────────────┘
```

要点:

- **CLI 一次性**:init 后无运行时依赖。框架升级命令(`ai-memory update`,只更新 `.ai/skills/` 通用部分)留待 v2。
- **工具对称性**:Codex 自 2025-12 起原生支持 Agent Skills(`.agents/skills/*/SKILL.md`,格式与 Claude 同构),skill 层两边对等。残余不对称:① Claude 有 Stop/PreCompact hook 兜底、Codex 无;② Claude critic 用独立上下文 subagent、Codex 同上下文自检。两者均为锦上添花,接受降级。
- **AGENTS.md 约束**:Codex 拼接 AGENTS.md 有 32KiB 默认上限,入口必须薄——与本设计一致。

## 4. 生成的目录结构

```
项目根/
├── .ai/                              ★ 单一源
│   ├── README.md                     框架总说明 + agent 进场协议
│   ├── memory/
│   │   ├── MEMORY.md                 记忆索引(入口,每次进场先读)
│   │   ├── project-state.md          项目状态:技术栈、当前版本、需求进度表、遗留问题
│   │   ├── session-log.md            最新 session 进展(节点式带时间戳追加)
│   │   ├── user-profile.md           用户背景与偏好(跨项目复用,init 可导入)
│   │   ├── feedback.md               协作行为规范(跨项目复用,init 可导入)
│   │   └── features/                 每需求一文件:现状、决策、接口契约、已知问题
│   └── skills/
│       ├── requirements-flow.md      需求定稿流程(draft→澄清→critic→final)
│       ├── architecture.md           架构方法论:模块边界、依赖规则、契约模板(语言无关)
│       ├── code-review.md            项目专属 review 检查项(不注册 skill,供 superpowers 引用)
│       ├── critic.md                 对抗性检查方法论
│       └── memory-update.md          记忆更新协议
├── docs/requirements/
│   └── v1.0.0/
│       ├── draft/                    人工粗稿(自由格式)
│       └── final/                    AI 定稿(目标/范围/契约/验收标准/开放问题)
├── CLAUDE.md                         薄入口:引用 .ai/README.md + 项目命令 + superpowers 编排约定
├── .claude/
│   ├── skills/{requirements-flow,critic,memory-update}/SKILL.md   薄包装
│   ├── commands/{update-memory,new-requirement,finalize-requirement,critic}.md
│   ├── agents/critic.md              独立上下文 critic subagent
│   └── settings.json                 Stop/PreCompact hook:收尾提醒记忆落盘
├── AGENTS.md                         Codex 薄入口(与 CLAUDE.md 同源渲染)
└── .agents/skills/{requirements-flow,critic,memory-update}/SKILL.md
```

结构决策:

- **薄包装定义**:适配层 SKILL.md 只含 frontmatter(name/description 触发条件)+ 一句「读取并遵循 `.ai/skills/xxx.md`」。正文只有一份。
- **session-log 与 project-state 分离**:高频流水与低频全景分开,避免高频写破坏全景文件格式。
- **接口契约不单独建目录**:契约模板在 `architecture.md`,定稿时写入 `final/*.md` 固定章节,实现后沉淀到 `features/*.md`。
- **跨技术栈**:`architecture.md` 只写语言无关方法论;技术栈信息 init 时写入 `project-state.md`。CLI 不做技术栈感知的模板分支(v2 再议)。
- **user-profile/feedback 复用**:init 询问是否从已有项目导入,否则生成空模板;首版不做全局同步。

## 5. 三条核心工作流

### 5.1 需求定稿流(draft → final)

1. 人工在 `draft/` 自由书写(或 `/new-requirement` 生成骨架:背景/想要什么/不确定的点)
2. `/finalize-requirement <名>`:读 draft → 逐个澄清模糊点(一次一问)→ 按固定结构成稿:**目标 / 范围(含不做什么)/ 接口契约 / 验收标准 / 开放问题**
3. **强制 critic 门**(见 5.3):逐条回应后才写入 `final/`
4. 联动记忆:更新 `project-state.md` 进度表(draft → finalized),`features/` 建档登记契约要点
5. 交接:实现阶段由 superpowers brainstorming/writing-plans 以 `final/*.md` 为输入

### 5.2 记忆更新流(节点式)

触发时机:

| 触发 | 方式 |
|---|---|
| 完成任务节点 / 关键决策(主路径) | skill 按 description 自动触发 |
| 用户主动 | `/update-memory` |
| 会话收尾 | Claude 侧 Stop/PreCompact hook 提醒(Codex 无) |
| 需求状态变化 | 定稿流第 4 步联动 |

写入路由:

- 进展流水 → `session-log.md` 带时间戳追加,只增不改;超约 200 行压缩归档进 `project-state.md`
- 需求/里程碑状态 → `project-state.md` 表格行
- 功能设计决策、契约变更 → `features/<名>.md`
- 新增记忆文件 → `MEMORY.md` 索引行

协议约束(写进 memory-update.md):写前先读;只增量追加不重构格式;跨工具切换前确认 session-log 落盘;记忆变更随代码一起 commit。

### 5.3 Critic 反驳检查

- Claude 侧:派发 critic subagent,独立上下文,只给文档 + `critic.md`,不给对话历史
- Codex 侧:同一方法论,同上下文自检(接受降级)

检查清单:① 假设攻击(未验证前提、单点崩塌假设);② 契约漏洞(错误路径、边界值、并发/幂等、误用后果);③ 过度设计(YAGNI、单人项目抽象成本);④ 遗漏场景(验收盲区、与 `features/` 已有功能冲突)。

输出纪律:带严重度的质疑列表;主 agent 逐条回应「接受修改」或「有理由反驳」,不允许沉默跳过;全部处理完才通过。

## 6. 已知缺陷与固化的缓解措施

| # | 缺陷 | 缓解 |
|---|---|---|
| 1 | 触发可靠性:skill 触发是描述匹配,非 100% | 节点式更新协议降低单次遗漏损失;Claude 侧 hook 兜底 |
| 2 | 会话中断致记忆丢失 | 节点式即时写入,不攒到会话结束 |
| 3 | Codex critic 同上下文易自我辩护 | 接受降级;重要定稿建议在 Claude 侧执行 |
| 4 | 双工具并发写冲突 | 约定单活跃 agent;记忆随代码 commit,git 兜底 |
| 5 | markdown 记忆无语义检索 | MEMORY.md 索引 + 懒加载;有意取舍换取可版本化可直读 |
| 6 | 双模型长期写作格式漂移 | 模板定死骨架;skill 明确「只增量追加不重构」 |

## 7. 与 superpowers 的关系

正交分层:superpowers 管「一次会话内的执行纪律」(brainstorming/TDD/debugging/review),本框架管「跨会话跨工具的状态与需求资产」。superpowers 6.x 同样支持 Codex,两侧工具栈同构。

编排约定(写入 CLAUDE.md/AGENTS.md 模板,未安装 superpowers 则忽略):

1. 需求文档工作走 `requirements-flow`,产出需求定稿(what/why);实现设计走 brainstorming,产出实现 spec(how),以 `final/*.md` 为输入
2. `code-review.md` 不注册 skill,仅作为项目检查项供 superpowers review 流程引用
3. 触发优先级依赖 superpowers 自身规则(CLAUDE.md 用户指令最高),编排约定写在入口文件即生效

## 8. CLI 实现要点

- 包名:`ai-memory` 已被占用(npm 上存在 v1.0.0),采用 scoped 包 `@betterdan/ai-memory`(用法 `npx @betterdan/ai-memory init`);备选无 scope 名 `aimemory`(已验证未占用)
- 命令:v1 仅 `init`。交互问题:项目名、技术栈描述、启用工具(claude/codex/both)、是否导入 user-profile/feedback
- 实现:模板目录 + 变量渲染(如 handlebars/eta)+ 文件复制;无 LLM 调用、无网络依赖
- 幂等性:目标文件已存在时逐个询问覆盖/跳过,绝不静默覆盖
- 测试:模板渲染单测 + init 端到端快照测试(临时目录生成后与期望结构比对)

## 9. 范围外(v2+ 候选)

- `ai-memory update`(框架升级同步)
- 技术栈感知的模板分支
- user-profile/feedback 全局同步机制
- 更多工具适配(Cursor、Gemini CLI 等)——架构已预留:新增工具只加适配层
