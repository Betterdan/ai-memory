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
  '.ai/skills/architecture.md',
  '.ai/skills/code-review.md',
  '.ai/skills/critic.md',
  '.ai/skills/memory-update.md',
  '.ai/skills/requirements-flow.md',
  'docs/requirements/README.md',
  'docs/requirements/v1.0.0/draft/.gitkeep',
  'docs/requirements/v1.0.0/final/.gitkeep',
];
export const EXPECTED_CLAUDE = [
  '.claude/agents/critic.md',
  '.claude/commands/critic.md',
  '.claude/commands/finalize-requirement.md',
  '.claude/commands/new-requirement.md',
  '.claude/commands/update-memory.md',
  '.claude/settings.json',
  '.claude/skills/critic/SKILL.md',
  '.claude/skills/memory-update/SKILL.md',
  '.claude/skills/requirements-flow/SKILL.md',
  'CLAUDE.md',
];
export const EXPECTED_CODEX = [
  '.agents/skills/critic/SKILL.md',
  '.agents/skills/memory-update/SKILL.md',
  '.agents/skills/requirements-flow/SKILL.md',
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
