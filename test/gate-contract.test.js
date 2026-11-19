import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, readFile, readdir, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { gateContract, matchGlob } from '../src/gate-contract.js';
import { gateReady } from '../src/gate-ready.js';
import { gitHookStatus, installGitHook } from '../src/git-hooks.js';
import { scaffold } from '../src/scaffold.js';
import { createTempDirs } from './temp-dirs.js';

const run = promisify(execFile);
const TEMPLATES = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'templates');
const CLI = path.join(path.dirname(TEMPLATES), 'bin', 'cli.js');
const tempDirs = createTempDirs();
afterEach(() => tempDirs.cleanup());

const VARS = {
  projectName: 'demo', techStack: 'Go', date: '2026-09-17', modelProfile: 'inherit', frameworkVersion: '0.11.0',
};

const FINAL = (declaration) => [
  '# 改签名', '',
  '## 目标', '', '调整下单接口。', '',
  '## 范围', '', '本次不做:批量。', '',
  '## 外部行为契约', '', '新增必填字段。', '',
  '## 验收标准', '', '- 缺该字段时返回 400', '',
  '## 开放问题', '', '无', '',
  '## 实现交接', '', `风险等级:M。${declaration}`, '',
].join('\n');

async function makeRepo({ declaration = '契约 diff 已确认。', globs = true, point = '改签名' } = {}) {
  const dir = await tempDirs.make('aim-contract-');
  await scaffold({ templatesRoot: TEMPLATES, targetDir: dir, vars: VARS, tools: [], onConflict: () => 'skip' });

  if (globs) {
    const file = path.join(dir, 'docs', 'architecture', 'interfaces.md');
    const body = await readFile(file, 'utf8');
    await writeFile(file, body
      .replace('entry_globs: []', 'entry_globs: [src/api/**]')
      .replace('contract_globs: []', 'contract_globs: [docs/api/**]'));
  }
  if (point) {
    const file = path.join(dir, '.ai', 'knowledge', 'iterations.md');
    const body = await readFile(file, 'utf8');
    await writeFile(file, body.replace('|---|---|---|---|---|',
      `|---|---|---|---|---|\n| v1.0.0 | ${point} | M | in-progress | 无 |`));
    const finalDir = path.join(dir, 'docs', 'requirements', 'v1.0.0', 'final');
    await mkdir(finalDir, { recursive: true });
    await writeFile(path.join(finalDir, `${point}.md`), FINAL(declaration));
  }

  await run('git', ['init', '-q', '.'], { cwd: dir });
  await run('git', ['config', 'user.email', 'test@example.com'], { cwd: dir });
  await run('git', ['config', 'user.name', 'test'], { cwd: dir });
  await run('git', ['add', '-A'], { cwd: dir });
  await run('git', ['commit', '-qm', 'base'], { cwd: dir });
  return dir;
}

async function touch(dir, rel, body = 'x\n') {
  const full = path.join(dir, ...rel.split('/'));
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, body);
}

async function snapshot(dir) {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  const out = {};
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const full = path.join(entry.parentPath, entry.name);
    const key = path.relative(dir, full).split(path.sep).join('/');
    if (key.startsWith('.git/')) continue;
    out[key] = createHash('sha256').update(await readFile(full)).digest('hex');
  }
  return out;
}

test('glob 只支持 ** 与 *,按路径段匹配', () => {
  assert.equal(matchGlob('src/api/**', 'src/api/orders.js'), true);
  assert.equal(matchGlob('src/api/**', 'src/api/v1/orders.js'), true);
  assert.equal(matchGlob('src/api/**', 'src/core/db.js'), false);
  assert.equal(matchGlob('docs/api/*.yaml', 'docs/api/orders.yaml'), true);
  assert.equal(matchGlob('docs/api/*.yaml', 'docs/api/v1/orders.yaml'), false);
  assert.equal(matchGlob('src/**/handlers/*.ts', 'src/a/b/handlers/x.ts'), true);
  assert.equal(matchGlob('**/*.proto', 'proto/order.proto'), true);
  assert.equal(matchGlob('src/*.js', 'src/a/b.js'), false);
});

