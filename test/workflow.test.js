import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { createModelRoutingConfig, writeModelRoutingConfig } from '../src/model-routing.js';
import { prepareHandoff, recordStageResult, verifyHandoff } from '../src/workflow.js';
import { createTempDirs } from './temp-dirs.js';

const tempDirs = createTempDirs();
afterEach(() => tempDirs.cleanup());

async function project(profile = 'balanced') {
  const dir = await tempDirs.make('aim-workflow-');
  await mkdir(path.join(dir, 'docs', 'design'), { recursive: true });
  await writeFile(path.join(dir, 'docs', 'design', 'feature.md'), 'DESIGN\n');
  await writeModelRoutingConfig(dir, createModelRoutingConfig(profile));
  return dir;
}

test('prepare 记录正式输入哈希、验收标准和执行等级', async () => {
  const dir = await project();
  const { handoff, path: handoffPath } = await prepareHandoff({
    targetDir: dir,
    feature: 'login',
    stage: 'implementation',
    risk: 'M',
    inputs: ['docs/design/feature.md'],
    acceptanceCriteria: ['AC-01'],
    allowedChangeScope: ['src/auth/**'],
  });
  assert.equal(handoff.executorTier, 'standard');
  assert.equal(handoff.inputs[0].path, 'docs/design/feature.md');
  assert.match(handoff.inputs[0].sha256, /^[a-f0-9]{64}$/);
  assert.equal(handoffPath, '.ai/runs/login/handoff.json');
  assert.equal((await verifyHandoff({ targetDir: dir, feature: 'login' })).stage, 'implementation');
});

test('verify 拒绝未决问题、过期输入和已变化路由', async () => {
  const dir = await project();
  const base = {
    targetDir: dir, feature: 'login', stage: 'implementation', risk: 'M',
    inputs: ['docs/design/feature.md'], acceptanceCriteria: ['AC-01'],
  };
  await prepareHandoff({ ...base, unresolvedDecisions: ['接口错误码未定'] });
  await assert.rejects(verifyHandoff({ targetDir: dir, feature: 'login' }), /未决问题/);

  await prepareHandoff(base);
  await writeFile(path.join(dir, 'docs', 'design', 'feature.md'), 'CHANGED\n');
  await assert.rejects(verifyHandoff({ targetDir: dir, feature: 'login' }), /输入已变化/);

  await writeFile(path.join(dir, 'docs', 'design', 'feature.md'), 'DESIGN\n');
  await prepareHandoff(base);
  await writeModelRoutingConfig(dir, createModelRoutingConfig('quality'));
  await assert.rejects(verifyHandoff({ targetDir: dir, feature: 'login' }), /模型路由已变化/);
});

test('prepare 拒绝项目外路径和缺少实现验收标准', async () => {
  const dir = await project();
  await assert.rejects(prepareHandoff({
    targetDir: dir, feature: 'C:login', stage: 'feature-design', risk: 'M', inputs: ['docs/design/feature.md'],
  }), /安全目录名/);
  await assert.rejects(prepareHandoff({
    targetDir: dir, feature: 'login', stage: 'implementation', risk: 'M',
    inputs: ['docs/design/feature.md'],
  }), /至少需要一个 --acceptance/);
  await assert.rejects(prepareHandoff({
    targetDir: dir, feature: 'login', stage: 'feature-design', risk: 'M', inputs: ['../outside.md'],
  }), /越出项目目录/);
});

test('prepare 拒绝通过符号链接读取项目外输入', async (t) => {
  const base = await mkdtemp(path.join(os.tmpdir(), 'aim-workflow-link-'));
  t.after(() => rm(base, { recursive: true, force: true }));
  const root = path.join(base, 'root');
  const external = path.join(base, 'external');
  await mkdir(root);
  await mkdir(external);
  await writeFile(path.join(external, 'design.md'), 'EXTERNAL\n');
  await writeModelRoutingConfig(root, createModelRoutingConfig('balanced'));
  await symlink(external, path.join(root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(prepareHandoff({
    targetDir: root, feature: 'login', stage: 'feature-design', risk: 'M', inputs: ['linked/design.md'],
  }), /符号链接或 junction/);
});

test('complete 只记录与当前阶段匹配的结构化回执', async () => {
  const dir = await project();
  await prepareHandoff({
    targetDir: dir, feature: 'login', stage: 'implementation', risk: 'M',
    inputs: ['docs/design/feature.md'], acceptanceCriteria: ['AC-01'],
  });
  const resultPath = path.join(dir, 'result.json');
  const valid = {
    stage: 'implementation', status: 'completed', changedFiles: ['src/login.js'],
    acceptanceCoverage: { 'AC-01': 'covered' }, tests: ['npm test'],
    designDeviations: [], unresolvedRisks: [],
  };
  await writeFile(resultPath, JSON.stringify(valid));
  const recorded = await recordStageResult({ targetDir: dir, feature: 'login', resultPath: 'result.json' });
  assert.equal(recorded.path, '.ai/runs/login/implementation-result.json');

  await writeFile(resultPath, JSON.stringify({ ...valid, stage: 'routine-tests' }));
  await assert.rejects(
    recordStageResult({ targetDir: dir, feature: 'login', resultPath: 'result.json' }),
    /stage 必须为 implementation/
  );

  await writeFile(resultPath, JSON.stringify({ ...valid, acceptanceCoverage: {} }));
  await assert.rejects(
    recordStageResult({ targetDir: dir, feature: 'login', resultPath: 'result.json' }),
    /缺少验收覆盖: AC-01/
  );
});
