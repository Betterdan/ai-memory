import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { assertNoSymlinkPath, resolveSafeDestination } from '../src/path-safety.js';

test('resolveSafeDestination 解析目标目录内的 POSIX 风格相对路径', () => {
  const root = path.resolve('target');
  assert.equal(
    resolveSafeDestination(root, '.ai/memory/project-state.md'),
    path.join(root, '.ai', 'memory', 'project-state.md'),
  );
});

test('resolveSafeDestination 拒绝空路径、绝对路径和盘符路径', () => {
  const root = path.resolve('target');
  for (const dest of ['', '/tmp/file', 'C:/tmp/file', 'C:file']) {
    assert.throws(() => resolveSafeDestination(root, dest));
  }
});

test('resolveSafeDestination 拒绝无效路径段和反斜杠', () => {
  const root = path.resolve('target');
  for (const dest of ['.', '..', '../file', 'dir/../file', 'dir/./file', 'dir//file', 'dir\\..\\file']) {
    assert.throws(() => resolveSafeDestination(root, dest));
  }
});

test('assertNoSymlinkPath 允许普通现有组件和不存在的后续组件', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ai-memory-safe-path-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'existing'));
  await writeFile(path.join(root, 'existing', 'file.md'), 'ok');

  await assertNoSymlinkPath(root, path.join(root, 'existing', 'file.md'));
  await assertNoSymlinkPath(root, path.join(root, 'existing', 'missing', 'file.md'));
});

test('assertNoSymlinkPath 拒绝目标目录之外的路径', async () => {
  const root = path.resolve('target');
  await assert.rejects(
    assertNoSymlinkPath(root, path.resolve(root, '..', 'outside.md')),
    /不在目标目录内/,
  );
});

test('assertNoSymlinkPath 拒绝符号链接或 junction 路径组件', async (t) => {
  const base = await mkdtemp(path.join(os.tmpdir(), 'ai-memory-safe-link-'));
  t.after(() => rm(base, { recursive: true, force: true }));
  const root = path.join(base, 'root');
  const linked = path.join(base, 'linked');
  await mkdir(root);
  await mkdir(linked);
  await symlink(linked, path.join(root, 'alias'), process.platform === 'win32' ? 'junction' : 'dir');

  await assert.rejects(
    assertNoSymlinkPath(root, path.join(root, 'alias', 'file.md')),
    /符号链接或 junction/,
  );
});
