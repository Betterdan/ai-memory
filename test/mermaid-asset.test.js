import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { MERMAID, cacheFile, digest, resolveMermaid } from '../src/mermaid-asset.js';
import { activateMermaid, hasMermaid, renderMarkdown } from '../src/markdown.js';
import { createTempDirs } from './temp-dirs.js';

const tempDirs = createTempDirs();
const originalCache = process.env.AI_MEMORY_CACHE;
afterEach(async () => {
  if (originalCache === undefined) delete process.env.AI_MEMORY_CACHE;
  else process.env.AI_MEMORY_CACHE = originalCache;
  await tempDirs.cleanup();
});

const FAKE = 'globalThis.mermaid={run(){}};\n';
const FAKE_DIGEST = digest(FAKE);
const ok = body => ({ ok: true, status: 200, arrayBuffer: async () => Buffer.from(body) });

async function useCache() {
  const dir = await tempDirs.make('aim-mermaid-');
  process.env.AI_MEMORY_CACHE = dir;
  return dir;
}

test('版本与哈希是固定值,不随 CDN 漂移', () => {
  assert.match(MERMAID.version, /^\d+\.\d+\.\d+$/);
  assert.match(MERMAID.sha256, /^[a-f0-9]{64}$/);
  assert.ok(MERMAID.url.includes(MERMAID.version), 'URL 必须带着固定版本');
});

test('指定本地文件时直接使用,读不到则明确报错', async () => {
  await useCache();
  const file = path.join(await tempDirs.make('aim-local-'), 'mermaid.min.js');
  await writeFile(file, FAKE);

  const found = await resolveMermaid({ localPath: file });
  assert.equal(found.source, FAKE);
  assert.match(found.from, /本地文件/);

  const missing = await resolveMermaid({ localPath: path.join(path.dirname(file), 'nope.js') });
  assert.match(missing.missing, /读不到/);
});

test('缓存命中时不联网', async () => {
  await useCache();
  await mkdir(path.dirname(cacheFile()), { recursive: true });
  await writeFile(cacheFile(), FAKE);

  let called = false;
  const result = await resolveMermaid({
    expectedDigest: FAKE_DIGEST,
    fetchImpl: async () => { called = true; return ok(FAKE); },
  });
  assert.equal(result.source, FAKE);
  assert.equal(result.from, '缓存');
  assert.equal(called, false, '有缓存就不该发请求');
});

test('缓存被篡改时拒绝使用', async () => {
  await useCache();
  await mkdir(path.dirname(cacheFile()), { recursive: true });
  await writeFile(cacheFile(), FAKE + 'tampered');

  const result = await resolveMermaid({ expectedDigest: FAKE_DIGEST, allowDownload: false });
  assert.match(result.missing, /校验不通过/);
  assert.equal(result.source, undefined);
});

test('禁止下载且无缓存时降级', async () => {
  await useCache();
  let called = false;
  const result = await resolveMermaid({
    allowDownload: false,
    fetchImpl: async () => { called = true; return ok(FAKE); },
  });
  assert.match(result.missing, /已禁止下载/);
  assert.equal(called, false);
});

test('下载成功后校验并写入缓存', async () => {
  const dir = await useCache();
  let requested;
  const result = await resolveMermaid({
    expectedDigest: FAKE_DIGEST,
    fetchImpl: async (url) => { requested = url; return ok(FAKE); },
  });
  assert.equal(requested, MERMAID.url);
  assert.equal(result.source, FAKE);
  assert.match(result.from, /下载/);
  assert.equal(await readFile(path.join(dir, `mermaid-${MERMAID.version}.min.js`), 'utf8'), FAKE);
});

test('下载内容哈希不符时丢弃,不写缓存', async () => {
  const dir = await useCache();
  const result = await resolveMermaid({
    expectedDigest: FAKE_DIGEST,
    fetchImpl: async () => ok('被掉包的内容'),
  });
  assert.match(result.missing, /校验不通过/);
  await assert.rejects(readFile(path.join(dir, `mermaid-${MERMAID.version}.min.js`)), '不得缓存未通过校验的内容');
});

test('下载失败与非 2xx 都降级而不是抛错', async () => {
  await useCache();
  const failed = await resolveMermaid({ fetchImpl: async () => { throw new Error('网络不可达'); } });
  assert.match(failed.missing, /网络不可达/);

  const notFound = await resolveMermaid({
    fetchImpl: async () => ({ ok: false, status: 404, arrayBuffer: async () => Buffer.from('') }),
  });
  assert.match(notFound.missing, /HTTP 404/);
});

test('mermaid 代码块识别与容器转换', () => {
  const html = renderMarkdown('```mermaid\ngraph TD\n  A-->B\n```\n');
  assert.equal(hasMermaid(html), true);
  const activated = activateMermaid(html);
  assert.ok(activated.includes('<pre class="mermaid">'));
  assert.ok(!activated.includes('language-mermaid'));
  assert.ok(activated.includes('A--&gt;B'), '图的源码必须原样保留');

  const other = renderMarkdown('```js\nconst a=1;\n```\n');
  assert.equal(hasMermaid(other), false);
  assert.ok(activateMermaid(other).includes('language-js'), '其他语言不受影响');
});
