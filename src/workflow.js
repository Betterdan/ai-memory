import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { readModelRoutingConfig, resolveModelRouting, STAGES } from './model-routing.js';
import { assertNoSymlinkPath } from './path-safety.js';

const RISKS = ['S', 'M', 'L'];

export async function prepareHandoff({
  targetDir, feature, stage, risk, inputs, acceptanceCriteria = [], allowedChangeScope = [], unresolvedDecisions = [],
}) {
  validateFeature(feature);
  if (!STAGES.includes(stage)) throw new Error(`未知工作流阶段: ${stage}`);
  if (!RISKS.includes(risk)) throw new Error(`risk 仅支持 S、M、L,收到: ${risk}`);
  if (!Array.isArray(inputs) || inputs.length === 0) throw new Error('至少需要一个 --input 正式输入文件');
  if (requiresAcceptance(stage) && acceptanceCriteria.length === 0) {
    throw new Error(`阶段 ${stage} 至少需要一个 --acceptance 验收标准编号`);
  }

  const routing = resolveModelRouting(await readModelRoutingConfig(targetDir));
  const records = [];
  for (const input of [...new Set(inputs)]) {
    const { relative, absolute } = resolveProjectInput(targetDir, input);
    await assertNoSymlinkPath(targetDir, absolute);
    let content;
    try {
      content = await readFile(absolute);
    } catch (err) {
      if (err.code === 'ENOENT' || err.code === 'EISDIR') throw new Error(`交接输入不是可读文件: ${relative}`, { cause: err });
      throw err;
    }
    records.push({ path: relative, sha256: createHash('sha256').update(content).digest('hex') });
  }

  const handoff = {
    schemaVersion: 1,
    featureId: feature,
    riskLevel: risk,
    stage,
    executorTier: routing[stage],
    createdAt: new Date().toISOString(),
    inputs: records,
    acceptanceCriteria: uniqueStrings(acceptanceCriteria),
    unresolvedDecisions: uniqueStrings(unresolvedDecisions),
    allowedChangeScope: uniqueStrings(allowedChangeScope),
  };
  const handoffPath = handoffFile(targetDir, feature);
  await assertNoSymlinkPath(targetDir, handoffPath);
  await mkdir(path.dirname(handoffPath), { recursive: true });
  await writeFile(handoffPath, JSON.stringify(handoff, null, 2) + '\n');
  return { handoff, path: relativeFromRoot(targetDir, handoffPath) };
}

