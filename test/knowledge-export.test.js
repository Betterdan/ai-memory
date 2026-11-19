import { after, afterEach, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { exportKnowledge, parsePoints } from '../src/knowledge-export.js';
import { IMAGE_LIMIT, extractTitle, inlineImages, renderMarkdown } from '../src/markdown.js';
import { scaffold } from '../src/scaffold.js';
import { createTempDirs } from './temp-dirs.js';

const TEMPLATES = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'templates');
const tempDirs = createTempDirs();
const originalCache = process.env.AI_MEMORY_CACHE;
// 隔离 mermaid 缓存:测试不联网,也不依赖开发机上已有的缓存。
// 必须在 before/after 而不是 afterEach 里还原,否则第一个用例之后隔离就失效了。
before(() => {
  process.env.AI_MEMORY_CACHE = path.join(path.dirname(fileURLToPath(import.meta.url)), '.no-such-cache');
});
after(() => {
  if (originalCache === undefined) delete process.env.AI_MEMORY_CACHE;
  else process.env.AI_MEMORY_CACHE = originalCache;
});
afterEach(() => tempDirs.cleanup());

const VARS = {
  projectName: '订单系统', techStack: 'Go + Vue', date: '2026-09-17',
  modelProfile: 'inherit', frameworkVersion: '0.11.0',
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

test('已验收待生效的需求点在首页单独显示', async () => {
  const dir = await makeProject({ content: false });
  const file = path.join(dir, '.ai', 'knowledge', 'iterations.md');
  const content = await readFile(file, 'utf8');
  await writeFile(file, content.replace('|---|---|---|---|---|', '|---|---|---|---|---|\n| v1.0.0 | 等待发布 | M | accepted | 无 |'));
  const result = await exportKnowledge({ targetDir: dir, allowDownload: false });
  const html = await readFile(path.join(dir, result.out), 'utf8');
  assert.match(html, /待生效/);
  assert.match(html, /等待发布/);
});

const read = (dir, rel) => readFile(path.join(dir, ...rel.split('/')), 'utf8');
// 夹具里有 mermaid 图,测试环境拿不到 bundle 会降级并产生一条警告,
// 所以图片相关断言只看图片自己的警告
const imageWarnings = result => result.warnings.filter(item => item.includes('图片'));

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
  const result = await exportKnowledge({ targetDir: dir, allowDownload: false });
  assert.equal(result.out, '.ai/knowledge.html');

  const html = await read(dir, '.ai/knowledge.html');
  assert.ok(!/(src|href)="https?:/.test(html), '不得引用外部资源');
  assert.ok(!/<link[^>]+stylesheet/.test(html), '样式必须内联');
  assert.ok(!/<script[^>]+src=/.test(html), '脚本必须内联');
});

test('四类来源全部导出,README 与 draft 被排除', async () => {
  const dir = await makeProject();
  await exportKnowledge({ targetDir: dir, allowDownload: false });
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
  await exportKnowledge({ targetDir: dir, allowDownload: false });
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
  await exportKnowledge({ targetDir: dir, allowDownload: false });
  const html = await read(dir, '.ai/knowledge.html');

  assert.ok(html.includes('<table>'), '表格');
  assert.ok(html.includes('checkbox'), '任务列表');
  assert.ok(html.includes('<del>'), '删除线');
  assert.ok(html.includes('<blockquote>'), '引用块');
  assert.ok(html.includes('language-mermaid'), '拿不到 mermaid 时降级为代码块');
});

test('相对图片内联为 data URI,外链原样保留', async () => {
  const dir = await makeProject();
  await write(dir, '.ai/knowledge/img/flow.svg', '<svg xmlns="http://www.w3.org/2000/svg"></svg>');
  await write(dir, '.ai/knowledge/entries/with-image.md', lines(
    '---', 'type: entry', 'group: 图示', 'form: 页面', 'summary: 带图', '---',
    '', '# 带图', '', '![流程](../img/flow.svg)', '', '![远程](https://example.com/a.png)'));

  const result = await exportKnowledge({ targetDir: dir, allowDownload: false });
  const html = await read(dir, '.ai/knowledge.html');
  assert.ok(html.includes('data:image/svg+xml;base64,'), '本地图片必须内联');
  assert.ok(html.includes('https://example.com/a.png'), '外链图片原样保留');
  assert.deepEqual(imageWarnings(result), [], '图片处理不应产生警告');
});

