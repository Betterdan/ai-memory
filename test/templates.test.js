import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { buildManifest } from '../src/manifest.js';
import { scaffold } from '../src/scaffold.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'templates');
const VARS = { projectName: 'demo', techStack: 'PHP + Vue', date: '2026-07-06' };

export const EXPECTED_COMMON = [
  '.ai/memory/MEMORY.md',
  '.ai/memory/features/.gitkeep',
  '.ai/memory/feedback.md',
  '.ai/memory/project-state.md',
  '.ai/memory/session-log.md',
  '.ai/memory/user-profile.md',
  '.ai/README.md',
];
export const EXPECTED_CLAUDE = [];
export const EXPECTED_CODEX = [];

test('真实模板清单与期望一致', async () => {
  const m = await buildManifest(ROOT, ['claude', 'codex']);
  const expected = [...EXPECTED_COMMON, ...EXPECTED_CLAUDE, ...EXPECTED_CODEX].sort((a, b) => a.localeCompare(b));
  assert.deepEqual(m.map(e => e.dest).sort((a, b) => a.localeCompare(b)), expected);
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
