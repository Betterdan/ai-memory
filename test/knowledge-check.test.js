import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { checkKnowledge, extractLinks } from '../src/knowledge-check.js';
import { applyKnowledgeBuild, planKnowledgeBuild } from '../src/knowledge-index.js';
import { scaffold } from '../src/scaffold.js';
import { createTempDirs } from './temp-dirs.js';

const TEMPLATES = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'templates');
const tempDirs = createTempDirs();
afterEach(() => tempDirs.cleanup());

const VARS = {
  projectName: 'demo', techStack: 'Go', date: '2026-09-16', modelProfile: 'inherit', frameworkVersion: '0.10.0',
};

const lines = (...rows) => rows.join('\n') + '\n';

const ENTRY = lines(
  '---', 'type: entry', 'group: 订单 API', 'form: API 分组', 'summary: 下单与取消',
  'contract: docs/api/orders.yaml', 'domains: [订单]', '---', '', '# 订单 API'
);

const DOMAIN = lines(
  '---', 'type: domain', 'name: 订单', 'summary: 订单生命周期', '---', '', '# 订单', '',
  '## 关联入口', '',
  '<!-- ai-memory:generated:related-entries:start -->',
  '<!-- ai-memory:generated:related-entries:end -->', '',
  '## 相关接口', '',
  '<!-- ai-memory:generated:related-contracts:start -->',
  '<!-- ai-memory:generated:related-contracts:end -->'
);

async function makeProject() {
  const dir = await tempDirs.make('aim-kbcheck-');
  await scaffold({ templatesRoot: TEMPLATES, targetDir: dir, vars: VARS, tools: [], onConflict: () => 'skip' });
  return dir;
}

const write = (dir, rel, body) => writeFile(path.join(dir, ...rel.split('/')), body);

async function snapshot(dir) {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  const out = {};
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const full = path.join(entry.parentPath, entry.name);
    const key = path.relative(dir, full).split(path.sep).join('/');
    out[key] = createHash('sha256').update(await readFile(full)).digest('hex');
  }
  return out;
}

const kinds = result => [...new Set(result.problems.map(problem => problem.kind))].sort();
const messages = result => result.problems.map(problem => problem.message).join('\n');

test('全新项目的空知识层校验通过', async () => {
  const dir = await makeProject();
  const result = await checkKnowledge({ targetDir: dir });
  assert.deepEqual(result.problems, [], '未写任何知识页时不应报索引过期');
  assert.deepEqual(result.counted, { entry: 0, domain: 0, decision: 0 });
});

test('链接提取跳过围栏、外链与纯锚点', () => {
  const body = lines(
    '[相对](../domains/a.md) [外链](https://example.com) [锚点](#x) [带锚点](b.md#section)',
    '```',
    '[围栏里的示例](../domains/不存在.md)',
    '```',
    '[结尾](c.md)'
  );
  assert.deepEqual(extractLinks(body), ['../domains/a.md', 'b.md', 'c.md']);
});

test('frontmatter 三类问题各自被报告', async () => {
  const dir = await makeProject();
  await write(dir, '.ai/knowledge/domains/none.md', '# 没有 frontmatter\n');
  await write(dir, '.ai/knowledge/domains/badtype.md', lines('---', 'type: unknown', '---', '', '# x'));
  await write(dir, '.ai/knowledge/domains/partial.md', lines('---', 'type: domain', 'name: 只有名字', '---', '', '# x'));

  const result = await checkKnowledge({ targetDir: dir });
  const text = messages(result);
  assert.match(text, /none\.md — 缺少 frontmatter/);
  assert.match(text, /badtype\.md — type 无效或缺失/);
  assert.match(text, /partial\.md — 缺少字段 summary/);
});

