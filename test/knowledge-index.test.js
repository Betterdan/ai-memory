import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import {
  GeneratedBlockError, hasGeneratedBlock, readGeneratedBlock, replaceGeneratedBlock,
} from '../src/generated-blocks.js';
import { applyKnowledgeBuild, parseFrontmatter, planKnowledgeBuild } from '../src/knowledge-index.js';
import { scaffold } from '../src/scaffold.js';
import { createTempDirs } from './temp-dirs.js';

const TEMPLATES = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'templates');
const tempDirs = createTempDirs();
afterEach(() => tempDirs.cleanup());

const VARS = {
  projectName: 'demo', techStack: 'Go', date: '2026-09-16', modelProfile: 'inherit', frameworkVersion: '0.11.0',
};

const ENTRY_ORDERS = [
  '---',
  'type: entry',
  'group: 订单 API',
  'form: API 分组',
  'summary: 下单、改单与取消',
  'contract: docs/api/orders.yaml',
  'domains: [订单, 支付]',
  '---',
  '',
  '# 订单 API',
  '',
].join('\n');

const ENTRY_CHECKOUT = [
  '---',
  'type: entry',
  'group: 结算页',
  'form: 页面',
  'summary: 购物车到支付',
  'domains: [支付]',
  '---',
  '',
  '# 结算页',
  '',
].join('\n');

const DOMAIN_PAGE = (name, summary) => [
  '---',
  'type: domain',
  `name: ${name}`,
  `summary: ${summary}`,
  '---',
  '',
  `# ${name}`,
  '',
  'HANDWRITTEN_ABOVE',
  '',
  '## 关联入口',
  '',
  '<!-- ai-memory:generated:related-entries:start -->',
  '<!-- ai-memory:generated:related-entries:end -->',
  '',
  '## 相关接口',
  '',
  '<!-- ai-memory:generated:related-contracts:start -->',
  '<!-- ai-memory:generated:related-contracts:end -->',
  '',
  'HANDWRITTEN_BELOW',
  '',
].join('\n');

async function makeProject() {
  const dir = await tempDirs.make('aim-kb-');
  await scaffold({ templatesRoot: TEMPLATES, targetDir: dir, vars: VARS, tools: [], onConflict: () => 'skip' });
  const k = (...parts) => path.join(dir, '.ai', 'knowledge', ...parts);
  await writeFile(k('entries', 'orders.md'), ENTRY_ORDERS);
  await writeFile(k('entries', 'checkout.md'), ENTRY_CHECKOUT);
  await writeFile(k('domains', 'orders.md'), DOMAIN_PAGE('订单', '订单生命周期'));
  await writeFile(k('domains', 'payment.md'), DOMAIN_PAGE('支付', '支付渠道与对账'));
  return dir;
}

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

const read = (dir, rel) => readFile(path.join(dir, ...rel.split('/')), 'utf8');

test('frontmatter 只解析标量与字符串数组,格式不合即判空', () => {
  const parsed = parseFrontmatter('---\ntype: entry\ndomains: [a, b]\nquoted: "x y"\n---\nbody\n');
  assert.equal(parsed.data.type, 'entry');
  assert.deepEqual(parsed.data.domains, ['a', 'b']);
  assert.equal(parsed.data.quoted, 'x y');
  assert.equal(parsed.rest.trim(), 'body');

  assert.equal(parseFrontmatter('# 没有 frontmatter\n'), null);
  assert.equal(parseFrontmatter('---\ntype: entry\n'), null, '未闭合的 frontmatter 判空');
  assert.equal(parseFrontmatter('---\nBadKey: 1\n---\n'), null, '键必须小写下划线');
});

test('生成区块标记缺失、重复或顺序错误时保守失败', () => {
  const ok = 'a\n<!-- ai-memory:generated:idx:start -->\nold\n<!-- ai-memory:generated:idx:end -->\nb\n';
  assert.equal(hasGeneratedBlock(ok, 'idx'), true);
  assert.equal(readGeneratedBlock(ok, 'idx').trim(), 'old');
  assert.ok(replaceGeneratedBlock(ok, 'idx', 'new').includes('new'));

  assert.equal(hasGeneratedBlock('no markers', 'idx'), false);
  assert.throws(() => readGeneratedBlock('no markers', 'idx'), GeneratedBlockError);

  const duplicated = ok + ok;
  assert.equal(hasGeneratedBlock(duplicated, 'idx'), false);
  assert.throws(() => replaceGeneratedBlock(duplicated, 'idx', 'x'), /只能包含一组/);

  const reversed = '<!-- ai-memory:generated:idx:end -->\n<!-- ai-memory:generated:idx:start -->\n';
  assert.throws(() => replaceGeneratedBlock(reversed, 'idx', 'x'), /顺序无效/);
});

