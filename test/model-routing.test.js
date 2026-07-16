import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp, readFile } from 'node:fs/promises';
import {
  createModelRoutingConfig, MODEL_ROUTING_DEST, resolveModelRouting,
  validateModelRoutingConfig, writeModelRoutingConfig,
} from '../src/model-routing.js';

test('inherit 保持旧行为且测试执行不调用模型', () => {
  const routing = resolveModelRouting(createModelRoutingConfig());
  assert.equal(routing.implementation, 'inherit');
  assert.equal(routing['final-review'], 'inherit');
  assert.equal(routing['test-execution'], 'none');
});

test('balanced 按高级规划、中等实现、便宜测试和高级审查路由', () => {
  const routing = resolveModelRouting(createModelRoutingConfig('balanced'));
  assert.equal(routing['write-plan'], 'premium');
  assert.equal(routing.implementation, 'standard');
  assert.equal(routing['routine-tests'], 'economy');
  assert.equal(routing['final-review'], 'premium');
});

test('配置拒绝未知 profile、stage 和 tier', () => {
  assert.throws(() => createModelRoutingConfig('fast'), /仅支持/);
  assert.throws(() => validateModelRoutingConfig({ schemaVersion: 1, profile: 'inherit', overrides: { deploy: 'premium' } }), /未知模型路由阶段/);
  assert.throws(() => validateModelRoutingConfig({ schemaVersion: 1, profile: 'inherit', overrides: { implementation: 'ultra' } }), /模型等级无效/);
});

test('模型配置以稳定 JSON 写入项目', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'aim-routing-'));
  await writeModelRoutingConfig(dir, createModelRoutingConfig('quality'));
  const body = await readFile(path.join(dir, ...MODEL_ROUTING_DEST.split('/')), 'utf8');
  assert.equal(JSON.parse(body).profile, 'quality');
  assert.ok(body.endsWith('\n'));
});
