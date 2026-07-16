import { createHash } from 'node:crypto';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildManifest } from './manifest.js';
import { matchesLegacyV01Baseline } from './legacy-v0.1.js';
import { migrationsBetween } from './migrations.js';
import { assertNoSymlinkPath, resolveSafeDestination } from './path-safety.js';
import { render } from './render.js';
import { ScaffoldError } from './scaffold.js';

export const CURRENT_SCHEMA_VERSION = 1;
export const METADATA_DEST = '.ai/ai-memory.json';

const USER_PREFIXES = [
  '.ai/memory/',
  'docs/architecture/',
  'docs/requirements/v',
  'docs/design/v',
];

const MIXED_FILES = new Set(['AGENTS.md', 'CLAUDE.md', '.claude/settings.json']);
const FRAMEWORK_EXCEPTIONS = new Set(['docs/requirements/README.md', 'docs/design/README.md']);

export function ownershipFor(dest) {
  if (MIXED_FILES.has(dest)) return 'mixed';
  if (FRAMEWORK_EXCEPTIONS.has(dest)) return 'framework';
  if (USER_PREFIXES.some(prefix => dest.startsWith(prefix))) return 'user';
  return 'framework';
}

export function hashContent(content) {
  return createHash('sha256').update(content).digest('hex');
}