test('kb build 生成 overview 两张索引与领域页横向视图', async () => {
  const dir = await makeProject();
  const plan = await planKnowledgeBuild({ targetDir: dir });
  await applyKnowledgeBuild({ targetDir: dir, plan });

  const overview = await read(dir, '.ai/knowledge/overview.md');
  assert.ok(overview.includes('| 订单 API | 下单、改单与取消 | [orders.md](entries/orders.md) |'));
  assert.ok(overview.includes('| 结算页 | 购物车到支付 | [checkout.md](entries/checkout.md) |'));
  assert.ok(overview.includes('| 订单 | 订单生命周期 | [orders.md](domains/orders.md) |'));
  assert.ok(overview.includes('| 支付 | 支付渠道与对账 | [payment.md](domains/payment.md) |'));

  const orders = await read(dir, '.ai/knowledge/domains/orders.md');
  assert.ok(orders.includes('| 订单 API | [orders.md](../entries/orders.md) |'));
  assert.ok(!orders.includes('结算页'), '未声明该领域的入口不得出现');
  assert.ok(orders.includes('- `docs/api/orders.yaml`'));

  const payment = await read(dir, '.ai/knowledge/domains/payment.md');
  assert.ok(payment.includes('| 订单 API | [orders.md](../entries/orders.md) |'));
  assert.ok(payment.includes('| 结算页 | [checkout.md](../entries/checkout.md) |'));
  assert.ok(payment.includes('- `docs/api/orders.yaml`'));
});

test('生成区之外的用户内容逐字节不变', async () => {
  const dir = await makeProject();
  await applyKnowledgeBuild({ targetDir: dir, plan: await planKnowledgeBuild({ targetDir: dir }) });

  const orders = await read(dir, '.ai/knowledge/domains/orders.md');
  assert.ok(orders.includes('HANDWRITTEN_ABOVE'));
  assert.ok(orders.includes('HANDWRITTEN_BELOW'));
  assert.ok(orders.startsWith('---\ntype: domain'), 'frontmatter 必须原样保留');

  const overview = await read(dir, '.ai/knowledge/overview.md');
  assert.ok(overview.includes('- 项目:demo'), '基本信息不得被动');
  assert.ok(overview.includes('| 问题 | 影响 | 触发处理的条件 |'), '遗留问题表不得被动');
});

test('dry-run 不写文件,连续构建幂等', async () => {
  const dir = await makeProject();
  const before = await snapshot(dir);
  const plan = await planKnowledgeBuild({ targetDir: dir });
  assert.ok(plan.changes.length > 0);
  assert.deepEqual(await snapshot(dir), before, 'planKnowledgeBuild 不得改动任何文件');

  await applyKnowledgeBuild({ targetDir: dir, plan });
  const built = await snapshot(dir);

  const second = await planKnowledgeBuild({ targetDir: dir });
  assert.deepEqual(second.changes, [], '内容未变时不应产生变更');
  await applyKnowledgeBuild({ targetDir: dir, plan: second });
  assert.deepEqual(await snapshot(dir), built);
});

test('缺 frontmatter 或缺必填字段的页被跳过且不中断生成', async () => {
  const dir = await makeProject();
  await writeFile(path.join(dir, '.ai', 'knowledge', 'domains', 'draft.md'), '# 随手写的\n');
  await writeFile(
    path.join(dir, '.ai', 'knowledge', 'entries', 'partial.md'),
    '---\ntype: entry\ngroup: 只有分组\n---\n\n# 缺字段\n'
  );

  const plan = await planKnowledgeBuild({ targetDir: dir });
  assert.ok(plan.skipped.some(item => item.includes('draft.md') && item.includes('缺少 frontmatter')));
  assert.ok(plan.skipped.some(item => item.includes('partial.md') && item.includes('缺少字段')));

  const result = await applyKnowledgeBuild({ targetDir: dir, plan });
  const overview = await read(dir, '.ai/knowledge/overview.md');
  assert.ok(overview.includes('订单 API'), '合规的页仍要生成');
  assert.ok(!overview.includes('只有分组'));
  assert.ok(result.written.every(dest => dest.startsWith('.ai/knowledge/')), '只写知识层内的文件');
});

test('README 不当作知识页,缺少 overview 时明确提示', async () => {
  const dir = await makeProject();
  const plan = await planKnowledgeBuild({ targetDir: dir });
  assert.ok(!plan.skipped.some(item => item.includes('README.md')), 'README 不应被当作知识页扫描');

  const bare = await tempDirs.make('aim-kb-bare-');
  await assert.rejects(planKnowledgeBuild({ targetDir: bare }), /缺少 .ai\/knowledge\/overview.md/);
});
