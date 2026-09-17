import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { checkReadiness, gateReady, inProgressPoints, isHookAllowedPath } from '../src/gate-ready.js';
import { scaffold } from '../src/scaffold.js';
import { createTempDirs } from './temp-dirs.js';

const TEMPLATES = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'templates');
const tempDirs = createTempDirs();
afterEach(() => tempDirs.cleanup());

const VARS = {
  projectName: 'demo', techStack: 'Go', date: '2026-09-17', modelProfile: 'inherit', frameworkVersion: '0.11.0',
};

const READY = [
  '# 批量导出', '',
  '## 目标', '', '让用户一次导出多条记录。', '',
  '## 范围', '', '本次不做:定时导出。', '',
  '## 外部行为契约', '', '调用方提交 id 列表。', '',
  '## 验收标准', '',
  '- 提交 100 个 id,返回 CSV,行数为 100',
  '- 提交超过 500 个 id,返回 400 与 TOO_MANY', '',
  '## 开放问题', '', '- 超时阈值取 30s(假设,不影响本点验收)', '',
  '## 实现交接', '', '风险等级:M。契约 diff 已确认。', '',
].join('\n');

async function makeProject(points = []) {
  const dir = await tempDirs.make('aim-gate-');
  await scaffold({ templatesRoot: TEMPLATES, targetDir: dir, vars: VARS, tools: [], onConflict: () => 'skip' });
  if (points.length) {
    const file = path.join(dir, '.ai', 'knowledge', 'iterations.md');
    const body = await readFile(file, 'utf8');
    const rows = points.map(name => `| v1.0.0 | ${name} | M | in-progress | 无 |`).join('\n');
    await writeFile(file, body.replace('|---|---|---|---|---|', `|---|---|---|---|---|\n${rows}`));
  }
  return dir;
}

async function writeFinal(dir, name, body) {
  const target = path.join(dir, 'docs', 'requirements', 'v1.0.0', 'final');
  await mkdir(target, { recursive: true });
  await writeFile(path.join(target, `${name}.md`), body);
}

async function snapshot(dir) {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  const out = {};
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const full = path.join(entry.parentPath, entry.name);
    out[path.relative(dir, full).split(path.sep).join('/')] =
      createHash('sha256').update(await readFile(full)).digest('hex');
  }
  return out;
}

test('定稿齐全时六项检查全过', () => {
  assert.deepEqual(checkReadiness(READY), []);
});