test('不是 git 仓库时跳过', async () => {
  const dir = await tempDirs.make('aim-contract-nogit-');
  await scaffold({ templatesRoot: TEMPLATES, targetDir: dir, vars: VARS, tools: [], onConflict: () => 'skip' });
  const file = path.join(dir, 'docs', 'architecture', 'interfaces.md');
  const body = await readFile(file, 'utf8');
  await writeFile(file, body
    .replace('entry_globs: []', 'entry_globs: [src/api/**]')
    .replace('contract_globs: []', 'contract_globs: [docs/api/**]'));

  const result = await gateContract({ targetDir: dir });
  assert.match(result.skipped, /不是 git 仓库/);
  assert.deepEqual(result.problems, []);
});

test('interfaces.md 未填 globs 时跳过并说明要补什么', async () => {
  const dir = await makeRepo({ globs: false });
  const result = await gateContract({ targetDir: dir });
  assert.match(result.skipped, /entry_globs 或 contract_globs 为空/);
});

test('声明契约已确认:入口与契约同时变更才通过', async () => {
  const dir = await makeRepo();
  await touch(dir, 'src/api/order.js');
  const missing = await gateContract({ targetDir: dir });
  assert.equal(missing.problems.length, 1);
  assert.match(missing.problems[0].message, /契约文件没有任何变更/);
  assert.deepEqual(missing.touchedEntries, ['src/api/order.js']);

  await touch(dir, 'docs/api/order.yaml');
  const synced = await gateContract({ targetDir: dir });
  assert.deepEqual(synced.problems, []);
});

test('声明不涉及对外接口却碰了入口代码要拦', async () => {
  const dir = await makeRepo({ declaration: '不涉及对外接口。' });
  const clean = await gateContract({ targetDir: dir });
  assert.deepEqual(clean.problems, [], '没碰入口代码时不应报错');

  await touch(dir, 'src/api/order.js');
  const violated = await gateContract({ targetDir: dir });
  assert.equal(violated.problems.length, 1);
  assert.match(violated.problems[0].message, /声明「不涉及对外接口」/);
});

test('只改契约不改入口是合法的', async () => {
  const dir = await makeRepo();
  await touch(dir, 'docs/api/order.yaml');
  const result = await gateContract({ targetDir: dir });
  assert.deepEqual(result.problems, []);
});

test('定稿没有声明契约状态时要拦', async () => {
  const dir = await makeRepo({ declaration: '' });
  const result = await gateContract({ targetDir: dir });
  assert.equal(result.problems.length, 1);
  assert.match(result.problems[0].message, /未声明契约状态/);
});

test('没有进行中的需求点时跳过', async () => {
  const dir = await makeRepo({ point: null });
  const result = await gateContract({ targetDir: dir });
  assert.match(result.skipped, /没有进行中的需求点/);
});

test('--staged 只看暂存区,未暂存的改动不算', async () => {
  const dir = await makeRepo();
  await touch(dir, 'src/api/order.js');

  const staged = await gateContract({ targetDir: dir, staged: true });
  assert.deepEqual(staged.problems, [], '未 git add 时暂存区是空的');

  await run('git', ['add', 'src/api/order.js'], { cwd: dir });
  const afterAdd = await gateContract({ targetDir: dir, staged: true });
  assert.equal(afterAdd.problems.length, 1);
  assert.deepEqual(afterAdd.touchedEntries, ['src/api/order.js']);
});

test('就绪暂存模式不能用未暂存的定稿或需求状态放行提交', async () => {
  const dir = await makeRepo({ point: null });
  const iterations = path.join(dir, '.ai', 'knowledge', 'iterations.md');
  const body = await readFile(iterations, 'utf8');
  await writeFile(iterations, body.replace('|---|---|---|---|---|', '|---|---|---|---|---|\n| v1.0.0 | 新需求 | M | in-progress | 无 |'));
  await touch(dir, 'docs/requirements/v1.0.0/final/新需求.md', FINAL('不涉及对外接口。'));
  await assert.rejects(gateReady({ targetDir: dir, staged: true }), /暂存/);
  await run(process.execPath, [CLI, 'worktree', 'select', '--point', '新需求'], { cwd: dir });
  await assert.rejects(gateReady({ targetDir: dir, staged: true }), /暂存/);
  await run('git', ['add', '.ai/knowledge/iterations.md'], { cwd: dir });
  assert.ok((await gateReady({ targetDir: dir, staged: true })).blocked.length);
  await run('git', ['add', 'docs/requirements/v1.0.0/final/新需求.md'], { cwd: dir });
  assert.equal((await gateReady({ targetDir: dir, staged: true })).blocked.length, 0);
  await touch(dir, 'docs/requirements/v1.0.0/final/新需求.md', FINAL(''));
  assert.equal((await gateReady({ targetDir: dir, staged: true })).blocked.length, 0, '未暂存的定稿改动不改变本次提交');
});