export async function detectInstallation(targetDir) {
  const metadataPath = path.join(targetDir, '.ai', 'ai-memory.json');
  try {
    const metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
    validateMetadata(metadata, metadataPath);
    return { kind: 'metadata', metadata };
  } catch (err) {
    if (err.code !== 'ENOENT') {
      if (err instanceof SyntaxError) throw new Error(`框架元数据不是有效 JSON: ${metadataPath}`, { cause: err });
      throw err;
    }
  }

  const readmePath = path.join(targetDir, '.ai', 'README.md');
  try {
    const readme = await readFile(readmePath, 'utf8');
    if (readme.includes('@betterdanlins/ai-memory')) {
      const facts = await readLegacyFacts(targetDir, readme);
      return { kind: 'legacy', version: '0.1.0', schemaVersion: 0, ...facts };
    }
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  return { kind: 'none' };
}

export async function writeFrameworkMetadata({
  targetDir, templatesRoot, frameworkVersion, tools, projectName, techStack, date, previousMetadata,
}) {
  const manifest = await buildManifest(templatesRoot, tools);
  const files = {};
  for (const { dest } of manifest) {
    const content = await readFile(path.join(targetDir, ...dest.split('/')), 'utf8');
    files[dest] = { ownership: ownershipFor(dest), sha256: hashContent(content) };
  }

  const metadata = {
    frameworkVersion,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    generatedAt: previousMetadata?.generatedAt ?? new Date().toISOString(),
    ...(previousMetadata ? { updatedAt: new Date().toISOString() } : {}),
    tools: [...tools],
    templateVars: { projectName, techStack, date },
    files,
  };
  const metadataPath = path.join(targetDir, '.ai', 'ai-memory.json');
  await mkdir(path.dirname(metadataPath), { recursive: true });
  await writeFile(metadataPath, JSON.stringify(metadata, null, 2) + '\n', { flag: previousMetadata ? 'w' : 'wx' });
  return metadata;
}

export async function planFrameworkUpdate({ targetDir, templatesRoot, frameworkVersion }) {
  const installation = await detectInstallation(targetDir);
  if (installation.kind === 'none') throw new Error('当前目录不是 ai-memory 项目,请先运行 init');

  const tools = installation.kind === 'metadata' ? installation.metadata.tools : installation.tools;
  const vars = installation.kind === 'metadata' ? installation.metadata.templateVars : installation.templateVars;
  if (installation.kind === 'metadata' && compareVersions(installation.metadata.frameworkVersion, frameworkVersion) > 0) {
    throw new Error(`项目框架版本 ${installation.metadata.frameworkVersion} 高于当前 CLI ${frameworkVersion},请使用更新版本的 CLI`);
  }
  const fromSchema = installation.kind === 'metadata' ? installation.metadata.schemaVersion : 0;
  const migrations = migrationsBetween(fromSchema, CURRENT_SCHEMA_VERSION);
  const manifest = await buildManifest(templatesRoot, tools);
  const desiredDests = new Set(manifest.map(({ dest }) => dest));
  const actions = [];

  for (const { src, dest } of manifest) {
    const desired = render(await readFile(src, 'utf8'), vars);
    const current = await readOptional(path.join(targetDir, ...dest.split('/')));
    const ownership = ownershipFor(dest);
    if (current === undefined) {
      actions.push({ action: 'add', dest, ownership });
      continue;
    }

    const currentHash = hashContent(current);
    const desiredHash = hashContent(desired);
    if (currentHash === desiredHash) {
      actions.push({ action: 'unchanged', dest, ownership });
    } else if (ownership === 'user') {
      actions.push({ action: 'preserve', dest, ownership });
    } else {
      const matchesBaseline = installation.kind === 'metadata'
        ? installation.metadata.files[dest]?.sha256 === currentHash
        : matchesLegacyV01Baseline(dest, current, vars);
      const action = matchesBaseline ? 'update' : ownership === 'mixed' ? 'merge' : 'review';
      actions.push({ action, dest, ownership, currentHash, desiredHash });
    }
  }

  if (installation.kind === 'metadata') {
    for (const [dest, record] of Object.entries(installation.metadata.files)) {
      if (desiredDests.has(dest) || !(await exists(path.join(targetDir, ...dest.split('/'))))) continue;
      actions.push({
        action: record.ownership === 'user' ? 'preserve' : 'review-remove',
        dest,
        ownership: record.ownership,
      });
    }
  }

  return {
    installation,
    frameworkVersion,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    tools,
    migrations,
    actions,
  };
}

export async function applyFrameworkUpdate({ targetDir, templatesRoot, plan }) {
  const blockers = plan.actions.filter(item => ['merge', 'review', 'review-remove'].includes(item.action));
  if (blockers.length) {
    throw new Error(`存在 ${blockers.length} 个需合并/审查项,未写入任何文件:\n${blockers.map(item => `- ${item.dest}`).join('\n')}`);
  }
  const manualMigrations = plan.migrations.filter(item => !item.automatic);
  if (manualMigrations.length) {
    throw new Error(`存在不可自动执行的 Schema 迁移: ${manualMigrations.map(item => item.id).join(', ')}`);
  }

  const vars = plan.installation.kind === 'metadata'
    ? plan.installation.metadata.templateVars
    : plan.installation.templateVars;
  const manifest = await buildManifest(templatesRoot, plan.tools);
  const sources = new Map(manifest.map(entry => [entry.dest, entry.src]));
  const candidates = [];

  for (const action of plan.actions.filter(item => item.action === 'add' || item.action === 'update')) {
    const src = sources.get(action.dest);
    if (!src) throw new Error(`升级计划缺少当前模板: ${action.dest}`);
    const destPath = resolveSafeDestination(targetDir, action.dest);
    await assertNoSymlinkPath(targetDir, destPath);
    if (action.action === 'update') {
      const current = await readFile(destPath, 'utf8');
      if (action.currentHash && hashContent(current) !== action.currentHash) {
        throw new Error(`文件在预检后发生变化,请重新 dry-run: ${action.dest}`);
      }
    }
    candidates.push({ ...action, destPath, content: render(await readFile(src, 'utf8'), vars) });
  }

  const summary = { written: [], skipped: [], imported: [], fallback: [] };
  for (const [index, item] of candidates.entries()) {
    try {
      await mkdir(path.dirname(item.destPath), { recursive: true });
      await writeFile(item.destPath, item.content, { flag: item.action === 'add' ? 'wx' : 'w' });
      summary.written.push(item.dest);
    } catch (err) {
      throw new ScaffoldError({
        phase: 'update', dest: item.dest, destPath: item.destPath, cause: err, summary,
        notWritten: candidates.slice(index).map(({ dest }) => dest),
      });
    }
  }

  const previousMetadata = plan.installation.kind === 'metadata' ? plan.installation.metadata : undefined;
  try {
    await writeFrameworkMetadata({
      targetDir,
      templatesRoot,
      frameworkVersion: plan.frameworkVersion,
      tools: plan.tools,
      projectName: vars.projectName,
      techStack: vars.techStack,
      date: vars.date,
      previousMetadata,
    });
    summary.written.push(METADATA_DEST);
  } catch (err) {
    throw new ScaffoldError({
      phase: 'update', dest: METADATA_DEST, destPath: path.join(targetDir, '.ai', 'ai-memory.json'),
      cause: err, summary, notWritten: [METADATA_DEST],
    });
  }
  return summary;
}

async function readLegacyFacts(targetDir, readme) {
  const state = await readOptional(path.join(targetDir, '.ai', 'memory', 'project-state.md')) ?? '';
  const projectName = state.match(/^- 项目:(.+)$/m)?.[1]?.trim() || path.basename(path.resolve(targetDir));
  const techStack = state.match(/^- 技术栈:(.+)$/m)?.[1]?.trim() || '(待补充)';
  const date = readme.match(/生成于 (\d{4}-\d{2}-\d{2})/)?.[1]
    || state.match(/最后更新:(\d{4}-\d{2}-\d{2})/)?.[1]
    || new Date().toISOString().slice(0, 10);
  const tools = [];
  if (await exists(path.join(targetDir, 'CLAUDE.md'))) tools.push('claude');
  if (await exists(path.join(targetDir, 'AGENTS.md'))) tools.push('codex');
  return { tools, templateVars: { projectName, techStack, date } };
}

function validateMetadata(metadata, metadataPath) {
  if (!metadata || typeof metadata !== 'object') throw new Error(`框架元数据格式无效: ${metadataPath}`);
  if (typeof metadata.frameworkVersion !== 'string' || !Number.isInteger(metadata.schemaVersion)) {
    throw new Error(`框架元数据缺少版本字段: ${metadataPath}`);
  }
  if (!Array.isArray(metadata.tools) || !metadata.templateVars || !metadata.files) {
    throw new Error(`框架元数据缺少安装基线: ${metadataPath}`);
  }
}

async function readOptional(filePath) {
  try {
    return await readFile(filePath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT' || err.code === 'ENOTDIR') return undefined;
    throw err;
  }
}

const exists = filePath => access(filePath).then(() => true, err => {
  if (err.code === 'ENOENT' || err.code === 'ENOTDIR') return false;
  throw err;
});

function compareVersions(left, right) {
  const parse = value => value.split('-', 1)[0].split('.').map(part => Number.parseInt(part, 10) || 0);
  const a = parse(left);
  const b = parse(right);
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const difference = (a[i] ?? 0) - (b[i] ?? 0);
    if (difference !== 0) return Math.sign(difference);
  }
  return 0;
}
