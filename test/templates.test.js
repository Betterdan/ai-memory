import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { buildManifest } from '../src/manifest.js';
import { scaffold } from '../src/scaffold.js';
import { render } from '../src/render.js';
import { createTempDirs } from './temp-dirs.js';

const SELF_CHECK_S = /S 级.*精简自检/;
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'templates');
const tempDirs = createTempDirs();
afterEach(() => tempDirs.cleanup());
const VARS = {
  projectName: 'demo', techStack: 'PHP + Vue', date: '2026-07-06', modelProfile: 'inherit', frameworkVersion: '0.9.0',
};

export const EXPECTED_COMMON = [
  '.ai/config/model-routing.json',
  '.ai/hooks/pre-commit.sample',
  '.ai/knowledge/README.md',
  '.ai/knowledge/conventions.md',
  '.ai/knowledge/decisions/README.md',
  '.ai/knowledge/domains/README.md',
  '.ai/knowledge/entries/README.md',
  '.ai/knowledge/iterations.md',
  '.ai/knowledge/overview.md',
  '.ai/memory/MEMORY.md',
  '.ai/memory/feedback.md',
  '.ai/memory/session-log.md',
  '.ai/memory/user-profile.md',
  '.ai/README.md',
  '.ai/runs/.gitignore',
  '.ai/skills/architecture.md',
  '.ai/skills/code-review.md',
  '.ai/skills/critic.md',
  '.ai/skills/delivery-readiness.md',
  '.ai/skills/feature-design.md',
  '.ai/skills/interface-contract.md',
  '.ai/skills/knowledge-structure.md',
  '.ai/skills/memory-update.md',
  '.ai/skills/model-routing.md',
  '.ai/skills/project-inception.md',
  '.ai/skills/requirements-flow.md',
  '.ai/skills/risk-levels.md',
  'docs/architecture/data-model.md',
  'docs/architecture/deployment.md',
  'docs/architecture/interfaces.md',
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
  '.claude/skills/code-review/SKILL.md',
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
  '.agents/skills/code-review/SKILL.md',
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
  const dir = await tempDirs.make('aim-real-');
  const r = await scaffold({ templatesRoot: ROOT, targetDir: dir, vars: VARS, tools: ['claude', 'codex'], onConflict: () => 'skip' });
  assert.equal(r.skipped.length, 0);
  for (const dest of r.written) {
    const body = await readFile(path.join(dir, ...dest.split('/')), 'utf8');
    assert.ok(!body.includes('{{'), `${dest} 有未渲染变量`);
  }
  const overview = await readFile(path.join(dir, '.ai/knowledge/overview.md'), 'utf8');
  assert.ok(overview.includes('- 项目:demo'));
  assert.ok(overview.includes('- 技术栈:PHP + Vue'));
});

