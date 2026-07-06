# @betterdan/ai-memory CLI 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 `npx @betterdan/ai-memory init` 脚手架 CLI,在目标项目一次性生成「AI 记忆 + 需求工作流 + Claude/Codex 双适配」框架(spec: `docs/superpowers/specs/2026-07-05-ai-memory-framework-design.md`)。

**Architecture:** 纯文件复制 + 变量渲染,无 LLM、无网络。三层分离:`templates/`(按 common/claude/codex 分组的模板)→ `src/`(render/manifest/scaffold 纯函数核心,可注入 templatesRoot 便于测试)→ `bin/cli.js`(commander 参数 + inquirer 交互,薄壳)。

**Tech Stack:** Node.js ≥20.17、ESM、`node --test` 内置测试框架、commander@13、@inquirer/prompts@8。

> 执行期修订(2026-07-06):测试脚本用 `node --test test/*.test.js` 而非 `node --test test/` —— 后者在 Node 26/Windows 下把目录当模块解析报 MODULE_NOT_FOUND(已实测);glob 形式在 POSIX(shell 展开)与 Windows(Node 内部 glob)均正确。engines 定为 `>=20.17.0`(@inquirer/prompts@8 的下限);commander 钉 ^13(15 需要 Node ≥22.12,违反本约束)。

## Global Constraints

- 包名 `@betterdan/ai-memory`,bin 命令名 `ai-memory`,v1 只有 `init` 子命令
- 运行时依赖仅 `commander` 与 `@inquirer/prompts`,不引入模板引擎(自写 `{{var}}` 渲染)
- 模板变量只有三个:`{{projectName}}`、`{{techStack}}`、`{{date}}`
- 幂等:目标文件已存在时逐个询问 overwrite/skip,绝不静默覆盖;`--yes` 非交互模式一律 skip
- 所有模板 UTF-8 + LF;所有生成物为可入库文本,模板不含目标项目的 .gitignore
- 每个 Task 结束必须 `npm test`(即 `node --test test/*.test.js`)全绿再 commit

---

### Task 1: 仓库脚手架

**Files:**
- Create: `package.json`、`.gitignore`、`bin/cli.js`(占位)、`test/smoke.test.js`

**Interfaces:**
- Produces: 可运行的 `npm test`(node --test);后续任务的目录约定 `src/`、`templates/`、`test/`

- [ ] **Step 1: 写 package.json**

```json
{
  "name": "@betterdan/ai-memory",
  "version": "0.1.0",
  "description": "AI memory + requirements workflow scaffolder for Claude Code & Codex",
  "type": "module",
  "bin": { "ai-memory": "bin/cli.js" },
  "files": ["bin", "src", "templates"],
  "engines": { "node": ">=20" },
  "scripts": { "test": "node --test test/" },
  "license": "MIT"
}
```

- [ ] **Step 2: 写 .gitignore**

```gitignore
node_modules/
coverage/
*.log
*.tgz
.DS_Store
/temp
```

- [ ] **Step 3: 安装依赖**

Run: `npm install commander @inquirer/prompts`
Expected: 生成 `package-lock.json`(要入库)

- [ ] **Step 4: 写占位 bin 与冒烟测试**

`bin/cli.js`:
```js
#!/usr/bin/env node
console.log('@betterdan/ai-memory (WIP)');
```

`test/smoke.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('smoke', () => { assert.equal(1 + 1, 2); });
```

- [ ] **Step 5: 运行测试**

Run: `npm test`
Expected: `pass 1`

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json .gitignore bin/cli.js test/smoke.test.js
git commit -m "chore: Node CLI 仓库脚手架(node --test + commander/inquirer 依赖)"
```

---

### Task 2: 模板渲染器 render.js

**Files:**
- Create: `src/render.js`
- Test: `test/render.test.js`

**Interfaces:**
- Produces: `render(content: string, vars: Record<string,string>): string` — 替换所有 `{{key}}`;遇到 vars 中不存在的 key 抛 `Error("未定义的模板变量: <key>")`

- [ ] **Step 1: 写失败测试**

`test/render.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { render } from '../src/render.js';

test('替换单个变量', () => {
  assert.equal(render('hi {{name}}', { name: 'dan' }), 'hi dan');
});

test('替换同一变量多次与多个变量', () => {
  assert.equal(
    render('{{a}}-{{b}}-{{a}}', { a: 'x', b: 'y' }),
    'x-y-x'
  );
});

test('未定义变量抛错', () => {
  assert.throws(() => render('{{missing}}', {}), /未定义的模板变量: missing/);
});

test('无变量文本原样返回', () => {
  assert.equal(render('plain { text }', {}), 'plain { text }');
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test test/render.test.js`
Expected: FAIL(Cannot find module '../src/render.js')

- [ ] **Step 3: 最小实现**

`src/render.js`:
```js
export function render(content, vars) {
  return content.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    if (!(key in vars)) throw new Error(`未定义的模板变量: ${key}`);
    return vars[key];
  });
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test`
Expected: 全部 PASS

- [ ] **Step 5: Commit**

```bash
git add src/render.js test/render.test.js
git commit -m "feat: {{var}} 模板渲染器(未定义变量报错)"
```

---

### Task 3: 清单构建 manifest.js

**Files:**
- Create: `src/manifest.js`、`test/fixtures/templates/common/a.md`、`test/fixtures/templates/common/sub/b.md`、`test/fixtures/templates/claude/CLAUDE.md`、`test/fixtures/templates/codex/AGENTS.md`
- Test: `test/manifest.test.js`

**Interfaces:**
- Consumes: 无
- Produces: `buildManifest(templatesRoot: string, tools: string[]): Promise<Array<{src: string, dest: string}>>` — 递归收集 `common/`(恒定)+ `claude/`(tools 含 'claude')+ `codex/`(tools 含 'codex')下所有文件;`dest` 为相对组目录的 POSIX 风格路径(`/` 分隔);按 dest 排序;**组目录不存在时视为空组,不报错**(模板是逐任务填充的)

- [ ] **Step 1: 写 fixtures(四个文件,内容任意一行即可)**

```bash
mkdir -p test/fixtures/templates/common/sub test/fixtures/templates/claude test/fixtures/templates/codex
printf 'A\n' > test/fixtures/templates/common/a.md
printf 'B\n' > test/fixtures/templates/common/sub/b.md
printf 'C\n' > test/fixtures/templates/claude/CLAUDE.md
printf 'D\n' > test/fixtures/templates/codex/AGENTS.md
```

- [ ] **Step 2: 写失败测试**

`test/manifest.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildManifest } from '../src/manifest.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'templates');

