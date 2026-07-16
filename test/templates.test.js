import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { buildManifest } from '../src/manifest.js';
import { scaffold } from '../src/scaffold.js';
import { render } from '../src/render.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'templates');
const VARS = {
  projectName: 'demo', techStack: 'PHP + Vue', date: '2026-07-06', modelProfile: 'inherit', frameworkVersion: '0.6.0',
};

export const EXPECTED_COMMON = [
  '.ai/config/model-routing.json',
  '.ai/memory/MEMORY.md',
  '.ai/memory/features/.gitkeep',
  '.ai/memory/feedback.md',
  '.ai/memory/project-state.md',
  '.ai/memory/session-log.md',
  '.ai/memory/user-profile.md',
  '.ai/README.md',
  '.ai/runs/.gitignore',
  '.ai/skills/architecture.md',
  '.ai/skills/code-review.md',
  '.ai/skills/critic.md',
  '.ai/skills/delivery-readiness.md',
  '.ai/skills/feature-design.md',
  '.ai/skills/memory-update.md',
  '.ai/skills/model-routing.md',
  '.ai/skills/project-inception.md',
  '.ai/skills/requirements-flow.md',
  'docs/architecture/data-model.md',
  'docs/architecture/deployment.md',
  'docs/architecture/quality-attributes.md',
  'docs/architecture/system-context.md',
  'docs/design/README.md',
  'docs/design/v1.0.0/.gitkeep',
  'docs/requirements/README.md',
  'docs/requirements/v1.0.0/draft/.gitkeep',
  'docs/requirements/v1.0.0/final/.gitkeep',
];
export const EXPECTED_CLAUDE = [
  '.claude/agents/critic.md',
  '.claude/agents/economy-test-worker.md',
  '.claude/agents/premium-planner.md',
  '.claude/agents/premium-reviewer.md',
  '.claude/agents/premium-implementer.md',
  '.claude/agents/standard-implementer.md',
  '.claude/agents/standard-test-worker.md',
  '.claude/commands/critic.md',
  '.claude/commands/design-feature.md',
  '.claude/commands/delivery-readiness.md',
  '.claude/commands/finalize-requirement.md',
  '.claude/commands/new-requirement.md',
  '.claude/commands/project-inception.md',
  '.claude/commands/update-memory.md',
  '.claude/settings.json',
  '.claude/skills/critic/SKILL.md',
  '.claude/skills/delivery-readiness/SKILL.md',
  '.claude/skills/feature-design/SKILL.md',
  '.claude/skills/memory-update/SKILL.md',
  '.claude/skills/model-routing/SKILL.md',
  '.claude/skills/project-inception/SKILL.md',
  '.claude/skills/requirements-flow/SKILL.md',
  'CLAUDE.md',
];
export const EXPECTED_CODEX = [
  '.agents/skills/critic/SKILL.md',
  '.agents/skills/delivery-readiness/SKILL.md',
  '.agents/skills/feature-design/SKILL.md',
  '.agents/skills/memory-update/SKILL.md',
  '.agents/skills/model-routing/SKILL.md',
  '.agents/skills/project-inception/SKILL.md',
  '.agents/skills/requirements-flow/SKILL.md',
  '.codex/agents/economy_test_worker.toml',
  '.codex/agents/premium_planner.toml',
  '.codex/agents/premium_reviewer.toml',
  '.codex/agents/premium_implementer.toml',
  '.codex/agents/standard_implementer.toml',
  '.codex/agents/standard_test_worker.toml',
  'AGENTS.md',
];

