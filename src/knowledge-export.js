import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildHtml } from './export-html.js';
import { parseFrontmatter } from './frontmatter.js';
import { activateMermaid, extractTitle, hasMermaid, inlineImages, renderMarkdown } from './markdown.js';
import { resolveMermaid } from './mermaid-asset.js';
import { parsePoints } from './iterations.js';

export { parsePoints };

export const DEFAULT_OUT = '.ai/knowledge.html';

// README 是给写的人看的模板说明,draft 是粗稿,都不进 wiki
const SOURCES = [
  { group: '概览', files: ['.ai/knowledge/overview.md'] },
  { group: '对外入口', dir: '.ai/knowledge/entries' },
  { group: '业务领域', dir: '.ai/knowledge/domains' },
  { group: '决策记录', dir: '.ai/knowledge/decisions' },
  { group: '架构基线', dir: 'docs/architecture' },
  { group: '需求点', nested: 'docs/requirements', leaf: 'final' },
  { group: '技术设计', nested: 'docs/design' },
  { group: '迭代记录', files: ['.ai/knowledge/iterations.md'] },
  { group: '开发约定', files: ['.ai/knowledge/conventions.md'] },
];

export async function exportKnowledge({
  targetDir, out = DEFAULT_OUT, now = new Date(),
  mermaidPath, allowDownload = true, fetchImpl,
}) {
  const warnings = [];
  const pages = [];
  const seen = new Map();

  for (const source of SOURCES) {
    for (const rel of await collectFiles(targetDir, source)) {
      const body = await readFile(path.join(targetDir, ...rel.split('/')), 'utf8');
      const parsed = parseFrontmatter(body);
      const content = parsed ? parsed.rest : body;
      const html = await inlineImages(renderMarkdown(content), {
        baseDir: path.dirname(path.join(targetDir, ...rel.split('/'))),
        warnings,
      });
      pages.push({
        id: uniqueId(rel, seen),
        group: source.group,
        title: extractTitle(content, path.basename(rel, '.md')),
        source: rel,
        html,
        frontmatter: parsed ? parsed.data : {},
      });
    }
  }

  const overview = await buildOverview(targetDir, pages);

  // 只有内容里真有 mermaid 才去解析资源:没有图的项目不该为此联网,也不该背上 3.4MB
  let mermaidSource;
  if (pages.some(page => hasMermaid(page.html))) {
    const resolved = await resolveMermaid({ localPath: mermaidPath, allowDownload, fetchImpl });
    if (resolved.source) {
      mermaidSource = resolved.source;
      for (const page of pages) page.html = activateMermaid(page.html);
    } else {
      warnings.push(`${resolved.missing};图暂以代码块呈现`);
    }
  }

  const html = buildHtml({ overview, pages, generatedAt: now.toISOString().slice(0, 10), mermaidSource });
  const destination = path.resolve(targetDir, out);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, html);

  return {
    out: path.relative(path.resolve(targetDir), destination).split(path.sep).join('/'),
    pages,
    warnings,
    mermaid: Boolean(mermaidSource),
  };
}

async function collectFiles(targetDir, source) {
  const found = [];
  if (source.files) {
    for (const rel of source.files) {
      if (await exists(path.join(targetDir, ...rel.split('/')))) found.push(rel);
    }
    return found;
  }
  if (source.dir) return listMarkdown(targetDir, source.dir);
  if (source.nested) {
    for (const child of await listDirs(targetDir, source.nested)) {
      const base = source.leaf ? `${source.nested}/${child}/${source.leaf}` : `${source.nested}/${child}`;
      found.push(...(await listMarkdown(targetDir, base)));
    }
  }
  return found;
}

async function listMarkdown(targetDir, rel) {
  try {
    const entries = await readdir(path.join(targetDir, ...rel.split('/')), { withFileTypes: true });
    return entries
      .filter(entry => entry.isFile() && entry.name.endsWith('.md') && entry.name !== 'README.md')
      .map(entry => `${rel}/${entry.name}`)
      .sort();
  } catch (err) {
    if (err.code === 'ENOENT' || err.code === 'ENOTDIR') return [];
    throw err;
  }
}

async function listDirs(targetDir, rel) {
  try {
    const entries = await readdir(path.join(targetDir, ...rel.split('/')), { withFileTypes: true });
    return entries.filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
  } catch (err) {
    if (err.code === 'ENOENT' || err.code === 'ENOTDIR') return [];
    throw err;
  }
}

async function buildOverview(targetDir, pages) {
  const overviewBody = await readOptional(path.join(targetDir, '.ai', 'knowledge', 'overview.md')) ?? '';
  const iterationsBody = await readOptional(path.join(targetDir, '.ai', 'knowledge', 'iterations.md')) ?? '';
  const decisions = pages.filter(page => page.group === '决策记录');

  return {
    projectName: field(overviewBody, '项目'),
    techStack: field(overviewBody, '技术栈'),
    iteration: field(overviewBody, '当前迭代'),
    goal: field(overviewBody, '目标'),
    consumers: field(overviewBody, '主要调用方'),
    points: parsePoints(iterationsBody),
    counts: {
      entries: pages.filter(page => page.group === '对外入口').length,
      domains: pages.filter(page => page.group === '业务领域').length,
      architecture: pages.filter(page => page.group === '架构基线').length,
      requirements: pages.filter(page => page.group === '需求点').length,
      designs: pages.filter(page => page.group === '技术设计').length,
      decisions: decisions.length,
      activeDecisions: decisions.filter(page => page.frontmatter.status !== 'superseded').length,
      supersededDecisions: decisions.filter(page => page.frontmatter.status === 'superseded').length,
    },
  };
}


function field(body, label) {
  const match = body.split('\n').find(line => line.trim().startsWith(`- ${label}:`) || line.trim().startsWith(`- ${label}：`));
  return match ? match.trim().slice(`- ${label}:`.length).trim() : '';
}

function uniqueId(rel, seen) {
  const base = rel.replace(/\.md$/, '').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').toLowerCase();
  const count = (seen.get(base) ?? 0) + 1;
  seen.set(base, count);
  return count === 1 ? base : `${base}-${count}`;
}

async function exists(filePath) {
  try {
    await readFile(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readOptional(filePath) {
  try {
    return await readFile(filePath, 'utf8');
  } catch {
    return undefined;
  }
}