test('both tools:common+claude+codex 全收集,dest 排序', async () => {
  const m = await buildManifest(ROOT, ['claude', 'codex']);
  assert.deepEqual(m.map(e => e.dest), ['AGENTS.md', 'CLAUDE.md', 'a.md', 'sub/b.md']);
});

test('只选 claude 时排除 codex 组', async () => {
  const m = await buildManifest(ROOT, ['claude']);
  assert.deepEqual(m.map(e => e.dest), ['CLAUDE.md', 'a.md', 'sub/b.md']);
});

test('src 是存在的绝对路径', async () => {
  const m = await buildManifest(ROOT, ['claude', 'codex']);
  for (const e of m) assert.ok(path.isAbsolute(e.src));
});

test('组目录不存在时视为空组', async () => {
  const m = await buildManifest(path.join(ROOT, '..'), ['claude', 'codex']);
  assert.deepEqual(m, []);
});
```

- [ ] **Step 3: 运行确认失败**

Run: `node --test test/manifest.test.js`
Expected: FAIL(Cannot find module '../src/manifest.js')

- [ ] **Step 4: 实现**

`src/manifest.js`:
```js
import { readdir } from 'node:fs/promises';
import path from 'node:path';

const GROUPS = {
  common: () => true,
  claude: (tools) => tools.includes('claude'),
  codex: (tools) => tools.includes('codex'),
};

export async function buildManifest(templatesRoot, tools) {
  const entries = [];
  for (const [group, enabled] of Object.entries(GROUPS)) {
    if (!enabled(tools)) continue;
    const groupDir = path.join(templatesRoot, group);
    for (const rel of await walk(groupDir, '')) {
      entries.push({ src: path.join(groupDir, ...rel.split('/')), dest: rel });
    }
  }
  return entries.sort((a, b) => a.dest.localeCompare(b.dest));
}

