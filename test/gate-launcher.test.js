import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scaffold } from '../src/scaffold.js';
import { createTempDirs } from './temp-dirs.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEMPLATES = path.join(ROOT, 'templates');
const LAUNCHER = path.join(TEMPLATES, 'common', '.ai', 'hooks', 'gate.mjs');
const tempDirs = createTempDirs();
afterEach(() => tempDirs.cleanup());

// 假 CLI:把收到的参数、stdin 与工作目录写进文件,以退出码 2 结束,便于核对转发是否原样
const FAKE_CLI = `
import { writeFileSync, readFileSync } from 'node:fs';
let input = '';
try { input = readFileSync(0, 'utf8'); } catch {}
writeFileSync(process.env.FAKE_OUT, JSON.stringify({ args: process.argv.slice(2), input, cwd: process.cwd() }));
process.exit(2);
`;

async function makeProject() {
  const dir = await tempDirs.make('aim-launcher-');
  await mkdir(path.join(dir, '.ai', 'hooks'), { recursive: true });
  await copyFile(LAUNCHER, path.join(dir, '.ai', 'hooks', 'gate.mjs'));
  return dir;
}

async function installFake(base) {
  const cli = path.join(base, '@betterdanlins', 'ai-memory', 'bin', 'cli.js');
  await mkdir(path.dirname(cli), { recursive: true });
  await writeFile(cli, FAKE_CLI);
  return cli;
}

// PATH 置空:开发机上即使全局装了 ai-memory 也不会被找到
function run(dir, args, { input, env = {}, cwd = dir } = {}) {
  const result = spawnSync(process.execPath, [path.join(dir, '.ai', 'hooks', 'gate.mjs'), ...args], {
    cwd, input, encoding: 'utf8',
    env: { ...process.env, PATH: '', Path: '', AI_MEMORY_CLI: '', TMPDIR: dir, TEMP: dir, TMP: dir, ...env },
  });
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
}

test('找不到 CLI 时 hook 模式放行,并以 systemMessage 每个会话提醒一次', async () => {
  const dir = await makeProject();
  const input = JSON.stringify({ session_id: 's1', tool_input: { file_path: 'src/a.js' } });

  const first = run(dir, ['gate', 'ready', '--hook'], { input });
  assert.equal(first.code, 0, '门禁坏了不能挡住编辑');
  const message = JSON.parse(first.stdout).systemMessage;
  assert.match(message, /门禁未生效/);
  assert.match(message, /npm i -g @betterdanlins\/ai-memory/, '需给出安装方式');

  const second = run(dir, ['gate', 'ready', '--hook'], { input });
  assert.equal(second.code, 0);
  assert.equal(second.stdout, '', '同一会话不重复提醒');

  const other = run(dir, ['gate', 'contract', '--hook'], { input: JSON.stringify({ session_id: 's2' }) });
  assert.match(JSON.parse(other.stdout).systemMessage, /门禁未生效/, '新会话要重新提醒');
});

test('找不到 CLI 时非 hook 模式在 stderr 警告并放行', async () => {
  const dir = await makeProject();
  const result = run(dir, ['gate', 'ready']);
  assert.equal(result.code, 0);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /门禁未执行/);
});

test('--probe 只报告能否找到 CLI', async () => {
  const dir = await makeProject();
  assert.equal(run(dir, ['--probe']).code, 1);
  await installFake(path.join(dir, 'node_modules'));
  assert.equal(run(dir, ['--probe']).code, 0);
});

test('项目内安装:参数、stdin、退出码原样转发,工作目录固定为项目根', async () => {
  const dir = await makeProject();
  await installFake(path.join(dir, 'node_modules'));
  await mkdir(path.join(dir, 'src', 'deep'), { recursive: true });
  const out = path.join(dir, 'out.json');

  const result = run(dir, ['gate', 'ready', '--hook'], {
    input: '{"session_id":"s1"}', env: { FAKE_OUT: out }, cwd: path.join(dir, 'src', 'deep'),
  });
  assert.equal(result.code, 2, '阻塞退出码必须透传,否则门禁失效');
  assert.equal(result.stdout, '', '找到 CLI 时不得提示');
  const seen = JSON.parse(await readFile(out, 'utf8'));
  assert.deepEqual(seen.args, ['gate', 'ready', '--hook']);
  assert.equal(seen.input, '{"session_id":"s1"}');
  assert.equal(path.resolve(seen.cwd), path.resolve(dir), '在子目录调用也要以项目根为准');
});

test('全局安装:按 npm 在 Windows 与 POSIX 下的目录布局从 PATH 找到', async () => {
  for (const layout of ['win', 'posix']) {
    const dir = await makeProject();
    const prefix = await tempDirs.make('aim-prefix-');
    const binDir = layout === 'win' ? prefix : path.join(prefix, 'bin');
    const modules = layout === 'win' ? path.join(prefix, 'node_modules') : path.join(prefix, 'lib', 'node_modules');
    await mkdir(binDir, { recursive: true });
    await installFake(modules);
    const out = path.join(dir, 'out.json');

    const result = run(dir, ['kb', 'check'], { env: { PATH: binDir, Path: binDir, FAKE_OUT: out } });
    assert.equal(result.code, 2, `${layout} 布局应找到全局 CLI`);
    assert.deepEqual(JSON.parse(await readFile(out, 'utf8')).args, ['kb', 'check']);
  }
});

test('AI_MEMORY_CLI 指定的 CLI 优先', async () => {
  const dir = await makeProject();
  const cli = await installFake(await tempDirs.make('aim-explicit-'));
  const out = path.join(dir, 'out.json');
  const result = run(dir, ['gate', 'ready'], { env: { AI_MEMORY_CLI: cli, FAKE_OUT: out } });
  assert.equal(result.code, 2);
});

test('接上真实 CLI:没有进行中的需求点时放行', async () => {
  const dir = await tempDirs.make('aim-launcher-real-');
  await scaffold({
    templatesRoot: TEMPLATES, targetDir: dir, tools: ['claude'], onConflict: () => 'skip',
    vars: { projectName: 'demo', techStack: 'Go', date: '2026-11-18', modelProfile: 'inherit', frameworkVersion: '0.11.3' },
  });
  const result = run(dir, ['gate', 'ready', '--hook'], {
    input: JSON.stringify({ session_id: 's1', tool_input: { file_path: path.join(dir, 'src', 'a.go') } }),
    env: { AI_MEMORY_CLI: path.join(ROOT, 'bin', 'cli.js') },
  });
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout.trim(), '', '真实 CLI 可用时不得出现未生效提示');
});

test('调用方不关 stdin 时 hook 模式也按时返回,不把编辑挂住', async () => {
  const dir = await makeProject();
  const { spawn } = await import('node:child_process');
  const started = Date.now();
  const child = spawn(process.execPath, [path.join(dir, '.ai', 'hooks', 'gate.mjs'), 'gate', 'ready', '--hook'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, PATH: '', Path: '', AI_MEMORY_CLI: '', TMPDIR: dir, TEMP: dir, TMP: dir },
  });
  child.stdin.write('{"session_id":"open"}');
  const code = await new Promise(resolve => {
    const kill = setTimeout(() => { child.kill(); resolve('timeout'); }, 5000);
    child.on('exit', status => { clearTimeout(kill); resolve(status); });
  });
  child.stdin.destroy();
  assert.equal(code, 0, 'stdin 未关闭时启动器被挂住');
  assert.ok(Date.now() - started < 4000);
});
