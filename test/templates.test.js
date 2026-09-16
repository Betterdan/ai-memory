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
  projectName: 'demo', techStack: 'PHP + Vue', date: '2026-07-06', modelProfile: 'inherit', frameworkVersion: '0.7.0',
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
  '.ai/skills/interface-contract.md',
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
  const state = await readFile(path.join(dir, '.ai/memory/project-state.md'), 'utf8');
  assert.ok(state.includes('- 项目:demo'));
  assert.ok(state.includes('- 技术栈:PHP + Vue'));
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
  const scanned = [
    ...(await collectFiles(path.join(repoRoot, 'templates'))),
    ...(await collectFiles(path.join(repoRoot, 'src'))),
    path.join(repoRoot, 'README.md'),
    path.join(repoRoot, 'README.zh-CN.md'),
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
    assert.ok(body.includes('S 级不做自检,直接实现并测试'));
    assert.ok(body.includes('risk-levels.md'));
    assert.ok(body.includes('M/L 级按 model-routing skill 创建/验证 handoff'));
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

  const state = await readFile(path.join(ROOT, 'common', '.ai', 'memory', 'project-state.md'), 'utf8');
  assert.ok(state.includes('| 版本 | 需求点 | 风险 | 状态 | 备注(依赖与顺序) |'));
  assert.ok(state.includes('planned(已拆分待定稿)'));

  const finalize = await readFile(path.join(ROOT, 'claude', '.claude', 'commands', 'finalize-requirement.md'), 'utf8');
  assert.ok(finalize.includes('拆分判断'));
  assert.ok(finalize.includes('就绪标准'));

  const codexFlow = await readFile(path.join(ROOT, 'codex', '.agents', 'skills', 'requirements-flow', 'SKILL.md'), 'utf8');
  assert.ok(codexFlow.includes('M/L 级的 critic 门'), 'codex 侧 critic 门必须限定等级');
  assert.ok(codexFlow.includes('S 级不做自检'));

  for (const file of await collectFiles(ROOT)) {
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
    assert.ok(body.includes('interface-contract.md'));
    assert.ok(body.includes('不分等级'));
  }

  for (const file of await collectFiles(ROOT)) {
    const rel = path.relative(ROOT, file).split(path.sep).join('/');
    const body = await readFile(file, 'utf8');
    assert.ok(!body.includes('四份'), `${rel} 仍写着四份基线`);
  }
});