async function walk(dir, prefix) {
  let dirents;
  try {
    dirents = await readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  const out = [];
  for (const d of dirents) {
    const rel = prefix ? `${prefix}/${d.name}` : d.name;
    if (d.isDirectory()) out.push(...(await walk(path.join(dir, d.name), rel)));
    else out.push(rel);
  }
  return out;
}
```

- [ ] **Step 5: 运行确认通过**

Run: `npm test`
Expected: 全部 PASS

- [ ] **Step 6: Commit**

```bash
git add src/manifest.js test/manifest.test.js test/fixtures/
git commit -m "feat: 模板清单构建(common/claude/codex 分组过滤)"
```

---

### Task 4: 脚手架核心 scaffold.js

**Files:**
- Create: `src/scaffold.js`
- Test: `test/scaffold.test.js`(复用 Task 3 fixtures;fixture 内容改造见 Step 1)

**Interfaces:**
- Consumes: `buildManifest(templatesRoot, tools)`、`render(content, vars)`
- Produces: `scaffold(opts): Promise<{written: string[], skipped: string[]}>`,其中 `opts = { templatesRoot, targetDir, vars, tools, onConflict, importFrom? }`;`onConflict(dest: string): Promise<'overwrite'|'skip'>|'overwrite'|'skip'` 仅在目标文件已存在时调用;`importFrom` 若给出,则在写完后用 `<importFrom>/.ai/memory/user-profile.md` 与 `feedback.md`(存在才拷)覆盖目标同名文件

- [ ] **Step 1: 给 fixture 加一个含变量的文件**

```bash
printf '# {{projectName}} ({{date}})\n' > test/fixtures/templates/common/vars.md
```

同步修改 `test/manifest.test.js` 中两处期望数组,加入 `'vars.md'`(排序位置:`['AGENTS.md','CLAUDE.md','a.md','sub/b.md','vars.md']` 与 `['CLAUDE.md','a.md','sub/b.md','vars.md']`)。

- [ ] **Step 2: 写失败测试**

`test/scaffold.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp, readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { scaffold } from '../src/scaffold.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'templates');
const VARS = { projectName: 'demo', techStack: 'php', date: '2026-07-06' };

async function tmp() { return mkdtemp(path.join(os.tmpdir(), 'aim-')); }

test('全新目录:全部写入并渲染变量', async () => {
  const dir = await tmp();
  const r = await scaffold({ templatesRoot: ROOT, targetDir: dir, vars: VARS, tools: ['claude', 'codex'], onConflict: () => 'skip' });
  assert.equal(r.skipped.length, 0);
  assert.ok(r.written.includes('vars.md'));
  assert.equal(await readFile(path.join(dir, 'vars.md'), 'utf8'), '# demo (2026-07-06)\n');
  assert.equal(await readFile(path.join(dir, 'sub', 'b.md'), 'utf8'), 'B\n');
});

test('冲突:onConflict 返回 skip 则保留原文件', async () => {
  const dir = await tmp();
  await writeFile(path.join(dir, 'a.md'), 'KEEP\n');
  const asked = [];
  const r = await scaffold({
    templatesRoot: ROOT, targetDir: dir, vars: VARS, tools: ['claude', 'codex'],
    onConflict: (dest) => { asked.push(dest); return 'skip'; },
  });
  assert.deepEqual(asked, ['a.md']);
  assert.ok(r.skipped.includes('a.md'));
  assert.equal(await readFile(path.join(dir, 'a.md'), 'utf8'), 'KEEP\n');
});

test('冲突:overwrite 则覆盖', async () => {
  const dir = await tmp();
  await writeFile(path.join(dir, 'a.md'), 'OLD\n');
  await scaffold({ templatesRoot: ROOT, targetDir: dir, vars: VARS, tools: ['claude', 'codex'], onConflict: () => 'overwrite' });
  assert.equal(await readFile(path.join(dir, 'a.md'), 'utf8'), 'A\n');
});

test('importFrom:存在的 user-profile/feedback 覆盖生成物', async () => {
  const src = await tmp();
  await mkdir(path.join(src, '.ai', 'memory'), { recursive: true });
  await writeFile(path.join(src, '.ai', 'memory', 'user-profile.md'), 'IMPORTED\n');
  const dir = await tmp();
  await scaffold({ templatesRoot: ROOT, targetDir: dir, vars: VARS, tools: ['claude'], onConflict: () => 'skip', importFrom: src });
  assert.equal(await readFile(path.join(dir, '.ai', 'memory', 'user-profile.md'), 'utf8'), 'IMPORTED\n');
});
```

- [ ] **Step 3: 运行确认失败**

Run: `node --test test/scaffold.test.js`
Expected: FAIL(Cannot find module '../src/scaffold.js')

- [ ] **Step 4: 实现**

`src/scaffold.js`:
```js
import { mkdir, readFile, writeFile, access, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { buildManifest } from './manifest.js';
import { render } from './render.js';

export async function scaffold({ templatesRoot, targetDir, vars, tools, onConflict, importFrom }) {
  const manifest = await buildManifest(templatesRoot, tools);
  const summary = { written: [], skipped: [] };
  for (const { src, dest } of manifest) {
    const destPath = path.join(targetDir, ...dest.split('/'));
    if (await exists(destPath)) {
      if ((await onConflict(dest)) !== 'overwrite') { summary.skipped.push(dest); continue; }
    }
    const raw = await readFile(src, 'utf8');
    await mkdir(path.dirname(destPath), { recursive: true });
    await writeFile(destPath, render(raw, vars));
    summary.written.push(dest);
  }
  if (importFrom) {
    for (const name of ['user-profile.md', 'feedback.md']) {
      const from = path.join(importFrom, '.ai', 'memory', name);
      if (await exists(from)) {
        const to = path.join(targetDir, '.ai', 'memory', name);
        await mkdir(path.dirname(to), { recursive: true });
        await copyFile(from, to);
      }
    }
  }
  return summary;
}

const exists = (p) => access(p).then(() => true, () => false);
```

- [ ] **Step 5: 运行确认通过**

Run: `npm test`
Expected: 全部 PASS

- [ ] **Step 6: Commit**

```bash
git add src/scaffold.js test/scaffold.test.js test/fixtures/ test/manifest.test.js
git commit -m "feat: scaffold 核心(冲突策略 + user-profile/feedback 导入)"
```

---

### Task 5: common 模板 — .ai/memory 与 .ai/README

**Files:**
- Create: `templates/common/.ai/README.md`、`templates/common/.ai/memory/{MEMORY.md,project-state.md,session-log.md,user-profile.md,feedback.md,features/.gitkeep}`
- Test: `test/templates.test.js`(新建,真模板 e2e)

**Interfaces:**
- Consumes: `scaffold()`、`buildManifest()`
- Produces: 真实 `templates/` 目录;`test/templates.test.js` 的 `EXPECTED_COMMON` 数组(后续任务持续追加)

- [ ] **Step 1: 写模板文件**

`templates/common/.ai/README.md`:
```markdown
# .ai/ — 跨 Agent 知识框架({{projectName}})

本目录是 agent-agnostic 的项目知识库,Claude Code、Codex 等所有 AI 工具共享同一份内容。
由 @betterdan/ai-memory 生成于 {{date}}。

## 进场协议(每次会话开始)

1. 读 `memory/MEMORY.md`(记忆索引)
2. 读 `memory/session-log.md` 末尾条目(接上进度)
3. 按任务类型按需加载 `skills/` 对应方法论

## 目录

- `memory/` — 记忆层:MEMORY.md 索引、project-state 全景、session-log 流水、user-profile/feedback 用户级记忆、features/ 功能档案
- `skills/` — 方法论层:requirements-flow、architecture、code-review、critic、memory-update

## 与工具专属配置的关系

CLAUDE.md、AGENTS.md 只是薄入口;`.claude/skills/`、`.agents/skills/` 只是触发包装。
**正文永远只有本目录一份**,修改方法论只改这里,适配层不需要动。
```

`templates/common/.ai/memory/MEMORY.md`:
```markdown
# 记忆索引

> agent 进场先读本文件,再按需加载指向的文件。一行一条;新增记忆文件必须在此登记。

- [项目状态](project-state.md) — 技术栈、当前版本、需求进度、遗留问题
- [Session 日志](session-log.md) — 最新进展、下一步、未落盘决策
- [用户画像](user-profile.md) — 背景、偏好、沟通方式
- [协作规范](feedback.md) — 历史反馈提炼的行为规范
<!-- features/ 功能档案在下方逐行登记 -->
```

`templates/common/.ai/memory/project-state.md`:
```markdown
# 项目状态

> 最后更新:{{date}}
> 低频全景文件:只在需求/里程碑状态变化时更新对应行,不写流水。

## 基本信息

- 项目:{{projectName}}
- 技术栈:{{techStack}}
- 当前迭代:v1.0.0

## 需求进度

| 版本 | 需求 | 状态(draft/finalized/in-progress/done) | 备注 |
|---|---|---|---|

## 已知遗留问题

(无)

## 归档的 session 摘要

(session-log 超长时压缩至此)
```

`templates/common/.ai/memory/session-log.md`:
```markdown
# Session 日志

> 高频追加文件:每完成一个任务节点/关键决策,带时间戳追加一条;只增不改。
> 超过约 200 行时,把旧条目压缩进 project-state.md 的「归档的 session 摘要」。
> 跨工具(Claude Code ↔ Codex)切换前,必须确认本文件已落盘并 commit。

## 条目格式

### YYYY-MM-DD HH:mm — <节点标题>

- 做了什么:
- 关键决策:
- 下一步:

---
```

`templates/common/.ai/memory/user-profile.md`:
```markdown
# 用户画像

> 用户级记忆,跨项目可复用(init 时可从已有项目导入)。

## 背景与角色

(技术背景、当前角色)

## 偏好

- 沟通语言:
- 回复风格:
- 技术偏好:
```

`templates/common/.ai/memory/feedback.md`:
```markdown
# 协作规范

> 从历史协作反馈中提炼的行为规范,用户级记忆,跨项目可复用。
> 每条写清:规范 + 为什么 + 如何应用。

(暂无条目)
```

`templates/common/.ai/memory/features/.gitkeep`:空文件。

- [ ] **Step 2: 写真模板 e2e 测试**

`test/templates.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { buildManifest } from '../src/manifest.js';
import { scaffold } from '../src/scaffold.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'templates');
const VARS = { projectName: 'demo', techStack: 'PHP + Vue', date: '2026-07-06' };

export const EXPECTED_COMMON = [
  '.ai/README.md',
  '.ai/memory/MEMORY.md',
  '.ai/memory/feedback.md',
  '.ai/memory/features/.gitkeep',
  '.ai/memory/project-state.md',
  '.ai/memory/session-log.md',
  '.ai/memory/user-profile.md',
];
export const EXPECTED_CLAUDE = [];
export const EXPECTED_CODEX = [];

test('真实模板清单与期望一致', async () => {
  const m = await buildManifest(ROOT, ['claude', 'codex']);
  const expected = [...EXPECTED_COMMON, ...EXPECTED_CLAUDE, ...EXPECTED_CODEX].sort((a, b) => a.localeCompare(b));
  assert.deepEqual(m.map(e => e.dest), expected);
});

test('scaffold 真实模板:渲染后无残留 {{ 且变量已替换', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'aim-real-'));
  const r = await scaffold({ templatesRoot: ROOT, targetDir: dir, vars: VARS, tools: ['claude', 'codex'], onConflict: () => 'skip' });
  assert.equal(r.skipped.length, 0);
  for (const dest of r.written) {
    const body = await readFile(path.join(dir, ...dest.split('/')), 'utf8');
    assert.ok(!body.includes('{{'), `${dest} 有未渲染变量`);
  }
  const state = await readFile(path.join(dir, '.ai/memory/project-state.md'), 'utf8');
  assert.ok(state.includes('- 项目:demo'));
  assert.ok(state.includes('- 技术栈:PHP + Vue'));
});
```

注意:Task 3 的 fixtures 测试不受影响(用的是 `test/fixtures/templates`)。

- [ ] **Step 3: 运行测试**

Run: `npm test`
Expected: 全部 PASS(claude/codex 组目录尚不存在,buildManifest 按 Task 3 约定视为空组;EXPECTED_CLAUDE/EXPECTED_CODEX 此时为空数组)

- [ ] **Step 4: Commit**

```bash
git add templates/ test/templates.test.js
git commit -m "feat: common 模板(.ai 记忆层)+ 真模板 e2e 测试"
```

---

### Task 6: common 模板 — .ai/skills 与 docs/requirements

**Files:**
- Create: `templates/common/.ai/skills/{requirements-flow.md,architecture.md,code-review.md,critic.md,memory-update.md}`、`templates/common/docs/requirements/README.md`、`templates/common/docs/requirements/v1.0.0/draft/.gitkeep`、`templates/common/docs/requirements/v1.0.0/final/.gitkeep`
- Modify: `test/templates.test.js`(EXPECTED_COMMON 追加)

**Interfaces:**
- Consumes: Task 5 的 e2e 测试框架
- Produces: 五份方法论正文(适配层薄包装将指向这些路径)

- [ ] **Step 1: 写五份方法论模板**

`templates/common/.ai/skills/requirements-flow.md`:
```markdown
# 需求定稿流程(draft → final)

