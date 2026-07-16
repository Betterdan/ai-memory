import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildManifest } from '../src/manifest.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'templates');

test('both tools:common+claude+codex 全收集,dest 排序', async () => {
  const m = await buildManifest(ROOT, ['claude', 'codex']);
  assert.deepEqual(m.map(e => e.dest), ['.ai/memory/user-profile.md', 'AGENTS.md', 'CLAUDE.md', 'a.md', 'sub/b.md', 'vars.md']);
});

test('只选 claude 时排除 codex 组', async () => {
  const m = await buildManifest(ROOT, ['claude']);
  assert.deepEqual(m.map(e => e.dest), ['.ai/memory/user-profile.md', 'CLAUDE.md', 'a.md', 'sub/b.md', 'vars.md']);
});

test('src 是存在的绝对路径', async () => {
  const m = await buildManifest(ROOT, ['claude', 'codex']);
  for (const e of m) assert.ok(path.isAbsolute(e.src));
});

test('.gitignore.template 映射为 .gitignore,避免 npm pack 自动改名', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ai-memory-manifest-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const src = path.join(root, 'common', '.ai', 'runs', '.gitignore.template');
  await mkdir(path.dirname(src), { recursive: true });
  await writeFile(src, '*\n!.gitignore\n');

  const manifest = await buildManifest(root, []);
  assert.deepEqual(manifest.map(item => item.dest), ['.ai/runs/.gitignore']);
  assert.equal(manifest[0].src, src);
});

test('组目录不存在时视为空组', async () => {
  const m = await buildManifest(path.join(ROOT, '..'), ['claude', 'codex']);
  assert.deepEqual(m, []);
});

test('不同模板组包含相同 dest 时列出冲突目标和全部来源', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ai-memory-manifest-'));
  t.after(() => rm(root, { recursive: true, force: true }));

  const commonSrc = path.join(root, 'common', 'shared.md');
  const claudeSrc = path.join(root, 'claude', 'shared.md');
  const codexSrc = path.join(root, 'codex', 'shared.md');
  await Promise.all([
    mkdir(path.dirname(commonSrc), { recursive: true }),
    mkdir(path.dirname(claudeSrc), { recursive: true }),
    mkdir(path.dirname(codexSrc), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(commonSrc, 'common'),
    writeFile(claudeSrc, 'claude'),
    writeFile(codexSrc, 'codex'),
  ]);

  await assert.rejects(
    buildManifest(root, ['claude', 'codex']),
    (err) => {
      assert.match(err.message, /Duplicate template destinations:/);
      assert.match(err.message, /- shared\.md/);
      assert.ok(err.message.includes(commonSrc));
      assert.ok(err.message.includes(claudeSrc));
      assert.ok(err.message.includes(codexSrc));
      return true;
    },
  );
});
