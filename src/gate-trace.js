import { lstatSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { itemLines, sectionMap } from './gate-ready.js';
import { parsePoints } from './iterations.js';
import { assertNoSymlinkPath, resolveSafeDestination } from './path-safety.js';

export function checkTrace(body, { fileExists = () => false } = {}) {
  const sections = sectionMap(body);
  const numbered = itemLines(sections['验收标准'] || '')
    .map(line => line.match(/\bAC-\d+\b/i)?.[0]?.toUpperCase());
  const ids = numbered.filter(Boolean);
  if (!ids.length) return [];
  const failures = [];
  const missing = numbered.length - ids.length;
  if (missing) failures.push(`${missing} 条验收标准缺少 AC 编号`);
  for (const id of new Set(ids)) {
    if (ids.filter(value => value === id).length > 1) failures.push(`${id} 重复`);
  }
  const records = new Map();
  for (const line of (sections['验收记录'] || '').split('\n')) {
    const cells = line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => cell.trim());
    if (!/^AC-\d+$/i.test(cells[0] || '')) continue;
    const id = cells[0].toUpperCase();
    if (records.has(id)) failures.push(`${id} 的验收记录重复`);
    records.set(id, cells);
    if (!ids.includes(id)) failures.push(`${id} 不在验收标准里`);
  }
  for (const id of new Set(ids)) {
    const record = records.get(id);
    if (!record) { failures.push(`${id} 没有验收记录`); continue; }
    const evidence = record[1] || '';
    if (!evidence) failures.push(`${id} 缺少证据`);
    if (record[2] !== '通过') failures.push(`${id} 的结果不是「通过」`);
    for (const match of evidence.matchAll(/`([^`]+)`/g)) {
      if (!fileExists(match[1])) failures.push(`${id} 引用的 ${match[1]} 不存在`);
    }
  }
  return failures;
}

function safeFileExists(targetDir, rel) {
  try {
    const full = resolveSafeDestination(targetDir, rel);
    let current = path.resolve(targetDir);
    for (const part of path.relative(current, full).split(path.sep)) {
      current = path.join(current, part);
      if (lstatSync(current).isSymbolicLink()) return false;
    }
    return lstatSync(full).isFile();
  } catch { return false; }
}

export async function gateTrace({ targetDir }) {
  let body;
  try { body = await readFile(path.join(targetDir, '.ai/knowledge/iterations.md'), 'utf8'); }
  catch (err) { if (err.code === 'ENOENT') return { results: [], blocked: [] }; throw err; }
  const points = parsePoints(body).filter(item => ['accepted', 'done'].includes(item.status));
  const results = [];
  for (const point of points) {
    // 需求点名称是文件名,不能用于访问项目目录以外的路径。
    if ([point.point, point.version].some(value => !value || /[\\/]/.test(value) || value === '.' || value === '..')) {
      results.push({ point: point.point, file: null, failures: ['需求点名称或版本不是有效路径段'] });
      continue;
    }
    const rel = `docs/requirements/${point.version}/final/${point.point}.md`;
    const file = resolveSafeDestination(targetDir, rel);
    let text;
    try {
      await assertNoSymlinkPath(targetDir, file);
      text = await readFile(file, 'utf8');
    } catch (err) {
      if (!['ENOENT', 'ENOTDIR'].includes(err.code)) throw err;
      results.push({ point: point.point, file: null, failures: [`找不到定稿 ${rel}`] });
      continue;
    }
    results.push({ point: point.point, file: rel, failures: checkTrace(text, { fileExists: rel => safeFileExists(targetDir, rel) }) });
  }
  return { results, blocked: results.filter(item => item.failures.length) };
}