test('新增工程 skills 适配层保持薄包装且架构基线可渲染', async () => {
  const dir = await tempDirs.make('aim-inception-');
  await scaffold({ templatesRoot: ROOT, targetDir: dir, vars: VARS, tools: ['claude', 'codex'], onConflict: () => 'skip' });

  const common = await readFile(path.join(dir, '.ai/skills/project-inception.md'), 'utf8');
  assert.ok(common.includes('项目工程基线'));
  for (const skill of ['project-inception', 'feature-design', 'delivery-readiness', 'code-review']) {
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
  assert.ok(design.includes('## 方案比较'));
  assert.ok(design.includes('## 实施计划'));
  assert.ok(design.includes('不重新讨论已确认的 what/why'));
});

test('交付、critic 与记忆更新按风险和工程节点控制成本', async () => {
  const delivery = await readFile(path.join(ROOT, 'common', '.ai', 'skills', 'delivery-readiness.md'), 'utf8');
  const critic = await readFile(path.join(ROOT, 'common', '.ai', 'skills', 'critic.md'), 'utf8');
  const memory = await readFile(path.join(ROOT, 'common', '.ai', 'skills', 'memory-update.md'), 'utf8');
  assert.ok(delivery.includes('ready'));
  assert.ok(delivery.includes('可观测性'));
  assert.ok(critic.includes('本方法只作用于 M/L 级'));
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
  for (const file of ['user-profile.md', 'feedback.md', 'session-log.md', 'overview.md', 'iterations.md']) {
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
    assert.ok(!/superpowers/i.test(body), `${entry} 仍引用 Superpowers`);
    assert.ok(body.includes('code-review skill'), `${entry} 必须路由到 code-review skill`);
  }
});

test('代码审查是正式 skill,适配层薄包装并在任务路由中登记', async () => {
  const review = await readFile(path.join(ROOT, 'common', '.ai', 'skills', 'code-review.md'), 'utf8');
  assert.ok(!review.includes('不注册为 skill'), 'code-review 必须是正式 skill');
  assert.ok(review.includes('## 触发时机'));
  assert.ok(review.includes('P0'));
  assert.ok(review.includes('契约一致'));

  const protocol = await readFile(path.join(ROOT, 'common', '.ai', 'README.md'), 'utf8');
  assert.ok(/\| Review \|.*code-review\.md/.test(protocol), '任务路由表必须指向 code-review skill');

  for (const adapter of [
    'claude/.claude/skills/code-review/SKILL.md',
    'codex/.agents/skills/code-review/SKILL.md',
  ]) {
    const body = await readFile(path.join(ROOT, ...adapter.split('/')), 'utf8');
    const frontmatter = body.split('---')[1].trim().split('\n').map(line => line.split(':', 1)[0]);
    assert.deepEqual(frontmatter, ['name', 'description']);
  }
});

test('流程不再依赖 Superpowers,阶段标识仅在模型路由相关文件中保留', async () => {
  const repoRoot = path.join(ROOT, '..');
  const STAGE_ID_ALLOWED = new Set([
    'src/model-routing.js',
    'templates/common/.ai/skills/model-routing.md',
    'templates/common/.ai/skills/feature-design.md',
  ]);
  // 只扫描进入用户项目的流程面。两份 README 的版本历史必须能写出「移除了 Superpowers」,
  // 与 R5b 保留 v0.6.0 历史升级说明同理:文档记录历史,不构成流程依赖。
  const scanned = [
    ...(await collectFiles(path.join(repoRoot, 'templates'))),
    ...(await collectFiles(path.join(repoRoot, 'src'))),
  ];
  assert.ok(scanned.length > 40, '扫描范围异常');

  for (const file of scanned) {
    const rel = path.relative(repoRoot, file).split(path.sep).join('/');
    const body = await readFile(file, 'utf8');
    assert.ok(!/superpower|brainstorming|writing-plans/i.test(body), `${rel} 仍引用 Superpowers`);
    if (/brainstorm|write-plan/.test(body)) {
      assert.ok(STAGE_ID_ALLOWED.has(rel), `${rel} 不应出现模型路由阶段标识`);
    }
  }
});

async function collectFiles(dir) {
  const { readdir } = await import('node:fs/promises');
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await collectFiles(full)));
    else out.push(full);
  }
  return out;
}

