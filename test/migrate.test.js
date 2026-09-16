import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { CURRENT_SCHEMA_VERSION, writeFrameworkMetadata } from '../src/framework.js';
import { applyMigration, planMigration } from '../src/migrate.js';
import { scaffold } from '../src/scaffold.js';
import { createTempDirs } from './temp-dirs.js';

const TEMPLATES = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'templates');
const tempDirs = createTempDirs();
afterEach(() => tempDirs.cleanup());

const VARS = {
  projectName: 'demo', techStack: 'Go', date: '2026-09-16', modelProfile: 'inherit', frameworkVersion: '0.7.0',
};

const PROJECT_STATE = [
  '# 项目状态',
  '',
  '## 基本信息',
  '',
  '- 项目:legacy-demo',
  '- 技术栈:Go + Postgres',
  '- 当前迭代:v1.2.0',
  '',
  '## 需求进度',
  '',
  '| 版本 | 需求 | 状态(draft/finalized/designed/in-progress/done) | 备注 |',
  '|---|---|---|---|',
  '| v1.2.0 | 登录改造 | done | 已上线 |',
  '| v1.2.0 | 报表导出 | in-progress | 依赖登录改造 |',
  '',
  '## 已知遗留问题',
  '',
  '- 导出超时未处理',
  '',
  '## 归档的 session 摘要',
  '',
  '2026-07 完成基础框架',
  '',
].join('\n');

async function makeSchema1Project(options) {
  const withFeatures = Boolean(options && options.withFeatures);
  const dir = await tempDirs.make('aim-migrate-');
  await scaffold({ templatesRoot: TEMPLATES, targetDir: dir, vars: VARS, tools: [], onConflict: () => 'skip' });
  await writeFrameworkMetadata({
    targetDir: dir, templatesRoot: TEMPLATES, frameworkVersion: '0.7.0', tools: [],
    projectName: 'demo', techStack: 'Go', date: '2026-09-16', schemaVersion: 1,
  });
  await writeFile(path.join(dir, '.ai', 'memory', 'project-state.md'), PROJECT_STATE);
  if (withFeatures) {
    await mkdir(path.join(dir, '.ai', 'memory', 'features'), { recursive: true });
    await writeFile(path.join(dir, '.ai', 'memory', 'features', 'login.md'), '# login\nexternal contract\n');
  }
  return dir;
}

async function snapshot(dir) {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  const out = {};
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const full = path.join(entry.parentPath, entry.name);
    const key = path.relative(dir, full).split(path.sep).join('/');
    out[key] = createHash('sha256').update(await readFile(full)).digest('hex');
  }
  return out;
}

const read = (dir, rel) => readFile(path.join(dir, ...rel.split('/')), 'utf8');

test('CURRENT_SCHEMA_VERSION 为 2,schema 1 项目有待执行的资产迁移', async () => {
  const dir = await makeSchema1Project();
  assert.equal(CURRENT_SCHEMA_VERSION, 2);
  const plan = await planMigration({ targetDir: dir });
  assert.equal(plan.fromSchema, 1);
  assert.equal(plan.toSchema, 2);
  assert.deepEqual(plan.migrations.map(item => item.id), ['knowledge-layer-v2']);
});

test('dry-run 计算完整变更集且不写任何文件', async () => {
  const dir = await makeSchema1Project();
  const before = await snapshot(dir);
  const plan = await planMigration({ targetDir: dir });
  assert.deepEqual(await snapshot(dir), before, 'planMigration 不得改动任何文件');
  assert.deepEqual(
    plan.migrations[0].changes.map(change => [change.kind, change.dest]),
    [
      ['write', '.ai/knowledge/overview.md'],
      ['write', '.ai/knowledge/iterations.md'],
      ['archive', '.ai/memory/project-state.md'],
    ]
  );
});

test('project-state 内容按归属落位,原文件归档', async () => {
  const dir = await makeSchema1Project();
  const plan = await planMigration({ targetDir: dir });
  const summary = await applyMigration({ targetDir: dir, templatesRoot: TEMPLATES, plan });

  const overview = await read(dir, '.ai/knowledge/overview.md');
  assert.ok(overview.includes('- 项目:legacy-demo'));
  assert.ok(overview.includes('- 技术栈:Go + Postgres'));
  assert.ok(overview.includes('- 当前迭代:v1.2.0'));
  assert.ok(overview.includes('导出超时未处理'), '遗留问题不得丢失');
  assert.ok(overview.includes('待整理(迁移自 project-state.md)'));

  const iterations = await read(dir, '.ai/knowledge/iterations.md');
  assert.ok(iterations.includes('| v1.2.0 | 登录改造 |  | done | 已上线 |'), '4 列旧表应补风险列');
  assert.ok(iterations.includes('| v1.2.0 | 报表导出 |  | in-progress | 依赖登录改造 |'));
  assert.ok(iterations.includes('2026-07 完成基础框架'), '归档摘要不得丢失');

  assert.equal(await read(dir, '.ai/memory/archive/project-state.md'), PROJECT_STATE);
  await assert.rejects(read(dir, '.ai/memory/project-state.md'));

  assert.deepEqual(summary.written, ['.ai/knowledge/overview.md', '.ai/knowledge/iterations.md']);
  assert.equal(summary.archived.length, 1);
  assert.equal(JSON.parse(await read(dir, '.ai/ai-memory.json')).schemaVersion, 2);
});

