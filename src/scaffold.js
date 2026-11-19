import { constants } from 'node:fs';
import { mkdir, readFile, writeFile, access, lstat, stat } from 'node:fs/promises';
import path from 'node:path';
import { buildManifest } from './manifest.js';
import { adoptManagedBlock } from './managed-blocks.js';
import { assertNoSymlinkPath, resolveSafeDestination } from './path-safety.js';
import { render } from './render.js';

const IMPORT_DESTS = new Set(['.ai/memory/user-profile.md', '.ai/memory/feedback.md']);

export class ScaffoldError extends Error {
  constructor({ phase, dest, destPath, cause, summary, notWritten }) {
    super(`生成 ${dest} 失败(${phase}): ${cause.message}`, { cause });
    this.name = 'ScaffoldError';
    this.code = phase === 'prepare' ? 'SCAFFOLD_PREPARE_FAILED' : 'SCAFFOLD_WRITE_FAILED';
    this.phase = phase;
    this.dest = dest;
    this.destPath = destPath;
    this.summary = copySummary(summary);
    this.notWritten = [...notWritten];
  }
}

export async function scaffold({ templatesRoot, targetDir, vars, tools, onConflict, importFrom, requireDirectoryParents }) {
  const importRoot = importFrom ? await validateImportRoot(importFrom) : undefined;
  const manifest = await buildManifest(templatesRoot, tools);
  const summary = { written: [], skipped: [], imported: [], fallback: [], preserved: [] };
  const candidates = [];

  for (const entry of manifest) {
    const destPath = resolveSafeDestination(targetDir, entry.dest);
    const existing = await inspect(destPath);
    const action = existing ? await onConflict(entry.dest) : 'create';
    if (existing && !['overwrite', 'preserve', 'adopt-entry'].includes(action)) {
      summary.skipped.push(entry.dest);
      continue;
    }
    if (action === 'preserve' || action === 'adopt-entry') {
      await assertNoSymlinkPath(targetDir, destPath);
      if (!existing.isFile()) throw new Error(`既有目标必须是普通文件: ${entry.dest}`);
    }
    if (action === 'preserve') {
      summary.preserved.push(entry.dest);
      continue;
    }
    candidates.push({ ...entry, destPath, action });
  }

  for (const { destPath } of candidates) {
    await assertNoSymlinkPath(targetDir, destPath, { requireDirectoryParents });
  }

  const planned = [];
  for (const candidate of candidates) {
    const { src, dest, destPath, action } = candidate;
    let content;
    let original;
    let source = 'template';
    try {
      if (importRoot && IMPORT_DESTS.has(dest)) {
        const importSrc = path.join(importRoot, '.ai', 'memory', path.basename(dest));
        content = await readOptionalImport(importSrc);
        source = content === undefined ? 'fallback' : 'import';
      }
      if (content === undefined) {
        content = render(await readFile(src, 'utf8'), vars);
      }
      if (action === 'adopt-entry') {
        original = await readFile(destPath);
        const current = original.toString('utf8');
        if (!original.equals(Buffer.from(current, 'utf8'))) throw new Error('既有入口必须使用 UTF-8');
        content = adoptManagedBlock(current, content);
      }
    } catch (err) {
      throw new ScaffoldError({
        phase: 'prepare', dest, destPath, cause: err, summary,
        notWritten: candidates.map(({ dest: pending }) => pending),
      });
    }
    planned.push({ dest, destPath, content, source, action, original });
  }

  for (const [index, item] of planned.entries()) {
    const { dest, destPath, content, source, action, original } = item;
    try {
      await mkdir(path.dirname(destPath), { recursive: true });
    } catch (err) {
      throw writeError('mkdir', item, err, summary, planned, index);
    }
    try {
      if (original) {
        await assertNoSymlinkPath(targetDir, destPath);
        if (!(await readFile(destPath)).equals(original)) throw new Error('入口在预检后发生变化');
      }
      await writeFile(destPath, content, { flag: action === 'create' ? 'wx' : 'w' });
    } catch (err) {
      throw writeError('write', item, err, summary, planned, index);
    }
    summary.written.push(dest);
    if (source === 'import') summary.imported.push(dest);
    if (source === 'fallback') summary.fallback.push(dest);
  }
  return summary;
}

async function inspect(filePath) {
  try {
    return await lstat(filePath);
  } catch (err) {
    if (err.code === 'ENOENT' || err.code === 'ENOTDIR') return undefined;
    throw err;
  }
}

function writeError(phase, item, cause, summary, planned, index) {
  return new ScaffoldError({
    phase,
    dest: item.dest,
    destPath: item.destPath,
    cause,
    summary,
    notWritten: planned.slice(index).map(({ dest }) => dest),
  });
}

function copySummary(summary) {
  return Object.fromEntries(Object.entries(summary).map(([key, value]) => [key, [...value]]));
}

async function validateImportRoot(importFrom) {
  const root = path.resolve(importFrom);
  let info;
  try {
    info = await stat(root);
  } catch (err) {
    if (err.code === 'ENOENT') throw new Error(`导入目录不存在: ${root}`, { cause: err });
    throw new Error(`无法访问导入目录 ${root}: ${err.message}`, { cause: err });
  }
  if (!info.isDirectory()) throw new Error(`导入路径不是目录: ${root}`);
  try {
    await access(root, constants.R_OK);
  } catch (err) {
    throw new Error(`导入目录不可读 ${root}: ${err.message}`, { cause: err });
  }
  return root;
}

async function readOptionalImport(importSrc) {
  try {
    return await readFile(importSrc, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return undefined;
    throw new Error(`无法读取导入文件 ${importSrc}: ${err.message}`, { cause: err });
  }
}
