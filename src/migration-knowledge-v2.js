import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

export const SOURCE = '.ai/memory/project-state.md';
export const OVERVIEW = '.ai/knowledge/overview.md';
export const ITERATIONS = '.ai/knowledge/iterations.md';
const ARCHIVE = '.ai/memory/archive/project-state.md';
const FEATURES = '.ai/memory/features';
const PENDING_TITLE = '## 待整理(迁移自 project-state.md)';

const PLACEHOLDERS = new Set(['', '(无)', '(session-log 超长时压缩至此)']);

export async function planKnowledgeLayerV2({ targetDir, metadata }) {
  const notices = [];
  const changes = [];
  const features = await listFeatures(targetDir);
  const source = await readOptional(path.join(targetDir, ...SOURCE.split('/')));
  const parsed = source === undefined ? null : parseProjectState(source);

  if (parsed === null) notices.push('未发现 .ai/memory/project-state.md,跳过内容搬迁。');
  else notices.push(...parsed.notices);

  if (parsed || features.length) {
    const overview = await mergeInto({
      targetDir, metadata, dest: OVERVIEW, merge: body => mergeOverview(body, parsed, features),
    });
    changes.push(overview);

    if (parsed) {
      const iterations = await mergeInto({
        targetDir, metadata, dest: ITERATIONS, merge: body => mergeIterations(body, parsed),
      });
      changes.push(iterations);
      if (settled(overview) && settled(iterations)) {
        changes.push({ kind: 'archive', dest: SOURCE, to: ARCHIVE, reason: '内容已并入 overview 与 iterations' });
      } else {
        notices.push('目标已被用户改造或无需变更,project-state.md 保持原位,请手工并入。');
      }
    }
  }

  if (features.length) {
    notices.push(`${features.length} 份 features 档案原地保留,需按 .ai/skills/knowledge-structure.md 人工归类:`);
    for (const name of features) notices.push(`  ${FEATURES}/${name}`);
  }
  return { changes, notices };
}

function settled(change) {
  return change.kind === 'write' || change.kind === 'noop';
}

async function mergeInto({ targetDir, metadata, dest, merge }) {
  const current = await readOptional(path.join(targetDir, ...dest.split('/')));
  if (current === undefined) return { kind: 'skip', dest, reason: '目标不存在,请先运行 ai-memory update --yes' };
  const content = merge(current);
  if (content === current) return { kind: 'noop', dest, reason: '已是目标状态,无需变更' };
  const baseline = metadata?.files?.[dest]?.sha256;
  if (baseline && sha256(current) !== baseline) {
    return { kind: 'skip', dest, reason: '目标已被用户修改,不覆盖;请手工并入' };
  }
  return { kind: 'write', dest, content, reason: '并入 project-state.md 的内容' };
}

function mergeOverview(body, parsed, features) {
  let next = body;
  if (parsed) {
    next = replaceValue(next, /^- 项目[:：].*$/m, '- 项目:', parsed.projectName);
    next = replaceValue(next, /^- 技术栈[:：].*$/m, '- 技术栈:', parsed.techStack);
    next = replaceValue(next, /^- 当前迭代[:：].*$/m, '- 当前迭代:', parsed.iteration);
  }
  if (features.length) {
    next = appendRows(next, '## 已知遗留问题', [
      `| ${features.length} 份 features 档案待归类 | 知识分散在两处 | 按 .ai/skills/knowledge-structure.md 归类后删除原文件 |`,
    ]);
  }
  if (parsed?.pendingOverview) next = appendPending(next, parsed.pendingOverview);
  return next;
}

function mergeIterations(body, parsed) {
  let next = appendRows(body, '## 需求点', parsed.rows);
  if (parsed.pendingIterations) next = appendPending(next, parsed.pendingIterations);
  return next;
}

function parseProjectState(body) {
  const notices = [];
  const progress = section(body, '需求进度');
  const { rows, unparsed } = parseProgressRows(progress);
  if (unparsed.length) notices.push('需求进度表有列数不符的行,已整块搬入「待整理」区,未丢弃。');

  const issues = section(body, '已知遗留问题');
  const archived = section(body, '归档的 session 摘要');
  const overviewLeftover = meaningful(issues) ? `### 原「已知遗留问题」\n\n${issues.trim()}` : '';
  const iterationLeftover = [
    meaningful(archived) ? `### 原「归档的 session 摘要」\n\n${archived.trim()}` : '',
    unparsed.length ? `### 未能解析的需求进度行\n\n${unparsed.join('\n')}` : '',
  ].filter(Boolean).join('\n\n');

  return {
    projectName: capture(body, /^- 项目[:：]\s*(.+)$/m),
    techStack: capture(body, /^- 技术栈[:：]\s*(.+)$/m),
    iteration: capture(body, /^- 当前迭代[:：]\s*(.+)$/m),
    rows,
    pendingOverview: overviewLeftover,
    pendingIterations: iterationLeftover,
    notices,
  };
}

function parseProgressRows(text) {
  const rows = [];
  const unparsed = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) continue;
    if (trimmed.startsWith('|---') || trimmed.includes('需求点') || trimmed.includes('| 需求 |')) continue;
    const cells = trimmed.slice(1, trimmed.endsWith('|') ? -1 : undefined).split('|').map(cell => cell.trim());
    if (cells.every(cell => cell === '')) continue;
    if (cells.length === 5) rows.push(`| ${cells.join(' | ')} |`);
    else if (cells.length === 4) rows.push(`| ${cells[0]} | ${cells[1]} |  | ${cells[2]} | ${cells[3]} |`);
    else unparsed.push(trimmed);
  }
  return { rows, unparsed };
}

function section(body, heading) {
  const lines = body.split('\n');
  const start = lines.findIndex(line => line.trim() === `## ${heading}`);
  if (start < 0) return '';
  const rest = lines.slice(start + 1);
  const end = rest.findIndex(line => line.startsWith('## '));
  return (end < 0 ? rest : rest.slice(0, end)).join('\n');
}

function appendRows(body, heading, rows) {
  const missing = rows.filter(row => !body.includes(row));
  if (!missing.length) return body;
  const lines = body.split('\n');
  const start = lines.findIndex(line => line.trim() === heading);
  if (start < 0) return body;
  let separator = -1;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (lines[i].startsWith('## ')) break;
    if (lines[i].trim().startsWith('|---')) { separator = i; break; }
  }
  if (separator < 0) return body;
  lines.splice(separator + 1, 0, ...missing);
  return lines.join('\n');
}

function appendPending(body, text) {
  if (!text.trim() || body.includes(text.trim())) return body;
  return `${body.replace(/\s+$/, '')}\n\n${PENDING_TITLE}\n\n${text.trim()}\n`;
}

function replaceValue(body, pattern, prefix, value) {
  if (!value || !pattern.test(body)) return body;
  return body.replace(pattern, `${prefix}${value}`);
}

function capture(body, pattern) {
  return body.match(pattern)?.[1]?.trim() ?? '';
}

function meaningful(text) {
  return !PLACEHOLDERS.has(text.trim());
}

function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

async function listFeatures(targetDir) {
  try {
    const entries = await readdir(path.join(targetDir, ...FEATURES.split('/')), { withFileTypes: true });
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
    if (err.code === 'ENOENT' || err.code === 'ENOTDIR' || err.code === 'EISDIR') return undefined;
    throw err;
  }
}