export async function verifyHandoff({ targetDir, feature, expectedStage }) {
  validateFeature(feature);
  const handoffPath = handoffFile(targetDir, feature);
  await assertNoSymlinkPath(targetDir, handoffPath);
  let handoff;
  try {
    handoff = JSON.parse(await readFile(handoffPath, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') throw new Error(`缺少交接清单: ${relativeFromRoot(targetDir, handoffPath)}`);
    if (err instanceof SyntaxError) throw new Error(`交接清单不是有效 JSON: ${relativeFromRoot(targetDir, handoffPath)}`, { cause: err });
    throw err;
  }
  validateHandoff(handoff, feature);
  if (expectedStage && handoff.stage !== expectedStage) {
    throw new Error(`交接阶段不匹配: 期望 ${expectedStage},实际 ${handoff.stage}`);
  }
  if (handoff.unresolvedDecisions.length) {
    throw new Error(`仍有 ${handoff.unresolvedDecisions.length} 个未决问题,不能进入 ${handoff.stage}`);
  }

  const routing = resolveModelRouting(await readModelRoutingConfig(targetDir));
  if (handoff.executorTier !== routing[handoff.stage]) {
    throw new Error(`模型路由已变化: ${handoff.stage} 当前应使用 ${routing[handoff.stage]},请重新 prepare`);
  }
  for (const record of handoff.inputs) {
    const { absolute } = resolveProjectInput(targetDir, record.path);
    await assertNoSymlinkPath(targetDir, absolute);
    let current;
    try {
      current = await readFile(absolute);
    } catch (err) {
      if (err.code === 'ENOENT') throw new Error(`交接输入已不存在: ${record.path}`);
      throw err;
    }
    const currentHash = createHash('sha256').update(current).digest('hex');
    if (currentHash !== record.sha256) throw new Error(`交接输入已变化,请重新 prepare: ${record.path}`);
  }
  return handoff;
}

export async function recordStageResult({ targetDir, feature, resultPath }) {
  const handoff = await verifyHandoff({ targetDir, feature });
  const source = resolveProjectInput(targetDir, resultPath);
  await assertNoSymlinkPath(targetDir, source.absolute);
  let result;
  try {
    result = JSON.parse(await readFile(source.absolute, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') throw new Error(`阶段回执不存在: ${source.relative}`);
    if (err instanceof SyntaxError) throw new Error(`阶段回执不是有效 JSON: ${source.relative}`, { cause: err });
    throw err;
  }
  validateStageResult(result, handoff);
  const destination = path.join(targetDir, '.ai', 'runs', feature, `${handoff.stage}-result.json`);
  await assertNoSymlinkPath(targetDir, destination);
  await writeFile(destination, JSON.stringify(result, null, 2) + '\n');
  return { result, path: relativeFromRoot(targetDir, destination) };
}

function validateHandoff(handoff, feature) {
  if (!handoff || handoff.schemaVersion !== 1 || handoff.featureId !== feature) {
    throw new Error(`交接清单格式或 featureId 无效: ${feature}`);
  }
  if (!STAGES.includes(handoff.stage) || !RISKS.includes(handoff.riskLevel)) {
    throw new Error(`交接清单阶段或风险等级无效: ${feature}`);
  }
  if (!Array.isArray(handoff.inputs) || !handoff.inputs.length
    || !Array.isArray(handoff.acceptanceCriteria)
    || !Array.isArray(handoff.unresolvedDecisions)
    || !Array.isArray(handoff.allowedChangeScope)) {
    throw new Error(`交接清单缺少必要字段: ${feature}`);
  }
  if (!['inherit', 'premium', 'standard', 'economy', 'none'].includes(handoff.executorTier)
    || handoff.inputs.some(record => !record || typeof record.path !== 'string' || !/^[a-f0-9]{64}$/.test(record.sha256))) {
    throw new Error(`交接清单输入或执行等级无效: ${feature}`);
  }
}

function validateStageResult(result, handoff) {
  if (!result || typeof result !== 'object' || result.stage !== handoff.stage) {
    throw new Error(`阶段回执 stage 必须为 ${handoff.stage}`);
  }
  if (!['completed', 'blocked', 'failed'].includes(result.status)) throw new Error(`阶段回执 status 无效: ${result.status}`);
  for (const field of ['changedFiles', 'tests', 'designDeviations', 'unresolvedRisks']) {
    if (!Array.isArray(result[field]) || result[field].some(value => typeof value !== 'string')) {
      throw new Error(`阶段回执 ${field} 必须是字符串数组`);
    }
  }
  if (!result.acceptanceCoverage || typeof result.acceptanceCoverage !== 'object' || Array.isArray(result.acceptanceCoverage)) {
    throw new Error('阶段回执 acceptanceCoverage 必须是对象');
  }
  for (const [id, coverage] of Object.entries(result.acceptanceCoverage)) {
    if (!id.trim() || !['covered', 'partial', 'not-covered', 'not-applicable'].includes(coverage)) {
      throw new Error(`阶段回执验收覆盖无效: ${id}=${coverage}`);
    }
  }
  const missing = handoff.acceptanceCriteria.filter(id => !(id in result.acceptanceCoverage));
  if (missing.length) throw new Error(`阶段回执缺少验收覆盖: ${missing.join(', ')}`);
}

function resolveProjectInput(targetDir, input) {
  if (typeof input !== 'string' || !input.trim() || path.isAbsolute(input)) throw new Error(`输入路径必须是项目内相对路径: ${input}`);
  const root = path.resolve(targetDir);
  const absolute = path.resolve(root, input);
  const relative = path.relative(root, absolute);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`输入路径越出项目目录: ${input}`);
  }
  return { absolute, relative: relative.split(path.sep).join('/') };
}

function handoffFile(targetDir, feature) {
  return path.join(targetDir, '.ai', 'runs', feature, 'handoff.json');
}

function relativeFromRoot(targetDir, filePath) {
  return path.relative(path.resolve(targetDir), filePath).split(path.sep).join('/');
}

function validateFeature(feature) {
  if (typeof feature !== 'string' || !/^[\p{L}\p{N}][\p{L}\p{N}._-]*$/u.test(feature)) {
    throw new Error(`feature 必须是单个安全目录名,收到: ${feature}`);
  }
}

function uniqueStrings(values) {
  return [...new Set(values.map(value => value.trim()).filter(Boolean))];
}

function requiresAcceptance(stage) {
  return ['implementation', 'routine-tests', 'adversarial-testing', 'final-review'].includes(stage);
}