test('真实模板清单与期望一致', async () => {
  const m = await buildManifest(ROOT, ['claude', 'codex']);
  // 与 buildManifest 相同的码点排序,保持顺序断言
  const expected = [...EXPECTED_COMMON, ...EXPECTED_CLAUDE, ...EXPECTED_CODEX]
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
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

test('新增工程 skills 适配层保持薄包装且架构基线可渲染', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'aim-inception-'));
  await scaffold({ templatesRoot: ROOT, targetDir: dir, vars: VARS, tools: ['claude', 'codex'], onConflict: () => 'skip' });

  const common = await readFile(path.join(dir, '.ai/skills/project-inception.md'), 'utf8');
  assert.ok(common.includes('项目工程基线'));
  for (const skill of ['project-inception', 'feature-design', 'delivery-readiness']) {
    for (const adapter of [
      `.claude/skills/${skill}/SKILL.md`,
      `.agents/skills/${skill}/SKILL.md`,
    ]) {
      const body = await readFile(path.join(dir, ...adapter.split('/')), 'utf8');
      assert.ok(body.includes(`.ai/skills/${skill}.md`));
      assert.ok(body.length < 700, `${adapter} 应保持薄包装`);
    }
  }

  const deployment = await readFile(path.join(dir, 'docs/architecture/deployment.md'), 'utf8');
  assert.ok(deployment.includes('项目：demo'));
  assert.ok(deployment.includes('技术栈：PHP + Vue'));
});

test('requirements-flow 与 feature-design 分离 what/why 和 how', async () => {
  const requirement = await readFile(path.join(ROOT, 'common', '.ai', 'skills', 'requirements-flow.md'), 'utf8');
  const design = await readFile(path.join(ROOT, 'common', '.ai', 'skills', 'feature-design.md'), 'utf8');
  assert.ok(requirement.includes('外部行为契约'));
  assert.ok(requirement.includes('实现交接'));
  assert.ok(requirement.includes('S |'));
  assert.ok(design.includes('技术接口契约'));
  assert.ok(design.includes('Superpowers 路由'));
  assert.ok(design.includes('不重新讨论已确认的 what/why'));
});

test('交付、critic 与记忆更新按风险和工程节点控制成本', async () => {
  const delivery = await readFile(path.join(ROOT, 'common', '.ai', 'skills', 'delivery-readiness.md'), 'utf8');
  const critic = await readFile(path.join(ROOT, 'common', '.ai', 'skills', 'critic.md'), 'utf8');
  const memory = await readFile(path.join(ROOT, 'common', '.ai', 'skills', 'memory-update.md'), 'utf8');
  assert.ok(delivery.includes('ready'));
  assert.ok(delivery.includes('可观测性'));
  assert.ok(critic.includes('S 级低风险需求'));
  assert.ok(critic.includes('M/L 级'));
  assert.ok(memory.includes('可独立验收'));
  assert.ok(memory.includes('不要因为写了一个测试'));
  assert.ok(memory.includes('user-profile.md'));
  assert.ok(memory.includes('feedback.md'));
  assert.ok(memory.includes('不得根据对话风格'));
  assert.ok(memory.includes('仓库可见性'));
  assert.ok(memory.includes('凭据永不写入'));
});

test('全部核心记忆具备进场加载与写入闭环,架构方法论有按需入口', async () => {
  const protocol = await readFile(path.join(ROOT, 'common', '.ai', 'README.md'), 'utf8');
  const index = await readFile(path.join(ROOT, 'common', '.ai', 'memory', 'MEMORY.md'), 'utf8');
  const profile = await readFile(path.join(ROOT, 'common', '.ai', 'memory', 'user-profile.md'), 'utf8');
  const feedback = await readFile(path.join(ROOT, 'common', '.ai', 'memory', 'feedback.md'), 'utf8');
  for (const file of ['user-profile.md', 'feedback.md', 'project-state.md', 'session-log.md']) {
    assert.ok(protocol.includes(file), `进场协议必须加载 ${file}`);
    assert.ok(index.includes(file), `记忆索引必须登记 ${file}`);
  }
  assert.ok(protocol.includes('禁止一次性读取整个'));
  assert.ok(profile.includes('只记录用户明确表达或确认'));
  assert.ok(profile.includes('必须先确认的操作'));
  assert.ok(feedback.includes('可重复执行的规则'));
  assert.ok(feedback.includes('以用户最新明确反馈为准'));

  const inception = await readFile(path.join(ROOT, 'common', '.ai', 'skills', 'project-inception.md'), 'utf8');
  const design = await readFile(path.join(ROOT, 'common', '.ai', 'skills', 'feature-design.md'), 'utf8');
  assert.ok(inception.includes('.ai/skills/architecture.md'));
  assert.ok(design.includes('.ai/skills/architecture.md'));
});

