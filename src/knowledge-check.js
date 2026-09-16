import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { planKnowledgeBuild, scanKnowledge } from './knowledge-index.js';

const KNOWLEDGE = '.ai/knowledge';
const LINK = /\[[^\]]*\]\(([^)]+)\)/g;

export async function checkKnowledge({ targetDir }) {
  const problems = [];
  const { pages, skipped } = await scanKnowledge(targetDir);

  for (const item of skipped) problems.push({ kind: 'frontmatter', message: item });

  const domainNames = new Set(pages.domain.map(page => page.data.name));
  for (const entry of pages.entry) {
    for (const name of toList(entry.data.domains)) {
      if (!domainNames.has(name)) {
        problems.push({ kind: '悬空领域引用', message: `${entry.rel} — domains 指向不存在的领域「${name}」` });
      }
    }
  }

  const decisionFiles = new Set(pages.decision.map(page => page.name));
  for (const decision of pages.decision) {
    if (decision.data.status !== 'superseded') continue;
    const target = decision.data.superseded_by;
    if (!target) {
      problems.push({ kind: '悬空决策引用', message: `${decision.rel} — status 为 superseded 但缺少 superseded_by` });
    } else if (!decisionFiles.has(target)) {
      problems.push({ kind: '悬空决策引用', message: `${decision.rel} — superseded_by 指向不存在的 ${target}` });
    }
  }

  for (const rel of await listKnowledgeFiles(targetDir)) {
    const body = await readFile(path.join(targetDir, ...rel.split('/')), 'utf8');
    for (const target of extractLinks(body)) {
      const resolved = path.resolve(path.dirname(path.join(targetDir, ...rel.split('/'))), target);
      if (!(await exists(resolved))) {
        problems.push({ kind: '内部断链', message: `${rel} — 链接指向不存在的 ${target}` });
      }
    }
  }

  try {
    const plan = await planKnowledgeBuild({ targetDir });
    if (plan.changes.length) {
      problems.push({
        kind: '索引过期',
        message: `${plan.changes.length} 个生成区块与当前 frontmatter 不一致,运行 ai-memory kb build 重新生成`,
      });
    }
  } catch (err) {
    problems.push({ kind: '索引过期', message: err.message });
  }

  return {
    problems,
    counted: { entry: pages.entry.length, domain: pages.domain.length, decision: pages.decision.length },
  };
}

export function extractLinks(body) {
  const targets = [];
  let inFence = false;
  for (const line of body.split('\n')) {
    if (line.trimStart().startsWith('```')) { inFence = !inFence; continue; }
    if (inFence) continue;
    for (const match of line.matchAll(LINK)) {
      const raw = match[1].trim().split(' ')[0];
      if (!raw || /^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith('#')) continue;
      const withoutAnchor = raw.split('#')[0];
      if (withoutAnchor) targets.push(withoutAnchor);
    }
  }
  return targets;
}

async function listKnowledgeFiles(targetDir) {
  const root = path.join(targetDir, ...KNOWLEDGE.split('/'));
  const out = [];
  await walk(root, '');
  return out;

  async function walk(dir, prefix) {
    let dirents;
    try {
      dirents = await readdir(dir, { withFileTypes: true });
    } catch (err) {
      if (err.code === 'ENOENT' || err.code === 'ENOTDIR') return;
      throw err;
    }
    for (const dirent of dirents) {
      const rel = prefix ? `${prefix}/${dirent.name}` : dirent.name;
      if (dirent.isDirectory()) await walk(path.join(dir, dirent.name), rel);
      else if (dirent.name.endsWith('.md')) out.push(`${KNOWLEDGE}/${rel}`);
    }
  }
}

async function exists(filePath) {
  try {
    await readFile(filePath);
    return true;
  } catch (err) {
    if (err.code === 'EISDIR') return true;
    if (err.code === 'ENOENT' || err.code === 'ENOTDIR') return false;
    throw err;
  }
}

function toList(value) {
  if (Array.isArray(value)) return value;
  return value ? [value] : [];
}