test('图片读不到或过大时跳过并警告,不中断导出', async () => {
  const dir = await makeProject();
  await write(dir, '.ai/knowledge/big.png', 'x'.repeat(IMAGE_LIMIT + 10));
  await write(dir, '.ai/knowledge/entries/broken.md', lines(
    '---', 'type: entry', 'group: 图问题', 'form: 页面', 'summary: 图有问题', '---',
    '', '# 图有问题', '', '![缺失](./nope.png)', '', '![过大](../big.png)'));

  const result = await exportKnowledge({ targetDir: dir, allowDownload: false });
  const html = await read(dir, '.ai/knowledge.html');
  const images = imageWarnings(result);
  assert.equal(images.length, 2);
  assert.ok(images.some(item => item.includes('读不到')));
  assert.ok(images.some(item => item.includes('未内联')));
  assert.ok(html.includes('图有问题'), '导出不得中断');
});

test('侧栏条目数等于总览加所有页面', async () => {
  const dir = await makeProject();
  const result = await exportKnowledge({ targetDir: dir, allowDownload: false });
  const html = await read(dir, '.ai/knowledge.html');
  const items = (html.match(/class="nav-item"/g) || []).length;
  assert.equal(items, result.pages.length + 1, '总览 + 每页一条');
});

test('自适应与深浅色:含窄屏断点与系统配色查询', async () => {
  const dir = await makeProject();
  await exportKnowledge({ targetDir: dir, allowDownload: false });
  const html = await read(dir, '.ai/knowledge.html');
  assert.ok(html.includes('@media (max-width:640px)'));
  assert.ok(html.includes('prefers-color-scheme:dark'));
  assert.ok(html.includes('viewport'));
});

