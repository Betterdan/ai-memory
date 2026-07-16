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

# Inspect an existing project's upgrade plan without writing
npx @betterdanlins/ai-memory update --dry-run

# Apply only conflict-free safe updates; abort entirely on user changes
npx @betterdanlins/ai-memory update --yes
```

Nothing is ever overwritten silently: existing files are asked about one by one (interactive) or skipped (`--yes`).
An invalid, non-directory, or unreadable `--import` project path fails explicitly. If the project directory is valid but an individual memory file is missing, the CLI falls back to its template and reports that fallback in the summary.
Before writing, the CLI checks for duplicate template destinations, path traversal, and symbolic links, then reads and renders every planned file. If an actual filesystem write fails midway, the error summary lists both written and not-yet-written files.
An initialized project cannot be initialized again. A newer CLI first uses `update --dry-run` to identify versions and user modifications. `update --yes` applies only additions and baseline-matching safe updates, aborting before any write when merge or review items exist.

## What it generates

```
.ai/                          # single source of truth, shared by all agents
├── README.md                 # session entry protocol
├── ai-memory.json            # version, schema, tools, ownership, baseline hashes
├── memory/
│   ├── MEMORY.md             # index — agents read this first
│   ├── project-state.md      # stack, current version, requirement progress
│   ├── session-log.md        # rolling log of progress & next steps
│   ├── user-profile.md       # background, preferences, communication style
│   ├── feedback.md           # behavioral norms distilled from feedback
│   └── features/             # per-feature dossiers
└── skills/                   # methodology: requirements-flow, architecture,
                              # project-inception, feature-design, delivery-readiness, etc.

docs/architecture/            # engineering baseline for 0-to-1 projects
├── system-context.md         # boundaries, actors, modules, and key flows
├── data-model.md             # entities, ownership, consistency, and migration
├── quality-attributes.md     # performance, observability, scalability, reliability
└── deployment.md             # topology, releases, rollback, and operations

docs/requirements/vX.Y.Z/
├── draft/                    # human-written rough requirements
└── final/                    # AI-finalized specs (passes the critic gate)

docs/design/vX.Y.Z/           # M/L-risk feature how, technical contracts, deltas

# Thin adapters, generated only for the tools you enable:
CLAUDE.md + .claude/          # Claude Code: commands, skills, agents, settings
AGENTS.md + .agents/          # Codex: skills
```

## CLI commands

| Command | Description |
| --- | --- |
| `init` | Initialize a new project; refuses to run over an existing ai-memory installation |
| `update --dry-run` | Read-only analysis of the upgrade plan from an existing project to this CLI version |
| `update --yes` | Apply conflict-free safe updates; refuse user changes, mixed-file conflicts, or missing migration paths |

### `init` options

| Option | Description |
| --- | --- |
| `--name <name>` | Project name (defaults to the current directory name) |
| `--stack <desc>` | Tech-stack description |
| `--tools <list>` | Comma-separated adapters to enable: `claude`, `codex` |
| `--import <path>` | Import `user-profile` / `feedback` from an existing project |
| `--yes` | Non-interactive: fill defaults, skip on any conflict |

## How it works

The generator is a small set of pure functions:

- **manifest** — walks the `common` / `claude` / `codex` template groups, keeping only the groups whose tools are enabled, and produces a flat `{src, dest}` list; duplicate destinations fail before writing and list every source.
- **render** — substitutes `{{variable}}` placeholders and throws on any undefined variable, so a broken template fails loudly instead of shipping `{{...}}`.
- **scaffold** — validates safe destinations and symbolic links, resolves conflicts, and reads/renders the complete plan in memory before writing; it also validates `--import` and pulls `user-profile` / `feedback` from it (falling back to the template with an explicit report when an individual source file is missing).
- **framework metadata** — a fresh init records framework/schema versions, ownership, and generated hashes; update uses them to distinguish safe updates from user changes. Metadata-free v0.1 projects are planned conservatively as legacy installations.

## Design principles

- **Single source** — content lives only in `.ai/`; `.claude/` and `.agents/` are trigger wrappers.
- **Engineering-node memory** — write session-log entries for independently verifiable features/phases, durable decisions, status changes, or tool handoffs, avoiding noise from tiny implementation steps.
- **Dual requirement directories** — human draft (`draft/`) → AI final (`final/`) behind a mandatory critic gate.
- **Project engineering baseline** — 0-to-1 projects establish language-agnostic system, data, quality-attribute, and deployment baselines once; ordinary features record only deltas.
- **Risk-tiered design** — S-risk requirements proceed directly to implementation; M/L-risk work uses feature-design for how, technical contracts, and engineering impact, with Superpowers selected only when justified by risk.
- **Evidence-based delivery** — before release, verify applicable contracts, tests, migration, rollback, performance, observability, and operations, producing an explicit readiness verdict.
- **Low-noise memory** — persist independently verifiable engineering nodes, durable decisions, status changes, and session handoffs instead of every small coding step.
- **Idempotent** — existing files are asked about one by one; `--yes` always skips. Never a silent overwrite.
- **Safe writes** — destinations must remain inside the target project, symbolic-link overwrites are rejected, and write failures retain a diagnostic progress summary.
- **Explicit compatibility** — newer CLIs can recognize older schemas, user assets are never overwritten from templates, and actual updates only touch baseline-matching files after a dry run rather than re-running init.

## Development

```bash
npm test        # node --test test/*.test.js
```

## License

[MIT](LICENSE) © Betterdan
