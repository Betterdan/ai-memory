import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { detectInstallation, ownershipFor, planFrameworkUpdate } from '../src/framework.js';
import { migrationsBetween } from '../src/migrations.js';
import { fileURLToPath } from 'node:url';

const TEMPLATES = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'templates');

test('文件所有权区分用户资产、框架文件和混合文件', () => {
  assert.equal(ownershipFor('.ai/config/model-routing.json'), 'user');
  assert.equal(ownershipFor('.ai/memory/session-log.md'), 'user');
  assert.equal(ownershipFor('docs/requirements/v1.0.0/final/a.md'), 'user');
  assert.equal(ownershipFor('docs/architecture/data-model.md'), 'user');
  assert.equal(ownershipFor('.ai/skills/critic.md'), 'framework');
  assert.equal(ownershipFor('.agents/skills/critic/SKILL.md'), 'framework');
  assert.equal(ownershipFor('docs/requirements/README.md'), 'framework');
  assert.equal(ownershipFor('AGENTS.md'), 'mixed');
  assert.equal(ownershipFor('.claude/settings.json'), 'mixed');
});

test('Schema migration 注册表提供连续路径并拒绝降级', () => {
  assert.deepEqual(migrationsBetween(0, 1).map(item => item.id), ['bootstrap-schema-v1']);
  assert.deepEqual(migrationsBetween(1, 1), []);
  assert.throws(() => migrationsBetween(2, 1), /项目 Schema 2 高于当前 CLI Schema 1/);
});

test('无元数据的 v0.1 项目被识别为 legacy 并保守规划', async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'aim-legacy-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(path.join(dir, '.ai', 'memory'), { recursive: true });
  await mkdir(path.join(dir, '.ai', 'skills'), { recursive: true });
  await writeFile(path.join(dir, '.ai', 'README.md'), '# legacy\n由 @betterdanlins/ai-memory 生成于 2026-07-01。\n');
  await writeFile(path.join(dir, '.ai', 'memory', 'project-state.md'), '- 项目:legacy-demo\n- 技术栈:Go\n');
  await writeFile(path.join(dir, '.ai', 'skills', 'critic.md'), 'USER_EDITED\n');

  const installation = await detectInstallation(dir);
  assert.equal(installation.kind, 'legacy');
  assert.equal(installation.version, '0.1.0');
  assert.deepEqual(installation.tools, []);

  const plan = await planFrameworkUpdate({ targetDir: dir, templatesRoot: TEMPLATES, frameworkVersion: '0.3.0' });
  assert.ok(plan.actions.some(item => item.dest === '.ai/skills/critic.md' && item.action === 'review'));
  assert.ok(plan.actions.some(item => item.dest === '.ai/memory/project-state.md' && item.action === 'preserve'));
  assert.ok(plan.actions.some(item => item.dest === '.ai/skills/project-inception.md' && item.action === 'add'));
  assert.deepEqual(
    plan.migrations.map(({ id, from, to, automatic }) => ({ id, from, to, automatic })),
    [{ id: 'bootstrap-schema-v1', from: 0, to: 1, automatic: true }]
  );
  assert.equal(await readFile(path.join(dir, '.ai', 'skills', 'critic.md'), 'utf8'), 'USER_EDITED\n');
});

test('项目 Schema 或框架版本高于 CLI 时拒绝降级规划', async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'aim-future-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(path.join(dir, '.ai'), { recursive: true });
  const base = {
    frameworkVersion: '0.3.0', schemaVersion: 2, generatedAt: '2026-07-16T00:00:00.000Z',
    tools: [], templateVars: { projectName: 'future', techStack: 'Go', date: '2026-07-16' }, files: {},
  };
  await writeFile(path.join(dir, '.ai', 'ai-memory.json'), JSON.stringify(base));
  await assert.rejects(
    planFrameworkUpdate({ targetDir: dir, templatesRoot: TEMPLATES, frameworkVersion: '0.3.0' }),
    /项目 Schema 2 高于当前 CLI Schema 1/
  );

  await writeFile(path.join(dir, '.ai', 'ai-memory.json'), JSON.stringify({ ...base, frameworkVersion: '9.0.0', schemaVersion: 1 }));
  await assert.rejects(
    planFrameworkUpdate({ targetDir: dir, templatesRoot: TEMPLATES, frameworkVersion: '0.3.0' }),
    /项目框架版本 9.0.0 高于当前 CLI 0.3.0/
  );
});