test('S/M/L 等级行为集中在 risk-levels,S 级为轻量独立路径', async () => {
  const skills = path.join(ROOT, 'common', '.ai', 'skills');
  const levels = await readFile(path.join(skills, 'risk-levels.md'), 'utf8');

  for (const section of ['## S 级', '## M 级', '## L 级']) {
    assert.ok(levels.includes(section), `risk-levels 缺少 ${section}`);
  }
  assert.equal(levels.split('**退出条件**').length - 1, 3, '每个等级都必须有退出条件');
  assert.equal(levels.split('**不做**').length - 1, 3, '每个等级都必须写明不做什么');

  for (const rule of [
    '不做 critic 自检',
    '不创建 handoff',
    '不生成交付就绪报告',
    '相关测试全部通过',
    '最多修复 2 次',
    '只有项目状态真实变化时才更新知识',
  ]) {
    assert.ok(levels.includes(rule), `S 级轻量路径缺少约束: ${rule}`);
  }

  const critic = await readFile(path.join(skills, 'critic.md'), 'utf8');
  assert.ok(!critic.includes('S 级低风险需求'), 'critic 不应再要求 S 级自检');
  assert.ok(critic.includes('本方法只作用于 M/L 级'));
  assert.ok(critic.includes('- M/L 级:主 agent 必须逐条回应'), '严格措辞必须限定作用域');

  const delivery = await readFile(path.join(skills, 'delivery-readiness.md'), 'utf8');
  assert.ok(delivery.includes('不生成交付就绪报告'));
  const requirements = await readFile(path.join(skills, 'requirements-flow.md'), 'utf8');
  assert.ok(requirements.includes('S 级不做自检'));
  assert.ok(requirements.includes('S 级不创建 handoff'));
  const routing = await readFile(path.join(skills, 'model-routing.md'), 'utf8');
  assert.ok(routing.includes('S 级按 `.ai/skills/risk-levels.md` 不创建 handoff'));

  for (const file of [
    'critic.md', 'delivery-readiness.md', 'feature-design.md',
    'requirements-flow.md', 'memory-update.md', 'model-routing.md',
  ]) {
    const body = await readFile(path.join(skills, file), 'utf8');
    assert.ok(body.includes('risk-levels.md'), `${file} 必须引用 risk-levels.md`);
  }
});

test('入口受管区块与任务路由登记风险等级单一事实源', async () => {
  const protocol = await readFile(path.join(ROOT, 'common', '.ai', 'README.md'), 'utf8');
  assert.ok(/\| 判断风险等级.*risk-levels\.md/.test(protocol), '任务路由表必须登记 risk-levels');
  assert.ok(protocol.includes('方法论层:risk-levels'));

  for (const entry of ['claude/CLAUDE.md', 'codex/AGENTS.md']) {
    const body = await readFile(path.join(ROOT, ...entry.split('/')), 'utf8');
    assert.ok(!body.includes('S 级精简自检'), `${entry} 仍要求 S 级自检`);
    assert.ok(body.includes('risk-levels.md'), '入口须路由到等级事实源');
    assert.ok(body.includes('model-routing skill'), '入口须路由到模型路由 skill');
  }

  for (const file of await collectFiles(ROOT)) {
    const rel = path.relative(ROOT, file).split(path.sep).join('/');
    const text = await readFile(file, 'utf8');
    assert.ok(!SELF_CHECK_S.test(text), `${rel} 仍要求 S 级自检`);
  }
});

test('需求流程以需求点为推进单位,含拆分判断与就绪标准', async () => {
  const flow = await readFile(path.join(ROOT, 'common', '.ai', 'skills', 'requirements-flow.md'), 'utf8');

  assert.ok(flow.includes('推进单位是需求点'));
  assert.ok(flow.includes('**需求集合**：`draft/<集合名>.md`'));
  assert.ok(flow.includes('**需求点**：`final/<集合名>-<点名>.md`'));

  assert.ok(flow.includes('## 拆分判断'));
  for (const signal of [
    '包含多个独立可观察的行为变化',
    '验收标准之间没有依赖',
    '各部分风险等级明显不同',
    '后面部分依赖前面的实现结果',
    '预计 diff 过大',
  ]) {
    assert.ok(flow.includes(signal), `缺少拆分信号: ${signal}`);
  }
  assert.ok(flow.includes('不拆的情况'));
  assert.ok(flow.includes('一句话目标、风险等级、依赖关系与建议顺序'));

  assert.ok(flow.includes('## 需求点就绪标准'));
  for (const item of ['目标单一', '验收标准可验证', '范围明确', '接口契约已确认', '无阻塞开放问题', '可独立提交']) {
    assert.ok(flow.includes(`**${item}**`), `缺少就绪标准: ${item}`);
  }
  assert.ok(flow.includes('六条全部满足即进入实现，不再额外审查'));

  assert.ok(flow.includes('一次只完整定稿一个需求点'));
  assert.ok(flow.includes('`planned` 登记'));
  assert.ok(flow.includes('两者不叠加'), '必须写明就绪标准与 critic 不叠加');
});