test('模型路由 common 单一源、双工具原生代理和默认继承保持一致', async () => {
  const common = await readFile(path.join(ROOT, 'common', '.ai', 'skills', 'model-routing.md'), 'utf8');
  const configTemplate = await readFile(path.join(ROOT, 'common', '.ai', 'config', 'model-routing.json'), 'utf8');
  const config = JSON.parse(render(configTemplate, { modelProfile: 'inherit' }));
  assert.equal(config.profile, 'inherit');
  assert.ok(common.includes('风险流程'));
  assert.ok(common.includes('不得用对话摘要替代正式文档'));
  assert.ok(!common.includes('model: opus'));

  for (const adapter of [
    'claude/.claude/skills/model-routing/SKILL.md',
    'codex/.agents/skills/model-routing/SKILL.md',
  ]) {
    const body = await readFile(path.join(ROOT, ...adapter.split('/')), 'utf8');
    assert.ok(body.includes('.ai/skills/model-routing.md'));
    assert.ok(body.length < 1000);
    const frontmatter = body.split('---')[1].trim().split('\n').map(line => line.split(':', 1)[0]);
    assert.deepEqual(frontmatter, ['name', 'description']);
  }

  const claudeRouting = await readFile(path.join(ROOT, 'claude', '.claude', 'skills', 'model-routing', 'SKILL.md'), 'utf8');
  const codexRouting = await readFile(path.join(ROOT, 'codex', '.agents', 'skills', 'model-routing', 'SKILL.md'), 'utf8');
  assert.ok(claudeRouting.includes('premium-planner'));
  assert.ok(claudeRouting.includes('economy-test-worker'));
  assert.ok(codexRouting.includes('premium_planner'));
  assert.ok(codexRouting.includes('economy_test_worker'));

  const claudePlanner = await readFile(path.join(ROOT, 'claude', '.claude', 'agents', 'premium-planner.md'), 'utf8');
  const claudeTests = await readFile(path.join(ROOT, 'claude', '.claude', 'agents', 'economy-test-worker.md'), 'utf8');
  const codexPlanner = await readFile(path.join(ROOT, 'codex', '.codex', 'agents', 'premium_planner.toml'), 'utf8');
  const codexTests = await readFile(path.join(ROOT, 'codex', '.codex', 'agents', 'economy_test_worker.toml'), 'utf8');
  assert.ok(claudePlanner.includes('model: opus'));
  assert.ok(claudeTests.includes('model: haiku'));
  assert.ok(codexPlanner.includes('model_reasoning_effort = "high"'));
  assert.ok(codexTests.includes('model_reasoning_effort = "low"'));
  await readFile(path.join(ROOT, 'claude', '.claude', 'agents', 'premium-implementer.md'), 'utf8');
  await readFile(path.join(ROOT, 'claude', '.claude', 'agents', 'standard-test-worker.md'), 'utf8');
  await readFile(path.join(ROOT, 'codex', '.codex', 'agents', 'premium_implementer.toml'), 'utf8');
  await readFile(path.join(ROOT, 'codex', '.codex', 'agents', 'standard_test_worker.toml'), 'utf8');
});

test('AGENTS.md 与 CLAUDE.md 使用唯一受管区块并保留用户区块', async () => {
  for (const entry of ['codex/AGENTS.md', 'claude/CLAUDE.md']) {
    const body = await readFile(path.join(ROOT, ...entry.split('/')), 'utf8');
    assert.equal(body.match(/<!-- ai-memory:managed:start -->/g)?.length, 1);
    assert.equal(body.match(/<!-- ai-memory:managed:end -->/g)?.length, 1);
    assert.equal(body.match(/<!-- ai-memory:user:start -->/g)?.length, 1);
    assert.equal(body.match(/<!-- ai-memory:user:end -->/g)?.length, 1);
    assert.ok(body.includes('进场先读 `.ai/README.md`'));
  }
});
