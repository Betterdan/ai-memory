import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// 固定版本与哈希:浮动版本等于把产物交给 CDN 决定,哈希不符一律拒绝并降级
export const MERMAID = Object.freeze({
  version: '11.17.2',
  url: 'https://cdn.jsdelivr.net/npm/mermaid@11.17.2/dist/mermaid.min.js',
  sha256: '581ed7d74bd9048d0e3a91363927d72ef22942d7722546b27f7cc29e35390eb8',
});

export function cacheDir() {
  if (process.env.AI_MEMORY_CACHE) return process.env.AI_MEMORY_CACHE;
  if (process.env.XDG_CACHE_HOME) return path.join(process.env.XDG_CACHE_HOME, 'ai-memory');
  return path.join(os.homedir(), '.cache', 'ai-memory');
}

export function cacheFile() {
  return path.join(cacheDir(), `mermaid-${MERMAID.version}.min.js`);
}

export function digest(source) {
  return createHash('sha256').update(source).digest('hex');
}

// expectedDigest 只供测试注入;生产路径不传,一律用固定哈希
export async function resolveMermaid({
  localPath, allowDownload = true, fetchImpl = fetch, expectedDigest = MERMAID.sha256,
} = {}) {
  if (localPath) {
    try {
      const source = await readFile(localPath, 'utf8');
      return { source, from: `本地文件 ${localPath}` };
    } catch {
      return { missing: `指定的 mermaid 文件读不到:${localPath}` };
    }
  }

  const cached = await readOptional(cacheFile());
  if (cached !== undefined) {
    if (digest(cached) === expectedDigest) return { source: cached, from: '缓存' };
    return { missing: `缓存的 mermaid 校验不通过,已忽略:${cacheFile()}` };
  }

  if (!allowDownload) {
    return { missing: `本地没有 mermaid ${MERMAID.version} 缓存,且已禁止下载` };
  }

  let source;
  try {
    const response = await fetchImpl(MERMAID.url);
    if (!response.ok) return { missing: `下载 mermaid 失败:HTTP ${response.status}` };
    source = Buffer.from(await response.arrayBuffer()).toString('utf8');
  } catch (err) {
    return { missing: `下载 mermaid 失败:${err.message}` };
  }

  if (digest(source) !== expectedDigest) {
    return { missing: `下载到的 mermaid 校验不通过,已丢弃(期望 ${MERMAID.sha256.slice(0, 12)}…)` };
  }

  try {
    await mkdir(path.dirname(cacheFile()), { recursive: true });
    await writeFile(cacheFile(), source);
  } catch {
    return { source, from: '下载(缓存写入失败,下次仍会重新下载)' };
  }
  return { source, from: `下载并缓存到 ${cacheFile()}` };
}

async function readOptional(filePath) {
  try {
    return await readFile(filePath, 'utf8');
  } catch {
    return undefined;
  }
}
