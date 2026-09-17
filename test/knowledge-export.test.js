import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { exportKnowledge, parsePoints } from '../src/knowledge-export.js';
import { IMAGE_LIMIT, extractTitle, inlineImages, renderMarkdown } from '../src/markdown.js';
import { scaffold } from '../src/scaffold.js';
import { createTempDirs } from './temp-dirs.js';

const TEMPLATES = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'templates');
const tempDirs = createTempDirs();
afterEach(() => tempDirs.cleanup());

const VARS = {
  projectName: '订单系统', techStack: 'Go + Vue', date: '2026-09-17',
  modelProfile: 'inherit', frameworkVersion: '0.10.0',
};
const lines = (...rows) => rows.join('\n') + '\n';

async function write(dir, rel, body) {
  const full = path.join(dir, ...rel.split('/'));
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, body);
}

async function makeProject({ content = true } = {}) {
  const dir = await tempDirs.make('aim-export-');
  await scaffold({ templatesRoot: TEMPLATES, targetDir: dir, vars: VARS, tools: [], onConflict: () => 'skip' });
  if (!content) return dir;

  const overviewPath = path.join(dir, '.ai', 'knowledge', 'overview.md');
  const overview = await readFile(overviewPath, 'utf8');
  await writeFile(overviewPath, overview
    .replace('- 目标:', '- 目标:让商家完成下单到对账')
    .replace('- 主要调用方:', '- 主要调用方:商家后台')
    .replace('- 当前迭代:v1.0.0', '- 当前迭代:v1.2.0'));

  const iterationsPath = path.join(dir, '.ai', 'knowledge', 'iterations.md');
  const iterations = await readFile(iterationsPath, 'utf8');
  await writeFile(iterationsPath, iterations.replace('|---|---|---|---|---|', [
    '|---|---|---|---|---|',
    '| v1.2.0 | 导出-批量 | M | in-progress | 依赖 导出-单条 |',
    '| v1.2.0 | 登录-双因子 | L | in-progress | 无 |',
    '| v1.1.0 | 导出-单条 | S | done | 无 |',
    '| v1.2.0 | 对账-月结 | M | planned | 等 导出-批量 |',
  ].join('\n')));

  await write(dir, '.ai/knowledge/entries/orders-api.md', lines(
    '---', 'type: entry', 'group: 订单 API', 'form: API 分组', 'summary: 下单与取消', 'domains: [订单]', '---',
    '', '# 订单 API', '', '| 行为 | 结果 |', '|---|---|', '| 下单 | 返回订单号 |',
    '', '- [x] 已支持幂等', '- [ ] 批量下单待做', '', '~~旧接口~~ 已下线', '', '> 注意幂等键必填'));
  await write(dir, '.ai/knowledge/domains/order.md', lines(
    '---', 'type: domain', 'name: 订单', 'summary: 订单生命周期', '---',
    '', '# 订单', '', '```mermaid', 'graph LR', '  A-->B', '```'));
  await write(dir, '.ai/knowledge/decisions/2026-08-01-a.md', lines(
    '---', 'type: decision', 'status: active', 'date: 2026-08-01', '---', '', '# 改用事件驱动'));
  await write(dir, '.ai/knowledge/decisions/2026-06-01-b.md', lines(
    '---', 'type: decision', 'status: superseded', 'superseded_by: 2026-08-01-a.md', 'date: 2026-06-01', '---',
    '', '# 轮询对账'));
  await write(dir, 'docs/requirements/v1.2.0/final/导出-批量.md', lines('# 批量导出', '', '一次导出多条。'));
  await write(dir, 'docs/requirements/v1.2.0/draft/想法.md', lines('# 粗稿', '', '还没想清楚。'));
  await write(dir, 'docs/design/v1.2.0/导出-批量.md', lines('# 批量导出设计', '', '接收 id 列表。'));
  return dir;
}

async function snapshot(dir, skip) {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  const out = {};
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const full = path.join(entry.parentPath, entry.name);
    const key = path.relative(dir, full).split(path.sep).join('/');
    if (skip && key === skip) continue;
    out[key] = createHash('sha256').update(await readFile(full)).digest('hex');
  }
  return out;
}

const read = (dir, rel) => readFile(path.join(dir, ...rel.split('/')), 'utf8');

