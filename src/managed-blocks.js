export const MANAGED_BLOCK_START = '<!-- ai-memory:managed:start -->';
export const MANAGED_BLOCK_END = '<!-- ai-memory:managed:end -->';

const MANAGED_BLOCK_FILES = new Set(['AGENTS.md', 'CLAUDE.md']);

export class ManagedBlockError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ManagedBlockError';
  }
}

export function isManagedBlockFile(dest) {
  return MANAGED_BLOCK_FILES.has(dest);
}

export function replaceManagedBlock(current, desired) {
  const currentBlock = locateManagedBlock(current, '当前文件');
  const desiredBlock = locateManagedBlock(desired, '新版模板');
  const eol = current.includes('\r\n') ? '\r\n' : '\n';
  const replacement = normalizeEol(desired.slice(desiredBlock.start, desiredBlock.end), eol);
  return current.slice(0, currentBlock.start) + replacement + current.slice(currentBlock.end);
}

export function adoptManagedBlock(current, desired) {
  const markers = [MANAGED_BLOCK_START, MANAGED_BLOCK_END, '<!-- ai-memory:user:start -->', '<!-- ai-memory:user:end -->'];
  if (markers.some(marker => current.includes(marker))) {
    throw new ManagedBlockError('已有 ai-memory 区块标记,请人工核对入口文件');
  }
  const { start, end } = locateManagedBlock(desired, '模板');
  const eol = current.includes('\r\n') ? '\r\n' : '\n';
  const bom = current.startsWith('\ufeff') ? '\ufeff' : '';
  let original = current.slice(bom.length);
  let prefix = bom;
  const opening = /^---[ \t]*\r?\n/.exec(original);
  if (opening) {
    const closing = /^(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/m.exec(original.slice(opening[0].length));
    if (!closing) throw new ManagedBlockError('入口 frontmatter 未闭合,请人工核对');
    const headerEnd = opening[0].length + closing.index + closing[0].length;
    const header = original.slice(0, headerEnd);
    prefix += header + (header.endsWith('\n') ? '' : eol) + eol;
    original = original.slice(headerEnd);
  }
  const separator = original.endsWith('\n') || !original ? '' : eol;
  return prefix + normalizeEol(desired.slice(start, end), eol) + eol + eol
    + markers[2] + eol + original + separator + markers[3] + eol;
}

export function hasValidManagedBlock(content) {
  try {
    locateManagedBlock(content, '文件');
    return true;
  } catch (err) {
    if (err instanceof ManagedBlockError) return false;
    throw err;
  }
}

function locateManagedBlock(content, label) {
  if (typeof content !== 'string') throw new ManagedBlockError(`${label}内容必须是字符串`);
  const starts = occurrences(content, MANAGED_BLOCK_START);
  const ends = occurrences(content, MANAGED_BLOCK_END);
  if (starts.length !== 1 || ends.length !== 1) {
    throw new ManagedBlockError(`${label}必须且只能包含一组 ai-memory managed 标记`);
  }
  const start = starts[0];
  const end = ends[0] + MANAGED_BLOCK_END.length;
  if (end <= start) throw new ManagedBlockError(`${label}的 ai-memory managed 标记顺序无效`);
  return { start, end };
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