test('需求目录、进度表与适配层按需求点表述', async () => {
  const readme = await readFile(path.join(ROOT, 'common', 'docs', 'requirements', 'README.md'), 'utf8');
  assert.ok(readme.includes('`final/<集合名>-<点名>.md`'));
  assert.ok(readme.includes('需求集合'));

  const iterations = await readFile(path.join(ROOT, 'common', '.ai', 'knowledge', 'iterations.md'), 'utf8');
  assert.ok(iterations.includes('| 版本 | 需求点 | 风险 | 状态 | 依赖与顺序 |'));
  assert.ok(iterations.includes('planned(已拆分待定稿)'));

  const finalize = await readFile(path.join(ROOT, 'claude', '.claude', 'commands', 'finalize-requirement.md'), 'utf8');
  assert.ok(finalize.includes('.ai/skills/requirements-flow.md'), '命令只留指向,规则在方法论里');
  assert.ok(finalize.includes('需求集合或需求点'), '触发语义须保留');

  const codexFlow = await readFile(path.join(ROOT, 'codex', '.agents', 'skills', 'requirements-flow', 'SKILL.md'), 'utf8');
  assert.ok(codexFlow.includes('.ai/skills/requirements-flow.md'));
  assert.ok(codexFlow.includes('Codex 侧无独立上下文'), '工具能力映射保留在适配层');

  // 只扫方法论与文档层:适配层已去规则化,只会出现 draft/final 路径本身
  for (const file of await collectFiles(path.join(ROOT, 'common'))) {
    const rel = path.relative(ROOT, file).split(path.sep).join('/');
    const body = await readFile(file, 'utf8');
    if (body.includes('draft') && body.includes('final')) {
      assert.ok(body.includes('需求点'), `${rel} 描述了 draft→final 却未按需求点表述`);
    }
  }
});

test('对外入口与契约约定写入基线,且不预设项目类型', async () => {
  const interfaces = await readFile(path.join(ROOT, 'common', 'docs', 'architecture', 'interfaces.md'), 'utf8');

  assert.ok(interfaces.includes('## 对外入口形态'));
  assert.ok(interfaces.includes('## 契约与验证约定'));
  for (const form of ['页面 / 视图', 'API 分组', '消息 / 事件', '定时任务', 'CLI 命令', 'SDK / 库公开接口']) {
    assert.ok(interfaces.includes(form), `缺少入口形态: ${form}`);
  }
  assert.ok(interfaces.includes('一个项目可多种并存'));
  assert.ok(interfaces.includes('未使用的写「不适用」'), '模板必须允许不适用而不是强行套用');

  for (const item of ['契约格式', '契约位置', '产生方向', '校验命令', '调用方如何获取类型或客户端']) {
    assert.ok(interfaces.includes(item), `缺少契约约定要素: ${item}`);
  }
  assert.ok(interfaces.includes('重新盘点触发条件'));
});

