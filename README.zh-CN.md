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

# 从已有项目导入用户级记忆(profile/feedback)
npx @betterdanlins/ai-memory init --import /path/to/other-project

# 已初始化项目只读检查升级计划
npx @betterdanlins/ai-memory update --dry-run

# 只应用无冲突的安全更新;有用户修改时整体拒绝
npx @betterdanlins/ai-memory update --yes
```

绝不静默覆盖:已存在的文件会逐个询问(交互式),或直接跳过(`--yes`)。
`--import` 指向的项目目录不存在、不是目录或不可读时会直接报错;目录有效但某个记忆文件缺失时会回退到默认模板,并在执行摘要中明确提示。
生成前会检查重复模板目标、路径越界和符号链接;模板读取与渲染全部通过后才开始写入。若实际磁盘写入中途失败,错误摘要会列出已经写入和尚未写入的文件。
已初始化项目不能重新运行 `init`;新版 CLI 先通过 `update --dry-run` 识别版本和用户修改。`update --yes` 只应用新增和基线哈希匹配的安全更新,存在合并/审查项时在写入前整体拒绝。

## 生成什么

```
.ai/                          # 单一源,所有 agent 共享
├── README.md                 # 会话进场协议
├── ai-memory.json            # 版本、Schema、工具、所有权和生成基线哈希
├── memory/
│   ├── MEMORY.md             # 索引 —— agent 进场先读
│   ├── project-state.md      # 技术栈、当前版本、需求进度
│   ├── session-log.md        # 进展与下一步的流水日志
│   ├── user-profile.md       # 背景、偏好、沟通方式
│   ├── feedback.md           # 从反馈提炼的行为规范
│   └── features/             # 功能档案
└── skills/                   # 方法论:requirements-flow、architecture、
                              # project-inception、feature-design、delivery-readiness 等

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
AGENTS.md + .agents/          # Codex:skills
```

## CLI 命令

| 命令 | 说明 |
| --- | --- |
| `init` | 初始化全新项目;检测到已有 ai-memory 安装时拒绝执行 |
| `update --dry-run` | 只读分析旧项目到当前 CLI 版本的升级计划 |
| `update --yes` | 应用无冲突安全更新;用户修改、混合文件冲突或缺失迁移路径会拒绝执行 |

### `init` 选项

| 选项 | 说明 |
| --- | --- |
| `--name <name>` | 项目名(默认取当前目录名) |
| `--stack <desc>` | 技术栈描述 |
| `--tools <list>` | 逗号分隔的适配层:`claude`、`codex` |
| `--import <path>` | 从已有项目导入 `user-profile` / `feedback` |
| `--yes` | 非交互模式:缺参用默认值,冲突一律跳过 |

## 工作原理

生成器由一组纯函数构成:

- **manifest** —— 遍历 `common` / `claude` / `codex` 模板组,只保留已启用工具对应的组,产出一份扁平的 `{src, dest}` 清单;重复目标会在写入前报错并列出来源。
- **render** —— 替换 `{{变量}}` 占位符,遇到任何未定义变量即抛错,让坏掉的模板大声失败,而不是把 `{{...}}` 发出去。
- **scaffold** —— 预检安全目标路径和符号链接,处理冲突并在内存中完成全部读取/渲染后再逐个写入;提供 `--import` 时先校验导入目录,再从中拉取 `user-profile` / `feedback`(单个源文件缺失则回退到模板并明确报告)。
- **framework metadata** —— 全新 init 记录 framework/schema 版本、文件所有权和生成哈希;update 据此区分安全更新与用户修改。无元数据的 v0.1 项目按 legacy 保守规划。

## 设计原则

- **单一源** —— 正文只在 `.ai/`;`.claude/`、`.agents/` 只是触发包装。
- **工程节点记忆** —— 只在可独立验收的功能/阶段、关键决策、状态变化或工具切换时写 session-log,避免细碎步骤制造噪声。
- **需求双目录** —— 人工粗稿(`draft/`)→ AI 定稿(`final/`),中间隔一道强制 critic 门。
- **项目工程基线** —— 0→1 项目先建立语言无关的系统、数据、质量属性和部署基线;普通功能只记录增量,不重复设计全局架构。
- **风险分级设计** —— S 级需求直接实现;M/L 级用 feature-design 补齐 how、技术接口和工程影响,Superpowers 只按风险选择使用。
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
