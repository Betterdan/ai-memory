import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp, readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { scaffold } from '../src/scaffold.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'templates');
const VARS = { projectName: 'demo', techStack: 'php', date: '2026-07-06' };

async function tmp() { return mkdtemp(path.join(os.tmpdir(), 'aim-')); }

test('全新目录:全部写入并渲染变量', async () => {
  const dir = await tmp();
  const r = await scaffold({ templatesRoot: ROOT, targetDir: dir, vars: VARS, tools: ['claude', 'codex'], onConflict: () => 'skip' });
  assert.equal(r.skipped.length, 0);
  assert.ok(r.written.includes('vars.md'));
  assert.equal(await readFile(path.join(dir, 'vars.md'), 'utf8'), '# demo (2026-07-06)\n');
  assert.equal(await readFile(path.join(dir, 'sub', 'b.md'), 'utf8'), 'B\n');
});

test('冲突:onConflict 返回 skip 则保留原文件', async () => {
  const dir = await tmp();
  await writeFile(path.join(dir, 'a.md'), 'KEEP\n');
  const asked = [];
  const r = await scaffold({
    templatesRoot: ROOT, targetDir: dir, vars: VARS, tools: ['claude', 'codex'],
    onConflict: (dest) => { asked.push(dest); return 'skip'; },
  });
  assert.deepEqual(asked, ['a.md']);
  assert.ok(r.skipped.includes('a.md'));
  assert.equal(await readFile(path.join(dir, 'a.md'), 'utf8'), 'KEEP\n');
});

test('冲突:overwrite 则覆盖', async () => {
  const dir = await tmp();
  await writeFile(path.join(dir, 'a.md'), 'OLD\n');
  await scaffold({ templatesRoot: ROOT, targetDir: dir, vars: VARS, tools: ['claude', 'codex'], onConflict: () => 'overwrite' });
  assert.equal(await readFile(path.join(dir, 'a.md'), 'utf8'), 'A\n');
});

test('importFrom:存在的 user-profile/feedback 覆盖生成物', async () => {
  const src = await tmp();
  await mkdir(path.join(src, '.ai', 'memory'), { recursive: true });
  await writeFile(path.join(src, '.ai', 'memory', 'user-profile.md'), 'IMPORTED\n');
  const dir = await tmp();
  await scaffold({ templatesRoot: ROOT, targetDir: dir, vars: VARS, tools: ['claude'], onConflict: () => 'skip', importFrom: src });
  assert.equal(await readFile(path.join(dir, '.ai', 'memory', 'user-profile.md'), 'utf8'), 'IMPORTED\n');
});