test('断链被报告,合法链接与领域页无入口不报', async () => {
  const dir = await makeProject();
  await write(dir, '.ai/knowledge/domains/orders.md', DOMAIN);
  await write(dir, '.ai/knowledge/entries/orders.md', ENTRY + lines(
    '', '见 [领域](../domains/orders.md)、[断链](../domains/missing.md)。',
    '[外链](https://example.com) 与 [锚点](#x) 不检查。'
  ));

  const result = await checkKnowledge({ targetDir: dir });
  const text = messages(result);
  assert.match(text, /entries\/orders\.md — 链接指向不存在的 \.\.\/domains\/missing\.md/);
  assert.ok(!text.includes('domains/orders.md — 链接'), '存在的相对链接不得报错');
  assert.ok(!text.includes('example.com'), '外链不检查');
  assert.ok(!kinds(result).includes('悬空领域引用'));
});

test('领域页没有关联入口是合法状态', async () => {
  const dir = await makeProject();
  await write(dir, '.ai/knowledge/domains/orders.md', DOMAIN);
  await applyKnowledgeBuild({ targetDir: dir, plan: await planKnowledgeBuild({ targetDir: dir }) });

  const result = await checkKnowledge({ targetDir: dir });
  assert.deepEqual(result.problems, [], '无对外入口的后端行为归领域页,不应报错');
});

test('悬空领域引用与悬空决策引用被报告', async () => {
  const dir = await makeProject();
  await write(dir, '.ai/knowledge/domains/orders.md', DOMAIN);
  await write(dir, '.ai/knowledge/entries/orders.md', lines(
    '---', 'type: entry', 'group: 订单 API', 'form: API 分组', 'summary: 下单',
    'domains: [订单, 不存在的领域]', '---', '', '# 订单 API'
  ));
  await write(dir, '.ai/knowledge/decisions/2026-01-01-a.md', lines(
    '---', 'type: decision', 'status: superseded', 'superseded_by: 2026-06-01-b.md', 'date: 2026-01-01', '---', '', '# a'
  ));
  await write(dir, '.ai/knowledge/decisions/2026-02-01-c.md', lines(
    '---', 'type: decision', 'status: superseded', 'date: 2026-02-01', '---', '', '# c'
  ));
  await write(dir, '.ai/knowledge/decisions/2026-03-01-d.md', lines(
    '---', 'type: decision', 'status: active', 'date: 2026-03-01', '---', '', '# d'
  ));

  const result = await checkKnowledge({ targetDir: dir });
  const text = messages(result);
  assert.match(text, /domains 指向不存在的领域「不存在的领域」/);
  assert.match(text, /2026-01-01-a\.md — superseded_by 指向不存在的 2026-06-01-b\.md/);
  assert.match(text, /2026-02-01-c\.md — status 为 superseded 但缺少 superseded_by/);
  assert.ok(!text.includes('2026-03-01-d.md'), 'status 为 active 时不要求 superseded_by');
});

test('索引过期被报告,kb build 之后不再报', async () => {
  const dir = await makeProject();
  await write(dir, '.ai/knowledge/domains/orders.md', DOMAIN);
  await write(dir, '.ai/knowledge/entries/orders.md', ENTRY);

  const stale = await checkKnowledge({ targetDir: dir });
  assert.ok(kinds(stale).includes('索引过期'));
  assert.match(messages(stale), /ai-memory kb build/);

  await applyKnowledgeBuild({ targetDir: dir, plan: await planKnowledgeBuild({ targetDir: dir }) });
  const fresh = await checkKnowledge({ targetDir: dir });
  assert.deepEqual(fresh.problems, []);
  assert.deepEqual(fresh.counted, { entry: 1, domain: 1, decision: 0 });
});

test('校验是只读的:运行前后目录树逐字节不变', async () => {
  const dir = await makeProject();
  await write(dir, '.ai/knowledge/domains/orders.md', DOMAIN);
  await write(dir, '.ai/knowledge/entries/orders.md', ENTRY);
  await write(dir, '.ai/knowledge/domains/none.md', '# 没有 frontmatter\n');

  const before = await snapshot(dir);
  const result = await checkKnowledge({ targetDir: dir });
  assert.ok(result.problems.length > 0);
  assert.deepEqual(await snapshot(dir), before, 'kb check 不得写任何文件');
});
