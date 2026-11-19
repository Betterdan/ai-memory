import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

// 在一次门禁中固定文件清单，内容读取自当前 worktree 的暂存区。
export async function readIndex(targetDir) {
  const { stdout } = await run('git', [
    'ls-files', '--stage', '-z', '--',
    '.ai/knowledge/iterations.md', 'docs/architecture/interfaces.md', 'docs/requirements/',
  ], { cwd: targetDir });
  const files = new Map();
  for (const entry of stdout.split('\0').filter(Boolean)) {
    const tab = entry.indexOf('\t');
    const header = entry.slice(0, tab).split(' ');
    const name = entry.slice(tab + 1);
    if (tab < 0 || header.length !== 3) throw new Error('无法解析 Git 暂存区');
    if (header[2] !== '0') throw new Error(`暂存区存在未解决冲突:${name}`);
    files.set(name, { mode: header[0], hash: header[1] });
  }
  return {
    files: [...files.keys()],
    async read(rel) {
      const entry = files.get(rel);
      if (!entry) return undefined;
      const { mode, hash } = entry;
      if (mode !== '100644' && mode !== '100755') throw new Error(`暂存区应使用普通文件:${rel}`);
      const { stdout: content } = await run('git', ['cat-file', 'blob', hash], { cwd: targetDir });
      return content;
    },
  };
}
