# ai-memory

> 一条命令,为任意项目搭建一套共享的 AI 记忆层与需求工作流 —— 跨 Claude Code、Codex 及未来的 agent 通用。

[English](README.md) · [简体中文](README.zh-CN.md)

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

## 版本与兼容性

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

## 生成什么

```
.ai/                          # 单一源,所有 agent 共享
├── README.md                 # 会话进场协议
├── ai-memory.json            # 版本、Schema、工具、所有权和生成基线哈希
├── config/
│   └── model-routing.json    # inherit/balanced/quality 阶段路由;属于用户配置
├── memory/
│   ├── MEMORY.md             # 索引 —— agent 进场先读
│   ├── project-state.md      # 技术栈、当前版本、需求进度
│   ├── session-log.md        # 进展与下一步的流水日志
│   ├── user-profile.md       # 背景、偏好、沟通方式
│   ├── feedback.md           # 从反馈提炼的行为规范
│   └── features/             # 功能档案
├── runs/                     # 本地交接与阶段回执;默认不进入 Git
└── skills/                   # 方法论:requirements-flow、architecture、
                              # feature-design、model-routing、delivery-readiness 等

docs/architecture/            # 0→1 项目工程基线
├── system-context.md         # 系统边界、参与者、模块和关键流程
├── data-model.md             # 实体、关系、所有权、一致性和迁移
├── quality-attributes.md     # 性能、可观测性、扩展性、可靠性等
└── deployment.md             # 部署拓扑、发布、回滚和运行保障

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

## 设计原则

- **单一源** —— 正文只在 `.ai/`;`.claude/`、`.agents/` 只是触发包装。
- **工程节点记忆** —— 只在可独立验收的功能/阶段、关键决策、状态变化或工具切换时写 session-log,避免细碎步骤制造噪声。
- **需求双目录** —— 人工粗稿(`draft/`)→ AI 定稿(`final/`),中间隔一道强制 critic 门。
- **项目工程基线** —— 0→1 项目先建立语言无关的系统、数据、质量属性和部署基线;普通功能只记录增量,不重复设计全局架构。
- **风险分级设计** —— S 级需求直接实现;M/L 级用 feature-design 补齐 how、技术接口和工程影响,Superpowers 只按风险选择使用。
- **可选成本路由** —— `inherit` 保持旧行为;显式 profile 才用高级模型规划/审查和低成本 worker 做有边界的测试工作,确定性测试执行不调用模型。
- **工程产物交接** —— 跨模型阶段通过校验后的正式文档交接,不依赖对话摘要;阶段回执向最终 reviewer 暴露验收覆盖、设计偏差和未决风险。
- **证据化交付** —— 发布前按风险检查契约、测试、迁移、回滚、性能、可观测性和运行保障,输出明确 ready 状态。
- **低噪声记忆** —— 只在可验收工程节点、关键决策、状态变化和会话切换时落盘,不记录每个细碎代码步骤。
- **幂等** —— 已存在的文件逐个询问;`--yes` 一律跳过。绝不静默覆盖。
- **安全落盘** —— 目标必须位于项目目录内,拒绝跟随符号链接覆盖;写入失败会保留可诊断的进度摘要。
- **显式兼容** —— 新版 CLI 可识别旧 Schema,用户资产永不由模板覆盖;升级先 dry-run,实际更新只处理基线匹配文件,不把重新 init 当作更新。

## 开发

```bash
npm test        # node --test test/*.test.js
```

## 许可证

[MIT](LICENSE) © Betterdan