test('需求点解析限定在「需求点」章节,不误读需求集合表', () => {
  const body = lines(
    '# 迭代记录',
    '',
    '## 需求点',
    '',
    '| 版本 | 需求点 | 风险 | 状态 | 依赖与顺序 |',
    '|---|---|---|---|---|',
    '| v1.0.0 | 甲 | S | done | 无 |',
    '| v1.1.0 | 乙 | M | in-progress | 依赖甲 |',
    '',
    '## 需求集合',
    '',
    '| 版本 | 集合 | 已拆出的点 | 备注 |',
    '|---|---|---|---|',
    '| v1.0.0 | 导出 | 甲、乙 | 无 |');
  assert.deepEqual(parsePoints(body), [
    { version: 'v1.0.0', point: '甲', risk: 'S', status: 'done', note: '无' },
    { version: 'v1.1.0', point: '乙', risk: 'M', status: 'in-progress', note: '依赖甲' },
  ], '需求集合表的表头与数据行都不得被当成需求点');

  assert.deepEqual(parsePoints(lines('| 版本 | 集合 | 已拆出的点 | 备注 |', '|---|---|---|---|')), [],
    '没有「需求点」章节时不解析任何东西');
});

test('标题取首个一级标题,没有则回退文件名', () => {
  assert.equal(extractTitle('前言\n\n# 订单 API\n', 'fallback'), '订单 API');
  assert.equal(extractTitle('没有标题\n', 'fallback'), 'fallback');
});

