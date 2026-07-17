import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { access, readFile, writeFile, mkdir, rm, symlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { scaffold } from '../src/scaffold.js';
import { createTempDirs } from './temp-dirs.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'templates');
const VARS = { projectName: 'demo', techStack: 'php', date: '2026-07-06' };

const tempDirs = createTempDirs();
afterEach(() => tempDirs.cleanup());
async function tmp() { return tempDirs.make('aim-'); }

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

test('importFrom:存在的 user-profile 以导入内容写入,计入 written', async () => {
  const src = await tmp();
  await mkdir(path.join(src, '.ai', 'memory'), { recursive: true });
  await writeFile(path.join(src, '.ai', 'memory', 'user-profile.md'), 'IMPORTED\n');
  const dir = await tmp();
  const r = await scaffold({ templatesRoot: ROOT, targetDir: dir, vars: VARS, tools: ['claude'], onConflict: () => 'skip', importFrom: src });
  assert.equal(await readFile(path.join(dir, '.ai', 'memory', 'user-profile.md'), 'utf8'), 'IMPORTED\n');
  assert.ok(r.written.includes('.ai/memory/user-profile.md'), '应计入 written');
  assert.deepEqual(r.imported, ['.ai/memory/user-profile.md']);
  assert.deepEqual(r.fallback, []);
});

test('importFrom + 冲突 skip:目标已有 user-profile 时内容不变且计入 skipped', async () => {
  const src = await tmp();
  await mkdir(path.join(src, '.ai', 'memory'), { recursive: true });
  await writeFile(path.join(src, '.ai', 'memory', 'user-profile.md'), 'IMPORTED\n');
  const dir = await tmp();
  await mkdir(path.join(dir, '.ai', 'memory'), { recursive: true });
  await writeFile(path.join(dir, '.ai', 'memory', 'user-profile.md'), 'SENTINEL\n');
  const r = await scaffold({ templatesRoot: ROOT, targetDir: dir, vars: VARS, tools: ['claude'], onConflict: () => 'skip', importFrom: src });
  assert.equal(await readFile(path.join(dir, '.ai', 'memory', 'user-profile.md'), 'utf8'), 'SENTINEL\n');
  assert.ok(r.skipped.includes('.ai/memory/user-profile.md'), '应计入 skipped');
});

test('importFrom:源目录缺文件时回退模板内容', async () => {
  const src = await tmp(); // empty, no user-profile.md
  const dir = await tmp();
  const r = await scaffold({ templatesRoot: ROOT, targetDir: dir, vars: VARS, tools: ['claude'], onConflict: () => 'skip', importFrom: src });
  assert.equal(await readFile(path.join(dir, '.ai', 'memory', 'user-profile.md'), 'utf8'), 'TEMPLATE_PROFILE\n');
  assert.ok(r.written.includes('.ai/memory/user-profile.md'));
  assert.deepEqual(r.imported, []);
  assert.deepEqual(r.fallback, ['.ai/memory/user-profile.md']);
});

test('importFrom:导入目录不存在时在写入前失败', async () => {
  const dir = await tmp();
  const missing = path.join(dir, 'missing-import');
  await assert.rejects(
    scaffold({ templatesRoot: ROOT, targetDir: dir, vars: VARS, tools: ['claude'], onConflict: () => 'skip', importFrom: missing }),
    /导入目录不存在/
  );
  await assert.rejects(readFile(path.join(dir, 'a.md'), 'utf8'));
});

test('importFrom:导入路径是文件时明确失败', async () => {
  const dir = await tmp();
  const sourceFile = path.join(dir, 'not-a-directory');
  await writeFile(sourceFile, 'FILE\n');
  await assert.rejects(
    scaffold({ templatesRoot: ROOT, targetDir: dir, vars: VARS, tools: ['claude'], onConflict: () => 'skip', importFrom: sourceFile }),
    /导入路径不是目录/
  );
});

test('模板准备失败时不写入任何文件并报告全部未写入目标', async (t) => {
  const templates = await tmp();
  const target = await tmp();
  t.after(() => Promise.all([
    rm(templates, { recursive: true, force: true }),
    rm(target, { recursive: true, force: true }),
  ]));
  await mkdir(path.join(templates, 'common'), { recursive: true });
  await writeFile(path.join(templates, 'common', 'a.md'), 'A\n');
  await writeFile(path.join(templates, 'common', 'b.md'), '{{missing}}\n');

  await assert.rejects(
    scaffold({ templatesRoot: templates, targetDir: target, vars: VARS, tools: [], onConflict: () => 'skip' }),
    (err) => {
      assert.equal(err.name, 'ScaffoldError');
      assert.equal(err.code, 'SCAFFOLD_PREPARE_FAILED');
      assert.equal(err.phase, 'prepare');
      assert.equal(err.dest, 'b.md');
      assert.deepEqual(err.summary.written, []);
      assert.deepEqual(err.notWritten, ['a.md', 'b.md']);
      return true;
    }
  );
  await assert.rejects(access(path.join(target, 'a.md')));
});

test('实际写入失败时报告已写入与尚未写入文件', async (t) => {
  const templates = await tmp();
  const target = await tmp();
  t.after(() => Promise.all([
    rm(templates, { recursive: true, force: true }),
    rm(target, { recursive: true, force: true }),
  ]));
  await mkdir(path.join(templates, 'common'), { recursive: true });
  await writeFile(path.join(templates, 'common', 'a.md'), 'A\n');
  await writeFile(path.join(templates, 'common', 'b.md'), 'B\n');
  await mkdir(path.join(target, 'b.md'));

  await assert.rejects(
    scaffold({ templatesRoot: templates, targetDir: target, vars: VARS, tools: [], onConflict: () => 'overwrite' }),
    (err) => {
      assert.equal(err.name, 'ScaffoldError');
      assert.equal(err.code, 'SCAFFOLD_WRITE_FAILED');
      assert.equal(err.phase, 'write');
      assert.equal(err.dest, 'b.md');
      assert.deepEqual(err.summary.written, ['a.md']);
      assert.deepEqual(err.summary.imported, []);
      assert.deepEqual(err.summary.fallback, []);
      assert.deepEqual(err.notWritten, ['b.md']);
      return true;
    }
  );
  assert.equal(await readFile(path.join(target, 'a.md'), 'utf8'), 'A\n');
});

test('覆盖目标经过符号链接目录时在写入前拒绝', async (t) => {
  const templates = await tmp();
  const target = await tmp();
  const outside = await tmp();
  t.after(() => Promise.all([
    rm(templates, { recursive: true, force: true }),
    rm(target, { recursive: true, force: true }),
    rm(outside, { recursive: true, force: true }),
  ]));
  await mkdir(path.join(templates, 'common', 'linked'), { recursive: true });
  await writeFile(path.join(templates, 'common', 'linked', 'file.md'), 'NEW\n');
  await writeFile(path.join(outside, 'file.md'), 'OUTSIDE\n');
  await symlink(outside, path.join(target, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');

  await assert.rejects(
    scaffold({ templatesRoot: templates, targetDir: target, vars: VARS, tools: [], onConflict: () => 'overwrite' }),
    /符号链接或 junction/
  );
  assert.equal(await readFile(path.join(outside, 'file.md'), 'utf8'), 'OUTSIDE\n');
});
