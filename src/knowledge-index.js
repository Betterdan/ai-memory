import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { hasGeneratedBlock, readGeneratedBlock, replaceGeneratedBlock } from './generated-blocks.js';
import { assertNoSymlinkPath, resolveSafeDestination } from './path-safety.js';

const KNOWLEDGE = '.ai/knowledge';
const OVERVIEW = `${KNOWLEDGE}/overview.md`;
const ENTRIES_INDEX = 'entries-index';
const DOMAINS_INDEX = 'domains-index';
const RELATED_ENTRIES = 'related-entries';
const RELATED_CONTRACTS = 'related-contracts';

const REQUIRED = {
  entry: ['group', 'form', 'summary'],
  domain: ['name', 'summary'],
  decision: ['status', 'date'],
};

export function parseFrontmatter(body) {
  if (!body.startsWith('---')) return null;
  const lines = body.split('\n');
  if (lines[0].trim() !== '---') return null;
  const end = lines.findIndex((line, index) => index > 0 && line.trim() === '---');
  if (end < 0) return null;

  const data = {};
  for (const line of lines.slice(1, end)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf(':');
    if (separator <= 0) return null;
    const key = trimmed.slice(0, separator).trim();
    const raw = trimmed.slice(separator + 1).trim();
    if (!/^[a-z][a-z0-9_]*$/.test(key)) return null;
    data[key] = parseValue(raw);
  }
  return { data, rest: lines.slice(end + 1).join('\n') };
}

function parseValue(raw) {
  if (raw.startsWith('[') && raw.endsWith(']')) {
    return raw.slice(1, -1).split(',').map(unquote).filter(Boolean);
  }
  return unquote(raw);
}

function unquote(value) {
  const trimmed = value.trim();
  if (trimmed.length >= 2 && (trimmed.startsWith('"') || trimmed.startsWith("'"))) {
    if (trimmed[0] === trimmed[trimmed.length - 1]) return trimmed.slice(1, -1);
  }
  return trimmed;
}

export async function scanKnowledge(targetDir) {
  const pages = { entry: [], domain: [], decision: [] };
  const skipped = [];
  for (const kind of ['entries', 'domains', 'decisions']) {
    const dir = path.join(targetDir, ...KNOWLEDGE.split('/'), kind);
    for (const name of await listMarkdown(dir)) {
      if (name === 'README.md') continue;
      const rel = `${KNOWLEDGE}/${kind}/${name}`;
      const parsed = parseFrontmatter(await readFile(path.join(dir, name), 'utf8'));
      if (!parsed) { skipped.push(`${rel} — 缺少 frontmatter`); continue; }
      const type = parsed.data.type;
      if (!REQUIRED[type]) { skipped.push(`${rel} — type 无效或缺失`); continue; }
      const missing = REQUIRED[type].filter(field => !parsed.data[field]);
      if (missing.length) { skipped.push(`${rel} — 缺少字段 ${missing.join('、')}`); continue; }
      pages[type].push({ rel, file: `${kind}/${name}`, name, data: parsed.data });
    }
  }
  for (const list of Object.values(pages)) list.sort((a, b) => (a.rel < b.rel ? -1 : 1));
  return { pages, skipped };
}

export async function planKnowledgeBuild({ targetDir }) {
  const { pages, skipped } = await scanKnowledge(targetDir);
  const changes = [];

  const overviewPath = resolveSafeDestination(targetDir, OVERVIEW);
  const overview = await readOptional(overviewPath);
  if (overview === undefined) throw new Error(`缺少 ${OVERVIEW};请先运行 ai-memory update --yes`);

  const entryRows = pages.entry.map(page =>
    `| ${page.data.group} | ${page.data.summary} | [${page.name}](entries/${page.name}) |`);
  const domainRows = pages.domain.map(page =>
    `| ${page.data.name} | ${page.data.summary} | [${page.name}](domains/${page.name}) |`);

  addBlockChange(changes, OVERVIEW, overview, ENTRIES_INDEX, table(['入口分组', '说明', '页面'], entryRows));
  addBlockChange(changes, OVERVIEW, overview, DOMAINS_INDEX, table(['领域', '说明', '页面'], domainRows));

  for (const domain of pages.domain) {
    const dest = domain.rel;
    const body = await readFile(resolveSafeDestination(targetDir, dest), 'utf8');
    const related = pages.entry.filter(entry => toList(entry.data.domains).includes(domain.data.name));
    const rows = related.map(entry => `| ${entry.data.group} | [${entry.name}](../entries/${entry.name}) |`);
    const contracts = [...new Set(related.map(entry => entry.data.contract).filter(Boolean))].sort();
    addBlockChange(changes, dest, body, RELATED_ENTRIES, table(['入口分组', '页面'], rows));
    addBlockChange(changes, dest, body, RELATED_CONTRACTS, contracts.length
      ? contracts.map(contract => `- \`${contract}\``).join('\n')
      : '（无）');
  }

  return { changes, skipped };
}

export async function applyKnowledgeBuild({ targetDir, plan }) {
  const written = [];
  const byFile = new Map();
  for (const change of plan.changes) {
    if (!byFile.has(change.dest)) byFile.set(change.dest, []);
    byFile.get(change.dest).push(change);
  }
  for (const [dest, changes] of byFile) {
    const destPath = resolveSafeDestination(targetDir, dest);
    await assertNoSymlinkPath(targetDir, destPath);
    let body = await readFile(destPath, 'utf8');
    for (const change of changes) body = replaceGeneratedBlock(body, change.block, change.content);
    await writeFile(destPath, body);
    written.push(dest);
  }
  return { written, skipped: plan.skipped };
}

function addBlockChange(changes, dest, body, block, content) {
  if (!hasGeneratedBlock(body, block)) return;
  if (readGeneratedBlock(body, block).trim() === content.trim()) return;
  changes.push({ dest, block, content });
}

function table(headers, rows) {
  return [`| ${headers.join(' | ')} |`, `|${headers.map(() => '---').join('|')}|`, ...rows].join('\n');
}

function toList(value) {
  if (Array.isArray(value)) return value;
  return value ? [value] : [];
}

async function listMarkdown(dir) {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries.filter(entry => entry.isFile() && entry.name.endsWith('.md')).map(entry => entry.name).sort();
  } catch (err) {
    if (err.code === 'ENOENT' || err.code === 'ENOTDIR') return [];
    throw err;
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
