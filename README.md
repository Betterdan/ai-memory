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

# Opt in to staged model routing
npx @betterdanlins/ai-memory init --model-profile balanced --yes

# Import user-level memory (profile/feedback) from an existing project
npx @betterdanlins/ai-memory init --import /path/to/other-project

# Inspect an existing project's upgrade plan without writing
npx @betterdanlins/ai-memory update --dry-run

# Apply only conflict-free safe updates; abort entirely on user changes
npx @betterdanlins/ai-memory update --yes

# Switch an initialized project from inherited models to staged routing
npx @betterdanlins/ai-memory models configure --profile balanced
```

Nothing is ever overwritten silently: existing files are asked about one by one (interactive) or skipped (`--yes`).
An invalid, non-directory, or unreadable `--import` project path fails explicitly. If the project directory is valid but an individual memory file is missing, the CLI falls back to its template and reports that fallback in the summary.
Before writing, the CLI checks for duplicate template destinations, path traversal, and symbolic links, then reads and renders every planned file. If an actual filesystem write fails midway, the error summary lists both written and not-yet-written files.
An initialized project cannot be initialized again. A newer CLI first uses `update --dry-run` to identify versions and user modifications. `update --yes` applies only additions and baseline-matching safe updates, aborting before any write when merge or review items exist.

## Versions and compatibility

### v0.6.0 — actionable memory loading

- Turns `user-profile.md` and `feedback.md` from passive import files into core session context. Every session loads the profile, durable collaboration rules, project state, and the latest session entry in a fixed order.
- Adds an explicit memory write router: confirmed cross-project preferences go to `user-profile.md`, reusable user corrections go to `feedback.md`, project facts stay in project memory, and one-off instructions are not persisted.
- Forbids inferred personal profiling and credential storage. Sensitive information is omitted by default and requires both an explicit request and confirmation of repository visibility; newer feedback replaces conflicting older rules.
- Adds task-specific loading routes so agents do not read the whole knowledge base. The architecture methodology is now explicitly loaded only by project inception and feature design.
- Connects Claude and Codex model-routing skills to their concrete native agent names, removing the implicit tier-to-executor gap.

### v0.5.0 — managed entry blocks

- Wraps the framework-owned sections of generated `AGENTS.md` and `CLAUDE.md` in explicit `ai-memory:managed` markers. Future updates replace only that block and preserve project commands and custom rules outside it.
- An unchanged v0.4.0 entry file can migrate to marked blocks automatically because its generated baseline hash proves it has not been edited. A modified unmarked v0.4.0 file requires one manual merge; after markers are established, later framework updates no longer conflict with user-section changes.
- Missing, duplicated, or malformed markers fail conservatively instead of triggering a whole-file overwrite. Managed-block updates also re-check the current file hash immediately before writing.
- `.claude/settings.json` remains a mixed JSON file and still requires review when both the framework and user changed it; Markdown markers are intentionally not applied to JSON.
- Fixes npm's automatic `.gitignore` template renaming and safely replaces the unchanged v0.4.0 `.ai/runs/.npmignore`; a locally edited obsolete file still requires review.

### v0.4.0 — staged model routing and verified handoffs

- Adds opt-in `inherit`, `balanced`, and `quality` profiles. New and upgraded projects default to `inherit`, so installing v0.4.0 does not silently increase model cost or change v0.3.0 workflow depth.
- Adds native Claude Code and Codex agents for premium planning/review, standard or premium implementation, and economy or standard test authoring. Model routing selects an executor only after the existing S/M/L workflow decides which stages are required.
- Adds `models show/configure` plus `workflow prepare/verify/complete`. Cross-model handoffs reference formal requirements, designs, and plans by path and SHA-256; stale inputs, unresolved decisions, route changes, unsafe paths, and incomplete acceptance receipts fail closed.
- Keeps `.ai/config/model-routing.json` user-owned and `.ai/runs/` local-only. Exact account entitlements are not auto-discovered: Claude uses native model aliases, while Codex agents use native reasoning-effort settings.

### v0.3.0 — safe framework upgrades and engineering workflow

- Introduced `.ai/ai-memory.json` framework/schema metadata, file ownership, generated baseline hashes, legacy v0.1 detection, and explicit migration planning.
- Added `update --dry-run` and conflict-free `update --yes`. User memory, requirements, architecture, and design assets are preserved; changed framework or mixed files require review instead of being overwritten.
- Added duplicate-destination checks, path traversal and symlink/junction protection, three-phase scaffolding, and diagnostic partial-write summaries.
- Added the language-agnostic `project-inception`, `feature-design`, and `delivery-readiness` workflows covering data modeling, technical contracts, deployment, performance, observability, scalability, reliability, security, and cost.

### Upgrade from v0.3.0 to v0.4.0

```bash
# Preview only; this must not modify the project
npx @betterdanlins/ai-memory@0.4.0 update --dry-run

# Apply only when the preview has no merge/review blockers
npx @betterdanlins/ai-memory@0.4.0 update --yes

