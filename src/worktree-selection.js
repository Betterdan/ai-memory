import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parsePoints } from './iterations.js';
import { assertNoSymlinkPath } from './path-safety.js';

const SELECTION = '.ai/runs/active-point.json';

export function selectionError(message) {
  const error = new Error(message);
  error.code = 'ACTIVE_POINT_INVALID';
  return error;
}

export async function readSelection(targetDir) {
  const file = path.join(targetDir, ...SELECTION.split('/'));
  try {
    await assertNoSymlinkPath(targetDir, file);
    const data = JSON.parse(await readFile(file, 'utf8'));
    if (typeof data.point !== 'string' || !data.point.trim() || /[\\/\r\n]/.test(data.point)) throw new Error('需求点名称无效');
    return data.point;
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw selectionError(`活动需求配置无效: ${err.message}`);
  }
}

export async function selectPoint(targetDir, point) {
  if (!point || /[\\/\r\n]/.test(point)) throw selectionError('需求点名称无效');
  const list = await readFile(path.join(targetDir, '.ai', 'knowledge', 'iterations.md'), 'utf8');
  const matches = parsePoints(list).filter(item => item.point === point);
  if (matches.length !== 1 || matches[0].status !== 'in-progress') {
    throw selectionError('活动需求必须是唯一的 in-progress 需求点');
  }
  const file = path.join(targetDir, ...SELECTION.split('/'));
  await assertNoSymlinkPath(targetDir, file);
  await mkdir(path.dirname(file), { recursive: true });
  await assertNoSymlinkPath(targetDir, file);
  await writeFile(file, JSON.stringify({ point }, null, 2) + '\n');
}

export async function clearSelection(targetDir) {
  const file = path.join(targetDir, ...SELECTION.split('/'));
  await assertNoSymlinkPath(targetDir, file);
  try { await unlink(file); } catch (err) { if (err.code !== 'ENOENT') throw err; }
}