test('六条就绪标准各自可独立触发失败', () => {
  const fail = (transform) => checkReadiness(transform(READY)).join('\n');

  assert.match(fail(b => b.replace('让用户一次导出多条记录。', '')), /就绪标准 1/);
  assert.match(fail(b => b.replace('- 提交 100 个 id,返回 CSV,行数为 100', '- 行数 TBD')), /就绪标准 2.*TBD/s);
  assert.match(fail(b => b.replace(/## 验收标准[\s\S]*?## 开放问题/, '## 开放问题')), /就绪标准 2/);
  assert.match(fail(b => b.replace('本次不做:定时导出。', '导出相关。')), /就绪标准 3/);
  assert.match(fail(b => b.replace('契约 diff 已确认。', '')), /就绪标准 4/);
  assert.match(fail(b => b.replace('(假设,不影响本点验收)', '?')), /就绪标准 5/);
  assert.match(fail(b => b.replace('风险等级:M。', '')), /就绪标准 6/);
});

test('开放问题写「无」不算未决', () => {
  const body = READY.replace('- 超时阈值取 30s(假设,不影响本点验收)', '无');
  assert.deepEqual(checkReadiness(body), []);
});

test('hook 路径白名单只放行 .ai/ 与 docs/', () => {
  assert.equal(isHookAllowedPath('/repo/.ai/knowledge/overview.md'), true);
  assert.equal(isHookAllowedPath('/repo/docs/requirements/v1/final/a.md'), true);
  assert.equal(isHookAllowedPath('/repo/src/export.js'), false);
  assert.equal(isHookAllowedPath('docs/design/x.md'), true);
  assert.equal(isHookAllowedPath(undefined), false);
});

test('没有进行中的需求点时不检查任何东西', async () => {
  const dir = await makeProject();
  assert.deepEqual(await inProgressPoints(dir), []);
  const { results, blocked } = await gateReady({ targetDir: dir });
  assert.deepEqual(results, []);
  assert.deepEqual(blocked, []);
});

test('只挑 in-progress 的点,其他状态不拦', async () => {
  const dir = await makeProject();
  const file = path.join(dir, '.ai', 'knowledge', 'iterations.md');
  const body = await readFile(file, 'utf8');
  await writeFile(file, body.replace('|---|---|---|---|---|', [
    '|---|---|---|---|---|',
    '| v1.0.0 | 已完成点 | S | done | 无 |',
    '| v1.0.0 | 待定稿点 | M | planned | 无 |',
    '| v1.0.0 | 在做的点 | M | in-progress | 无 |',
  ].join('\n')));
  assert.deepEqual(await inProgressPoints(dir), ['在做的点']);
});

test('多个 in-progress 点逐个检查,任一不合格即阻塞', async () => {
  const dir = await makeProject(['甲', '乙']);
  await writeFinal(dir, '甲', READY);
  await writeFinal(dir, '乙', READY.replace('契约 diff 已确认。', ''));

  const { results, blocked } = await gateReady({ targetDir: dir });
  assert.equal(results.length, 2);
  assert.deepEqual(blocked.map(item => item.point), ['乙']);
});

test('定稿缺失与重名各给明确错误,不静默通过', async () => {
  const missing = await makeProject(['导出']);
  const first = await gateReady({ targetDir: missing });
  assert.match(first.blocked[0].failures[0], /找不到定稿/);

  const duplicated = await makeProject(['导出']);
  await writeFinal(duplicated, '导出', READY);
  const other = path.join(duplicated, 'docs', 'requirements', 'v1.1.0', 'final');
  await mkdir(other, { recursive: true });
  await writeFile(path.join(other, '导出.md'), READY);
  const second = await gateReady({ targetDir: duplicated });
  assert.match(second.blocked[0].failures[0], /多个版本目录下都有/);
});

test('门禁是只读的', async () => {
  const dir = await makeProject(['导出']);
  await writeFinal(dir, '导出', READY.replace('契约 diff 已确认。', ''));
  const before = await snapshot(dir);
  const { blocked } = await gateReady({ targetDir: dir });
  assert.equal(blocked.length, 1);
  assert.deepEqual(await snapshot(dir), before);
});

test('settings.json 用 PreToolUse 自动触发且不因缺命令而卡死', async () => {
  const raw = await readFile(path.join(TEMPLATES, 'claude', '.claude', 'settings.json'), 'utf8');
  const settings = JSON.parse(raw);
  const pre = settings.hooks.PreToolUse;
  assert.ok(Array.isArray(pre) && pre.length === 1);
  for (const tool of ['Edit', 'Write', 'MultiEdit']) {
    assert.ok(pre[0].matcher.includes(tool), `matcher 未覆盖 ${tool}`);
  }
  const command = pre[0].hooks[0].command;
  assert.match(command, /gate ready --hook/);
  assert.match(command, /--no-install/, 'hook 不得在编辑时联网安装依赖');
  assert.ok(settings.hooks.Stop && settings.hooks.PreCompact, '既有提醒 hook 不得丢失');
});

test('跨工具兜底样例存在且默认不安装', async () => {
  const sample = await readFile(path.join(TEMPLATES, 'common', '.ai', 'hooks', 'pre-commit.sample'), 'utf8');
  assert.match(sample, /gate ready/);
  assert.match(sample, /kb check/);
  assert.match(sample, /exit 0/, 'ai-memory 不可用时必须放行');
  assert.ok(sample.includes('.git/hooks/pre-commit'), '需给出安装方式');
});