test('导出单文件且不含任何外部资源引用', async () => {
  const dir = await makeProject();
  const result = await exportKnowledge({ targetDir: dir });
  assert.equal(result.out, '.ai/knowledge.html');

  const html = await read(dir, '.ai/knowledge.html');
  assert.ok(!/(src|href)="https?:/.test(html), '不得引用外部资源');
  assert.ok(!/<link[^>]+stylesheet/.test(html), '样式必须内联');
  assert.ok(!/<script[^>]+src=/.test(html), '脚本必须内联');
});

test('四类来源全部导出,README 与 draft 被排除', async () => {
  const dir = await makeProject();
  await exportKnowledge({ targetDir: dir });
  const html = await read(dir, '.ai/knowledge.html');

  assert.ok(html.includes('订单 API'), '入口页');
  assert.ok(html.includes('graph LR'), '领域页正文');
  assert.ok(html.includes('改用事件驱动'), '决策页');
  assert.ok(html.includes('系统上下文'), '架构基线');
  assert.ok(html.includes('一次导出多条'), '需求点定稿');
  assert.ok(html.includes('接收 id 列表'), '技术设计');

  assert.ok(!html.includes('还没想清楚'), 'draft 不得进入');
  assert.ok(!html.includes('每个入口分组一页'), 'entries/README 不得进入');
  assert.ok(!html.includes('一条决策一个文件'), 'decisions/README 不得进入');
});

test('首页给出项目信息、需求点分组与系统构成', async () => {
  const dir = await makeProject();
  await exportKnowledge({ targetDir: dir });
  const html = await read(dir, '.ai/knowledge.html');

  assert.ok(html.includes('订单系统'));
  assert.ok(html.includes('Go + Vue'));
  assert.ok(html.includes('v1.2.0'));
  assert.ok(html.includes('让商家完成下单到对账'));

  assert.match(html, /<b>2<\/b> 进行中/);
  assert.match(html, /<b>1<\/b> 已完成/);
  assert.match(html, /<b>1<\/b> 待定稿/);
  assert.ok(html.includes('导出-批量') && html.includes('登录-双因子'));

  assert.match(html, /<b>1<\/b> 对外入口/);
  assert.match(html, /<b>1<\/b> 业务领域/);
  assert.match(html, /<b>2<\/b> 决策记录/);
  assert.ok(html.includes('生效 1 · 已取代 1'), '决策按 frontmatter 区分生效与已取代');
});

test('GFM 全套语法渲染正确,mermaid 暂以代码块呈现', async () => {
  const dir = await makeProject();
  await exportKnowledge({ targetDir: dir });
  const html = await read(dir, '.ai/knowledge.html');

  assert.ok(html.includes('<table>'), '表格');
  assert.ok(html.includes('checkbox'), '任务列表');
  assert.ok(html.includes('<del>'), '删除线');
  assert.ok(html.includes('<blockquote>'), '引用块');
  assert.ok(html.includes('language-mermaid'), 'mermaid 块保留为代码,留给后续渲染');
});

test('相对图片内联为 data URI,外链原样保留', async () => {
  const dir = await makeProject();
  await write(dir, '.ai/knowledge/img/flow.svg', '<svg xmlns="http://www.w3.org/2000/svg"></svg>');
  await write(dir, '.ai/knowledge/entries/with-image.md', lines(
    '---', 'type: entry', 'group: 图示', 'form: 页面', 'summary: 带图', '---',
    '', '# 带图', '', '![流程](../img/flow.svg)', '', '![远程](https://example.com/a.png)'));

  const result = await exportKnowledge({ targetDir: dir });
  const html = await read(dir, '.ai/knowledge.html');
  assert.ok(html.includes('data:image/svg+xml;base64,'), '本地图片必须内联');
  assert.ok(html.includes('https://example.com/a.png'), '外链图片原样保留');
  assert.deepEqual(result.warnings, []);
});

test('图片读不到或过大时跳过并警告,不中断导出', async () => {
  const dir = await makeProject();
  await write(dir, '.ai/knowledge/big.png', 'x'.repeat(IMAGE_LIMIT + 10));
  await write(dir, '.ai/knowledge/entries/broken.md', lines(
    '---', 'type: entry', 'group: 图问题', 'form: 页面', 'summary: 图有问题', '---',
    '', '# 图有问题', '', '![缺失](./nope.png)', '', '![过大](../big.png)'));

  const result = await exportKnowledge({ targetDir: dir });
  const html = await read(dir, '.ai/knowledge.html');
  assert.equal(result.warnings.length, 2);
  assert.ok(result.warnings.some(item => item.includes('读不到')));
  assert.ok(result.warnings.some(item => item.includes('未内联')));
  assert.ok(html.includes('图有问题'), '导出不得中断');
});

test('侧栏条目数等于总览加所有页面', async () => {
  const dir = await makeProject();
  const result = await exportKnowledge({ targetDir: dir });
  const html = await read(dir, '.ai/knowledge.html');
  const items = (html.match(/class="nav-item"/g) || []).length;
  assert.equal(items, result.pages.length + 1, '总览 + 每页一条');
});

test('自适应与深浅色:含窄屏断点与系统配色查询', async () => {
  const dir = await makeProject();
  await exportKnowledge({ targetDir: dir });
  const html = await read(dir, '.ai/knowledge.html');
  assert.ok(html.includes('@media (max-width:640px)'));
  assert.ok(html.includes('prefers-color-scheme:dark'));
  assert.ok(html.includes('viewport'));
});

test('知识层为空时给出空状态与下一步', async () => {
  const dir = await makeProject({ content: false });
  const result = await exportKnowledge({ targetDir: dir });
  const html = await read(dir, '.ai/knowledge.html');
  assert.ok(html.includes('还没有可展示的内容'));
  assert.ok(html.includes('.ai/knowledge/entries/'));
  assert.ok(html.includes('ai-memory kb export'));
  // 全新项目会带出一批空模板页(概览、迭代、约定与 5 份架构基线),
  // 所以空状态的判据是「没有实质内容」而不是「没有页面」
  assert.ok(result.pages.length > 0, '模板自带的页面仍应导出');
  assert.ok(!html.includes('导出-批量'), '空项目不应出现任何需求点');
  assert.ok(html.includes('<b>0</b> 对外入口'));
});

test('同输入两次导出结果一致,且只写输出文件', async () => {
  const dir = await makeProject();
  const before = await snapshot(dir, '.ai/knowledge.html');
  const now = new Date('2026-09-17T00:00:00.000Z');

  await exportKnowledge({ targetDir: dir, now });
  const first = await read(dir, '.ai/knowledge.html');
  await exportKnowledge({ targetDir: dir, now });
  const second = await read(dir, '.ai/knowledge.html');

  assert.equal(first, second);
  assert.deepEqual(await snapshot(dir, '.ai/knowledge.html'), before, '除输出文件外不得改动任何文件');
});

test('--out 可以改输出位置', async () => {
  const dir = await makeProject();
  const result = await exportKnowledge({ targetDir: dir, out: 'wiki/项目.html' });
  assert.equal(result.out, 'wiki/项目.html');
  assert.ok((await read(dir, 'wiki/项目.html')).includes('订单系统'));
});

test('原样 HTML 不做净化:知识页与源码同等信任', async () => {
  const dir = await makeProject();
  await write(dir, '.ai/knowledge/entries/raw.md', lines(
    '---', 'type: entry', 'group: 原样', 'form: 页面', 'summary: 原样 HTML', '---',
    '', '# 原样', '', '<div class="custom">自定义块</div>'));
  await exportKnowledge({ targetDir: dir });
  const html = await read(dir, '.ai/knowledge.html');
  assert.ok(html.includes('<div class="custom">自定义块</div>'));
});

test('标题与分组名做 HTML 转义,不产生破损结构', async () => {
  const dir = await makeProject();
  await write(dir, '.ai/knowledge/entries/tricky.md', lines(
    '---', 'type: entry', 'group: 尖括号', 'form: 页面', 'summary: x', '---',
    '', '# <b>标题</b> & "引号"'));
  await exportKnowledge({ targetDir: dir });
  const html = await read(dir, '.ai/knowledge.html');
  assert.ok(html.includes('&lt;b&gt;标题&lt;/b&gt; &amp; &quot;引号&quot;'), '导航标题必须转义');
});
