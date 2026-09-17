import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { parseFrontmatter } from './frontmatter.js';
import { contractDeclaration, inProgressPoints, locateFinal } from './gate-ready.js';

const run = promisify(execFile);
const INTERFACES = 'docs/architecture/interfaces.md';

export async function gateContract({ targetDir, staged = false }) {
  const config = await readInterfaceConfig(targetDir);
  if (config.skip) return { skipped: config.skip, problems: [] };

  const changed = await changedPaths(targetDir, staged);
  if (changed === null) return { skipped: '当前目录不是 git 仓库,或 git 不可用', problems: [] };

  const points = await inProgressPoints(targetDir);
  if (!points.length) return { skipped: '没有进行中的需求点', problems: [] };

  const touchedEntries = changed.filter(file => matchAny(config.entryGlobs, file));
  const touchedContracts = changed.filter(file => matchAny(config.contractGlobs, file));
  const problems = [];

  for (const point of points) {
    const located = await locateFinal(targetDir, point);
    if (located.error) { problems.push({ point, message: located.error }); continue; }
    const body = await readFile(path.join(targetDir, ...located.rel.split('/')), 'utf8');
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

async function readInterfaceConfig(targetDir) {
  let body;
  try {
    body = await readFile(path.join(targetDir, ...INTERFACES.split('/')), 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT' || err.code === 'ENOTDIR') return { skip: `缺少 ${INTERFACES}` };
    throw err;
  }
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

async function changedPaths(targetDir, staged) {
  // -uall:不加的话 git 会把未跟踪目录折叠成 `?? src/`,新增文件拿不到完整路径
  const args = staged ? ['diff', '--cached', '--name-only'] : ['status', '--porcelain', '-uall'];
  let stdout;
  try {
    ({ stdout } = await run('git', args, { cwd: targetDir }));
  } catch {
    return null;
  }
  const files = [];
  for (const line of stdout.split('\n')) {
    if (!line.trim()) continue;
    const raw = staged ? line.trim() : line.slice(3).trim();
    const renamed = raw.split(' -> ');
    files.push(unquotePath(renamed[renamed.length - 1]));
  }
  return files;
}

function unquotePath(value) {
  const trimmed = value.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) return trimmed.slice(1, -1);
  return trimmed;
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
