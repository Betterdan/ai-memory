# ai-memory

> Scaffold a shared AI memory layer and requirements workflow into any project — one command, portable across Claude Code, Codex, and future agents.

[English](README.md) · [简体中文](README.zh-CN.md)

[![CI](https://github.com/Betterdan/ai-memory/actions/workflows/ci.yml/badge.svg)](https://github.com/Betterdan/ai-memory/actions/workflows/ci.yml)

## Why

Acceptance traceability is available through `ai-memory gate trace`: numbered acceptance criteria on `accepted` or `done` items need corresponding evidence records. Older unnumbered requirements remain compatible. The check verifies records and referenced files, not whether tests actually ran, and is not automatically added to existing Git hooks. Use `accepted` for changes awaiting activation and `done` once active; update current knowledge only when the change takes effect. Existing functionality can be documented with the optional confirmation workflow in `.ai/skills/knowledge-structure.md`. Existing projects should review `update --dry-run` before applying the safe update; user-owned iteration and knowledge files are not rewritten.

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

**For the gates to actually run, the CLI must be callable.** Running `init` through `npx` leaves nothing installed; install it globally with `npm i -g @betterdanlins/ai-memory`, or in the project with `npm i -D @betterdanlins/ai-memory`. When the CLI cannot be found, the Claude Code hooks warn once per session and let the edit through, and the git gate prints a warning and lets the commit through — never blocking you, but never failing silently either.

Nothing is ever overwritten silently: existing files are asked about one by one (interactive) or skipped (`--yes`).
An invalid, non-directory, or unreadable `--import` project path fails explicitly. If the project directory is valid but an individual memory file is missing, the CLI falls back to its template and reports that fallback in the summary.
Before writing, the CLI checks for duplicate template destinations, path traversal, and symbolic links, then reads and renders every planned file. If an actual filesystem write fails midway, the error summary lists both written and not-yet-written files.
An initialized project cannot be initialized again. A newer CLI first uses `update --dry-run` to identify versions and user modifications. `update --yes` applies only additions and baseline-matching safe updates, aborting before any write when merge or review items exist.
`update` never touches user-owned files. When a release changes how user knowledge is laid out, `update` reports the pending migration and `ai-memory migrate --dry-run` / `--yes` performs it as a separate, explicit step — run `update` first, then `migrate`. Migration is one-way: once it raises `schemaVersion`, older CLI versions refuse to operate on the project. If a migration fails midway, `schemaVersion` is left untouched so the command can simply be run again.

## What gets enforced

The workflow is written down in `.ai/skills/`, but writing something down does not make it happen. These four points are mechanical: they run on their own and fail with an exit code.

| When | Mechanism | Behaviour |
| --- | --- | --- |
| Before implementation | `PreToolUse` → `gate ready` | Blocks the edit (exit 2) when a requirement point marked `in-progress` has an incomplete final spec, and hands the reasons back to the model. Nothing is blocked while no point carries that status, and edits under `.ai/` and `docs/` always pass — otherwise fixing the requirement itself would deadlock. |
| End of session | `Stop` → `gate contract` | Blocks once when a point's contract declaration contradicts what actually changed: "no external interface" while entry-point code moved, or "contract diff confirmed" while no contract file did. `stop_hook_active` keeps a misconfiguration from trapping the session. |
| Before commit | git `pre-commit`, installed with `hooks install` | Runs `gate ready`, `gate contract` and `kb check` together. Claude Code gets its enforcement from hooks; Codex and other tools have no equivalent mechanism, so this is how they get theirs. |
| After writing knowledge | `kb check` | Frontmatter, internal links, dangling domain and decision references, domain pages missing their generated blocks, stale indexes — exit 1 on any of them. |

Both gates are plain text and file checks: milliseconds, zero tokens, no model call. They catch omissions and vagueness, never whether the content is right.

What stays a written convention: judging the risk tier, deciding when to split a requirement set, working through critic findings one by one, deciding where a piece of knowledge belongs. Those need to understand the content, so a mechanical check cannot do them.

## Versions and compatibility

The full development record of the v0.8.0–v0.11.0 round — every requirement point, why R5/R6/R10 were split, and the defects that only surfaced once it ran — is in [`docs/evolution-r1-r10b.md`](docs/evolution-r1-r10b.md).

### v0.14.0 — adopt an existing project

- `init --adopt --yes` adds managed entry blocks while preserving existing frontmatter, project rules, user files, and Claude settings.
- The adoption protocol guides rule consolidation and a first knowledge baseline from code, tests, and an existing wiki. Projects already using ai-memory can preview an upgrade without reinitializing or replacing their knowledge files.

### v0.13.0 — parallel Git worktrees

- Git gates recognize linked worktrees and `core.hooksPath`, preserve existing hooks by default, and warn when a hook path may be shared.
- Each worktree can select an active requirement; projects without a selection retain their previous checks. `gate contract --base <ref> --point <name>` checks committed changes from the merge base.
- User assets are not automatically merged. Existing projects should inspect `update --dry-run`; the worktree selection remains local and untracked.

### v0.11.3 — gates no longer fail silently

> v0.11.2 was tagged but never published to npm; its changes ship in this release.

- The hooks and the git gate used to call `npx --no-install ai-memory`. A project initialized with `npx`, as the README suggests, has no local install, so npx exited with 1 — and Claude Code only blocks on 2. **The gates silently let everything through**, and every edit waited about 2.5 seconds. Every PHP or Go project without a `package.json` was affected.
- A new framework-owned file, `.ai/hooks/gate.mjs`, looks for the CLI via `AI_MEMORY_CLI`, then a project-local install, then a global install on `PATH`, and runs it directly with node (about 0.7 seconds), passing the blocking exit code through unchanged.
- When the CLI cannot be found, it lets the action through with a clear warning: once per session as a Claude Code `systemMessage`, and on the terminal for the git gate.
- `init` and `hooks install` print the install command when the CLI is not callable; `hooks status` recognizes an old npx-based pre-commit and tells you to refresh it.

### v0.11.2 — wiki export fixes, a Linux migration fix and a kb check gap

- Pages with non-ASCII (e.g. Chinese) file names can now be opened, refreshed and bookmarked directly. Browsers hand over a percent-encoded hash, which never matched the page id, so every such link fell back to the home page.
- Relative links between pages (such as `../domains/order.md` in an entry page) are rewritten into in-page jumps, so clicking them switches pages and the back button works. Links to files that are not exported (contracts, source code) and external links are left untouched.
- On Linux, a migration that fails midway now reports "schemaVersion not raised, safe to re-run" as intended. When a path component was a file, Linux raised `ENOTDIR` instead of `ENOENT`, and the bare error escaped during the pre-flight check, bypassing that explanation; data was never at risk.
- `kb check` reports a new kind of problem, missing generated blocks: a domain page without its `related-entries` / `related-contracts` markers was silently skipped by `kb build`.
- Dependencies: `marked` ^18.1.1, `@inquirer/prompts` ^8.7.3.
- No `update` or `migrate` needed; run `kb export` again, and `kb check` once.

### v0.11.0 — one file that shows what the project is and how far it got

- Adds `ai-memory kb export`: the knowledge layer, the architecture baseline, finalized requirement points and technical designs all render into a single self-contained HTML file. Open it directly — no server, no build step, no network.
- Its home page is a status overview rather than rendered prose: project facts, requirement points grouped by status (in-progress expanded, done collapsed), counts of entry points, domains, baselines, designs and decisions, and how many decisions are active versus superseded.
- Adds `marked`, so any Markdown renders — GFM tables, task lists, strikethrough, block quotes. Raw HTML in a page is passed through rather than sanitized: these files come from your own repository and carry the same trust as your source code.
- Inlines local images as data URIs, capped at 2MB each. An image that is missing, oversized or of an unsupported type is skipped with a warning instead of breaking the export.
- Renders Mermaid diagrams offline. The renderer is pinned to mermaid 11.17.2 and checked against its SHA-256; it is fetched once, cached under `AI_MEMORY_CACHE` / `XDG_CACHE_HOME` / `~/.cache/ai-memory`, and inlined. A project with no diagrams never fetches it and never carries its weight.
- Degrades rather than fails: `--no-download` for offline and air-gapped use, `--mermaid <path>` to point at a local copy. When the renderer cannot be obtained or its hash does not match, diagrams fall back to code blocks and the reason is printed.

### v0.10.0 — gates that run on their own

- Adds `ai-memory gate ready`: a structural readiness check of every requirement point marked `in-progress` — sections present, no `TBD` left in the acceptance criteria, scope states what is out, contract status declared, open questions annotated, risk tier recorded. It checks for omissions and vagueness, never for whether the content is right.
- Wires that check to a `PreToolUse` hook, so it runs when the agent starts editing implementation code rather than when someone remembers to type a command. Failing it exits 2, which blocks the edit and feeds the reasons back to the model. Edits under `.ai/` and `docs/` are always allowed — otherwise fixing the requirement itself would deadlock.
- Adds `ai-memory gate contract`, which cross-checks a point's contract declaration against what actually changed: declaring "no external interface" while touching entry-point code, or declaring "contract diff confirmed" while no contract file moved, both fail. It runs on the `Stop` hook and blocks once, guarded by `stop_hook_active` so a misconfiguration cannot trap the session.
- Adds `ai-memory hooks install`, which installs a git `pre-commit` gate running all three checks. Claude Code gets its enforcement from hooks; Codex and other tools have no equivalent mechanism, so this is how they get theirs.
- `interfaces.md` gains `entry_globs` / `contract_globs` frontmatter. Until a project fills those in, `gate contract` skips and says what to add — it does not nag projects that keep no contract files.
- Both gates are plain text and file checks: milliseconds, zero tokens, no model call, consistent with the rule against model-invoking guards.

### v0.9.0 — generated knowledge index and de-ruled adapters

- Knowledge pages now carry frontmatter (`type`, `group`/`name`, `summary`, `contract`, `domains`, decision `status`/`date`), and `ai-memory kb build` regenerates the overview indexes plus each domain page's related entries and contracts from it.
- Generated regions live inside `<!-- ai-memory:generated:<name> -->` markers, deliberately distinct from `ai-memory:managed`: `update` must never touch `.ai/knowledge/`, and separate markers make that structural rather than a matter of discipline. Content outside a marker is never rewritten, and malformed markers fail conservatively.
- Adds `ai-memory kb check`, a read-only validation of frontmatter, internal links, dangling domain/decision references, and index staleness. It exits 1 on any problem, so it can gate a commit or a CI job as-is.
- De-rules the adapter layer. Process rules now live only in `.ai/`; `.claude/`, `.agents/`, and `.codex/` keep triggers, tool-native mappings, and a single pointer. Two guards enforce it: adapter bodies stay within 200 characters — the two model-routing wrappers are allowed 400 because they are pure agent-name maps — and may not contain risk-tier or process wording.
- The `CLAUDE.md` / `AGENTS.md` managed block becomes a pure routing table — task to skill and artifact location, no restated process. That block loads on every session, so it is the cheapest place to remove duplication.

### v0.8.0 — requirement points, knowledge layer, and explicit migration

- Removes the Superpowers dependency. Option comparison, implementation planning, and code review are now first-class templates; `code-review` becomes a registered skill with adapters for both tools.
- Adds `.ai/skills/risk-levels.md` as the single source of truth for S/M/L behaviour. S becomes a lightweight independent path: no self-critique, no handoff, no design document, no delivery report — relevant tests passing is the exit condition, with at most two fix attempts before handing the failure back.
- Requirements advance one point at a time. `draft/` holds a requirement set; `final/<set>-<point>.md` holds a single independently shippable point. Explicit split signals decide when to divide a set, and a six-item readiness standard replaces further review before implementation.
- Adds `docs/architecture/interfaces.md` and `.ai/skills/interface-contract.md`. External entry-point forms and contract conventions live in the baseline, and changing an externally observable interface requires a confirmed contract diff at every risk level.
- Splits memory into process records (`.ai/memory/`) and current knowledge (`.ai/knowledge/`), organised as entry-point pages (primary view) and domain pages (cross-cutting view), with exactly one home per fact and an explicit promotion rule.
- Adds `ai-memory migrate --dry-run` / `--yes` and raises `schemaVersion` to 2. `update` keeps its original promise and never touches user-owned files.

### v0.7.0 — release engineering

- Adds a GitHub Actions matrix for Windows/Linux and both the minimum supported Node.js `20.17.0` and the current LTS line.
- Pins third-party Actions to immutable commit SHAs, disables persisted checkout credentials, uses read-only workflow permissions, and enables weekly npm/Actions Dependabot updates.
- Adds a real package gate: build the npm tarball, reject local-only files, install it into an isolated directory, then execute packaged `init` and `update --dry-run`.
- Replaces the placeholder arithmetic smoke test with a real CLI startup and command-discovery test.
- Centralizes temporary-directory tracking so CLI, scaffold, workflow, routing, and template tests clean up after both passing and failing cases.
- Adds `npm run verify` as the single local/CI release check.

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

### Upgrade from v0.6.0 to v0.7.0

```bash
npx @betterdanlins/ai-memory@0.7.0 update --dry-run
npx @betterdanlins/ai-memory@0.7.0 update --yes
```

v0.7.0 changes release validation rather than project-owned workflow data. Normal upgrades only refresh unchanged framework metadata/templates; user memory, requirements, designs, model profile, and entry user blocks remain unchanged.

### Upgrade from v0.7.0 to v0.8.0

```bash
npx @betterdanlins/ai-memory@0.8.0 update --dry-run
npx @betterdanlins/ai-memory@0.8.0 update --yes

# User-owned assets migrate separately, after the update
npx @betterdanlins/ai-memory@0.8.0 migrate --dry-run
npx @betterdanlins/ai-memory@0.8.0 migrate --yes
```

Run `update` first, then `migrate`: the migration writes into knowledge files that `update` creates. `update` only adds the new framework files and refreshes managed blocks; it leaves `schemaVersion` at 1 and reports the pending migration.

`migrate` merges `project-state.md` into `knowledge/overview.md` and `knowledge/iterations.md`, archives the original under `.ai/memory/archive/`, and leaves `.ai/memory/features/` in place with a list of dossiers to classify by hand against `.ai/skills/knowledge-structure.md`. Anything it cannot parse is moved verbatim into a "待整理" section instead of being dropped, and a target you have edited yourself is skipped rather than overwritten.

Migration is one-way: once `schemaVersion` becomes 2, CLI versions before 0.8.0 refuse to operate on the project. If it fails midway, `schemaVersion` stays at 1 and the command can simply be run again.

### Upgrade from v0.8.0 to v0.9.0

```bash
npx @betterdanlins/ai-memory@0.9.0 update --dry-run
npx @betterdanlins/ai-memory@0.9.0 update --yes
```

No migration step: `schemaVersion` stays at 2, so `migrate` has nothing to do. The adapter layer and the managed entry block update in place; your user block and everything under `.ai/knowledge/` are untouched.

If you already wrote knowledge pages under v0.8.0, they have no frontmatter yet. `kb build` skips them and `kb check` lists them by name — add the frontmatter shown in `.ai/knowledge/entries/README.md` and `domains/README.md` to opt each page into the generated indexes. Pages you never annotate keep working as plain Markdown.

Domain pages created before v0.9.0 have no generated markers. Copy the two marker pairs from `domains/README.md` into the page tail; without them `kb build` simply leaves that page alone.

### Upgrade from v0.9.0 to v0.10.0

```bash
npx @betterdanlins/ai-memory@0.10.0 update --dry-run
npx @betterdanlins/ai-memory@0.10.0 update --yes
```

No migration step; `schemaVersion` stays at 2.

**If you customized `.claude/settings.json`, dry-run will report `merge`.** That file is a mixed-ownership JSON, so the framework refuses to overwrite it. Open the freshly generated template as a reference, copy the `PreToolUse` block and the `gate contract` entry under `Stop` into your own file, then run dry-run again. Projects that never touched the file update automatically.

`gate ready` is active as soon as a requirement point is marked `in-progress` in `iterations.md`. Nothing is blocked while no point carries that status.

`gate contract` stays dormant until `docs/architecture/interfaces.md` declares its paths. That file is user-owned, so `update` will not add the frontmatter for you:

```yaml
---
entry_globs: [src/api/**, src/pages/**]
contract_globs: [docs/api/**]
---
```

The git gate is opt-in: run `ai-memory hooks install` to enable it, `ai-memory hooks status` to check. An existing `pre-commit` is never overwritten without `--force`.

### Upgrade from v0.11.x to v0.11.3

```bash
npm i -g @betterdanlins/ai-memory@0.11.3   # or npm i -D in the project; the gates depend on it
ai-memory update --dry-run
ai-memory update --yes
ai-memory hooks status                     # if you installed the git gate: rerun hooks install --force when it reports an old one
```

No migration. `update` adds `.ai/hooks/gate.mjs` and refreshes `.claude/settings.json` and `pre-commit.sample`. **If you customized `settings.json`, the dry-run reports `merge`**: replace the two `npx --no-install ai-memory gate …` commands with the template's `node "$CLAUDE_PROJECT_DIR/.ai/hooks/gate.mjs" gate …`.

### Upgrade from v0.10.0 to v0.11.0

```bash
npx @betterdanlins/ai-memory@0.11.2 update --dry-run
npx @betterdanlins/ai-memory@0.11.2 update --yes
```

No migration, and — unlike the previous release — no hook file to merge: `schemaVersion` stays at 2 and `.claude/settings.json` is untouched.

Then generate the wiki:

```bash
npx @betterdanlins/ai-memory@0.11.2 kb export
```

The output lands at `.ai/knowledge.html`. It is a generated artifact: commit it if you want teammates to open it from the repository, ignore it if you would rather regenerate on demand — the framework does not decide for you.

The layout adapts to mobile screens and follows the system's light or dark color scheme. Run `kb export` again to refresh an existing HTML file with the current theme.

If your pages contain Mermaid diagrams, the first export downloads the pinned renderer once (about 3.4MB) and caches it globally; later exports and other projects reuse that cache. On a machine with no network, pass `--no-download` to fall back to code blocks, or `--mermaid <path>` to supply the bundle yourself.

## What it generates

```
.ai/                          # single source of truth, shared by all agents
├── README.md                 # session entry protocol
├── ai-memory.json            # version, schema, tools, ownership, baseline hashes
├── config/
│   └── model-routing.json    # inherit/balanced/quality stage routing; user-owned
├── knowledge/                # current knowledge: what the system looks like now
│   ├── overview.md           # goals, stack, current iteration, known issues
│   ├── entries/              # external entry-point pages (primary view)
│   ├── domains/              # business domain pages (cross-cutting view)
│   ├── decisions/            # decision records, marked active or superseded
│   ├── iterations.md         # requirement sets, points, status and order
│   └── conventions.md        # project development conventions
├── hooks/
│   └── pre-commit.sample     # tool-neutral git gate; ai-memory hooks install
├── memory/
│   ├── MEMORY.md             # core/on-demand memory loading index
│   ├── session-log.md        # rolling log of progress & next steps
│   ├── user-profile.md       # background, preferences, communication style
│   └── feedback.md           # behavioral norms distilled from feedback
├── runs/                     # local handoffs and stage receipts; ignored by Git
└── skills/                   # methodology: requirements-flow, architecture,
                              # feature-design, model-routing, delivery-readiness, etc.

docs/architecture/            # engineering baseline for 0-to-1 projects
├── system-context.md         # boundaries, actors, modules, and key flows
├── data-model.md             # entities, ownership, consistency, and migration
├── quality-attributes.md     # performance, observability, scalability, reliability
├── deployment.md             # topology, releases, rollback, and operations
└── interfaces.md             # external entry points, contract format, and verification

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
| `migrate --dry-run` | Preview the Schema migration of user-owned assets without writing anything |
| `migrate --yes` | Run the migration; `schemaVersion` is raised only after every change is written |
| `kb build [--dry-run]` | Regenerate the knowledge index and domain cross-views from page frontmatter; only rewrites generated blocks |
| `kb check` | Read-only validation of frontmatter, internal links, dangling references, missing generated blocks, and index staleness; exits 1 on any problem |
| `gate ready [--point <name>] [--staged] [--hook]` | Structural readiness check of the selected point or all in-progress points; `--staged` reads iteration status and requirements from the Git index |
| `gate trace` | Read-only verification of numbered acceptance records and evidence files for accepted and done points; exits 1 on problems |
| `gate contract [--staged] [--hook]` | Cross-checks each point s contract declaration against what actually changed; skips unless `interfaces.md` declares `entry_globs` and `contract_globs` |
| `gate contract --base <ref> --point <name>` | Checks committed changes from the merge base to HEAD for one requirement point; fails if the base or merge base is unavailable |
| `worktree select --point <name>` / `worktree status` / `worktree clear` | Select, inspect or clear the current worktree's active point for the default readiness and contract gates |
| `hooks install [--force]` / `hooks status` | Installs the tool-neutral git pre-commit gate, so Codex and other tools get enforcement too |
| `kb export [--out <path>] [--mermaid <path>] [--no-download]` | Exports the knowledge layer, architecture baseline, finalized requirements and designs into one self-contained HTML — open it and see what the project is and how far it got. Mermaid diagrams render offline; the pinned renderer is fetched once and cached |
| `models show` | Show the selected profile and resolved tier for every workflow stage |
| `models configure --profile <name>` | Select `inherit`, `balanced`, or `quality` without changing requirements, designs, or code |
| `workflow prepare` | Create a local handoff manifest with hashes of formal input documents |
| `workflow verify` | Reject missing, stale, unresolved, or route-mismatched handoffs before execution |
| `workflow complete` | Validate and store a structured stage receipt for downstream review |

### Parallel Git worktrees

Commit the initialized framework to your base branch, then create a branch and worktree per requirement, for example `git worktree add -b feature/a ../project-a dev`. Each worktree has its own `.ai/` files, requirement documents and index; ignored `.ai/runs/` receipts do not sync automatically. Existing projects should inspect `update --dry-run` before applying a safe upgrade; user knowledge is preserved.

Run `ai-memory hooks install` in a worktree to install the hook at Git's effective path; `hooks status` recognizes `core.hooksPath`. Hooks are normally shared by linked worktrees, so installation and `--force` can affect the others. Existing hooks are not overwritten by default; merge them manually where appropriate. The hook checks the worktree that triggers the commit. If that worktree cannot find the CLI, it warns and allows the commit; configure a local or global installation there.

The updated pre-commit sample reads iteration status, finalized requirements and interface configuration from the Git index. Stage the documents needed by the commit. An active requirement found only in the working tree must be staged before the commit can pass. Projects without interface configuration can still skip contract checks. Framework updates leave installed hooks in place. Run `hooks status` to find older samples, then merge or reinstall after checking the effect on other worktrees and updating their CLI. `kb check` still reads knowledge files from the working tree.

After marking the current point `in-progress`, run `ai-memory worktree select --point <name>` in each worktree. Default readiness and contract gates then check only that point. The selection is stored in the worktree's ignored `.ai/runs/active-point.json`; use `worktree status` to inspect it and `worktree clear` to restore checks for all active points. Existing projects without a selection keep their previous behavior. The default gates skip a selected point when it is no longer in progress, and block if the selection is invalid, missing or ambiguous.

Before merging, run `ai-memory gate contract --base dev --point <name>` to inspect committed changes from the merge base to HEAD. Check uncommitted changes separately with the ordinary or `--staged` mode. `--base` cannot be combined with `--hook`. Replace `dev` with the actual base; the requirement and interface configuration are read from the current worktree. Resolve overlapping iteration, session or knowledge changes manually; after merging, run `kb build` and `kb check` and review the diff.

### Existing code and wikis

Run `ai-memory init --adopt --yes` at the root of a project that has not used ai-memory. For the selected tools, adoption adds a managed block to `AGENTS.md` / `CLAUDE.md`, keeps frontmatter at the top and the original body in the user block, and writes upgrade metadata. Existing user files and `.claude/settings.json` are preserved. Integrate hooks manually if you keep existing Claude settings. Existing block markers, unclosed frontmatter, unsafe paths, and other managed file conflicts are reported before writes. For initialized projects, use `update --dry-run`.

Follow `.ai/skills/project-adoption.md` to review rules one by one. Reuse equivalent rules, add only the differences to existing rules, and assign new rules to the team, project, module, or personal scope. Index shared rules in `.ai/knowledge/conventions.md` and verify loading from a separate worktree.

Build the first knowledge baseline from code, tests, and the existing wiki. Record the code revision, evidence, coverage, and open questions. Write verified findings to `.ai/knowledge/` and `docs/architecture/`, then run `kb build`, `kb check`, and `kb export`. Initialization scaffolds the framework. The agent reviews the original wiki within the agreed scope and keeps it as evidence.

### `init` options

| Option | Description |
| --- | --- |
| `--name <name>` | Project name (defaults to the current directory name) |
| `--stack <desc>` | Tech-stack description |
| `--tools <list>` | Comma-separated adapters to enable: `claude`, `codex` |
| `--model-profile <profile>` | `inherit` (default), `balanced`, or `quality`; `--yes` never opts into costly routing implicitly |
| `--import <path>` | Import `user-profile` / `feedback` from an existing project |
| `--adopt` | Adopt an existing project while preserving entry file text, user files, and existing Claude settings |
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
- **package verification** — CI and local verification install the generated tarball itself, exercise its packaged CLI, and assert that local collaboration files are excluded.

## Design principles

- **Single source** — content lives only in `.ai/`; `.claude/` and `.agents/` are trigger wrappers.
- **Actionable scoped memory** — every session loads a small core set; durable user preferences, reusable feedback, project facts, and feature decisions have separate write destinations, while task artifacts remain on-demand.
- **Engineering-node memory** — write session-log entries for independently verifiable features/phases, durable decisions, status changes, or tool handoffs, avoiding noise from tiny implementation steps.
- **Dual requirement directories** — human draft (`draft/`) → AI final (`final/`) behind a mandatory critic gate.
- **Project engineering baseline** — 0-to-1 projects establish language-agnostic system, data, quality-attribute, and deployment baselines once; ordinary features record only deltas.
- **Risk-tiered design** — S-risk requirements proceed directly to implementation; M/L-risk work uses feature-design for how, technical contracts, and engineering impact, with option comparison and staged implementation plans used only when the risk justifies them.
- **Optional cost routing** — `inherit` preserves prior behavior; explicit profiles can use stronger models for planning/review and cheaper workers for bounded test work while deterministic test execution uses no model.
- **Artifact-based handoff** — cross-model stages read formal artifacts through a verified handoff rather than relying on conversational summaries; implementation receipts expose coverage, deviations, and unresolved risk to the final reviewer.
- **Evidence-based delivery** — before release, verify applicable contracts, tests, migration, rollback, performance, observability, and operations, producing an explicit readiness verdict.
- **Low-noise memory** — persist independently verifiable engineering nodes, durable decisions, status changes, and session handoffs instead of every small coding step.
- **Idempotent** — existing files are asked about one by one; `--yes` always skips. Never a silent overwrite.
- **Safe writes** — destinations must remain inside the target project, symbolic-link overwrites are rejected, and write failures retain a diagnostic progress summary.
- **Explicit compatibility** — newer CLIs can recognize older schemas, user assets are never overwritten from templates, and actual updates only touch baseline-matching files after a dry run rather than re-running init.

## Development

```bash
npm test              # unit and CLI/template integration tests
npm run test:package  # pack, isolated install, packaged init/update smoke
npm run verify        # complete local/CI release gate
```

## License

[MIT](LICENSE) © Betterdan
