import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { assertNoSymlinkPath } from './path-safety.js';

export const MODEL_ROUTING_DEST = '.ai/config/model-routing.json';
export const MODEL_ROUTING_SCHEMA_VERSION = 1;

export const STAGES = [
  'brainstorm',
  'requirement-finalize',
  'feature-design',
  'write-plan',
  'implementation',
  'routine-tests',
  'test-execution',
  'failure-diagnosis',
  'adversarial-testing',
  'final-review',
];

const PROFILES = {
  inherit: Object.fromEntries(STAGES.map(stage => [stage, stage === 'test-execution' ? 'none' : 'inherit'])),
  balanced: {
    brainstorm: 'premium',
    'requirement-finalize': 'premium',
    'feature-design': 'premium',
    'write-plan': 'premium',
    implementation: 'standard',
    'routine-tests': 'economy',
    'test-execution': 'none',
    'failure-diagnosis': 'standard',
    'adversarial-testing': 'premium',
    'final-review': 'premium',
  },
  quality: {
    brainstorm: 'premium',
    'requirement-finalize': 'premium',
    'feature-design': 'premium',
    'write-plan': 'premium',
    implementation: 'premium',
    'routine-tests': 'standard',
    'test-execution': 'none',
    'failure-diagnosis': 'premium',
    'adversarial-testing': 'premium',
    'final-review': 'premium',
  },
};

export const MODEL_PROFILES = Object.freeze(Object.keys(PROFILES));

export function createModelRoutingConfig(profile = 'inherit') {
  assertProfile(profile);
  return { schemaVersion: MODEL_ROUTING_SCHEMA_VERSION, profile, overrides: {} };
}

export function resolveModelRouting(config) {
  validateModelRoutingConfig(config);
  return { ...PROFILES[config.profile], ...config.overrides };
}

export async function readModelRoutingConfig(targetDir) {
  const configPath = path.join(targetDir, ...MODEL_ROUTING_DEST.split('/'));
  await assertNoSymlinkPath(targetDir, configPath);
  let config;
  try {
    config = JSON.parse(await readFile(configPath, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') throw new Error(`缺少模型路由配置: ${MODEL_ROUTING_DEST};请先更新 ai-memory 框架`);
    if (err instanceof SyntaxError) throw new Error(`模型路由配置不是有效 JSON: ${MODEL_ROUTING_DEST}`, { cause: err });
    throw err;
  }
  validateModelRoutingConfig(config);
  return config;
}

export async function writeModelRoutingConfig(targetDir, config) {
  validateModelRoutingConfig(config);
  const configPath = path.join(targetDir, ...MODEL_ROUTING_DEST.split('/'));
  await assertNoSymlinkPath(targetDir, configPath);
  await mkdir(path.dirname(configPath), { recursive: true });
  await writeFile(configPath, JSON.stringify(config, null, 2) + '\n');
  return config;
}

export function validateModelRoutingConfig(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new Error('模型路由配置必须是对象');
  }
  if (config.schemaVersion !== MODEL_ROUTING_SCHEMA_VERSION) {
    throw new Error(`不支持的模型路由 Schema: ${config.schemaVersion}`);
  }
  assertProfile(config.profile);
  if (!config.overrides || typeof config.overrides !== 'object' || Array.isArray(config.overrides)) {
    throw new Error('模型路由 overrides 必须是对象');
  }
  for (const [stage, tier] of Object.entries(config.overrides)) {
    if (!STAGES.includes(stage)) throw new Error(`未知模型路由阶段: ${stage}`);
    if (!['inherit', 'premium', 'standard', 'economy', 'none'].includes(tier)) {
      throw new Error(`阶段 ${stage} 的模型等级无效: ${tier}`);
    }
  }
}

function assertProfile(profile) {
  if (!MODEL_PROFILES.includes(profile)) {
    throw new Error(`model profile 仅支持 ${MODEL_PROFILES.join('、')},收到: ${profile}`);
  }
}
