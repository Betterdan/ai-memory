import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp, readFile, writeFile, access } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'cli.js');

test('init --yes 全量生成且渲染变量', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'aim-cli-'));
  await run(process.execPath, [CLI, 'init', '--name', 'demo', '--stack', 'Go', '--tools', 'claude,codex', '--yes'], { cwd: dir });
  const state = await readFile(path.join(dir, '.ai/memory/project-state.md'), 'utf8');
  assert.ok(state.includes('- 项目:demo'));
  assert.ok(state.includes('- 技术栈:Go'));
  await access(path.join(dir, 'CLAUDE.md'));
  await access(path.join(dir, 'AGENTS.md'));
});

test('init --tools claude 不生成 Codex 侧', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'aim-cli-'));
  await run(process.execPath, [CLI, 'init', '--name', 'demo', '--stack', 'Go', '--tools', 'claude', '--yes'], { cwd: dir });
  await access(path.join(dir, 'CLAUDE.md'));
  await assert.rejects(access(path.join(dir, 'AGENTS.md')));
});

test('init --yes 冲突时跳过既有文件', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'aim-cli-'));
  await writeFile(path.join(dir, 'CLAUDE.md'), 'MINE\n');
  const { stdout } = await run(process.execPath, [CLI, 'init', '--name', 'demo', '--stack', 'Go', '--tools', 'claude', '--yes'], { cwd: dir });
  assert.equal(await readFile(path.join(dir, 'CLAUDE.md'), 'utf8'), 'MINE\n');
  assert.ok(stdout.includes('跳过 1'));
});

test('非法 --tools 值报错退出', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'aim-cli-'));
  await assert.rejects(
    run(process.execPath, [CLI, 'init', '--tools', 'cursor', '--yes'], { cwd: dir }),
    /tools 仅支持 claude、codex/
  );
});