test('对外接口契约是跨等级硬门槛', async () => {
  const skills = path.join(ROOT, 'common', '.ai', 'skills');
  const gate = await readFile(path.join(skills, 'interface-contract.md'), 'utf8');

  assert.ok(gate.includes('不论风险等级'));
  assert.ok(gate.includes('判定边界是**系统边界**'));
  assert.ok(gate.includes('## 触发门槛') || gate.includes('**触发门槛**'));
  assert.ok(gate.includes('**不触发**'));
  assert.ok(gate.includes('模块间接口'), '必须排除模块间接口');
  assert.ok(gate.includes('版本控制中的文件 diff'));
  assert.ok(gate.includes('用户已确认该 diff'));
  assert.ok(gate.includes('docs/architecture/interfaces.md'));

  const levels = await readFile(path.join(skills, 'risk-levels.md'), 'utf8');
  assert.ok(levels.includes('## 跨等级硬门槛'));
  assert.ok(levels.includes('interface-contract.md'));
  assert.ok(levels.includes('S 级不豁免上方的跨等级硬门槛'), 'S 级必须显式说明不豁免');

  for (const file of ['requirements-flow.md', 'feature-design.md', 'code-review.md', 'delivery-readiness.md']) {
    const body = await readFile(path.join(skills, file), 'utf8');
    assert.ok(body.includes('interface-contract.md'), `${file} 必须接入契约门槛`);
  }

  const inception = await readFile(path.join(skills, 'project-inception.md'), 'utf8');
  assert.ok(inception.includes('五份模板'));
  assert.ok(inception.includes('`interfaces.md`'));
  assert.ok(inception.includes('只有技术栈或契约方式变化时才重新盘点'));

  const protocol = await readFile(path.join(ROOT, 'common', '.ai', 'README.md'), 'utf8');
  assert.ok(/\| 改动对外接口 \|.*interface-contract\.md/.test(protocol));

  for (const entry of ['claude/CLAUDE.md', 'codex/AGENTS.md']) {
    const body = await readFile(path.join(ROOT, ...entry.split('/')), 'utf8');
    assert.ok(body.includes('interface-contract.md'), '入口须路由到契约门槛');
  }

  for (const file of await collectFiles(ROOT)) {
    const rel = path.relative(ROOT, file).split(path.sep).join('/');
    const body = await readFile(file, 'utf8');
    assert.ok(!body.includes('四份'), `${rel} 仍写着四份基线`);
  }
});

test('当前知识层建立入口/领域结构与归属规则', async () => {
  const k = path.join(ROOT, 'common', '.ai', 'knowledge');
  const rules = await readFile(path.join(ROOT, 'common', '.ai', 'skills', 'knowledge-structure.md'), 'utf8');

  for (const row of [
    '只在某个入口体现的行为',
    '多个入口共用的业务规则',
    '无对外入口的后端行为',
    '实体、数据归属、状态流转',
    '接口形状',
  ]) {
    assert.ok(rules.includes(row), `归属表缺少: ${row}`);
  }
  assert.ok(rules.includes('每条知识只有一个归属'));
  assert.ok(rules.includes('只放链接,不复制内容'));

  assert.ok(rules.includes('## 提升规则'));
  assert.ok(rules.includes('第二个入口也用到同一规则时'));
  assert.ok(rules.includes('改为链接'));

  assert.ok(rules.includes('契约描述形状,入口页描述语义'));
  for (const semantic of ['业务规则', '错误含义', '副作用', '幂等性', '调用顺序']) {
    assert.ok(rules.includes(semantic), `语义定义缺少: ${semantic}`);
  }

  const entries = await readFile(path.join(k, 'entries', 'README.md'), 'utf8');
  assert.ok(entries.includes('每个入口分组一页'));
  assert.ok(entries.includes('不要一个接口一页'), '入口页粒度必须是分组');
  assert.ok(entries.includes('docs/architecture/interfaces.md'));

  const domains = await readFile(path.join(k, 'domains', 'README.md'), 'utf8');
  assert.ok(domains.includes('提升规则'));
  assert.ok(domains.includes('ai-memory kb build'), '横向视图必须指名生成命令');
  assert.ok(domains.includes('请勿手工编辑'), '横向视图不得由 AI 手工总结');
  assert.ok(domains.includes('ai-memory:generated:related-entries'), '页模板必须带生成区标记');

  const decisions = await readFile(path.join(k, 'decisions', 'README.md'), 'utf8');
  assert.ok(decisions.includes('已取代'));
});

