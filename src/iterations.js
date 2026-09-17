// iterations.md 里有「需求点」和「需求集合」两张表,后者的表头同样是 4 列,
// 只按列数和首列筛会把它当成需求点。这里按章节定位,只读「需求点」那张表。
const SECTION = '## 需求点';

export function parsePoints(body) {
  const lines = body.split('\n');
  const start = lines.findIndex(line => line.trim() === SECTION);
  if (start < 0) return [];

  const points = [];
  for (const line of lines.slice(start + 1)) {
    const trimmed = line.trim();
    if (trimmed.startsWith('## ')) break;
    if (!trimmed.startsWith('|') || trimmed.startsWith('|---')) continue;
    const cells = trimmed.slice(1, trimmed.endsWith('|') ? -1 : undefined).split('|').map(cell => cell.trim());
    if (cells.length < 4) continue;
    if (cells[1] === '需求点' || cells[0] === '版本') continue;
    if (!cells[1] || !cells[3]) continue;
    points.push({ version: cells[0], point: cells[1], risk: cells[2], status: cells[3], note: cells[4] ?? '' });
  }
  return points;
}
