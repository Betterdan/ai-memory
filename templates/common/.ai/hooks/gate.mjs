#!/usr/bin/env node
// ai-memory 门禁启动器:Claude Code hook 与 git pre-commit 都经由这里调用 CLI。
//
// 为什么不用 `npx --no-install ai-memory`:按 README 用 `npx @betterdanlins/ai-memory init`
// 初始化的项目里通常没有本地安装,npx 找不到命令时以退出码 1 失败——Claude Code 只把 2
// 当阻塞,于是门禁静默放行,每次编辑还白等数秒。PHP、Go 等项目甚至没有 package.json。
//
// 查找顺序:AI_MEMORY_CLI 环境变量 → 项目内 node_modules → PATH 上的全局安装。
// 找不到时放行但明确提示:hook 模式每个会话提醒一次,其余模式写 stderr。
// 用法:node .ai/hooks/gate.mjs <ai-memory 参数...>;--probe 只检查能否找到 CLI。

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, realpathSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE = path.join('@betterdanlins', 'ai-memory', 'bin', 'cli.js');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const INSTALL_HINT = '安装后生效:npm i -g @betterdanlins/ai-memory(或在项目内 npm i -D @betterdanlins/ai-memory)';

function findCli() {
  const explicit = process.env.AI_MEMORY_CLI;
  if (explicit && existsSync(explicit)) return explicit;

  const local = path.join(ROOT, 'node_modules', PACKAGE);
  if (existsSync(local)) return local;

  const entries = (process.env.PATH || process.env.Path || '').split(path.delimiter).filter(Boolean);
  for (const dir of entries) {
    // Windows:<prefix>/ai-memory.cmd 与 <prefix>/node_modules/... 同级
    // POSIX(含 nvm):<prefix>/bin/ai-memory 与 <prefix>/lib/node_modules/...
    for (const candidate of [path.join(dir, 'node_modules', PACKAGE), path.join(dir, '..', 'lib', 'node_modules', PACKAGE)]) {
      if (existsSync(candidate)) return candidate;
    }
    // 其他包管理器的布局:bin 是指向 cli.js 的符号链接
    const link = path.join(dir, 'ai-memory');
    try {
      const real = realpathSync(link);
      if (real.endsWith(path.join('bin', 'cli.js'))) return real;
    } catch {}
  }
  return undefined;
}

// hook 输入很小;调用方忘了关 stdin 时也必须按时返回,不能把编辑挂住。
// 定时器不能 unref:否则 stdin 一直开着时它永远不触发,兜底本身成了故障
function readStdin() {
  return new Promise(resolve => {
    if (process.stdin.isTTY) { resolve(''); return; }
    let data = '';
    const finish = () => { clearTimeout(timer); resolve(data); };
    const timer = setTimeout(() => { process.stdin.destroy(); resolve(data); }, 800);
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => { data += chunk; });
    process.stdin.on('end', finish);
    process.stdin.on('error', finish);
  });
}

function warnOncePerSession(input) {
  let session = '';
  try { session = JSON.parse(input).session_id || ''; } catch {}
  const key = createHash('sha256').update(`${ROOT}\n${session || process.ppid}`).digest('hex').slice(0, 16);
  const marker = path.join(os.tmpdir(), `ai-memory-gate-missing-${key}`);
  if (existsSync(marker)) return;
  try { writeFileSync(marker, ''); } catch {}
  const message = `[ai-memory] 门禁未生效:找不到 ai-memory CLI,本会话的 gate 检查都会直接放行。${INSTALL_HINT}`;
  process.stdout.write(`${JSON.stringify({ systemMessage: message })}\n`);
}

const args = process.argv.slice(2);
const cli = findCli();

if (args[0] === '--probe') process.exit(cli ? 0 : 1);

const hookMode = args.includes('--hook');
const input = hookMode ? await readStdin() : undefined;

if (!cli) {
  if (hookMode) warnOncePerSession(input);
  else process.stderr.write(`[ai-memory] 门禁未执行:找不到 ai-memory CLI。${INSTALL_HINT}\n`);
  process.exit(0);
}

const result = spawnSync(process.execPath, [cli, ...args], {
  cwd: ROOT,
  input,
  stdio: [hookMode ? 'pipe' : 'inherit', 'inherit', 'inherit'],
});
if (result.error) {
  process.stderr.write(`[ai-memory] 门禁启动失败,已放行:${result.error.message}\n`);
  process.exit(0);
}
process.exit(result.status ?? 0);
