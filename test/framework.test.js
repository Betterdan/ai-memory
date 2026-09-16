import { test } from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  applyFrameworkUpdate, detectInstallation, hashContent, ownershipFor, planFrameworkUpdate,
} from '../src/framework.js';
import { migrationsBetween } from '../src/migrations.js';
import { fileURLToPath } from 'node:url';

const TEMPLATES = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'templates');

test('文件所有权区分用户资产、框架文件和混合文件', () => {
  assert.equal(ownershipFor('.ai/config/model-routing.json'), 'user');
  assert.equal(ownershipFor('.ai/memory/session-log.md'), 'user');
  assert.equal(ownershipFor('.ai/knowledge/overview.md'), 'user');
  assert.equal(ownershipFor('.ai/knowledge/entries/api.md'), 'user');
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
  assert.ok(!plan.actions.some(item => item.dest === '.ai/memory/project-state.md'), 'project-state 已移出模板,不应出现在升级计划中');
  const legacyState = await readFile(path.join(dir, '.ai', 'memory', 'project-state.md'), 'utf8');
  assert.ok(legacyState.includes('- 项目:legacy-demo'), 'legacy 用户资产必须原样保留');
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

test('v0.4 无标记混合文件仅在匹配生成基线时自动迁移', async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'aim-v04-managed-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(path.join(dir, '.ai'), { recursive: true });
  const oldAgents = '# demo\n\n## AI 协作框架(ai-memory)\nOLD_V04\n';
  await writeFile(path.join(dir, 'AGENTS.md'), oldAgents);
  const metadata = {
    frameworkVersion: '0.4.0', schemaVersion: 1, generatedAt: '2026-07-16T00:00:00.000Z',
    tools: ['codex'], templateVars: { projectName: 'demo', techStack: 'Node', date: '2026-07-16' },
    files: { 'AGENTS.md': { ownership: 'mixed', sha256: hashContent(oldAgents) } },
  };
  await writeFile(path.join(dir, '.ai', 'ai-memory.json'), JSON.stringify(metadata));

  const safe = await planFrameworkUpdate({ targetDir: dir, templatesRoot: TEMPLATES, frameworkVersion: '0.5.0' });
  assert.ok(safe.actions.some(item => item.dest === 'AGENTS.md' && item.action === 'update'));

  await writeFile(path.join(dir, 'AGENTS.md'), oldAgents + 'USER_EDIT\n');
  const modified = await planFrameworkUpdate({ targetDir: dir, templatesRoot: TEMPLATES, frameworkVersion: '0.5.0' });
  assert.ok(modified.actions.some(item => item.dest === 'AGENTS.md' && item.action === 'merge'));
});

test('已移除的未修改框架文件可安全删除,用户修改后要求确认', async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'aim-safe-remove-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(path.join(dir, '.ai', 'runs'), { recursive: true });
  const obsolete = '*\n!.npmignore\n';
  await writeFile(path.join(dir, '.ai', 'runs', '.npmignore'), obsolete);
  const metadata = {
    frameworkVersion: '0.4.0', schemaVersion: 1, generatedAt: '2026-07-16T00:00:00.000Z',
    tools: [], templateVars: { projectName: 'demo', techStack: 'Node', date: '2026-07-16' },
    files: { '.ai/runs/.npmignore': { ownership: 'framework', sha256: hashContent(obsolete) } },
  };
  await writeFile(path.join(dir, '.ai', 'ai-memory.json'), JSON.stringify(metadata));

  const safe = await planFrameworkUpdate({ targetDir: dir, templatesRoot: TEMPLATES, frameworkVersion: '0.5.0' });
  assert.ok(safe.actions.some(item => item.dest === '.ai/runs/.npmignore' && item.action === 'remove'));

  await writeFile(path.join(dir, '.ai', 'runs', '.npmignore'), obsolete + 'USER_EDIT\n');
  const modified = await planFrameworkUpdate({ targetDir: dir, templatesRoot: TEMPLATES, frameworkVersion: '0.5.0' });
  assert.ok(modified.actions.some(item => item.dest === '.ai/runs/.npmignore' && item.action === 'review-remove'));

  await writeFile(path.join(dir, '.ai', 'runs', '.npmignore'), obsolete);
  const applicable = await planFrameworkUpdate({ targetDir: dir, templatesRoot: TEMPLATES, frameworkVersion: '0.5.0' });
  const result = await applyFrameworkUpdate({ targetDir: dir, templatesRoot: TEMPLATES, plan: applicable });
  assert.deepEqual(result.removed, ['.ai/runs/.npmignore']);
  await assert.rejects(access(path.join(dir, '.ai', 'runs', '.npmignore')));
  await access(path.join(dir, '.ai', 'runs', '.gitignore'));
  const upgraded = JSON.parse(await readFile(path.join(dir, '.ai', 'ai-memory.json'), 'utf8'));
  assert.equal(upgraded.frameworkVersion, '0.5.0');
});