触发:用户要求新建/定稿需求,或 /new-requirement、/finalize-requirement。

## 新建(new)

1. 确认目标版本目录 `docs/requirements/vX.Y.Z/`(不存在则创建 draft/ 与 final/)
2. 在 `draft/<需求名>.md` 生成骨架:背景 / 想要什么 / 不确定的点
3. 在 `.ai/memory/project-state.md` 需求进度表登记一行(状态 draft)

## 定稿(finalize)

1. 读 `draft/<需求名>.md`
2. 逐个澄清模糊点:一次只问一个问题,优先选择题
3. 按固定结构成稿:**目标 / 范围(必须含「不做什么」)/ 接口契约(格式见 architecture.md)/ 验收标准 / 开放问题**
4. 强制 critic 门:按 `critic.md` 检查,逐条回应完毕才可写入 `final/<需求名>.md`
5. 联动记忆:project-state 状态改 finalized;`features/<需求名>.md` 建档登记契约要点;MEMORY.md 加索引行
6. 需求文档与记忆变更一起 commit

## 与 superpowers 的衔接

实现阶段由 brainstorming/writing-plans 以 `final/<需求名>.md` 为输入。
本流程只产出需求(what/why),不做实现设计(how)。
```

`templates/common/.ai/skills/architecture.md`:
```markdown
# 架构方法论(语言无关)