test('契约暂存模式读取暂存区定稿,不能被未暂存内容覆盖', async () => {
  const dir = await makeRepo({ declaration: '不涉及对外接口。' });
  await touch(dir, 'docs/requirements/v1.0.0/final/改签名.md', FINAL('契约 diff 已确认。'));
  await touch(dir, 'src/api/order.js');
  await touch(dir, 'docs/api/order.yaml');
  await run('git', ['add', 'src/api/order.js', 'docs/api/order.yaml'], { cwd: dir });
  assert.match((await gateContract({ targetDir: dir, staged: true })).problems[0].message, /不涉及对外接口/);
});

test('契约暂存模式使用已暂存接口配置,忽略未暂存配置变更', async () => {
  const dir = await makeRepo({ declaration: '不涉及对外接口。' });
  const interfaces = path.join(dir, 'docs', 'architecture', 'interfaces.md');
  await writeFile(interfaces, (await readFile(interfaces, 'utf8')).replace('entry_globs: [src/api/**]', 'entry_globs: []'));
  await touch(dir, 'src/api/order.js');
  await run('git', ['add', 'src/api/order.js'], { cwd: dir });
  const result = await gateContract({ targetDir: dir, staged: true });
  assert.match(result.problems[0].message, /不涉及对外接口/);
});

test('契约暂存模式能匹配中文入口并检查移出入口目录的旧路径', async () => {
  const dir = await makeRepo({ declaration: '不涉及对外接口。' });
  const config = 'docs/architecture/interfaces.md';
  const entry = 'src/接口/下单.js';
  const body = await readFile(path.join(dir, config), 'utf8');
  await touch(dir, config, body.replace('src/api/**', 'src/接口/**'));
  await touch(dir, entry);
  await run('git', ['add', '--', config, entry], { cwd: dir });
  assert.deepEqual((await gateContract({ targetDir: dir, staged: true })).touchedEntries, [entry]);
  await run('git', ['commit', '-qm', 'entry baseline'], { cwd: dir });
  await run('git', ['config', 'diff.renames', 'true'], { cwd: dir });
  await run('git', ['mv', '--', entry, 'src/legacy.js'], { cwd: dir });
  const result = await gateContract({ targetDir: dir, staged: true });
  assert.deepEqual(result.touchedEntries, [entry]);
  assert.match(result.problems[0].message, /不涉及对外接口/);
});

test('契约暂存模式报告暂存区缺少已配置的接口规则', async () => {
  const dir = await makeRepo();
  const config = 'docs/architecture/interfaces.md';
  await touch(dir, 'src/api/order.js');
  await run('git', ['add', 'src/api/order.js'], { cwd: dir });
  await run('git', ['rm', '--cached', '--', config], { cwd: dir });
  await assert.rejects(gateContract({ targetDir: dir, staged: true }), /暂存区缺少 docs\/architecture\/interfaces.md/);
});

test('两个暂存门禁一致处理本地活动需求,以已暂存的定稿为准', async () => {
  const dir = await makeRepo();
  const iterations = '.ai/knowledge/iterations.md';
  await run(process.execPath, [CLI, 'worktree', 'select', '--point', '改签名'], { cwd: dir });
  const body = await readFile(path.join(dir, iterations), 'utf8');
  await touch(dir, iterations, body.split('\n').filter(line => !line.includes('| 改签名 |')).join('\n'));
  assert.equal((await gateReady({ targetDir: dir, staged: true })).results.length, 1);

  const untracked = await makeRepo({ point: null });
  const previous = await readFile(path.join(untracked, iterations), 'utf8');
  await touch(untracked, iterations, previous.replace('|---|---|---|---|---|', '|---|---|---|---|---|\n| v1.0.0 | 新需求 | M | in-progress | 无 |'));
  await assert.rejects(gateContract({ targetDir: untracked, staged: true }), /暂存.*新需求/);
});

