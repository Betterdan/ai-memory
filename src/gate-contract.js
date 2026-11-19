import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { parseFrontmatter } from './frontmatter.js';
import { contractDeclaration, inProgressPoints, locateFinal } from './gate-ready.js';
import { readIndex } from './git-index.js';

const run = promisify(execFile);
const INTERFACES = 'docs/architecture/interfaces.md';

export async function gateContract({ targetDir, staged = false, base, point }) {
  if (base && staged) throw new Error('--base 与 --staged 不能同时使用');
  if (base && !point) throw new Error('--base 需要通过 --point 指定需求点');
  if (point && (/[\\/]/.test(point) || point === '.' || point === '..')) throw new Error('需求点名称必须是文件名');
  const changed = await changedPaths(targetDir, staged, base);
  const index = staged && changed !== null ? await readIndex(targetDir) : null;
  const points = point ? [point] : await inProgressPoints(targetDir, index);
  const config = await readInterfaceConfig(targetDir, index);
  if (index && points.length && !index.files.includes(INTERFACES)
    && (changed.includes(INTERFACES) || !(await readInterfaceConfig(targetDir, null)).skip)) {
    throw new Error(`暂存区缺少 ${INTERFACES};请先暂存本次提交使用的接口规则`);
  }
  if (config.skip) return { skipped: config.skip, problems: [] };
  if (changed === null) return { skipped: '当前目录不是 git 仓库,或 git 不可用', problems: [] };

  if (!points.length) return { skipped: '没有进行中的需求点', problems: [] };

  const touchedEntries = changed.filter(file => matchAny(config.entryGlobs, file));
  const touchedContracts = changed.filter(file => matchAny(config.contractGlobs, file));
  const problems = [];

  for (const point of points) {
    const located = await locateFinal(targetDir, point, index);
    if (located.error) { problems.push({ point, message: located.error }); continue; }
    const body = index ? await index.read(located.rel) : await readFile(path.join(targetDir, ...located.rel.split('/')), 'utf8');
    const declared = contractDeclaration(body);

    if (declared === 'not-applicable' && touchedEntries.length) {
      problems.push({
        point,
        message: `定稿声明「不涉及对外接口」,但本次改动碰了入口代码:${touchedEntries.join('、')}`,
      });
    }
    if (declared === 'confirmed' && touchedEntries.length && !touchedContracts.length) {
      problems.push({
        point,
        message: `定稿声明「契约 diff 已确认」,但契约文件没有任何变更;已改入口:${touchedEntries.join('、')}`,
      });
    }
    if (declared === null) {
      problems.push({ point, message: '定稿未声明契约状态,先补齐就绪标准第 4 条' });
    }
  }

  return { skipped: null, problems, touchedEntries, touchedContracts };
}

async function readInterfaceConfig(targetDir, index) {
  let body;
  try {
    body = index ? await index.read(INTERFACES) : await readFile(path.join(targetDir, ...INTERFACES.split('/')), 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT' || err.code === 'ENOTDIR') return { skip: `缺少 ${INTERFACES}` };
    throw err;
  }
  if (body === undefined) return { skip: `暂存区缺少 ${INTERFACES}` };
  const parsed = parseFrontmatter(body);
  if (!parsed) {
    return { skip: `${INTERFACES} 没有 frontmatter;补上 entry_globs 与 contract_globs 后本门禁才生效` };
  }
  const entryGlobs = toList(parsed.data.entry_globs);
  const contractGlobs = toList(parsed.data.contract_globs);
  if (!entryGlobs.length || !contractGlobs.length) {
    return { skip: `${INTERFACES} 的 entry_globs 或 contract_globs 为空;填写后本门禁才生效` };
  }
  return { entryGlobs, contractGlobs };
}

async function changedPaths(targetDir, staged, base) {
  if (base) {
    try {
      const { stdout: commit } = await run('git', ['rev-parse', '--verify', '--end-of-options', `${base}^{commit}`], { cwd: targetDir });
      const { stdout: mergeBase } = await run('git', ['merge-base', 'HEAD', commit.trim()], { cwd: targetDir });
      const { stdout } = await run('git', ['diff', '--name-only', '--no-renames', '-z', mergeBase.trim(), 'HEAD', '--'], { cwd: targetDir });
      return stdout.split('\0').filter(Boolean);
    } catch (err) {
      throw new Error(`无法比较基线 ${base}:请检查引用、Git 仓库及共同祖先`, { cause: err });
    }
  }
  // -uall:不加的话 git 会把未跟踪目录折叠成 `?? src/`,新增文件拿不到完整路径
  const args = staged ? ['diff', '--cached', '--name-only', '--no-renames', '-z', '--']
    : ['status', '--porcelain', '-z', '-uall', '--no-renames'];
  let stdout;
  try {
    ({ stdout } = await run('git', args, { cwd: targetDir }));
  } catch (err) {
    if (staged) throw new Error(`无法读取 Git 暂存改动: ${String(err.stderr ?? '').trim() || err.message}`, { cause: err });
    return null;
  }
  const files = stdout.split('\0').filter(Boolean);
  return staged ? files : files.map(item => item.slice(3));
}

export function matchAny(globs, filePath) {
  return globs.some(glob => matchGlob(glob, filePath));
}

// 只支持 ** 与 *,按路径段匹配;不引 minimatch
export function matchGlob(pattern, filePath) {
  return matchSegments(pattern.split('/').filter(Boolean), filePath.split('/').filter(Boolean));
}

function matchSegments(patternParts, pathParts) {
  if (!patternParts.length) return pathParts.length === 0;
  const [head, ...rest] = patternParts;
  if (head === '**') {
    for (let index = 0; index <= pathParts.length; index += 1) {
      if (matchSegments(rest, pathParts.slice(index))) return true;
    }
    return false;
  }
  if (!pathParts.length) return false;
  if (!matchName(head, pathParts[0])) return false;
  return matchSegments(rest, pathParts.slice(1));
}

function matchName(pattern, name) {
  const parts = pattern.split('*');
  if (parts.length === 1) return pattern === name;
  const first = parts[0];
  const last = parts[parts.length - 1];
  if (!name.startsWith(first) || !name.endsWith(last)) return false;
  if (name.length < first.length + last.length) return false;
  let cursor = first.length;
  for (const part of parts.slice(1, -1)) {
    if (!part) continue;
    const found = name.indexOf(part, cursor);
    if (found < 0) return false;
    cursor = found + part.length;
  }
  return cursor <= name.length - last.length;
}

function toList(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  return value ? [value] : [];
}