## 模块边界

- 每个模块用一句话说清职责;说不清 = 边界有问题
- 模块间只通过显式接口通信;不看内部实现也能正确使用
- 依赖单向:上层可依赖下层,禁止反向依赖与循环依赖

## 接口契约格式(定稿时写入 final/*.md 的「接口契约」章节)

每个接口写清:

- **名称与语义**:做什么,明确不做什么
- **输入**:参数、类型、边界值约定
- **输出**:返回结构、错误路径(每种失败如何表达给调用方)
- **幂等/并发**:重复调用的后果,是否需要去重或加锁
- **兼容**:后续变更如何不破坏既有调用方

## 跨技术栈落地

本文件只写原则。具体项目的模块清单、依赖层级、数据规范写在
`.ai/memory/project-state.md` 或 `features/` 对应档案里,由 agent 按本原则裁剪到当前技术栈。
```

`templates/common/.ai/skills/code-review.md`:
```markdown
# Review 检查项(项目专属)

> 不注册为 skill;供 superpowers 的 code review 流程作为附加检查项引用。

- **契约一致**:实现与 `final/*.md` 的接口契约、验收标准逐条对照
- **错误路径**:失败表达与契约声明一致,没有吞掉错误
- **记忆同步**:功能行为变化已更新 `features/` 对应档案
- **范围**:未引入需求「不做什么」里排除的内容
- **简洁**:没有单人项目不需要的抽象(YAGNI)
```

`templates/common/.ai/skills/critic.md`:
```markdown
# 对抗性检查方法论

输入:一份需求定稿、架构设计或实现方案。你的职责是攻击它,不是完善它。

## 四类检查

1. **假设攻击**:依赖了哪些未验证的前提?哪条假设崩了整个方案就崩?
2. **契约漏洞**:错误路径、边界值、并发/幂等是否有定义?调用方误用会发生什么?
3. **过度设计**:哪些部分是 YAGNI?这个抽象在单人项目里值得吗?
4. **遗漏场景**:验收标准覆盖不到的行为?与 `.ai/memory/features/` 已有功能的冲突?

## 输出格式

质疑列表,每条:`[high|medium|low] 质疑内容 + 触发条件`。不提供修复方案,不表扬。

## 纪律

- 主 agent 必须逐条回应「接受并修改」或「给出理由反驳」,不允许沉默跳过
- 全部处理完毕才算通过
- Claude Code 侧:由 critic subagent 独立上下文执行,只给文档路径,不给对话历史
- Codex 侧:同上下文自检,刻意抵制为自己刚写内容辩护的倾向
```

`templates/common/.ai/skills/memory-update.md`:
```markdown
# 记忆更新协议(节点式)

## 触发时机

1. **完成一个任务节点 / 做出关键决策 → 立即写**,不攒到会话结束(主路径)
2. 用户说「更新记忆」或 /update-memory
3. 会话收尾、上下文即将压缩
4. 需求状态变化(requirements-flow 第 5 步联动)

## 写入路由

| 内容 | 去处 |
|---|---|
| 进展流水(做到哪/下一步/踩坑) | `session-log.md` 带时间戳追加 |
| 需求/里程碑状态变化 | `project-state.md` 对应表格行 |
| 功能设计决策、契约变更 | `features/<名>.md` |
| 新增记忆文件 | `MEMORY.md` 加索引行 |

## 硬性约束

- 写前先读目标文件
- 只增量追加,不重构既有格式与历史条目
- session-log 超约 200 行:把旧条目压缩进 project-state.md 的归档章节
- 跨工具切换前确认 session-log 已落盘;记忆变更随代码一起 commit
```

`templates/common/docs/requirements/README.md`:
```markdown
# 需求目录

- 每个迭代版本一个目录:`vX.Y.Z/`
- `draft/` — 人工粗稿,自由格式,想到哪写到哪
- `final/` — AI 协作定稿,固定结构:目标 / 范围 / 接口契约 / 验收标准 / 开放问题
- 定稿流程见 `.ai/skills/requirements-flow.md`(/new-requirement、/finalize-requirement)
```

`templates/common/docs/requirements/v1.0.0/draft/.gitkeep`、`templates/common/docs/requirements/v1.0.0/final/.gitkeep`:空文件。

- [ ] **Step 2: 更新期望清单**

`test/templates.test.js` 的 `EXPECTED_COMMON` 追加:
```js
  '.ai/skills/architecture.md',
  '.ai/skills/code-review.md',
  '.ai/skills/critic.md',
  '.ai/skills/memory-update.md',
  '.ai/skills/requirements-flow.md',
  'docs/requirements/README.md',
  'docs/requirements/v1.0.0/draft/.gitkeep',
  'docs/requirements/v1.0.0/final/.gitkeep',
