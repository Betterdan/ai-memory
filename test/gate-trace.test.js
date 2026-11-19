import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkReadiness } from '../src/gate-ready.js';
import { checkTrace, gateTrace } from '../src/gate-trace.js';
import { scaffold } from '../src/scaffold.js';
import { createTempDirs } from './temp-dirs.js';

const TEMPLATES = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'templates');
const tempDirs = createTempDirs();
afterEach(() => tempDirs.cleanup());

const VARS = {
  projectName: 'demo', techStack: 'Go', date: '2026-11-18', modelProfile: 'inherit', frameworkVersion: '0.12.0',
};

const final = ({ acceptance, record = [] }) => [
  '# 批量导出', '',
  '## 目标', '', '让用户一次导出多条记录。', '',
  '## 范围', '', '本次不做:定时导出。', '',
  '## 外部行为契约', '', '调用方提交 id 列表。', '',
  '## 验收标准', '', ...acceptance, '',
  '## 开放问题', '', '- 无', '',
  '## 实现交接', '', '风险等级:M。契约 diff 已确认。', '',
  ...(record.length ? ['## 验收记录', '', '| AC | 证据 | 结果 |', '|---|---|---|', ...record, ''] : []),
].join('\n');

const AC = ['- AC-01: 提交 100 个 id,返回 CSV,行数为 100', '- AC-02: 提交超过 500 个 id,返回 400 与 TOO_MANY'];

async function makeProject(rows) {
  const dir = await tempDirs.make('aim-trace-');
  await scaffold({ templatesRoot: TEMPLATES, targetDir: dir, vars: VARS, tools: [], onConflict: () => 'skip' });
  const file = path.join(dir, '.ai', 'knowledge', 'iterations.md');
  const body = await readFile(file, 'utf8');
  const lines = rows.map(([name, status]) => `| v1.0.0 | ${name} | M | ${status} | 无 |`).join('\n');
  await writeFile(file, body.replace('|---|---|---|---|---|', `|---|---|---|---|---|\n${lines}`));
  return dir;
}

async function write(dir, rel, body) {
  const full = path.join(dir, ...rel.split('/'));
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, body);
}

test('就绪检查:用了 AC 编号就必须每条都有且不重复', () => {
  assert.deepEqual(checkReadiness(final({ acceptance: AC })), []);
  assert.deepEqual(checkReadiness(final({ acceptance: ['- 提交 100 个 id,返回 CSV', '- 超限返回 400'] })), [],
    '没用编号的老定稿不受影响');

  const partial = checkReadiness(final({ acceptance: ['- AC-01: 提交 100 个 id', '- 超限返回 400'] }));
  assert.ok(partial.some(item => /1 条验收标准缺少 AC 编号/.test(item)), partial.join('\n'));

  const duplicate = checkReadiness(final({ acceptance: ['- AC-01: 提交 100 个 id', '- AC-01: 超限返回 400'] }));
  assert.ok(duplicate.some(item => /AC-01 重复/.test(item)), duplicate.join('\n'));
});

test('追溯检查:每条 AC 都有证据且结果为通过', () => {
  assert.deepEqual(checkTrace(final({ acceptance: AC, record: [
    '| AC-01 | `test/export.test.js` 批量导出 100 条 | 通过 |',
    '| AC-02 | 人工:提交 501 个 id 看到 400 | 通过 |',
  ] }), { fileExists: () => true }), []);

  const missing = checkTrace(final({ acceptance: AC, record: ['| AC-01 | `test/export.test.js` | 通过 |'] }), { fileExists: () => true });
  assert.ok(missing.some(item => /AC-02 没有验收记录/.test(item)), missing.join('\n'));

  const failing = checkTrace(final({ acceptance: AC, record: [
    '| AC-01 | `test/export.test.js` | 未执行 |',
    '| AC-02 |  | 通过 |',
  ] }), { fileExists: () => true });
  assert.ok(failing.some(item => /AC-01 的结果不是「通过」/.test(item)), '未运行的检查不得记为通过');
  assert.ok(failing.some(item => /AC-02 缺少证据/.test(item)));

  const stale = checkTrace(final({ acceptance: AC, record: [
    '| AC-01 | 人工 | 通过 |', '| AC-02 | 人工 | 通过 |', '| AC-03 | 人工 | 通过 |',
  ] }), { fileExists: () => true });
  assert.ok(stale.some(item => /AC-03 不在验收标准里/.test(item)));

  const ghost = checkTrace(final({ acceptance: AC, record: [
    '| AC-01 | `test/missing.test.js` | 通过 |', '| AC-02 | 人工 | 通过 |',
  ] }), { fileExists: rel => rel !== 'test/missing.test.js' });
  assert.ok(ghost.some(item => /AC-01 引用的 test\/missing\.test\.js 不存在/.test(item)));

  assert.deepEqual(checkTrace(final({ acceptance: ['- 没有编号'] }), { fileExists: () => true }), [], '老定稿跳过');
});

test('gate trace 只检查 accepted 与 done 的点,并核对证据文件真实存在', async () => {
  const dir = await makeProject([['doing', 'in-progress'], ['ok', 'accepted'], ['bad', 'done']]);
  await write(dir, 'docs/requirements/v1.0.0/final/doing.md', final({ acceptance: AC }));
  await write(dir, 'docs/requirements/v1.0.0/final/ok.md', final({ acceptance: AC, record: [
    '| AC-01 | `test/export.test.js` | 通过 |', '| AC-02 | 人工 | 通过 |',
  ] }));
  await write(dir, 'docs/requirements/v1.0.0/final/bad.md', final({ acceptance: AC, record: [
    '| AC-01 | `test/nope.test.js` | 通过 |',
  ] }));
  await write(dir, 'test/export.test.js', '// AC-01\n');

  const { results, blocked } = await gateTrace({ targetDir: dir });
  assert.deepEqual(results.map(item => item.point).sort(), ['bad', 'ok'], 'in-progress 的点还没到追溯阶段');
  assert.deepEqual(blocked.map(item => item.point), ['bad']);
  const messages = blocked[0].failures.join('\n');
  assert.match(messages, /nope\.test\.js 不存在/);
  assert.match(messages, /AC-02 没有验收记录/);
});