test('真实 worktree 提交不能依赖未暂存的需求文档', async () => {
  const dir = await makeRepo({ point: null });
  const root = await tempDirs.make('aim-index-hook-');
  const work = path.join(root, 'feature');
  await run('git', ['worktree', 'add', '-qb', 'feature/index', work], { cwd: dir });
  const iterations = path.join(work, '.ai', 'knowledge', 'iterations.md');
  const body = await readFile(iterations, 'utf8');
  await writeFile(iterations, body.replace('|---|---|---|---|---|', '|---|---|---|---|---|\n| v1.0.0 | 新需求 | M | in-progress | 无 |'));
  await touch(work, 'docs/requirements/v1.0.0/final/新需求.md', FINAL('不涉及对外接口。'));
  await run(process.execPath, [CLI, 'worktree', 'select', '--point', '新需求'], { cwd: work });
  const sample = '.ai/hooks/pre-commit.sample';
  const sampleBody = await readFile(path.join(work, sample), 'utf8');
  await touch(work, sample, sampleBody.replace(/\r?\n/g, '\r\n'));
  const { installed } = await installGitHook({ targetDir: work });
  assert.equal(installed, true);
  const { stdout: hookPath } = await run('git', ['rev-parse', '--git-path', 'hooks/pre-commit'], { cwd: work });
  const hook = path.resolve(work, hookPath.trim());
  assert.ok(!(await readFile(hook, 'utf8')).includes('\r'), 'Git 必须能用 sh 执行共享 hook');
  await touch(work, 'new-file.txt');
  await run('git', ['add', 'new-file.txt'], { cwd: work });
  const env = { ...process.env, AI_MEMORY_CLI: CLI };
  const failure = await run('git', ['commit', '-qm', 'incomplete'], { cwd: work, env }).then(() => null, err => err);
  assert.ok(failure);
  assert.match(failure.stdout + failure.stderr, /暂存/);
  await run('git', ['add', '.ai/knowledge/iterations.md', 'docs/requirements/v1.0.0/final/新需求.md'], { cwd: work });
  await run('git', ['commit', '-qm', 'complete'], { cwd: work, env });
});

test('hooks status 提醒 launcher 旧样例仍读取工作区', async () => {
  const dir = await makeRepo();
  assert.equal((await installGitHook({ targetDir: dir })).installed, true);
  const { stdout } = await run('git', ['rev-parse', '--git-path', 'hooks/pre-commit'], { cwd: dir });
  const hook = path.resolve(dir, stdout.trim());
  const body = await readFile(hook, 'utf8');
  await writeFile(hook, body.replace('gate ready --staged', 'gate ready'), 'utf8');
  const status = await gitHookStatus({ targetDir: dir });
  assert.ok(status.installed && status.outdated);
  assert.match(status.message, /暂存区/);
});

test('新增的未跟踪文件必须被发现,不能被 git 折叠成目录', async () => {
  const dir = await makeRepo();
  await touch(dir, 'src/api/nested/deep/order.js');
  const result = await gateContract({ targetDir: dir });
  assert.deepEqual(result.touchedEntries, ['src/api/nested/deep/order.js']);
});

test('契约门禁是只读的', async () => {
  const dir = await makeRepo();
  await touch(dir, 'src/api/order.js');
  const before = await snapshot(dir);
  await gateContract({ targetDir: dir });
  assert.deepEqual(await snapshot(dir), before);
});

test('interfaces.md 模板带 frontmatter 并说明字段', async () => {
  const body = await readFile(path.join(TEMPLATES, 'common', 'docs', 'architecture', 'interfaces.md'), 'utf8');
  assert.ok(body.startsWith('---'), 'frontmatter 必须在文件最前');
  assert.ok(body.includes('entry_globs: []'));
  assert.ok(body.includes('contract_globs: []'));
  assert.ok(body.includes('gate contract'), '须说明这两个字段给谁用');
  assert.ok(body.includes('以 frontmatter 为准'), '须说明与下方表格冲突时以谁为准');
});

