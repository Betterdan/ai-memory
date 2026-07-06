import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildManifest } from '../src/manifest.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'templates');

test('both tools:common+claude+codex 全收集,dest 排序', async () => {
  const m = await buildManifest(ROOT, ['claude', 'codex']);
  assert.deepEqual(m.map(e => e.dest), ['AGENTS.md', 'CLAUDE.md', 'a.md', 'sub/b.md', 'vars.md']);
});

test('只选 claude 时排除 codex 组', async () => {
  const m = await buildManifest(ROOT, ['claude']);
  assert.deepEqual(m.map(e => e.dest), ['CLAUDE.md', 'a.md', 'sub/b.md', 'vars.md']);
});

test('src 是存在的绝对路径', async () => {
  const m = await buildManifest(ROOT, ['claude', 'codex']);
  for (const e of m) assert.ok(path.isAbsolute(e.src));
});

test('组目录不存在时视为空组', async () => {
  const m = await buildManifest(path.join(ROOT, '..'), ['claude', 'codex']);
  assert.deepEqual(m, []);
});