test('记忆层收敛为过程记录,当前状态一律进 knowledge', async () => {
  const index = await readFile(path.join(ROOT, 'common', '.ai', 'memory', 'MEMORY.md'), 'utf8');
  for (const kind of ['当前知识', '过程记录', '用户级记忆']) {
    assert.ok(index.includes(kind), `记忆索引缺少分类: ${kind}`);
  }
  assert.ok(index.includes('knowledge-structure.md'));
  assert.ok(index.includes('禁止一次性加载整个目录'));

  const log = await readFile(path.join(ROOT, 'common', '.ai', 'memory', 'session-log.md'), 'utf8');
  assert.ok(log.includes('只记过程'));
  assert.ok(log.includes('不在本文件重复'));
  assert.ok(log.includes('iterations.md'), '归档去向必须指向迭代记录');

  const protocol = await readFile(path.join(ROOT, 'common', '.ai', 'README.md'), 'utf8');
  assert.ok(protocol.includes('knowledge/overview.md'));
  assert.ok(protocol.includes('knowledge/iterations.md'));
  assert.ok(/\| 写入知识 \|.*knowledge-structure\.md/.test(protocol));

  for (const entry of ['claude/CLAUDE.md', 'codex/AGENTS.md']) {
    const body = await readFile(path.join(ROOT, ...entry.split('/')), 'utf8');
    assert.ok(body.includes('knowledge-structure.md'));
  }

  for (const file of await collectFiles(ROOT)) {
    const rel = path.relative(ROOT, file).split(path.sep).join('/');
    const body = await readFile(file, 'utf8');
    assert.ok(!body.includes('project-state'), `${rel} 仍引用已删除的 project-state`);
  }
});

test('需求点落地后有知识合并协议,features 已退役', async () => {
  const skills = path.join(ROOT, 'common', '.ai', 'skills');
  const update = await readFile(path.join(skills, 'memory-update.md'), 'utf8');

  assert.ok(update.includes('## 需求点落地后的知识合并'));
  assert.ok(update.includes('risk-levels.md'), '触发时机必须绑定等级退出条件');
  assert.ok(update.includes('knowledge-structure.md'), '必须先判断归属');

  assert.ok(update.includes('合并改写'));
  assert.ok(update.includes('不写「本次新增」'));
  assert.ok(update.includes('不并列保留两个版本'));
  assert.ok(update.includes('标记为**已取代**并保留,不删除'));
  assert.ok(update.includes('标记为 `done`'));
  assert.ok(update.includes('压缩为一行结论'));
  assert.ok(update.includes('ai-memory kb build'), '第 6 步必须指名生成命令');
  assert.ok(update.includes('生成区块内的内容一律不手工编辑'));
  assert.ok(update.includes('diff 形式交用户确认'));

  assert.ok(!update.includes('features/'), '写入路由不应再指向 features');
  assert.ok(update.includes('.ai/knowledge/decisions/'));

  for (const file of await collectFiles(ROOT)) {
    const rel = path.relative(ROOT, file).split(path.sep).join('/');
    const body = await readFile(file, 'utf8');
    for (const stale of ['features/', 'feature 记忆', '功能档案']) {
      assert.ok(!body.includes(stale), `${rel} 仍引用已退役的 ${stale}`);
    }
  }
});

test('frontmatter 规范与生成区标记写入方法论,两套标记物理隔离', async () => {
  const rules = await readFile(path.join(ROOT, 'common', '.ai', 'skills', 'knowledge-structure.md'), 'utf8');
  assert.ok(rules.includes('## frontmatter 规范'));
  for (const field of ['`group`', '`form`', '`summary`', '`contract`', '`domains`', '`status`', '`date`']) {
    assert.ok(rules.includes(field), `frontmatter 规范缺少字段: ${field}`);
  }
  assert.ok(rules.includes('## 生成区块'));
  assert.ok(rules.includes('不要手工编辑'));
  assert.ok(rules.includes('保守失败'));

  const overview = await readFile(path.join(ROOT, 'common', '.ai', 'knowledge', 'overview.md'), 'utf8');
  assert.ok(overview.includes('ai-memory:generated:entries-index:start'));
  assert.ok(overview.includes('ai-memory:generated:domains-index:start'));

  for (const file of await collectFiles(ROOT)) {
    const rel = path.relative(ROOT, file).split(path.sep).join('/');
    const body = await readFile(file, 'utf8');
    if (!body.includes('ai-memory:generated')) continue;
    assert.ok(!body.includes('ai-memory:managed'), `${rel} 不得混用两套区块标记`);
    // knowledge-structure.md 是规范文档,必须写出标记格式本身
    const allowed = rel.startsWith('common/.ai/knowledge/') || rel === 'common/.ai/skills/knowledge-structure.md';
    assert.ok(allowed, `生成区标记只应出现在知识层或其规范文档: ${rel}`);
  }
});