test('hooks install 装 git 门禁,已存在时不覆盖', async () => {
  const dir = await makeRepo();
  const before = await gitHookStatus({ targetDir: dir });
  assert.equal(before.installed, false);

  const installed = await installGitHook({ targetDir: dir });
  assert.equal(installed.installed, true);
  const hook = await readFile(path.join(dir, '.git', 'hooks', 'pre-commit'), 'utf8');
  assert.match(hook, /gate ready/);
  assert.match(hook, /gate contract --staged/);
  assert.match(hook, /kb check/);

  const again = await installGitHook({ targetDir: dir });
  assert.equal(again.installed, false, '已存在时必须拒绝覆盖');
  assert.match(again.message, /--force/);

  const forced = await installGitHook({ targetDir: dir, force: true });
  assert.equal(forced.installed, true);

  const after = await gitHookStatus({ targetDir: dir });
  assert.equal(after.installed, true);
  assert.equal(after.managed, true);
});

test('非 git 仓库时 hooks install 明确报错', async () => {
  const dir = await tempDirs.make('aim-hooks-nogit-');
  await scaffold({ templatesRoot: TEMPLATES, targetDir: dir, vars: VARS, tools: [], onConflict: () => 'skip' });
  const result = await installGitHook({ targetDir: dir });
  assert.equal(result.installed, false);
  assert.match(result.message, /不是 git 仓库/);
});

test('子目录不能意外向父仓库安装 hook', async () => {
  const dir = await makeRepo();
  const child = path.join(dir, 'nested');
  await mkdir(child);
  await scaffold({ templatesRoot: TEMPLATES, targetDir: child, vars: VARS, tools: [], onConflict: () => 'skip' });
  const result = await installGitHook({ targetDir: child });
  assert.equal(result.installed, false);
  assert.match(result.message, /仓库根目录/);
});

test('经 junction 或符号链接进入仓库时可以识别真实根目录', async () => {
  const dir = await makeRepo();
  const parent = await tempDirs.make('aim-alias-');
  const alias = path.join(parent, 'alias');
  await symlink(dir, alias, process.platform === 'win32' ? 'junction' : 'dir');
  assert.equal((await installGitHook({ targetDir: alias })).installed, true);
  assert.equal((await gitHookStatus({ targetDir: dir })).managed, true);
});

test('hooks status 识别 v0.11.2 及以前经 npx 调用的旧版门禁', async () => {
  const dir = await makeRepo();
  await writeFile(path.join(dir, '.git', 'hooks', 'pre-commit'),
    '#!/bin/sh\n# ai-memory\nnpx --no-install ai-memory gate ready || exit 1\n');
  const status = await gitHookStatus({ targetDir: dir });
  assert.equal(status.installed, true);
  assert.equal(status.outdated, true);
  assert.match(status.message, /hooks install --force/);

  await installGitHook({ targetDir: dir, force: true });
  assert.equal((await gitHookStatus({ targetDir: dir })).outdated, false);
});

test('关联 worktree 安装和检查共用 hook,不会覆盖已有 hook', async () => {
  const dir = await makeRepo();
  const work = path.join(await tempDirs.make('aim-linked-'), 'feature');
  await run('git', ['worktree', 'add', '-qb', 'feature/test', work], { cwd: dir });
  const result = await installGitHook({ targetDir: work });
  assert.equal(result.installed, true);
  assert.match(result.message, /共享/);
  assert.equal((await gitHookStatus({ targetDir: dir })).managed, true);
  assert.equal((await gitHookStatus({ targetDir: work })).managed, true);
  assert.equal((await installGitHook({ targetDir: work })).installed, false);
});

test('共用 hook 提交时检查实际触发的 worktree 和暂存区', async () => {
  const dir = await makeRepo();
  const base = await tempDirs.make('aim-two-worktrees-');
  const first = path.join(base, 'first');
  const second = path.join(base, 'second');
  await run('git', ['worktree', 'add', '-qb', 'feature/first', first], { cwd: dir });
  await run('git', ['worktree', 'add', '-qb', 'feature/second', second], { cwd: dir });
  await installGitHook({ targetDir: first });
  const env = { ...process.env, AI_MEMORY_CLI: CLI };
  await touch(first, 'src/api/order.js');
  await run('git', ['add', 'src/api/order.js'], { cwd: first });
  const failure = await run('git', ['commit', '-qm', 'bad'], { cwd: first, env }).then(() => null, err => err);
  assert.ok(failure, '入口改动缺少契约时应阻止提交');
  await touch(second, 'local.txt');
  await run('git', ['add', 'local.txt'], { cwd: second });
  await run('git', ['commit', '-qm', 'good'], { cwd: second, env });
});

