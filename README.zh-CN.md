# ai-memory

> 一条命令,为任意项目搭建一套共享的 AI 记忆层与需求工作流 —— 跨 Claude Code、Codex 及未来的 agent 通用。

[English](README.md) · [简体中文](README.zh-CN.md)

[![CI](https://github.com/Betterdan/ai-memory/actions/workflows/ci.yml/badge.svg)](https://github.com/Betterdan/ai-memory/actions/workflows/ci.yml)

## 为什么

AI 编码 agent 在会话之间会丢失全部上下文,而每个工具(Claude Code、Codex……)又各有各的配置格式。`ai-memory` 同时解决这两个问题:

- **单一源。** 所有实际内容只存在于一份 agent 无关的 `.ai/` 目录里。工具专属目录(`.claude/`、`.agents/`)只是指回它的薄包装 —— 切换或新增工具都不会让你的知识库分叉。
- **跨会话不断档的记忆。** 结构化的记忆层记录上个会话完成到哪、需求整体进度、以及用户级偏好,让全新的 agent 能从上一个 agent 停下的地方精确接续。
- **带护栏的需求工作流。** 人工粗稿与 AI 定稿分别存放在带版本号的 `draft/` → `final/` 目录中,定稿前强制经过一道 “critic” 反驳评审门。

## 快速开始

```bash
# 交互式
npx @betterdanlins/ai-memory init

# 非交互式
npx @betterdanlins/ai-memory init --name demo --stack "PHP + Vue" --tools claude,codex --yes

# 显式启用分阶段模型路由
npx @betterdanlins/ai-memory init --model-profile balanced --yes

# 从已有项目导入用户级记忆(profile/feedback)
npx @betterdanlins/ai-memory init --import /path/to/other-project

# 已初始化项目只读检查升级计划
npx @betterdanlins/ai-memory update --dry-run

# 只应用无冲突的安全更新;有用户修改时整体拒绝
npx @betterdanlins/ai-memory update --yes

# 已初始化项目从继承模型切换到分层路由
npx @betterdanlins/ai-memory models configure --profile balanced
```

绝不静默覆盖:已存在的文件会逐个询问(交互式),或直接跳过(`--yes`)。
`--import` 指向的项目目录不存在、不是目录或不可读时会直接报错;目录有效但某个记忆文件缺失时会回退到默认模板,并在执行摘要中明确提示。
生成前会检查重复模板目标、路径越界和符号链接;模板读取与渲染全部通过后才开始写入。若实际磁盘写入中途失败,错误摘要会列出已经写入和尚未写入的文件。
已初始化项目不能重新运行 `init`;新版 CLI 先通过 `update --dry-run` 识别版本和用户修改。`update --yes` 只应用新增和基线哈希匹配的安全更新,存在合并/审查项时在写入前整体拒绝。
`update` 永远不碰用户资产。当某个版本改变了用户知识的组织方式时,`update` 只报告待执行的迁移,由 `ai-memory migrate --dry-run` / `--yes` 作为独立步骤执行——先 `update`,后 `migrate`。迁移是单向的:`schemaVersion` 一旦提升,旧版 CLI 将拒绝操作该项目。迁移中途失败时 `schemaVersion` 保持不变,直接重跑即可。

## 版本与兼容性

### v0.10.0 —— 会自己运行的门禁

- 新增 `ai-memory gate ready`:对 `iterations.md` 中标为 `in-progress` 的需求点做结构就绪检查——章节齐不齐、验收标准里还有没有 `TBD`、范围有没有写「不做」、契约状态有没有声明、开放问题有没有标注、实现交接有没有风险等级。它只查漏写与含糊,不判断内容对错。
- 把这道检查接到 `PreToolUse` hook 上:agent 开始编辑实现代码时自动触发,而不是等人想起来敲命令。不合格以退出码 2 阻塞该次编辑,并把原因喂回模型。`.ai/` 与 `docs/` 下的编辑始终放行——否则连去修需求文档都会被挡住,直接死锁。
- 新增 `ai-memory gate contract`:核对需求点的契约声明与实际改动是否一致。声明「不涉及对外接口」却碰了入口代码,或声明「契约 diff 已确认」却没有任何契约文件变更,都会被拦。它挂在 `Stop` hook 上,只阻塞一次,并用 `stop_hook_active` 保护,配置写错也不会把会话卡在结束不了的循环里。
- 新增 `ai-memory hooks install`:安装 git `pre-commit` 门禁,提交前跑齐三项检查。Claude Code 的强制来自 hook;Codex 等工具没有等价机制,这条命令是它们获得强制的唯一途径。
- `interfaces.md` 增加 `entry_globs` / `contract_globs` frontmatter。项目没填之前 `gate contract` 直接跳过并提示要补什么——不打扰还没维护契约文件的项目。
- 两道门禁都是纯文本与文件检查:几毫秒、零 token、不调模型,与「不引入会调用模型的守卫工具」一致。

### v0.9.0 —— 知识索引自动生成与适配层去规则化

- 知识页增加 frontmatter(`type`、`group`/`name`、`summary`、`contract`、`domains`,决策页 `status`/`date`),`ai-memory kb build` 据此重新生成 overview 的两张索引,以及每个领域页的关联入口与相关接口。
- 生成内容放在 `<!-- ai-memory:generated:<名称> -->` 标记之间,刻意区别于 `ai-memory:managed`:`update` 绝不能碰 `.ai/knowledge/`,用不同标记把这件事变成结构约束而不是纪律要求。标记之外的内容永不改写,标记损坏时保守失败。
- 新增 `ai-memory kb check`,只读校验 frontmatter、知识层内部链接、悬空领域/决策引用与索引是否过期;有问题时退出码为 1,可直接用作提交前或 CI 的门禁。
- 适配层去规则化。流程规则只存在于 `.ai/`;`.claude/`、`.agents/`、`.codex/` 只保留触发条件、工具原生映射和一句指向。两条守卫保证不再漂移:适配层正文不超过 200 字符(model-routing 两份是纯 agent 名映射,放宽到 400),且不得出现风险等级与流程措辞。
- `CLAUDE.md` / `AGENTS.md` 的受管区块变成纯路由表——任务对应 skill 与产物位置,不再复述流程。该区块每次会话都加载,是消除重复收益最高的地方。

### v0.8.0 —— 需求点工作流、知识层与显式迁移

- 移除 Superpowers 依赖。方案比较、实施计划和代码审查收回为自有模板;`code-review` 成为正式 skill,两侧工具都有适配层。
- 新增 `.ai/skills/risk-levels.md` 作为 S/M/L 行为的单一事实源。S 级改为轻量独立路径:不做自检、不建 handoff、不写技术设计与交付报告,相关测试通过即完成,失败最多修复两次后交回用户。
- 需求以需求点为单位推进。`draft/` 放需求集合,`final/<集合名>-<点名>.md` 放单个可独立验收、可独立提交的点;拆分信号决定何时拆,六条就绪标准取代进入实现前的额外审查。
- 新增 `docs/architecture/interfaces.md` 与 `.ai/skills/interface-contract.md`。对外入口形态与契约约定写入基线;改变对外可观察接口时,不论风险等级都必须先确认契约 diff。
- 记忆拆成过程记录(`.ai/memory/`)与当前知识(`.ai/knowledge/`),按对外入口页(主视图)和业务领域页(横向视图)组织,每条知识只有一个归属并有明确的提升规则。
- 新增 `ai-memory migrate --dry-run` / `--yes`,`schemaVersion` 提升到 2。`update` 保持原有承诺,永远不碰用户资产。

### v0.7.0 —— 发布工程化

- 新增 GitHub Actions 矩阵，覆盖 Windows/Linux、最低支持 Node.js `20.17.0` 和当前 LTS。
- 第三方 Actions 固定到不可变提交 SHA，关闭 checkout 凭据持久化，工作流只授予只读权限，并启用 npm/Actions 每周 Dependabot 更新。
- 新增真实发布包门禁：生成 npm tarball、拒绝本地专用文件、安装到隔离目录，再执行包内 `init` 与 `update --dry-run`。
- 用真实 CLI 启动和核心命令发现测试替换无意义的算术 smoke。
- 统一跟踪测试临时目录，CLI、scaffold、workflow、模型路由和模板测试在成功或失败后都会清理。
- 新增 `npm run verify`，作为本地与 CI 共用的完整发布检查入口。

### v0.6.0 —— 可执行的记忆加载闭环

- 将 `user-profile.md` 和 `feedback.md` 从被动导入文件接入核心会话上下文。每次会话按固定顺序加载用户画像、长期协作规则、项目状态和最新 session 条目。
- 增加明确的记忆写入路由：已确认的跨项目偏好进入 `user-profile.md`，可复用的用户纠正进入 `feedback.md`，项目事实留在项目记忆，一次性要求不落盘。
- 禁止推断个人画像和保存凭据。敏感信息默认不写，只有用户明确要求并确认仓库可见性后才能记录；新反馈与旧规则冲突时替换旧规则。
- 增加按任务加载路由，避免 Agent 一次性读取整个知识库；架构方法论只在项目启动和功能设计时明确加载。
- Claude 与 Codex 的模型路由 skill 现在显式映射实际原生代理名称，补齐等级到执行者之间的隐式断点。

### v0.5.0 —— 入口文件受管区块

- 为生成的 `AGENTS.md` 和 `CLAUDE.md` 框架区域增加明确的 `ai-memory:managed` 标记。后续升级只替换该区块,区块外的项目命令和自定义规则保持不变。
- 未修改的 v0.4.0 入口文件可依据生成基线哈希自动迁移为带标记结构。已经修改且没有标记的 v0.4.0 文件需要一次人工合并;标记建立后,后续框架升级不再与用户区块修改冲突。
- 标记缺失、重复或格式损坏时保守拒绝自动合并,不会退化为整文件覆盖。写入受管区块前还会再次核对当前文件哈希。
- `.claude/settings.json` 仍是混合 JSON 文件;框架和用户都修改时继续要求审查,不会向 JSON 强行加入 Markdown 标记。
- 修复 npm 自动改名 `.gitignore` 模板的问题,并安全替换未修改的 v0.4.0 `.ai/runs/.npmignore`;若该废弃文件被本地修改,仍要求人工审查。

### v0.4.0 —— 分阶段模型路由与可靠交接

- 新增可选的 `inherit`、`balanced`、`quality` profile。新项目和升级项目默认保持 `inherit`,安装 v0.4.0 不会静默增加模型成本,也不会改变 v0.3.0 的工作流深度。
- 为 Claude Code 和 Codex 新增原生分层 agents,覆盖高级规划/审查、中等或高级实现、低成本或中等测试编写。仍先由原有 S/M/L 流程决定是否需要某个阶段,模型路由只选择执行者。
- 新增 `models show/configure` 和 `workflow prepare/verify/complete`。跨模型交接通过路径和 SHA-256 引用正式需求、设计与计划;输入过期、未决问题、路由变化、不安全路径和验收回执缺失都会关闭式失败。
- `.ai/config/model-routing.json` 属于用户配置,`.ai/runs/` 只保存本地运行状态。框架不会自动探测账号模型权限:Claude 使用原生模型别名,Codex agents 使用原生推理等级。

### v0.3.0 —— 安全升级与工程工作流

- 引入 `.ai/ai-memory.json` 框架/Schema 元数据、文件所有权、生成基线哈希、v0.1 legacy 检测和显式迁移规划。
- 新增 `update --dry-run` 与无冲突 `update --yes`。用户记忆、需求、架构和设计资产始终保留;修改过的框架文件或混合文件进入人工审查,不会被直接覆盖。
- 增加重复目标、路径穿越、符号链接/junction 防护、三阶段生成和可诊断的部分写入摘要。
- 增加语言无关的 `project-inception`、`feature-design`、`delivery-readiness`,覆盖数据建模、技术接口、部署、性能、可观测性、扩展性、可靠性、安全和成本。

### 从 v0.3.0 升级到 v0.4.0

```bash
# 只读预览,不得修改项目
npx @betterdanlins/ai-memory@0.4.0 update --dry-run

# 仅在预览没有 merge/review 阻塞项时应用
npx @betterdanlins/ai-memory@0.4.0 update --yes

# 可选:安全升级后显式启用分阶段模型路由
npx @betterdanlins/ai-memory@0.4.0 models configure --profile balanced
```

升级完成后 profile 仍为 `inherit`,只有显式配置才会改变。不要在已有 v0.3.0 项目重新运行 `init`。若 dry-run 出现 merge/review 项,应以新生成的 v0.4.0 文件为参考人工合并,然后重新执行 dry-run。

### 从 v0.4.0 升级到 v0.5.0

```bash
npx @betterdanlins/ai-memory@0.5.0 update --dry-run
npx @betterdanlins/ai-memory@0.5.0 update --yes
```

如果 `AGENTS.md` 或 `CLAUDE.md` 仍是未修改的 v0.4.0 生成版本,会自动迁移。若无标记入口已被定制,dry-run 会报告 `merge`;应对照全新 v0.5.0 参考文件,把项目内容放进 user 区块后重试。标记建立后,只在 `<!-- ai-memory:managed:start/end -->` 之外编辑。

### 从 v0.5.0 升级到 v0.6.0

```bash
npx @betterdanlins/ai-memory@0.6.0 update --dry-run
npx @betterdanlins/ai-memory@0.6.0 update --yes
```

`AGENTS.md` / `CLAUDE.md` 的受管区块和未修改的框架文件会自动更新。已有 `user-profile.md`、`feedback.md`、项目状态和 feature 记忆继续属于用户资产，绝不覆盖；新的进场和 memory-update 协议会立即使用已有内容。更完整的画像/反馈初始结构只用于全新项目或仍缺失的文件。

### 从 v0.6.0 升级到 v0.7.0

```bash
npx @betterdanlins/ai-memory@0.7.0 update --dry-run
npx @betterdanlins/ai-memory@0.7.0 update --yes
```

v0.7.0 改变的是发布验证，不修改项目所有的工作流数据。正常升级只刷新未修改的框架元数据/模板；用户记忆、需求、设计、模型 profile 和入口 user 区块保持不变。

### 从 v0.7.0 升级到 v0.8.0

```bash
npx @betterdanlins/ai-memory@0.8.0 update --dry-run
npx @betterdanlins/ai-memory@0.8.0 update --yes

# 用户资产由独立命令迁移,在 update 之后执行
npx @betterdanlins/ai-memory@0.8.0 migrate --dry-run
npx @betterdanlins/ai-memory@0.8.0 migrate --yes
```

先 `update` 后 `migrate`:迁移要写入的知识文件由 `update` 创建。`update` 只新增框架文件并刷新受管区块,把 `schemaVersion` 保持在 1,并报告待执行的迁移。

`migrate` 把 `project-state.md` 并入 `knowledge/overview.md` 与 `knowledge/iterations.md`,原文件归档到 `.ai/memory/archive/`,`.ai/memory/features/` 原地保留并输出待归类清单,由你按 `.ai/skills/knowledge-structure.md` 人工归类。解析不了的内容整块搬进「待整理」区而不是丢弃;你自己改过的目标会被跳过,不会被覆盖。

迁移是单向的:`schemaVersion` 一旦变为 2,0.8.0 之前的 CLI 将拒绝操作该项目。中途失败时 `schemaVersion` 保持为 1,直接重跑即可。

### 从 v0.8.0 升级到 v0.9.0

```bash
npx @betterdanlins/ai-memory@0.9.0 update --dry-run
npx @betterdanlins/ai-memory@0.9.0 update --yes
```

不需要迁移:`schemaVersion` 仍为 2,`migrate` 无事可做。适配层与入口受管区块原地更新,user 区块和 `.ai/knowledge/` 下的内容不受影响。

如果你在 v0.8.0 下已经写了知识页,它们还没有 frontmatter。`kb build` 会跳过这些页,`kb check` 会逐个列出——按 `.ai/knowledge/entries/README.md` 与 `domains/README.md` 里的示例补上 frontmatter,该页才会进入自动索引。不补的页仍然是普通 Markdown,照常可用。

v0.9.0 之前建的领域页没有生成区标记。把 `domains/README.md` 里的两对标记复制到页尾即可;没有标记时 `kb build` 会直接跳过该页。

### 从 v0.9.0 升级到 v0.10.0

```bash
npx @betterdanlins/ai-memory@0.10.0 update --dry-run
npx @betterdanlins/ai-memory@0.10.0 update --yes
```

不需要迁移,`schemaVersion` 仍为 2。

**如果你改过 `.claude/settings.json`,dry-run 会报 `merge`。** 该文件是混合所有权的 JSON,框架不会覆盖它。用新生成的模板作参考,把 `PreToolUse` 区块和 `Stop` 下的 `gate contract` 一条并进你自己的文件,再跑一次 dry-run。没动过该文件的项目会自动更新。

`gate ready` 在 `iterations.md` 里有需求点标为 `in-progress` 时即生效;没有任何点处于该状态时不拦截任何编辑。

`gate contract` 要等 `docs/architecture/interfaces.md` 声明了路径才生效。该文件属于用户资产,`update` 不会替你加 frontmatter:

```yaml
---
entry_globs: [src/api/**, src/pages/**]
contract_globs: [docs/api/**]
---
```

git 门禁是可选的:`ai-memory hooks install` 启用,`ai-memory hooks status` 查看。已存在的 `pre-commit` 不加 `--force` 绝不覆盖。

## 生成什么

```
.ai/                          # 单一源,所有 agent 共享
├── README.md                 # 会话进场协议
├── ai-memory.json            # 版本、Schema、工具、所有权和生成基线哈希
├── config/
│   └── model-routing.json    # inherit/balanced/quality 阶段路由;属于用户配置
├── knowledge/                # 当前知识:系统现在是什么样
│   ├── overview.md           # 目标、技术栈、当前迭代、遗留问题
│   ├── entries/              # 对外入口页(主视图)
│   ├── domains/              # 业务领域页(横向视图)
│   ├── decisions/            # 决策记录,标注生效或已取代
│   ├── iterations.md         # 需求集合、需求点状态与顺序
│   └── conventions.md        # 开发约定
├── memory/
│   ├── MEMORY.md             # 核心/按需记忆加载索引
│   ├── session-log.md        # 进展与下一步的流水日志
│   ├── user-profile.md       # 背景、偏好、沟通方式
│   └── feedback.md           # 从反馈提炼的行为规范
├── runs/                     # 本地交接与阶段回执;默认不进入 Git
└── skills/                   # 方法论:requirements-flow、architecture、
                              # feature-design、model-routing、delivery-readiness 等

docs/architecture/            # 0→1 项目工程基线
├── system-context.md         # 系统边界、参与者、模块和关键流程
├── data-model.md             # 实体、关系、所有权、一致性和迁移
├── quality-attributes.md     # 性能、可观测性、扩展性、可靠性等
├── deployment.md             # 部署拓扑、发布、回滚和运行保障
└── interfaces.md             # 对外入口形态、契约格式与验证约定

docs/requirements/vX.Y.Z/
├── draft/                    # 人工书写的粗稿需求
└── final/                    # AI 定稿(通过 critic 门)

docs/design/vX.Y.Z/           # M/L 级功能 how、技术接口与工程增量

# 薄适配层,仅为你启用的工具生成:
CLAUDE.md + .claude/          # Claude Code:commands、skills、agents、settings
AGENTS.md + .agents/ + .codex/# Codex:skills 与分层自定义 agents
```

## CLI 命令

| 命令 | 说明 |
| --- | --- |
| `init` | 初始化全新项目;检测到已有 ai-memory 安装时拒绝执行 |
| `update --dry-run` | 只读分析旧项目到当前 CLI 版本的升级计划 |
| `update --yes` | 应用无冲突安全更新;用户修改、混合文件冲突或缺失迁移路径会拒绝执行 |
| `migrate --dry-run` | 预览用户资产的 Schema 迁移,不写任何文件 |
| `migrate --yes` | 执行迁移;全部变更写入成功后才提升 `schemaVersion` |
| `kb build [--dry-run]` | 按知识页 frontmatter 重新生成索引与领域页横向视图;只重写生成区块 |
| `kb check` | 只读校验 frontmatter、内部链接、悬空引用与索引是否过期;有问题时退出码 1 |
| `gate ready [--point <名>] [--hook]` | 检查进行中需求点定稿的结构就绪度;退出码 1,`--hook` 模式为 2 以便 PreToolUse 阻塞实现 |
| `gate contract [--staged] [--hook]` | 核对需求点的契约声明与实际改动是否一致;`interfaces.md` 未填 globs 时跳过 |
| `hooks install [--force]` / `hooks status` | 安装跨工具的 git pre-commit 门禁,让 Codex 等工具也有强制 |
| `kb export [--out <路径>] [--mermaid <路径>] [--no-download]` | 把知识层、架构基线、需求定稿与技术设计导出为一个自包含 HTML,打开就能看清项目全貌与进度;mermaid 图离线可渲染,渲染器按固定版本取一次并缓存 |
| `models show` | 显示当前 profile 和每个阶段解析后的模型等级 |
| `models configure --profile <name>` | 选择 `inherit`、`balanced` 或 `quality`,不修改需求、设计或代码 |
| `workflow prepare` | 用正式输入文档的哈希创建本地交接清单 |
| `workflow verify` | 执行前拒绝缺失、过期、有未决问题或路由不匹配的交接 |
| `workflow complete` | 校验并保存供后续审查使用的结构化阶段回执 |

### `init` 选项

| 选项 | 说明 |
| --- | --- |
| `--name <name>` | 项目名(默认取当前目录名) |
| `--stack <desc>` | 技术栈描述 |
| `--tools <list>` | 逗号分隔的适配层:`claude`、`codex` |
| `--model-profile <profile>` | `inherit`(默认)、`balanced` 或 `quality`;`--yes` 不会静默启用高成本路由 |
| `--import <path>` | 从已有项目导入 `user-profile` / `feedback` |
| `--yes` | 非交互模式:缺参用默认值,冲突一律跳过 |

## 工作原理

生成器由一组职责明确的小模块构成:

- **manifest** —— 遍历 `common` / `claude` / `codex` 模板组,只保留已启用工具对应的组,产出一份扁平的 `{src, dest}` 清单;重复目标会在写入前报错并列出来源。
- **render** —— 替换 `{{变量}}` 占位符,遇到任何未定义变量即抛错,让坏掉的模板大声失败,而不是把 `{{...}}` 发出去。
- **scaffold** —— 预检安全目标路径和符号链接,处理冲突并在内存中完成全部读取/渲染后再逐个写入;提供 `--import` 时先校验导入目录,再从中拉取 `user-profile` / `feedback`(单个源文件缺失则回退到模板并明确报告)。
- **framework metadata** —— 全新 init 记录 framework/schema 版本、文件所有权和生成哈希;update 据此区分安全更新与用户修改。无元数据的 v0.1 项目按 legacy 保守规划。
- **managed entry blocks** —— Markdown 入口只更新通过校验的框架区块;无标记或标记损坏的定制文件仍人工合并,JSON settings 继续采用保守整文件审查。
- **model routing** —— 可选 profile 把现有阶段映射为 premium、standard、economy、inherit 或无模型执行;Claude/Codex 使用原生自定义 agent 配置,路由不会增加 S/M/L 阶段。
- **workflow handoff** —— 本地清单只用路径和 SHA-256 引用正式需求/设计/计划;输入过期、未决问题、路由变化、路径越界或符号链接都会关闭式失败。
- **发布包验证** —— CI 和本地验证直接安装生成的 tarball，运行包内 CLI，并断言本地协作文件不会进入发布物。

## 设计原则

- **单一源** —— 正文只在 `.ai/`;`.claude/`、`.agents/` 只是触发包装。
- **可执行的分域记忆** —— 每次会话只加载小型核心集合；长期用户偏好、可复用反馈、项目事实和功能决策分别写入不同位置，任务产物继续按需加载。
- **工程节点记忆** —— 只在可独立验收的功能/阶段、关键决策、状态变化或工具切换时写 session-log,避免细碎步骤制造噪声。
- **需求双目录** —— 人工粗稿(`draft/`)→ AI 定稿(`final/`),中间隔一道强制 critic 门。
- **项目工程基线** —— 0→1 项目先建立语言无关的系统、数据、质量属性和部署基线;普通功能只记录增量,不重复设计全局架构。
- **风险分级设计** —— S 级需求直接实现;M/L 级用 feature-design 补齐 how、技术接口和工程影响,方案比较与分阶段实施计划只按风险选择使用。
- **可选成本路由** —— `inherit` 保持旧行为;显式 profile 才用高级模型规划/审查和低成本 worker 做有边界的测试工作,确定性测试执行不调用模型。
- **工程产物交接** —— 跨模型阶段通过校验后的正式文档交接,不依赖对话摘要;阶段回执向最终 reviewer 暴露验收覆盖、设计偏差和未决风险。
- **证据化交付** —— 发布前按风险检查契约、测试、迁移、回滚、性能、可观测性和运行保障,输出明确 ready 状态。
- **低噪声记忆** —— 只在可验收工程节点、关键决策、状态变化和会话切换时落盘,不记录每个细碎代码步骤。
- **幂等** —— 已存在的文件逐个询问;`--yes` 一律跳过。绝不静默覆盖。
- **安全落盘** —— 目标必须位于项目目录内,拒绝跟随符号链接覆盖;写入失败会保留可诊断的进度摘要。
- **显式兼容** —— 新版 CLI 可识别旧 Schema,用户资产永不由模板覆盖;升级先 dry-run,实际更新只处理基线匹配文件,不把重新 init 当作更新。

## 开发

```bash
npm test              # 单元及 CLI/模板集成测试
npm run test:package  # 打包、隔离安装、包内 init/update smoke
npm run verify        # 本地与 CI 完整发布门禁
```

## 许可证

[MIT](LICENSE) © Betterdan
