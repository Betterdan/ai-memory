export class GeneratedBlockError extends Error {
  constructor(message) {
    super(message);
    this.name = 'GeneratedBlockError';
  }
}

export const startMarker = name => `<!-- ai-memory:generated:${name}:start -->`;
export const endMarker = name => `<!-- ai-memory:generated:${name}:end -->`;

export function hasGeneratedBlock(content, name) {
  try {
    locate(content, name);
    return true;
  } catch (err) {
    if (err instanceof GeneratedBlockError) return false;
    throw err;
  }
}

export function readGeneratedBlock(content, name) {
  const { inner } = locate(content, name);
  return content.slice(inner.start, inner.end);
}

export function replaceGeneratedBlock(content, name, replacement) {
  const { inner } = locate(content, name);
  const eol = content.includes('\r\n') ? '\r\n' : '\n';
  const body = replacement.trim().length
    ? `${eol}${normalizeEol(replacement.trim(), eol)}${eol}`
    : eol;
  return content.slice(0, inner.start) + body + content.slice(inner.end);
}

function locate(content, name) {
  if (typeof content !== 'string') throw new GeneratedBlockError('内容必须是字符串');
  if (!/^[a-z0-9-]+$/.test(name)) throw new GeneratedBlockError(`生成区块名无效: ${name}`);
  const open = startMarker(name);
  const close = endMarker(name);
  const starts = occurrences(content, open);
  const ends = occurrences(content, close);
  if (starts.length !== 1 || ends.length !== 1) {
    throw new GeneratedBlockError(`必须且只能包含一组 ai-memory generated 标记: ${name}`);
  }
  const innerStart = starts[0] + open.length;
  const innerEnd = ends[0];
  if (innerEnd < innerStart) throw new GeneratedBlockError(`生成区块标记顺序无效: ${name}`);
  return { inner: { start: innerStart, end: innerEnd } };
}

function occurrences(content, token) {
  const positions = [];
  let offset = 0;
  while (offset < content.length) {
    const index = content.indexOf(token, offset);
    if (index === -1) break;
    positions.push(index);
    offset = index + token.length;
  }
  return positions;
}

function normalizeEol(content, eol) {
  return content.replace(/\r?\n/g, eol);
}