test('自定义 hooksPath 的有效 hook 被安装和识别,已有内容不被覆盖', async () => {
  const dir = await makeRepo();
  await run('git', ['config', 'core.hooksPath', '.custom-hooks'], { cwd: dir });
  await mkdir(path.join(dir, '.custom-hooks'));
  const hook = path.join(dir, '.custom-hooks', 'pre-commit');
  await writeFile(hook, '#!/bin/sh\n# custom\n');
  assert.equal((await installGitHook({ targetDir: dir })).installed, false);
  assert.match(await readFile(hook, 'utf8'), /custom/);
  assert.equal((await gitHookStatus({ targetDir: dir })).managed, false);
  assert.equal((await installGitHook({ targetDir: dir, force: true })).installed, true);
  assert.equal((await gitHookStatus({ targetDir: dir })).managed, true);
});

test('基线对比检查已提交的需求分支,缺失基线报错', async () => {
  const dir = await makeRepo({ declaration: '不涉及对外接口。' });
  await run('git', ['branch', 'dev'], { cwd: dir });
  await touch(dir, 'src/api/order.js');
  await run('git', ['add', 'src/api/order.js'], { cwd: dir });
  await run('git', ['commit', '-qm', 'feature'], { cwd: dir });
  assert.equal((await gateContract({ targetDir: dir })).problems.length, 0);
  const compared = await gateContract({ targetDir: dir, base: 'dev', point: '改签名' });
  assert.equal(compared.problems.length, 1);
  await assert.rejects(gateContract({ targetDir: dir, base: 'missing', point: '改签名' }), /基线/);
  await assert.rejects(gateContract({ targetDir: dir, base: 'dev' }), /--point/);
  await assert.rejects(gateContract({ targetDir: dir, base: 'dev', point: '改签名', staged: true }), /不能同时/);
  const cliFailure = await run(process.execPath, [CLI, 'gate', 'contract', '--base', 'dev', '--point', '改签名'], { cwd: dir }).then(() => null, err => err);
  assert.equal(cliFailure.code, 1);
  assert.match(cliFailure.stdout, /不涉及对外接口/);
  const missing = await run(process.execPath, [CLI, 'gate', 'contract', '--base', 'missing', '--point', '改签名'], { cwd: dir }).then(() => null, err => err);
  assert.notEqual(missing.code, 0);
  assert.match(missing.stderr, /基线/);
  const hook = run(process.execPath, [CLI, 'gate', 'contract', '--base', 'missing', '--point', '改签名', '--hook'], { cwd: dir });
  hook.child.stdin.end('{}');
  const hookFailure = await hook.then(() => null, err => err);
  assert.equal(hookFailure.code, 2);
});