# Optional: explicitly enable staged routing after the safe update
npx @betterdanlins/ai-memory@0.4.0 models configure --profile balanced
```

After the update, the profile remains `inherit` until explicitly changed. Do not re-run `init` on an existing v0.3.0 project. If dry-run reports merge or review items, merge them with the generated v0.4.0 files as references, then run dry-run again.

### Upgrade from v0.4.0 to v0.5.0

```bash
npx @betterdanlins/ai-memory@0.5.0 update --dry-run
npx @betterdanlins/ai-memory@0.5.0 update --yes
```

If `AGENTS.md` or `CLAUDE.md` is still the unchanged v0.4.0 generated version, it migrates automatically. If either unmarked file was customized, dry-run reports `merge`; compare it with a fresh v0.5.0 reference, keep project-specific content in the user block, and retry. Once markers exist, edit only outside `<!-- ai-memory:managed:start/end -->`.

### Upgrade from v0.5.0 to v0.6.0

```bash
npx @betterdanlins/ai-memory@0.6.0 update --dry-run
npx @betterdanlins/ai-memory@0.6.0 update --yes
```

The managed sections of `AGENTS.md` / `CLAUDE.md` and unchanged framework files update automatically. Existing `user-profile.md`, `feedback.md`, project state, and feature memory remain user-owned and are never overwritten. The new entry and memory-update protocols start using that existing content immediately; richer profile/feedback starter structures are used only for fresh or still-missing files.

## What it generates

```
.ai/                          # single source of truth, shared by all agents
├── README.md                 # session entry protocol
├── ai-memory.json            # version, schema, tools, ownership, baseline hashes
├── config/
│   └── model-routing.json    # inherit/balanced/quality stage routing; user-owned
├── memory/
│   ├── MEMORY.md             # core/on-demand memory loading index
│   ├── project-state.md      # stack, current version, requirement progress
│   ├── session-log.md        # rolling log of progress & next steps
│   ├── user-profile.md       # background, preferences, communication style
│   ├── feedback.md           # behavioral norms distilled from feedback
│   └── features/             # per-feature dossiers
├── runs/                     # local handoffs and stage receipts; ignored by Git
└── skills/                   # methodology: requirements-flow, architecture,
                              # feature-design, model-routing, delivery-readiness, etc.

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
AGENTS.md + .agents/ + .codex/# Codex: skills and model-specific custom agents
```

## CLI commands

| Command | Description |
| --- | --- |
| `init` | Initialize a new project; refuses to run over an existing ai-memory installation |
| `update --dry-run` | Read-only analysis of the upgrade plan from an existing project to this CLI version |
| `update --yes` | Apply conflict-free safe updates; refuse user changes, mixed-file conflicts, or missing migration paths |
| `models show` | Show the selected profile and resolved tier for every workflow stage |
| `models configure --profile <name>` | Select `inherit`, `balanced`, or `quality` without changing requirements, designs, or code |
| `workflow prepare` | Create a local handoff manifest with hashes of formal input documents |
| `workflow verify` | Reject missing, stale, unresolved, or route-mismatched handoffs before execution |
| `workflow complete` | Validate and store a structured stage receipt for downstream review |

### `init` options

| Option | Description |
| --- | --- |
| `--name <name>` | Project name (defaults to the current directory name) |
| `--stack <desc>` | Tech-stack description |
| `--tools <list>` | Comma-separated adapters to enable: `claude`, `codex` |
| `--model-profile <profile>` | `inherit` (default), `balanced`, or `quality`; `--yes` never opts into costly routing implicitly |
| `--import <path>` | Import `user-profile` / `feedback` from an existing project |
| `--yes` | Non-interactive: fill defaults, skip on any conflict |

## How it works

The generator is a small set of focused modules:

- **manifest** — walks the `common` / `claude` / `codex` template groups, keeping only the groups whose tools are enabled, and produces a flat `{src, dest}` list; duplicate destinations fail before writing and list every source.
- **render** — substitutes `{{variable}}` placeholders and throws on any undefined variable, so a broken template fails loudly instead of shipping `{{...}}`.
- **scaffold** — validates safe destinations and symbolic links, resolves conflicts, and reads/renders the complete plan in memory before writing; it also validates `--import` and pulls `user-profile` / `feedback` from it (falling back to the template with an explicit report when an individual source file is missing).
- **framework metadata** — a fresh init records framework/schema versions, ownership, and generated hashes; update uses them to distinguish safe updates from user changes. Metadata-free v0.1 projects are planned conservatively as legacy installations.
- **managed entry blocks** — Markdown entry files update only their validated framework block. Unmarked or malformed customized files remain manual merges; JSON settings keep conservative whole-file review semantics.
- **model routing** — optional profiles map existing workflow stages to premium, standard, economy, inherited, or no-model execution. Claude and Codex adapters use native custom-agent configuration; routing never creates extra S/M/L stages.
- **workflow handoff** — a local manifest references formal requirements/design/plan files by path and SHA-256. Verification fails closed on stale inputs, unresolved decisions, changed routing, path escape, or symbolic links.

## Design principles

- **Single source** — content lives only in `.ai/`; `.claude/` and `.agents/` are trigger wrappers.
- **Actionable scoped memory** — every session loads a small core set; durable user preferences, reusable feedback, project facts, and feature decisions have separate write destinations, while task artifacts remain on-demand.
- **Engineering-node memory** — write session-log entries for independently verifiable features/phases, durable decisions, status changes, or tool handoffs, avoiding noise from tiny implementation steps.
- **Dual requirement directories** — human draft (`draft/`) → AI final (`final/`) behind a mandatory critic gate.
- **Project engineering baseline** — 0-to-1 projects establish language-agnostic system, data, quality-attribute, and deployment baselines once; ordinary features record only deltas.
- **Risk-tiered design** — S-risk requirements proceed directly to implementation; M/L-risk work uses feature-design for how, technical contracts, and engineering impact, with Superpowers selected only when justified by risk.
- **Optional cost routing** — `inherit` preserves prior behavior; explicit profiles can use stronger models for planning/review and cheaper workers for bounded test work while deterministic test execution uses no model.
- **Artifact-based handoff** — cross-model stages read formal artifacts through a verified handoff rather than relying on conversational summaries; implementation receipts expose coverage, deviations, and unresolved risk to the final reviewer.
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
