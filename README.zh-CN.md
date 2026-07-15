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
```

绝不静默覆盖:已存在的文件会逐个询问(交互式),或直接跳过(`--yes`)。

## 生成什么

```
.ai/                          # 单一源,所有 agent 共享
├── README.md                 # 会话进场协议
├── memory/
│   ├── MEMORY.md             # 索引 —— agent 进场先读
│   ├── project-state.md      # 技术栈、当前版本、需求进度
│   ├── session-log.md        # 进展与下一步的流水日志
│   ├── user-profile.md       # 背景、偏好、沟通方式
│   ├── feedback.md           # 从反馈提炼的行为规范
│   └── features/             # 功能档案
└── skills/                   # 方法论:requirements-flow、architecture、
                              # code-review、critic、memory-update

docs/requirements/vX.Y.Z/
├── draft/                    # 人工书写的粗稿需求
└── final/                    # AI 定稿(通过 critic 门)

# 薄适配层,仅为你启用的工具生成:
CLAUDE.md + .claude/          # Claude Code:commands、skills、agents、settings
AGENTS.md + .agents/          # Codex:skills
```

## CLI 选项

| 选项 | 说明 |
| --- | --- |
| `--name <name>` | 项目名(默认取当前目录名) |
| `--stack <desc>` | 技术栈描述 |
| `--tools <list>` | 逗号分隔的适配层:`claude`、`codex` |
| `--import <path>` | 从已有项目导入 `user-profile` / `feedback` |
| `--yes` | 非交互模式:缺参用默认值,冲突一律跳过 |

## 工作原理

生成器由一组纯函数构成:

- **manifest** —— 遍历 `common` / `claude` / `codex` 模板组,只保留已启用工具对应的组,产出一份扁平的 `{src, dest}` 清单。
- **render** —— 替换 `{{变量}}` 占位符,遇到任何未定义变量即抛错,让坏掉的模板大声失败,而不是把 `{{...}}` 发出去。
- **scaffold** —— 逐个写文件,冲突交给回调处理(询问 / 跳过 / 覆盖),并在提供 `--import` 时从中拉取 `user-profile` / `feedback`(源文件缺失则回退到模板)。

## 设计原则

- **单一源** —— 正文只在 `.ai/`;`.claude/`、`.agents/` 只是触发包装。
- **节点式记忆** —— 完成一个任务节点就立即写一条 session-log,跨工具切换不断档。
- **需求双目录** —— 人工粗稿(`draft/`)→ AI 定稿(`final/`),中间隔一道强制 critic 门。
- **幂等** —— 已存在的文件逐个询问;`--yes` 一律跳过。绝不静默覆盖。

## 开发

```bash
npm test        # node --test test/*.test.js
```

## 许可证

[MIT](LICENSE) © Betterdan