test('元数据中的项目外路径在升级规划阶段即被拒绝', async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'aim-metadata-path-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(path.join(dir, '.ai'), { recursive: true });
  const metadata = {
    frameworkVersion: '0.4.0', schemaVersion: 1, generatedAt: '2026-07-16T00:00:00.000Z',
    tools: [], templateVars: { projectName: 'demo', techStack: 'Node', date: '2026-07-16' },
    files: { '../outside.md': { ownership: 'framework', sha256: '0'.repeat(64) } },
  };
  await writeFile(path.join(dir, '.ai', 'ai-memory.json'), JSON.stringify(metadata));

  await assert.rejects(
    planFrameworkUpdate({ targetDir: dir, templatesRoot: TEMPLATES, frameworkVersion: '0.5.0' }),
    /无效路径段/
  );
});

test('未修改的旧版项目升级时受管区块替换 Superpowers 编排且新增 code-review 适配', async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'aim-r1-review-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(path.join(dir, '.ai'), { recursive: true });

  const userBlock = [
    '<!-- ai-memory:user:start -->',
    '## 项目信息',
    '',
    '- 技术栈:Node',
    '- 启动:npm run dev',
    '<!-- ai-memory:user:end -->',
    '',
  ].join('\n');
  const oldEntry = [
    '# demo',
    '',
    '<!-- ai-memory:managed:start -->',
    '## AI 协作框架(ai-memory)',
    '',
    '进场先读 `.ai/README.md`,严格按其中的核心记忆与任务路由加载协议执行。',
    '',
    '## 与 superpowers 的编排(未安装则忽略本节)',
    '',
    '1. S 级跳过 brainstorming/writing-plans',
    '<!-- ai-memory:managed:end -->',
    '',
    userBlock,
  ].join('\n');
  await writeFile(path.join(dir, 'CLAUDE.md'), oldEntry);
  await mkdir(path.join(dir, '.ai', 'memory', 'features'), { recursive: true });
  await writeFile(path.join(dir, '.ai', 'memory', 'features', 'legacy-feature.md'), 'KEEP_FEATURE_DOSSIER');

  const metadata = {
    frameworkVersion: '0.7.0', schemaVersion: 1, generatedAt: '2026-09-01T00:00:00.000Z',
    tools: ['claude'], templateVars: { projectName: 'demo', techStack: 'Node', date: '2026-09-01' },
    files: {
      'CLAUDE.md': { ownership: 'mixed', sha256: hashContent(oldEntry) },
      '.ai/memory/features/legacy-feature.md': { ownership: 'user', sha256: hashContent('KEEP_FEATURE_DOSSIER') },
    },
  };
  await writeFile(path.join(dir, '.ai', 'ai-memory.json'), JSON.stringify(metadata));

  const plan = await planFrameworkUpdate({ targetDir: dir, templatesRoot: TEMPLATES, frameworkVersion: '0.8.0' });
  const actionOf = dest => plan.actions.find(item => item.dest === dest)?.action;
  assert.equal(actionOf('CLAUDE.md'), 'update-managed');
  assert.equal(actionOf('.claude/skills/code-review/SKILL.md'), 'add');
  assert.equal(actionOf('.ai/skills/code-review.md'), 'add');
  assert.equal(actionOf('.ai/skills/risk-levels.md'), 'add');
  assert.equal(actionOf('.ai/skills/interface-contract.md'), 'add');
  assert.equal(actionOf('docs/architecture/interfaces.md'), 'add');
  assert.equal(actionOf('.ai/knowledge/overview.md'), 'add');
  assert.equal(actionOf('.ai/skills/knowledge-structure.md'), 'add');
  assert.equal(actionOf('.ai/memory/features/legacy-feature.md'), 'preserve');
  assert.deepEqual(
    plan.actions.filter(item => ['merge', 'review', 'review-remove'].includes(item.action)).map(item => item.dest),
    []
  );

  await applyFrameworkUpdate({ targetDir: dir, templatesRoot: TEMPLATES, plan });
  const upgraded = await readFile(path.join(dir, 'CLAUDE.md'), 'utf8');
  assert.ok(upgraded.includes(userBlock), '用户区块必须原样保留');
  assert.ok(!/superpowers/i.test(upgraded));
  assert.ok(upgraded.includes('## 方案比较、实施计划与代码审查'));
  await access(path.join(dir, '.claude', 'skills', 'code-review', 'SKILL.md'));
  assert.equal(await readFile(path.join(dir, '.ai', 'memory', 'features', 'legacy-feature.md'), 'utf8'), 'KEEP_FEATURE_DOSSIER');
});