test('不同 worktree 可选各自的活动需求,默认检查全部并可恢复', async () => {
  const dir = await makeRepo({ declaration: '不涉及对外接口。' });
  const iterations = path.join(dir, '.ai', 'knowledge', 'iterations.md');
  await writeFile(iterations, (await readFile(iterations, 'utf8')).replace('| v1.0.0 | 改签名 | M | in-progress | 无 |', '| v1.0.0 | 改签名 | M | in-progress | 无 |\n| v1.0.0 | 另一个 | M | in-progress | 无 |'));
  await run('git', ['add', '.ai/knowledge/iterations.md'], { cwd: dir });
  await run('git', ['commit', '-qm', 'second point'], { cwd: dir });
  const root = await tempDirs.make('aim-selection-');
  const a = path.join(root, 'a'); const b = path.join(root, 'b');
  await run('git', ['worktree', 'add', '-qb', 'selection/a', a], { cwd: dir });
  await run('git', ['worktree', 'add', '-qb', 'selection/b', b], { cwd: dir });
  await run(process.execPath, [CLI, 'worktree', 'select', '--point', '改签名'], { cwd: a });
  const readyA = await run(process.execPath, [CLI, 'gate', 'ready'], { cwd: a });
  assert.match(readyA.stdout, /就绪 改签名/);
  const contractA = await run(process.execPath, [CLI, 'gate', 'contract'], { cwd: a });
  assert.match(contractA.stdout, /契约声明与改动一致/);
  const readyB = await run(process.execPath, [CLI, 'gate', 'ready'], { cwd: b }).then(() => null, err => err);
  assert.match(readyB.stdout, /另一个/);
  const contractB = await run(process.execPath, [CLI, 'gate', 'contract'], { cwd: b }).then(() => null, err => err);
  assert.match(contractB.stdout, /另一个/);
  await run(process.execPath, [CLI, 'worktree', 'select', '--point', '另一个'], { cwd: b });
  assert.match((await run(process.execPath, [CLI, 'worktree', 'status'], { cwd: b })).stdout, /另一个/);
  assert.match((await run(process.execPath, [CLI, 'worktree', 'status'], { cwd: a })).stdout, /改签名/);
  await assert.rejects(run(process.execPath, [CLI, 'worktree', 'select', '--point', '不存在'], { cwd: a }));
  assert.match((await run(process.execPath, [CLI, 'worktree', 'status'], { cwd: a })).stdout, /改签名/);
  const selectedFile = path.join(a, '.ai', 'runs', 'active-point.json');
  await run('git', ['check-ignore', '.ai/runs/active-point.json'], { cwd: a });
  const iterA = path.join(a, '.ai', 'knowledge', 'iterations.md');
  const progress = await readFile(iterA, 'utf8');
  await writeFile(iterA, progress.replace('| 改签名 | M | in-progress |', '| 改签名 | M | accepted |'));
  assert.match((await run(process.execPath, [CLI, 'gate', 'ready'], { cwd: a })).stdout, /没有进行中的需求点/);
  await writeFile(iterA, progress);
  await writeFile(selectedFile, '{invalid');
  const invalid = run(process.execPath, [CLI, 'gate', 'ready', '--hook'], { cwd: a });
  invalid.child.stdin.end('{}');
  assert.equal((await invalid.then(() => null, err => err)).code, 2);
  await writeFile(selectedFile, JSON.stringify({ point: '不存在' }));
  const stale = run(process.execPath, [CLI, 'gate', 'contract', '--hook'], { cwd: a });
  stale.child.stdin.end('{}');
  assert.equal((await stale.then(() => null, err => err)).code, 2);
  await run(process.execPath, [CLI, 'worktree', 'clear'], { cwd: a });
  const restored = await run(process.execPath, [CLI, 'gate', 'ready'], { cwd: a }).then(() => null, err => err);
  assert.match(restored.stdout, /另一个/);
});

test('两个需求在独立 worktree 开发,合并与 rebase 后按更新的基线检查', async () => {
  const dir = await makeRepo({ declaration: '不涉及对外接口。' });
  await run('git', ['branch', 'dev'], { cwd: dir });
  const root = await tempDirs.make('aim-parallel-');
  const first = path.join(root, 'first');
  const second = path.join(root, 'second');
  await run('git', ['worktree', 'add', '-qb', 'feature/a', first, 'dev'], { cwd: dir });
  await run('git', ['worktree', 'add', '-qb', 'feature/b', second, 'dev'], { cwd: dir });
  await touch(first, 'feature-a.txt', 'A');
  await touch(second, 'src/api/b.js', 'B');
  await run('git', ['add', 'feature-a.txt'], { cwd: first });
  await run('git', ['commit', '-qm', 'feature a'], { cwd: first });
  await run('git', ['add', 'src/api/b.js'], { cwd: second });
  await run('git', ['commit', '-qm', 'feature b'], { cwd: second });
  assert.equal((await gateContract({ targetDir: first, base: 'dev', point: '改签名' })).problems.length, 0);
  assert.equal((await gateContract({ targetDir: second, base: 'dev', point: '改签名' })).problems.length, 1);
  await run('git', ['checkout', '-q', 'dev'], { cwd: dir });
  await run('git', ['merge', '--ff-only', 'feature/a'], { cwd: dir });
  await run('git', ['rebase', 'dev'], { cwd: second });
  assert.equal((await gateContract({ targetDir: second, base: 'dev', point: '改签名' })).problems.length, 1);
  assert.equal(await readFile(path.join(second, 'feature-a.txt'), 'utf8'), 'A');
});
