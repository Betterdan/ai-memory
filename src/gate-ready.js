import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const ITERATIONS = '.ai/knowledge/iterations.md';
const REQUIREMENTS = 'docs/requirements';
const SECTIONS = ['目标', '范围', '外部行为契约', '验收标准', '开放问题', '实现交接'];
const UNRESOLVED = ['TBD', 'tbd', '待定', '???', '??'];
const CONTRACT_MARKS = ['契约 diff 已确认', '不涉及对外接口', '不涉及对外可观察接口'];
const OPEN_OK = ['已确认', '假设', '不阻塞'];
const EMPTY_MARKS = ['无', '(无)', '（无）', '没有'];
// hook 不拦截这些前缀:需求没写好时要能去修需求,挡住就死锁
export const HOOK_ALLOWED_PREFIXES = ['.ai/', 'docs/'];

export async function gateReady({ targetDir, point }) {
  const points = point ? [point] : await inProgressPoints(targetDir);
  const results = [];
  for (const name of points) {
    const located = await locateFinal(targetDir, name);
    if (located.error) {
      results.push({ point: name, file: null, failures: [located.error] });
      continue;
    }
    const body = await readFile(path.join(targetDir, ...located.rel.split('/')), 'utf8');
    results.push({ point: name, file: located.rel, failures: checkReadiness(body) });
  }
  return { results, blocked: results.filter(item => item.failures.length) };
}

export function checkReadiness(body) {
  const failures = [];
  const sections = sectionMap(body);

  if (!sections['目标'] || !sections['目标'].trim()) {
    failures.push('就绪标准 1:缺少「目标」章节或内容为空');
  }

  const acceptance = sections['验收标准'];
  if (!acceptance || !itemLines(acceptance).length) {
    failures.push('就绪标准 2:「验收标准」章节缺失或没有任何条目');
  } else {
    const marker = UNRESOLVED.find(word => acceptance.includes(word));
    if (marker) failures.push(`就绪标准 2:验收标准里仍有未决标记「${marker}」`);
  }

  if (!sections['范围']) failures.push('就绪标准 3:缺少「范围」章节');
  else if (!sections['范围'].includes('不做')) failures.push('就绪标准 3:「范围」没有写明本次不做什么');

  if (!CONTRACT_MARKS.some(mark => body.includes(mark))) {
    failures.push(`就绪标准 4:未声明接口契约状态,需出现 ${CONTRACT_MARKS.map(m => `「${m}」`).join(' 或 ')} 之一`);
  }

  const open = sections['开放问题'];
  if (open === undefined) failures.push('就绪标准 5:缺少「开放问题」章节');
  else {
    const items = itemLines(open);
    const declaredEmpty = items.length === 0
      || EMPTY_MARKS.some(mark => open.trim() === mark || open.trim() === `- ${mark}`);
    const dangling = declaredEmpty ? [] : items.filter(line => !OPEN_OK.some(word => line.includes(word)));
    if (dangling.length) {
      failures.push(`就绪标准 5:${dangling.length} 条开放问题未标注已确认/假设/不阻塞`);
    }
  }

  const handoff = sections['实现交接'];
  if (!handoff) failures.push('就绪标准 6:缺少「实现交接」章节');
  else if (!/风险等级|风险[:：]/.test(handoff)) failures.push('就绪标准 6:「实现交接」未写明风险等级');

  return failures;
}

export function contractDeclaration(body) {
  if (body.includes('不涉及对外接口') || body.includes('不涉及对外可观察接口')) return 'not-applicable';
  if (body.includes('契约 diff 已确认')) return 'confirmed';
  return null;
}

export async function inProgressPoints(targetDir) {
  const body = await readOptional(path.join(targetDir, ...ITERATIONS.split('/')));
  if (body === undefined) return [];
  const points = [];
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|') || trimmed.startsWith('|---')) continue;
    const cells = trimmed.slice(1, trimmed.endsWith('|') ? -1 : undefined).split('|').map(cell => cell.trim());
    if (cells.length < 4 || cells[1] === '需求点') continue;
    if (cells[3] === 'in-progress' && cells[1]) points.push(cells[1]);
  }
  return points;
}

export async function locateFinal(targetDir, point) {
  const root = path.join(targetDir, ...REQUIREMENTS.split('/'));
  let versions;
  try {
    versions = (await readdir(root, { withFileTypes: true }))
      .filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
  } catch (err) {
    if (err.code === 'ENOENT' || err.code === 'ENOTDIR') return { error: `找不到 ${REQUIREMENTS}/` };
    throw err;
  }
  const matches = [];
  for (const version of versions) {
    const rel = `${REQUIREMENTS}/${version}/final/${point}.md`;
    if ((await readOptional(path.join(targetDir, ...rel.split('/')))) !== undefined) matches.push(rel);
  }
  if (!matches.length) return { error: `需求点已标为 in-progress,但找不到定稿 ${REQUIREMENTS}/<版本>/final/${point}.md` };
  if (matches.length > 1) return { error: `多个版本目录下都有 ${point}.md:${matches.join('、')}` };
  return { rel: matches[0] };
}

function sectionMap(body) {
  const lines = body.split('\n');
  const marks = [];
  lines.forEach((line, index) => {
    const text = line.trim();
    const structural = /^#{1,6}\s/.test(text) || /^([-*]\s*)?\*\*[^*]+\*\*/.test(text) || /^\|\s*\*\*/.test(text);
    if (!structural) return;
    const name = SECTIONS.find(candidate => text.includes(candidate));
    if (name) marks.push({ name, index });
  });
  const out = {};
  marks.forEach((mark, position) => {
    const end = position + 1 < marks.length ? marks[position + 1].index : lines.length;
    if (out[mark.name] === undefined) out[mark.name] = lines.slice(mark.index + 1, end).join('\n');
  });
  return out;
}

function itemLines(text) {
  return text.split('\n').map(line => line.trim())
    .filter(line => /^([-*]\s|\d+\.\s|\|)/.test(line) && !line.startsWith('|---') && line.length > 3);
}

export function isHookAllowedPath(filePath) {
  if (!filePath) return false;
  const normalized = filePath.split(path.sep).join('/');
  return HOOK_ALLOWED_PREFIXES.some(prefix => normalized.includes(`/${prefix}`) || normalized.startsWith(prefix));
}

async function readOptional(filePath) {
  try {
    return await readFile(filePath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT' || err.code === 'ENOTDIR' || err.code === 'EISDIR') return undefined;
    throw err;
  }
}
