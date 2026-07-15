# ai-memory

> Scaffold a shared AI memory layer and requirements workflow into any project — one command, portable across Claude Code, Codex, and future agents.

[English](README.md) · [简体中文](README.zh-CN.md)

## Why

AI coding agents forget everything between sessions, and every tool (Claude Code, Codex, …) wants its own config format. `ai-memory` fixes both:

- **One source of truth.** All real content lives in a single agent-agnostic `.ai/` directory. Tool-specific folders (`.claude/`, `.agents/`) are thin wrappers that just point back to it — so switching or adding tools never forks your knowledge base.
- **Memory that survives sessions.** A structured memory layer records what the last session finished, overall requirement progress, and user-level preferences, so a fresh agent can pick up exactly where the previous one left off.
- **A requirements workflow with guardrails.** Human rough drafts and AI-finalized specs live in versioned `draft/` → `final/` directories, with a mandatory "critic" review gate before anything is finalized.

## Quick start

```bash
# Interactive
npx @betterdanlins/ai-memory init

# Non-interactive
npx @betterdanlins/ai-memory init --name demo --stack "PHP + Vue" --tools claude,codex --yes

# Import user-level memory (profile/feedback) from an existing project
npx @betterdanlins/ai-memory init --import /path/to/other-project
```

Nothing is ever overwritten silently: existing files are asked about one by one (interactive) or skipped (`--yes`).

## What it generates

```
.ai/                          # single source of truth, shared by all agents
├── README.md                 # session entry protocol
├── memory/
│   ├── MEMORY.md             # index — agents read this first
│   ├── project-state.md      # stack, current version, requirement progress
│   ├── session-log.md        # rolling log of progress & next steps
│   ├── user-profile.md       # background, preferences, communication style
│   ├── feedback.md           # behavioral norms distilled from feedback
│   └── features/             # per-feature dossiers
└── skills/                   # methodology: requirements-flow, architecture,
                              # code-review, critic, memory-update

docs/requirements/vX.Y.Z/
├── draft/                    # human-written rough requirements
└── final/                    # AI-finalized specs (passes the critic gate)

# Thin adapters, generated only for the tools you enable:
CLAUDE.md + .claude/          # Claude Code: commands, skills, agents, settings
AGENTS.md + .agents/          # Codex: skills
```

## CLI options

| Option | Description |
| --- | --- |
| `--name <name>` | Project name (defaults to the current directory name) |
| `--stack <desc>` | Tech-stack description |
| `--tools <list>` | Comma-separated adapters to enable: `claude`, `codex` |
| `--import <path>` | Import `user-profile` / `feedback` from an existing project |
| `--yes` | Non-interactive: fill defaults, skip on any conflict |

## How it works

The generator is a small set of pure functions:

- **manifest** — walks the `common` / `claude` / `codex` template groups, keeping only the groups whose tools are enabled, and produces a flat `{src, dest}` list.
- **render** — substitutes `{{variable}}` placeholders and throws on any undefined variable, so a broken template fails loudly instead of shipping `{{...}}`.
- **scaffold** — writes each file, routes conflicts through a callback (ask / skip / overwrite), and pulls `user-profile` / `feedback` from `--import` when provided (falling back to the template if the source file is missing).

## Design principles

- **Single source** — content lives only in `.ai/`; `.claude/` and `.agents/` are trigger wrappers.
- **Node-based memory** — write a session-log entry the moment a task node completes, so switching tools mid-task loses nothing.
- **Dual requirement directories** — human draft (`draft/`) → AI final (`final/`) behind a mandatory critic gate.
- **Idempotent** — existing files are asked about one by one; `--yes` always skips. Never a silent overwrite.

## Development

```bash
npm test        # node --test test/*.test.js
```

## License

[MIT](LICENSE) © Betterdan