// 适配层只留触发条件与工具原生映射;流程规则一律在 .ai/。
// 这两条守卫替代了此前每改一次 .ai/skills/ 就要人工 grep 适配层的做法。
const ADAPTER_FORBIDDEN = ['S 级', 'M 级', 'L 级', 'M/L', '就绪标准', '拆分判断', '逐条', '门槛', '不允许', '不得'];
const ADAPTER_BODY_LIMIT = 200;
// model-routing 的正文是 agent 名映射,属工具原生映射,不是流程规则
const ADAPTER_LIMIT_EXCEPTIONS = new Map([
  ['claude/.claude/skills/model-routing/SKILL.md', 400],
  ['codex/.agents/skills/model-routing/SKILL.md', 400],
]);

function adapterBody(rel, raw) {
  if (rel.endsWith('.toml')) {
    const open = 'developer_instructions = """';
    const start = raw.indexOf(open);
    if (start < 0) return '';
    return raw.slice(start + open.length, raw.indexOf('"""', start + open.length)).trim();
  }
  const parts = raw.split(/^---$/m);
  return (parts.length >= 3 ? parts.slice(2).join('---') : raw).trim();
}

test('适配层只留触发条件与工具原生映射', async () => {
  const files = [
    ...(await collectFiles(path.join(ROOT, 'claude'))),
    ...(await collectFiles(path.join(ROOT, 'codex'))),
  ];
  let checked = 0;
  for (const file of files) {
    const rel = path.relative(ROOT, file).split(path.sep).join('/');
    if (rel.endsWith('CLAUDE.md') || rel.endsWith('AGENTS.md')) continue;
    if (!rel.endsWith('.md') && !rel.endsWith('.toml')) continue;
    const body = adapterBody(rel, await readFile(file, 'utf8'));
    const limit = ADAPTER_LIMIT_EXCEPTIONS.get(rel) ?? ADAPTER_BODY_LIMIT;
    assert.ok(body.length <= limit, `${rel} 正文 ${body.length} 字符,超过上限 ${limit}`);
    for (const word of ADAPTER_FORBIDDEN) {
      assert.ok(!body.includes(word), `${rel} 正文含流程规则措辞「${word}」,应推回 .ai/`);
    }
    assert.ok(body.includes('.ai/'), `${rel} 正文须指向 .ai/ 下的方法论`);
    checked += 1;
  }
  assert.ok(checked >= 30, `扫描范围异常,只检查了 ${checked} 个适配层文件`);
});

test('入口受管区块只做路由,不复述流程', async () => {
  for (const entry of ['claude/CLAUDE.md', 'codex/AGENTS.md']) {
    const raw = await readFile(path.join(ROOT, ...entry.split('/')), 'utf8');
    const block = raw.slice(
      raw.indexOf('<!-- ai-memory:managed:start -->'),
      raw.indexOf('<!-- ai-memory:managed:end -->')
    );
    for (const word of ADAPTER_FORBIDDEN) {
      assert.ok(!block.includes(word), `${entry} 受管区块含流程规则措辞「${word}」`);
    }
    for (const skill of [
      'project-inception', 'requirements-flow', 'feature-design', 'code-review',
      'delivery-readiness', 'memory-update', 'critic', 'model-routing',
    ]) {
      assert.ok(block.includes(skill), `${entry} 受管区块丢失 ${skill} 的路由`);
    }
    for (const source of ['risk-levels.md', 'interface-contract.md', 'knowledge-structure.md']) {
      assert.ok(block.includes(source), `${entry} 受管区块丢失 ${source} 的路由`);
    }
    assert.ok(block.includes('.ai/README.md'), '进场协议入口不得丢失');
  }
});
