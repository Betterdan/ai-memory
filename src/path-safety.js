import { lstat } from 'node:fs/promises';
import path from 'node:path';

export function resolveSafeDestination(targetDir, dest) {
  if (typeof dest !== 'string' || dest.length === 0) {
    throw new Error('模板目标路径必须是非空相对路径');
  }
  if (dest.includes('\\')) {
    throw new Error(`模板目标路径必须使用 "/" 分隔: ${dest}`);
  }
  if (path.posix.isAbsolute(dest) || path.win32.isAbsolute(dest) || /^[A-Za-z]:/.test(dest)) {
    throw new Error(`模板目标路径不能是绝对路径: ${dest}`);
  }

  const segments = dest.split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    throw new Error(`模板目标路径包含无效路径段: ${dest}`);
  }

  const root = path.resolve(targetDir);
  const destination = path.resolve(root, ...segments);
  const relative = path.relative(root, destination);
  if (relative === '' || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`模板目标路径超出目标目录: ${dest}`);
  }
  return destination;
}

export async function assertNoSymlinkPath(targetDir, destPath) {
  const root = path.resolve(targetDir);
  const destination = path.resolve(destPath);
  const relative = path.relative(root, destination);
  if (relative === '' || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`目标路径不在目标目录内: ${destPath}`);
  }

  let current = root;
  for (const segment of relative.split(path.sep)) {
    current = path.join(current, segment);
    let stats;
    try {
      stats = await lstat(current);
    } catch (err) {
      if (err.code === 'ENOENT') return;
      throw err;
    }
    if (stats.isSymbolicLink()) {
      throw new Error(`目标路径包含符号链接或 junction: ${current}`);
    }
  }
}
