// 极简 frontmatter 解析:只支持标量与字符串数组,不引第三方依赖。
// knowledge-index 与 gate-contract 共用,避免两处各写一份解析。
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
