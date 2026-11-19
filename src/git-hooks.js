import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { access, chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const LAUNCHER = '.ai/hooks/gate.mjs';

export const CLI_HINT = '提示:门禁需要可调用的 ai-memory CLI,否则 hook 与 pre-commit 只会提示并放行。'
  + '安装:npm i -g @betterdanlins/ai-memory(或项目内 npm i -D @betterdanlins/ai-memory)';

// 用项目自己的启动器探测,与 hook 运行时的查找逻辑保持一致
export function gateCliReachable({ targetDir }) {
  const result = spawnSync(process.execPath, [path.join(targetDir, ...LAUNCHER.split('/')), '--probe'], { stdio: 'ignore' });
  return result.status === 0;
}

const SAMPLE = '.ai/hooks/pre-commit.sample';

function hookDestination(targetDir) {
  const root = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: targetDir, encoding: 'utf8' });
  if (root.status !== 0) return null;
  const normalize = value => process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value);
  try {
    if (normalize(realpathSync(root.stdout.trim())) !== normalize(realpathSync(targetDir))) return null;
  } catch { return null; }
  const result = spawnSync('git', ['rev-parse', '--git-path', 'hooks/pre-commit'], { cwd: targetDir, encoding: 'utf8' });
  if (result.status !== 0 || !result.stdout.trim()) return null;
  return path.resolve(targetDir, result.stdout.trim());
}

export async function installGitHook({ targetDir, force = false }) {
  const destination = hookDestination(targetDir);
  if (!destination) {
    return { installed: false, message: '当前目录不是 git 仓库根目录,无法安装 pre-commit 门禁' };
  }

  let sample;
  try {
    sample = await readFile(path.join(targetDir, ...SAMPLE.split('/')), 'utf8');
  } catch {
    return { installed: false, message: `缺少 ${SAMPLE};请先运行 ai-memory update --yes` };
  }

  if (!force && (await exists(destination))) {
    return { installed: false, message: `${destination} 已存在;确认可以覆盖后加 --force,或手工把 ${SAMPLE} 的内容并进去` };
  }

  await mkdir(path.dirname(destination), { recursive: true });
  try {
    await writeFile(destination, sample.replaceAll('\r\n', '\n'), { flag: force ? 'w' : 'wx' });
  } catch (err) {
    if (err.code === 'EEXIST') return { installed: false, message: `${destination} 已存在;确认可以覆盖后加 --force` };
    throw err;
  }
  await chmod(destination, 0o755).catch(() => {});
  return { installed: true, message: `已安装 ${destination};此 hook 路径可能由多个 worktree 共享;提交前会运行 gate ready、gate contract 与 kb check` };
}

export async function gitHookStatus({ targetDir }) {
  const destination = hookDestination(targetDir);
  if (!destination) return { installed: false, message: '当前目录不是 git 仓库根目录,无法检查 pre-commit 门禁' };
  if (!(await exists(destination))) {
    return { installed: false, message: `${destination} 未安装;运行 ai-memory hooks install 可启用跨工具门禁` };
  }
  const body = await readFile(destination, 'utf8');
  const managed = body.includes('ai-memory');
  // v0.11.2 及以前的样例经 npx 调用,项目里没有本地安装时会静默放行
  const legacyLauncher = managed && body.includes('npx --no-install ai-memory');
  const readsWorkingTree = managed && /^\s*node\s+"\$GATE"\s+gate\s+ready\s+\|\|/m.test(body);
  const outdated = legacyLauncher || readsWorkingTree;
  let message = `${destination} 已存在但不是 ai-memory 的门禁;需要手工合并`;
  if (managed) {
    message = `${destination} 已安装 ai-memory 门禁`;
    if (legacyLauncher) message = `${destination} 是旧版门禁,找不到本地安装时会静默放行;运行 ai-memory hooks install --force 更新`;
    else if (readsWorkingTree) message = `${destination} 的就绪门禁仍读取工作区;请核对共享影响后合并新版样例,使其检查暂存区`;
  }
  return { installed: true, managed, outdated, message };
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}