```

- [ ] **Step 3: 运行测试**

Run: `npm test`
Expected: 全部 PASS

- [ ] **Step 4: Commit**

```bash
git add templates/ test/templates.test.js
git commit -m "feat: 方法论模板(五份 skills)+ 需求目录模板"
```

---

### Task 7: Claude 适配层模板

**Files:**
- Create: `templates/claude/CLAUDE.md`、`templates/claude/.claude/skills/{requirements-flow,critic,memory-update}/SKILL.md`、`templates/claude/.claude/commands/{update-memory.md,new-requirement.md,finalize-requirement.md,critic.md}`、`templates/claude/.claude/agents/critic.md`、`templates/claude/.claude/settings.json`
- Modify: `test/templates.test.js`(EXPECTED_CLAUDE)

**Interfaces:**
- Consumes: `.ai/skills/*.md` 的路径(Task 6 产出,包装只引用不复制正文)
- Produces: Claude Code 侧完整适配层

- [ ] **Step 1: 写模板**

`templates/claude/CLAUDE.md`:
```markdown
# {{projectName}}

## AI 协作框架(ai-memory)

进场先读 `.ai/memory/MEMORY.md`,随后遵循 `.ai/README.md` 的进场协议。

- 需求文档工作(新建/定稿)→ requirements-flow skill,产物在 `docs/requirements/vX.Y.Z/{draft,final}/`
- 记忆更新 → 节点式(完成任务节点立即写),协议见 `.ai/skills/memory-update.md`;手动 /update-memory
- 反驳检查 → /critic 或定稿流程内强制触发;必须派 critic subagent 独立上下文执行

## 与 superpowers 的编排(未安装则忽略本节)

1. 需求定稿(what/why)走 requirements-flow;实现设计(how)走 brainstorming,以 `docs/requirements/*/final/*.md` 为输入
2. code review 走 superpowers 流程,叠加 `.ai/skills/code-review.md` 的项目检查项

## 项目信息

- 技术栈:{{techStack}}
<!-- 在此补充启动/测试/构建命令 -->
```

`templates/claude/.claude/skills/requirements-flow/SKILL.md`:
```markdown
---
name: requirements-flow
description: Use when 用户要新建需求、定稿需求、把 draft 转 final,或提到「需求文档/定稿/finalize」
---

读取并严格遵循 `.ai/skills/requirements-flow.md` 执行,不要凭记忆复述流程。
```

`templates/claude/.claude/skills/critic/SKILL.md`:
```markdown
---
name: critic
description: Use when 需要对需求定稿、架构设计或实现方案做对抗性检查/反驳/挑毛病
---

派发 critic subagent(独立上下文,只给文档路径与 `.ai/skills/critic.md`,不给对话历史),随后按其纪律逐条回应质疑。
```

`templates/claude/.claude/skills/memory-update/SKILL.md`:
```markdown
---
name: memory-update
description: Use when 完成一个任务节点、做出关键决策、会话收尾,或用户要求更新记忆/总结进展
---

读取并严格遵循 `.ai/skills/memory-update.md` 的写入路由与硬性约束执行。
```

`templates/claude/.claude/commands/update-memory.md`:
```markdown
---
description: 主动总结当前进展并按路由写入 .ai/memory/
---

按 `.ai/skills/memory-update.md` 执行:
1. 读 `.ai/memory/MEMORY.md` 与 `session-log.md`
2. 追加本次节点条目(时间戳 + 做了什么 + 关键决策 + 下一步)
3. 需求/里程碑状态有变则更新 `project-state.md` 对应表格行
```

`templates/claude/.claude/commands/new-requirement.md`:
```markdown
---
description: 新建需求 draft 骨架并在 project-state 登记
argument-hint: <需求名> [版本,默认当前迭代]
---

按 `.ai/skills/requirements-flow.md` 的「新建」章节执行。需求名与版本:$ARGUMENTS
```

`templates/claude/.claude/commands/finalize-requirement.md`:
```markdown
---
description: 将 draft 需求定稿为 final(含强制 critic 门)
argument-hint: <需求名>
---

按 `.ai/skills/requirements-flow.md` 的「定稿」章节执行,需求名:$ARGUMENTS。
critic 门必须由 critic subagent 独立上下文执行,逐条回应后才写 final/。
```

`templates/claude/.claude/commands/critic.md`:
```markdown
---
description: 对指定文档做对抗性检查
argument-hint: <文档路径>
---

派发 critic subagent 检查 $ARGUMENTS:只给文档路径与 `.ai/skills/critic.md`,不携带对话历史。返回后逐条回应「接受并修改」或「有理由反驳」,不允许沉默跳过。
```

`templates/claude/.claude/agents/critic.md`:
```markdown
---
name: critic
description: 对需求定稿/架构设计/实现方案做对抗性检查。传入文档路径,不要传对话历史。
tools: Read, Grep, Glob
---

你是对抗性审查者。读取指定文档与 `.ai/skills/critic.md`,按四类清单(假设攻击/契约漏洞/过度设计/遗漏场景)攻击该文档。
只输出质疑列表:每条 `[high|medium|low] 质疑 + 触发条件`。不提供修复方案,不表扬,不复述文档。
```

`templates/claude/.claude/settings.json`:
```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "echo '[ai-memory] 会话收尾:请确认本次进展已按节点式协议写入 .ai/memory/session-log.md'"
          }
        ]
      }
    ],
    "PreCompact": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "echo '[ai-memory] 上下文即将压缩:请先把关键进展写入 .ai/memory/session-log.md'"
          }
        ]
      }
    ]
  }
}
```

- [ ] **Step 2: 更新期望清单**

`EXPECTED_CLAUDE` 设为:
```js
export const EXPECTED_CLAUDE = [
  '.claude/agents/critic.md',
  '.claude/commands/critic.md',
  '.claude/commands/finalize-requirement.md',
  '.claude/commands/new-requirement.md',
  '.claude/commands/update-memory.md',
  '.claude/settings.json',
  '.claude/skills/critic/SKILL.md',
  '.claude/skills/memory-update/SKILL.md',
  '.claude/skills/requirements-flow/SKILL.md',
  'CLAUDE.md',
];
```

- [ ] **Step 3: 运行测试**

Run: `npm test`
Expected: 全部 PASS

- [ ] **Step 4: Commit**

```bash
git add templates/claude/ test/templates.test.js
git commit -m "feat: Claude Code 适配层模板(skills/commands/critic agent/hooks)"
```

---

### Task 8: Codex 适配层模板

**Files:**
- Create: `templates/codex/AGENTS.md`、`templates/codex/.agents/skills/{requirements-flow,critic,memory-update}/SKILL.md`
- Modify: `test/templates.test.js`(EXPECTED_CODEX)

**Interfaces:**
- Consumes: `.ai/skills/*.md` 路径
- Produces: Codex 侧完整适配层

- [ ] **Step 1: 写模板**

`templates/codex/AGENTS.md`(与 CLAUDE.md 同源设计但独立成文,差异仅在 critic 一节——Codex 无 subagent,改为同上下文自检):
```markdown
# {{projectName}}

## AI 协作框架(ai-memory)

进场先读 `.ai/memory/MEMORY.md`,随后遵循 `.ai/README.md` 的进场协议。

- 需求文档工作(新建/定稿)→ requirements-flow skill,产物在 `docs/requirements/vX.Y.Z/{draft,final}/`
- 记忆更新 → 节点式(完成任务节点立即写),协议见 `.ai/skills/memory-update.md`
- 反驳检查 → critic skill 或定稿流程内强制触发;同上下文自检,刻意抵制自我辩护(见 `.ai/skills/critic.md` 纪律)

## 与 superpowers 的编排(未安装则忽略本节)

1. 需求定稿(what/why)走 requirements-flow;实现设计(how)走 brainstorming,以 `docs/requirements/*/final/*.md` 为输入
2. code review 走 superpowers 流程,叠加 `.ai/skills/code-review.md` 的项目检查项

## 项目信息

- 技术栈:{{techStack}}
<!-- 在此补充启动/测试/构建命令 -->
```

`templates/codex/.agents/skills/requirements-flow/SKILL.md`:
```markdown
---
name: requirements-flow
description: Use when 用户要新建需求、定稿需求、把 draft 转 final,或提到「需求文档/定稿/finalize」
---

读取并严格遵循 `.ai/skills/requirements-flow.md` 执行,不要凭记忆复述流程。
critic 门在 Codex 侧为同上下文自检:严格按 `.ai/skills/critic.md` 的四类清单与纪律执行。
```

`templates/codex/.agents/skills/critic/SKILL.md`:
```markdown
---
name: critic
description: Use when 需要对需求定稿、架构设计或实现方案做对抗性检查/反驳/挑毛病
---

读取 `.ai/skills/critic.md`,按四类清单攻击目标文档;输出带严重度的质疑列表后,逐条回应「接受并修改」或「有理由反驳」。刻意抵制为自己刚写内容辩护的倾向。
```

`templates/codex/.agents/skills/memory-update/SKILL.md`:
```markdown
---
name: memory-update
description: Use when 完成一个任务节点、做出关键决策、会话收尾,或用户要求更新记忆/总结进展
---

读取并严格遵循 `.ai/skills/memory-update.md` 的写入路由与硬性约束执行。
```

- [ ] **Step 2: 更新期望清单**

```js
export const EXPECTED_CODEX = [
  '.agents/skills/critic/SKILL.md',
  '.agents/skills/memory-update/SKILL.md',
  '.agents/skills/requirements-flow/SKILL.md',
  'AGENTS.md',
];
```

- [ ] **Step 3: 运行测试**

Run: `npm test`
Expected: 全部 PASS

- [ ] **Step 4: Commit**

```bash
git add templates/codex/ test/templates.test.js
git commit -m "feat: Codex 适配层模板(AGENTS.md + .agents/skills)"
```

---

### Task 9: CLI 入口 bin/cli.js

**Files:**
- Modify: `bin/cli.js`(替换占位)
- Test: `test/cli.test.js`

**Interfaces:**
- Consumes: `scaffold({ templatesRoot, targetDir, vars, tools, onConflict, importFrom })`
- Produces: `ai-memory init [--name <n>] [--stack <s>] [--tools <claude,codex|claude|codex>] [--import <path>] [--yes]`;缺参且无 `--yes` 时交互询问;`--yes` 时缺参用默认值(name=当前目录名、stack='(待补充)'、tools=claude,codex),冲突一律 skip

- [ ] **Step 1: 写失败测试(子进程跑非交互路径)**

`test/cli.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp, readFile, writeFile, access } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'cli.js');

test('init --yes 全量生成且渲染变量', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'aim-cli-'));
  await run(process.execPath, [CLI, 'init', '--name', 'demo', '--stack', 'Go', '--tools', 'claude,codex', '--yes'], { cwd: dir });
  const state = await readFile(path.join(dir, '.ai/memory/project-state.md'), 'utf8');
  assert.ok(state.includes('- 项目:demo'));
  assert.ok(state.includes('- 技术栈:Go'));
  await access(path.join(dir, 'CLAUDE.md'));
  await access(path.join(dir, 'AGENTS.md'));
});

test('init --tools claude 不生成 Codex 侧', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'aim-cli-'));
  await run(process.execPath, [CLI, 'init', '--name', 'demo', '--stack', 'Go', '--tools', 'claude', '--yes'], { cwd: dir });
  await access(path.join(dir, 'CLAUDE.md'));
  await assert.rejects(access(path.join(dir, 'AGENTS.md')));
});

test('init --yes 冲突时跳过既有文件', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'aim-cli-'));
  await writeFile(path.join(dir, 'CLAUDE.md'), 'MINE\n');
  const { stdout } = await run(process.execPath, [CLI, 'init', '--name', 'demo', '--stack', 'Go', '--tools', 'claude', '--yes'], { cwd: dir });
  assert.equal(await readFile(path.join(dir, 'CLAUDE.md'), 'utf8'), 'MINE\n');
  assert.ok(stdout.includes('跳过 1'));
});

test('非法 --tools 值报错退出', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'aim-cli-'));
  await assert.rejects(
    run(process.execPath, [CLI, 'init', '--tools', 'cursor', '--yes'], { cwd: dir }),
    /tools 仅支持 claude、codex/
  );
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test test/cli.test.js`
Expected: FAIL(占位 cli.js 不会生成任何文件)

- [ ] **Step 3: 实现**

`bin/cli.js`:
```js
#!/usr/bin/env node
import { Command } from 'commander';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scaffold } from '../src/scaffold.js';

const TEMPLATES = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'templates');
const program = new Command();

program.name('ai-memory').description('AI memory + requirements workflow scaffolder');

program
  .command('init')
  .description('在当前目录生成 ai-memory 框架')
  .option('--name <name>', '项目名')
  .option('--stack <desc>', '技术栈描述')
  .option('--tools <list>', '启用工具,逗号分隔:claude,codex')
  .option('--import <path>', '从已有项目导入 user-profile/feedback')
  .option('--yes', '非交互模式:缺参用默认值,冲突一律跳过')
  .action(async (opts) => {
    const targetDir = process.cwd();
    let { name, stack, tools: toolsRaw } = opts;

    let importFrom = opts.import;
    if (!opts.yes) {
      const { input, checkbox } = await import('@inquirer/prompts');
      name ??= await input({ message: '项目名:', default: path.basename(targetDir) });
      stack ??= await input({ message: '技术栈描述:', default: '(待补充)' });
      toolsRaw ??= (await checkbox({
        message: '启用哪些工具适配:',
        choices: [
          { name: 'Claude Code', value: 'claude', checked: true },
          { name: 'Codex', value: 'codex', checked: true },
        ],
      })).join(',');
      importFrom ??= (await input({
        message: '从已有项目导入 user-profile/feedback?(输入项目路径,留空跳过)', default: '',
      })) || undefined;
    }
    name ??= path.basename(targetDir);
    stack ??= '(待补充)';
    toolsRaw ??= 'claude,codex';

    const tools = toolsRaw.split(',').map(s => s.trim()).filter(Boolean);
    for (const t of tools) {
      if (t !== 'claude' && t !== 'codex') {
        console.error(`tools 仅支持 claude、codex,收到: ${t}`);
        process.exit(1);
      }
    }

    const onConflict = opts.yes
      ? () => 'skip'
      : async (dest) => {
          const { confirm } = await import('@inquirer/prompts');
          return (await confirm({ message: `${dest} 已存在,覆盖?`, default: false })) ? 'overwrite' : 'skip';
        };

    const vars = { projectName: name, techStack: stack, date: new Date().toISOString().slice(0, 10) };
    const r = await scaffold({ templatesRoot: TEMPLATES, targetDir, vars, tools, onConflict, importFrom });
    console.log(`完成:写入 ${r.written.length},跳过 ${r.skipped.length}`);
    if (r.skipped.length) for (const d of r.skipped) console.log(`  跳过 ${d}`);
    console.log('下一步:打开项目让 agent 读 .ai/memory/MEMORY.md;把项目命令补进 CLAUDE.md/AGENTS.md。');
  });

program.parseAsync();
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test`
Expected: 全部 PASS

- [ ] **Step 5: Commit**

```bash
git add bin/cli.js test/cli.test.js
git commit -m "feat: init 命令(交互/非交互双模式,冲突策略,tools 过滤)"
```

---

### Task 10: README 与发布准备

**Files:**
- Create: `README.md`
- Test: 复用全量测试 + `npm pack` 冒烟

**Interfaces:**
- Consumes: 全部前序产出
- Produces: 可发布的 npm 包

- [ ] **Step 1: 写 README.md**

```markdown
# @betterdan/ai-memory

AI 记忆 + 需求工作流脚手架:一条命令在项目里生成跨 Claude Code / Codex 的
记忆层(.ai/memory)、方法论层(.ai/skills)、需求版本目录(docs/requirements)
与两侧薄适配层。

## 用法

​```bash
npx @betterdan/ai-memory init
# 非交互:
npx @betterdan/ai-memory init --name demo --stack "PHP + Vue" --tools claude,codex --yes
# 从已有项目导入用户级记忆:
npx @betterdan/ai-memory init --import /path/to/other-project
​```

## 设计

- 单一源:所有正文只在 `.ai/`,`.claude/`、`.agents/` 只是触发包装
- 节点式记忆:完成任务节点立即写 session-log,跨工具切换不断档
- 需求双目录:人工粗稿 `draft/` → AI 定稿 `final/`(强制 critic 门)
- 幂等:已存在的文件逐个询问,绝不静默覆盖(`--yes` 一律跳过)

设计文档:`docs/superpowers/specs/2026-07-05-ai-memory-framework-design.md`
```

(注:README 中代码围栏写正常的三反引号;上文加零宽标记仅为嵌套展示。)

- [ ] **Step 2: 全量测试 + 打包冒烟**

Run: `npm test`
Expected: 全部 PASS

Run: `npm pack --dry-run`
Expected: 文件列表包含 `bin/`、`src/`、`templates/` 全部文件与 README、package.json;不含 `test/`、`docs/`、`temp`

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: README 与发布准备"
```

(实际 `npm publish --access public` 由用户手动执行,不在本计划内。)
