import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildHtml } from './export-html.js';
import { parseFrontmatter } from './frontmatter.js';
import { activateMermaid, extractTitle, hasMermaid, inlineImages, renderMarkdown } from './markdown.js';
import { resolveMermaid } from './mermaid-asset.js';
import { parsePoints } from './iterations.js';
import { assertNoSymlinkPath } from './path-safety.js';
import { wikiLinks } from './wiki-links.js';

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
  { group: '开发规则', tree: '.ai/knowledge/rules' },
  { group: '接入资料', tree: 'docs/adoption' },
  { group: '项目 Wiki', tree: 'docs/wiki', groupByFolder: true },
];

export async function exportKnowledge({
  targetDir, out = DEFAULT_OUT, now = new Date(),
  mermaidPath, allowDownload = true, fetchImpl,
}) {
  const warnings = [];
  const pages = [];
  const seen = new Set();
  const destination = path.resolve(targetDir, out);

  for (const source of SOURCES) {
    for (const rel of await collectFiles(targetDir, source)) {
      const folder = source.groupByFolder
        ? path.posix.relative(source.tree, path.posix.dirname(rel)).split('/').slice(0, 2).join(' / ')
        : '';
      pages.push({
        id: uniqueId(rel, seen),
        group: folder ? `${source.group} · ${folder}` : source.group,
        source: rel,
      });
    }
  }

  const links = wikiLinks(pages, { targetDir, destination });
  for (const page of pages) {
    const sourcePath = path.join(targetDir, ...page.source.split('/'));
    const body = await readFile(sourcePath, 'utf8');
    const parsed = parseFrontmatter(body);
    const content = parsed ? parsed.rest : body;
    page.title = extractTitle(content, path.posix.basename(page.source).replace(/\.md$/i, ''));
    page.frontmatter = parsed ? parsed.data : {};
    const rendered = content.trim() ? renderMarkdown(content, {
      pageId: page.id,
      link: href => links.markdown(page, href),
      wikiLink: page.source.startsWith('docs/wiki/') ? target => links.obsidian(page, target) : undefined,
    }) : '<p class="muted">此文档暂无正文。</p>';
    page.html = await inlineImages(rendered, { baseDir: path.dirname(sourcePath), warnings });
  }
  if (links.unresolved.size) {
    const sample = [...links.unresolved].slice(0, 8).join('、');
    warnings.push(`项目 Wiki 中 ${links.unresolved.size} 个双链目标不存在或不唯一，已保留文字：${sample}`);
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
  if (source.tree) {
    await assertNoSymlinkPath(targetDir, path.join(targetDir, source.tree));
    return listMarkdownTree(targetDir, source.tree);
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

async function listMarkdownTree(targetDir, rel) {
  let entries;
  try {
    entries = await readdir(path.join(targetDir, ...rel.split('/')), { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT' || err.code === 'ENOTDIR') return [];
    throw err;
  }
  const found = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const child = `${rel}/${entry.name}`;
    if (entry.isDirectory()) found.push(...await listMarkdownTree(targetDir, child));
    else if (entry.isFile() && /\.md$/i.test(entry.name)) found.push(child);
  }
  return found.sort();
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
      wiki: pages.filter(page => page.source.startsWith('docs/wiki/')).length,
    },
  };
}


function field(body, label) {
  const match = body.split('\n').find(line => line.trim().startsWith(`- ${label}:`) || line.trim().startsWith(`- ${label}：`));
  return match ? match.trim().slice(`- ${label}:`.length).trim() : '';
}

function uniqueId(rel, seen) {
  const base = rel.replace(/\.md$/i, '').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').toLowerCase();
  let id = base;
  for (let index = 2; seen.has(id); index++) id = `${base}-${index}`;
  seen.add(id);
  return id;
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
