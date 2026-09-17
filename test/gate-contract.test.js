import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { gateContract, matchGlob } from '../src/gate-contract.js';
import { gitHookStatus, installGitHook } from '../src/git-hooks.js';
import { scaffold } from '../src/scaffold.js';
import { createTempDirs } from './temp-dirs.js';

const run = promisify(execFile);
const TEMPLATES = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'templates');
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