test('搜索和移动导航有可访问名称,深浅色的导航文字对比足够', async () => {
  const dir = await makeProject();
  await exportKnowledge({ targetDir: dir, allowDownload: false });
  const html = await read(dir, '.ai/knowledge.html');
  assert.match(html, /id="search"[^>]*aria-label="搜索知识库"/);
  assert.match(html, /id="menu"[^>]*aria-expanded="false"[^>]*aria-controls="sidebar"/);
  const roots = [...html.matchAll(/:root\{([^}]+)\}/g)].map(match => Object.fromEntries(
    [...match[1].matchAll(/(--[\w-]+):(#[0-9a-f]{6})/gi)].map(part => [part[1], part[2]])
  ));
  const luminance = hex => {
    const rgb = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  };
  assert.equal(roots.length, 2);
  for (const root of roots) {
    const values = [luminance(root['--accent-soft']), luminance(root['--accent-ink'])].sort((a, b) => b - a);
    assert.ok((values[0] + 0.05) / (values[1] + 0.05) >= 4.5, '选中导航的文字对比至少 4.5:1');
  }
});

test('知识层为空时给出空状态与下一步', async () => {
  const dir = await makeProject({ content: false });
  const result = await exportKnowledge({ targetDir: dir, allowDownload: false });
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

  await exportKnowledge({ targetDir: dir, allowDownload: false, now });
  const first = await read(dir, '.ai/knowledge.html');
  await exportKnowledge({ targetDir: dir, allowDownload: false, now });
  const second = await read(dir, '.ai/knowledge.html');

  assert.equal(first, second);
  assert.deepEqual(await snapshot(dir, '.ai/knowledge.html'), before, '除输出文件外不得改动任何文件');
});

test('--out 可以改输出位置', async () => {
  const dir = await makeProject();
  const result = await exportKnowledge({ targetDir: dir, allowDownload: false, out: 'wiki/项目.html' });
  assert.equal(result.out, 'wiki/项目.html');
  assert.ok((await read(dir, 'wiki/项目.html')).includes('订单系统'));
});

test('原样 HTML 不做净化:知识页与源码同等信任', async () => {
  const dir = await makeProject();
  await write(dir, '.ai/knowledge/entries/raw.md', lines(
    '---', 'type: entry', 'group: 原样', 'form: 页面', 'summary: 原样 HTML', '---',
    '', '# 原样', '', '<div class="custom">自定义块</div>'));
  await exportKnowledge({ targetDir: dir, allowDownload: false });
  const html = await read(dir, '.ai/knowledge.html');
  assert.ok(html.includes('<div class="custom">自定义块</div>'));
});

test('标题与分组名做 HTML 转义,不产生破损结构', async () => {
  const dir = await makeProject();
  await write(dir, '.ai/knowledge/entries/tricky.md', lines(
    '---', 'type: entry', 'group: 尖括号', 'form: 页面', 'summary: x', '---',
    '', '# <b>标题</b> & "引号"'));
  await exportKnowledge({ targetDir: dir, allowDownload: false });
  const html = await read(dir, '.ai/knowledge.html');
  assert.ok(html.includes('&lt;b&gt;标题&lt;/b&gt; &amp; &quot;引号&quot;'), '导航标题必须转义');
});

test('给定本地 mermaid bundle 时内联并转换为渲染容器', async () => {
  const dir = await makeProject();
  const bundle = path.join(await tempDirs.make('aim-bundle-'), 'mermaid.min.js');
  await writeFile(bundle, 'globalThis.mermaid={initialize(){},run(){}};\n');

  const result = await exportKnowledge({ targetDir: dir, allowDownload: false, mermaidPath: bundle });
  const html = await read(dir, '.ai/knowledge.html');

  assert.equal(result.mermaid, true);
  assert.ok(html.includes('<pre class="mermaid">'), '图必须放进 mermaid 容器');
  assert.ok(!html.includes('language-mermaid'), '不应再是普通代码块');
  assert.ok(html.includes('globalThis.mermaid'), 'bundle 必须内联');
  assert.ok(html.includes('__renderMermaid'), '需要按页渲染的钩子');
  assert.ok(!/(src|href)="https?:/.test(html), '内联后仍不得有外部引用');
  assert.deepEqual(result.warnings.filter(item => item.includes('mermaid')), []);
});

test('内容里没有 mermaid 时完全不解析资源,也不联网', async () => {
  const dir = await makeProject();
  await writeFile(path.join(dir, '.ai', 'knowledge', 'domains', 'order.md'),
    ['---', 'type: domain', 'name: 订单', 'summary: 无图', '---', '', '# 订单', '', '纯文字。', ''].join('\n'));

  let called = false;
  const result = await exportKnowledge({
    targetDir: dir,
    fetchImpl: async () => { called = true; throw new Error('不该被调用'); },
  });
  assert.equal(called, false, '没有图就不该去取 3.4MB 的 bundle');
  assert.equal(result.mermaid, false);
  assert.deepEqual(result.warnings.filter(item => item.includes('mermaid')), []);
});

// 把导出页里的路由脚本放进极简假 DOM 里真跑一遍,只模拟它用到的那几个 API
function runRouter(html, hash) {
  const ids = [...html.matchAll(/<article id="([^"]+)" class="page"/g)].map(match => match[1]);
  const pages = ids.map(id => ({ id, hidden: true, textContent: '' }));
  const listeners = {};
  const nav = {
    querySelectorAll: () => [],
    addEventListener: () => {},
  };
  const document = {
    getElementById: id => (id === 'nav' ? nav : null),
    querySelectorAll: selector => (selector === '.page' ? pages : []),
  };
  const window = {
    scrollTo: () => {},
    addEventListener: (name, fn) => { listeners[name] = fn; },
  };
  const location = { hash };
  const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)[1];
  vm.runInNewContext(script, { document, window, location, history: { replaceState: () => {} } });
  const visible = () => pages.filter(page => !page.hidden).map(page => page.id);
  return { visible, navigate(next) { location.hash = next; listeners.hashchange?.(); } };
}

test('中文页面 id 经浏览器编码的 hash 仍能直接打开', async () => {
  const dir = await makeProject();
  await exportKnowledge({ targetDir: dir, allowDownload: false });
  const html = await read(dir, '.ai/knowledge.html');
  const id = 'docs-requirements-v1-2-0-final-导出-批量';
  assert.ok(html.includes(`<article id="${id}"`));

  const router = runRouter(html, `#${encodeURIComponent(id)}`);
  assert.deepEqual(router.visible(), [id], '刷新或直接打开链接不应回到首页');
  router.navigate('#home');
  assert.deepEqual(router.visible(), ['home'], '页内 hash 变化需要切换页面');
});

test('已导出页面链接保留章节,未打包的相对路径以 HTML 输出位置为准', async () => {
  const dir = await makeProject();
  await write(dir, 'docs/requirements/v1.2.0/final/导出-批量.md', lines('# 批量导出', '', '## 目标', '一次导出多条。'));
  await write(dir, '.ai/knowledge/entries/orders-api.md', lines(
    '---', 'type: entry', 'group: 订单 API', 'form: API 分组', 'summary: 下单', 'domains: [订单]', '---',
    '', '# 订单 API', '',
    '见 [订单](../domains/order.md)、[批量导出](../../../docs/requirements/v1.2.0/final/%E5%AF%BC%E5%87%BA-%E6%89%B9%E9%87%8F.md#目标)。',
    '契约在 [orders.yaml](../../../docs/api/orders.yaml?view=1#schema),外部见 [官网](https://example.com)。'));
  await exportKnowledge({ targetDir: dir, allowDownload: false });
  const html = await read(dir, '.ai/knowledge.html');

  assert.ok(html.includes('href="#ai-knowledge-domains-order"'), '领域页链接应改为页内跳转');
  assert.ok(html.includes('href="#docs-requirements-v1-2-0-final-导出-批量:目标"'), '编码过的中文路径也要识别');
  assert.ok(html.includes('id="docs-requirements-v1-2-0-final-导出-批量:目标"'));
  assert.deepEqual(runRouter(html, '#docs-requirements-v1-2-0-final-导出-批量:目标').visible(), ['docs-requirements-v1-2-0-final-导出-批量']);
  assert.ok(html.includes('href="../docs/api/orders.yaml?view=1#schema"'));
  assert.ok(html.includes('href="https://example.com"'), '外链保持原样');
  assert.ok(!html.includes('order.md"'), '不应残留指向 .md 源文件的链接');

  const out = 'build/wiki/index.html';
  await exportKnowledge({ targetDir: dir, out, allowDownload: false });
  assert.ok((await read(dir, out)).includes('href="../../docs/api/orders.yaml?view=1#schema"'));
});

test('导出嵌套规则、接入 README 和项目 Wiki,并解析旧 Wiki 双链', async () => {
  const dir = await makeProject();
  await write(dir, '.ai/knowledge/conventions.md', lines('# 开发约定', '[后端规则](rules/team/backend.md)', '[接入记录](../../docs/adoption/README.md)'));
  await write(dir, '.ai/knowledge/rules/team/backend.md', lines('# 后端规则', '规则正文'));
  await write(dir, 'docs/adoption/README.md', lines('# 接入记录', '证据正文'));
  await write(dir, 'docs/wiki/readme.md', lines('# 旧 Wiki 入口', '[[模块 A#2-路径检查|模块导航]]', '[[不存在|待补资料]]', '\u0060[[代码示例]]\u0060'));
  await write(dir, 'docs/wiki/modules/模块 A.md', lines('# 模块 A', '## 2. 路径检查', '旧 Wiki 正文', '', '[[readme|返回入口]]'));
  const result = await exportKnowledge({ targetDir: dir, allowDownload: false });
  const html = await read(dir, result.out);
  assert.match(html, /href="#ai-knowledge-rules-team-backend">后端规则/);
  assert.match(html, /href="#docs-adoption-readme">接入记录/);
  assert.match(html, /href="#docs-wiki-modules-模块-a:2-路径检查">模块导航/);
  assert.match(html, /href="#docs-wiki-readme">返回入口/);
  assert.match(html, /<code>\[\[代码示例\]\]<\/code>/);
  assert.match(html, /无法定位.*待补资料/);
  assert.ok(result.warnings.some(message => message.includes('不存在')));
});