test('迁移幂等:schema 已是 2 时不再重复执行', async () => {
  const dir = await makeSchema1Project();
  const first = await planMigration({ targetDir: dir });
  await applyMigration({ targetDir: dir, templatesRoot: TEMPLATES, plan: first });
  const after = await snapshot(dir);

  const second = await planMigration({ targetDir: dir });
  assert.deepEqual(second.migrations, [], 'schema 2 不应再有待执行迁移');
  assert.deepEqual(await snapshot(dir), after);
});

test('目标已被用户改造时跳过且不归档', async () => {
  const dir = await makeSchema1Project();
  await writeFile(path.join(dir, '.ai', 'knowledge', 'overview.md'), '# rewritten by user\n');

  const plan = await planMigration({ targetDir: dir });
  const overview = plan.migrations[0].changes.find(change => change.dest === '.ai/knowledge/overview.md');
  assert.equal(overview.kind, 'skip');
  assert.match(overview.reason, /已被用户修改/);
  assert.ok(!plan.migrations[0].changes.some(change => change.kind === 'archive'), '未全部就位时不得归档');

  await applyMigration({ targetDir: dir, templatesRoot: TEMPLATES, plan });
  assert.equal(await read(dir, '.ai/knowledge/overview.md'), '# rewritten by user\n');
  const kept = await read(dir, '.ai/memory/project-state.md');
  assert.ok(kept.includes('legacy-demo'), '原文件必须保留');
});

test('features 档案原地保留并进入待归类清单', async () => {
  const dir = await makeSchema1Project({ withFeatures: true });
  const plan = await planMigration({ targetDir: dir });
  const notices = plan.migrations[0].notices.join('\n');
  assert.match(notices, /1 份 features 档案原地保留/);
  assert.match(notices, /knowledge-structure/);
  assert.ok(notices.includes('.ai/memory/features/login.md'));

  await applyMigration({ targetDir: dir, templatesRoot: TEMPLATES, plan });
  const dossier = await read(dir, '.ai/memory/features/login.md');
  assert.ok(dossier.includes('external contract'), 'features 不得被搬走');
  const overview = await read(dir, '.ai/knowledge/overview.md');
  assert.ok(overview.includes('份 features 档案待归类'), '遗留问题表应提示待归类');
});

test('写入失败时 schemaVersion 不提升,修复后可重跑', async () => {
  const dir = await makeSchema1Project();
  await writeFile(path.join(dir, '.ai', 'memory', 'archive'), 'blocker');

  const plan = await planMigration({ targetDir: dir });
  await assert.rejects(
    applyMigration({ targetDir: dir, templatesRoot: TEMPLATES, plan }),
    /schemaVersion 未提升/
  );
  const stalled = JSON.parse(await read(dir, '.ai/ai-memory.json'));
  assert.equal(stalled.schemaVersion, 1);

  await rm(path.join(dir, '.ai', 'memory', 'archive'));
  const retry = await planMigration({ targetDir: dir });
  assert.deepEqual(
    retry.migrations[0].changes.map(change => change.kind),
    ['noop', 'noop', 'archive'],
    '已写入的目标应判为无需变更,而不是被用户修改'
  );
  await applyMigration({ targetDir: dir, templatesRoot: TEMPLATES, plan: retry });
  const done = JSON.parse(await read(dir, '.ai/ai-memory.json'));
  assert.equal(done.schemaVersion, 2);
});

test('legacy 与未初始化目录给出明确前置提示', async () => {
  const dir = await tempDirs.make('aim-migrate-legacy-');
  await mkdir(path.join(dir, '.ai'), { recursive: true });
  await assert.rejects(planMigration({ targetDir: dir }), /不是 ai-memory 项目/);

  const legacyReadme = '# legacy\n由 @betterdanlins/ai-memory 生成于 2026-07-01。\n';
  await writeFile(path.join(dir, '.ai', 'README.md'), legacyReadme);
  await assert.rejects(planMigration({ targetDir: dir }), /请先运行 ai-memory update/);
});
