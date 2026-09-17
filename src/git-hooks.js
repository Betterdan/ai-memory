import { access, chmod, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const SAMPLE = '.ai/hooks/pre-commit.sample';
const TARGET = '.git/hooks/pre-commit';

export async function installGitHook({ targetDir, force = false }) {
  const gitDir = path.join(targetDir, '.git');
  try {
    const info = await stat(gitDir);
    if (!info.isDirectory()) throw new Error('not a dir');
  } catch {
    return { installed: false, message: '当前目录不是 git 仓库,无法安装 pre-commit 门禁' };
  }

  let sample;
  try {
    sample = await readFile(path.join(targetDir, ...SAMPLE.split('/')), 'utf8');
  } catch {
    return { installed: false, message: `缺少 ${SAMPLE};请先运行 ai-memory update --yes` };
  }

  const destination = path.join(targetDir, ...TARGET.split('/'));
  if (!force && (await exists(destination))) {
    return { installed: false, message: `${TARGET} 已存在;确认可以覆盖后加 --force,或手工把 ${SAMPLE} 的内容并进去` };
  }

  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, sample);
  await chmod(destination, 0o755).catch(() => {});
  return { installed: true, message: `已安装 ${TARGET};提交前会运行 gate ready、gate contract 与 kb check` };
}

export async function gitHookStatus({ targetDir }) {
  const destination = path.join(targetDir, ...TARGET.split('/'));
  if (!(await exists(destination))) {
    return { installed: false, message: `${TARGET} 未安装;运行 ai-memory hooks install 可启用跨工具门禁` };
  }
  const body = await readFile(destination, 'utf8');
  const managed = body.includes('ai-memory');
  return {
    installed: true,
    managed,
    message: managed
      ? `${TARGET} 已安装 ai-memory 门禁`
      : `${TARGET} 已存在但不是 ai-memory 的门禁;需要手工合并`,
  };
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}
