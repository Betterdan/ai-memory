#!/usr/bin/env node
import { Command } from 'commander';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyFrameworkUpdate, detectInstallation, METADATA_DEST, planFrameworkUpdate, writeFrameworkMetadata } from '../src/framework.js';
import { ScaffoldError, scaffold } from '../src/scaffold.js';

const TEMPLATES = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'templates');
const PACKAGE = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const program = new Command();

program.name('ai-memory').description('AI memory + requirements workflow scaffolder').version(PACKAGE.version);

program
  .command('init')
  .description('在当前目录生成 ai-memory 框架')
  .option('--name <name>', '项目名')
  .option('--stack <desc>', '技术栈描述')
  .option('--tools <list>', '启用工具,逗号分隔:claude,codex')
  .option('--import <path>', '从已有项目导入 user-profile/feedback')
  .option('--yes', '非交互模式:缺参用默认值,冲突一律跳过')
  .action(async (opts) => {
    const targetDir = process.cwd();
    const existingInstallation = await detectInstallation(targetDir);
    if (existingInstallation.kind !== 'none') {
      const label = existingInstallation.kind === 'legacy'
        ? '检测到无元数据的 v0.1.0 legacy 项目'
        : `项目已由 ai-memory ${existingInstallation.metadata.frameworkVersion} 初始化`;
      throw new Error(`${label};不要重新运行 init,请先执行 ai-memory update --dry-run`);
    }
    let { name, stack, tools: toolsRaw } = opts;

    // Validate CLI-supplied --tools before entering interactive prompts
    if (toolsRaw !== undefined) {
      for (const t of toolsRaw.split(',').map(s => s.trim()).filter(Boolean)) {
        if (t !== 'claude' && t !== 'codex') {
          console.error(`tools 仅支持 claude、codex,收到: ${t}`);
          process.exit(1);
        }
      }
    }

    let importFrom = opts.import;
    if (!opts.yes) {
      const { input, checkbox } = await import('@inquirer/prompts');
      name ??= await input({ message: '项目名:', default: path.basename(targetDir) });
      stack ??= await input({ message: '技术栈描述:', default: '(待补充)' });
      toolsRaw ??= (await checkbox({
        message: '启用哪些工具适配:',
        choices: [
          { name: 'Claude Code', value: 'claude', checked: true },
          { name: 'Codex', value: 'codex', checked: true },
        ],
      })).join(',');
      importFrom ??= (await input({
        message: '从已有项目导入 user-profile/feedback?(输入项目路径,留空跳过)', default: '',
      })) || undefined;
    }
    name ??= path.basename(targetDir);
    stack ??= '(待补充)';
    toolsRaw ??= 'claude,codex';

    const tools = [...new Set(toolsRaw.split(',').map(s => s.trim()).filter(Boolean))];
    if (tools.length === 0) {
      console.log('未启用任何工具适配,仅生成 .ai/ 通用层');
    }

    const onConflict = opts.yes
      ? () => 'skip'
      : async (dest) => {
          const { confirm } = await import('@inquirer/prompts');
          return (await confirm({ message: `${dest} 已存在,覆盖?`, default: false })) ? 'overwrite' : 'skip';
        };

    const date = new Date().toISOString().slice(0, 10);
    const vars = { projectName: name, techStack: stack, date };
    const r = await scaffold({ templatesRoot: TEMPLATES, targetDir, vars, tools, onConflict, importFrom });
    if (r.skipped.length === 0) {
      try {
        await writeFrameworkMetadata({
          targetDir, templatesRoot: TEMPLATES, frameworkVersion: PACKAGE.version,
          tools, projectName: name, techStack: stack, date,
        });
        r.written.push(METADATA_DEST);
      } catch (err) {
        throw new ScaffoldError({
          phase: 'write', dest: METADATA_DEST, destPath: path.join(targetDir, '.ai', 'ai-memory.json'),
          cause: err, summary: r, notWritten: [METADATA_DEST],
        });
      }
    } else {
      console.log('警告:存在冲突跳过项,未创建框架元数据;当前结果不能自动升级');
    }
    console.log(`完成:写入 ${r.written.length},跳过 ${r.skipped.length}`);
    if (r.imported.length) for (const d of r.imported) console.log(`  已导入 ${d}`);
    if (r.fallback.length) for (const d of r.fallback) console.log(`  导入源缺失,使用模板 ${d}`);
    if (r.skipped.length) for (const d of r.skipped) console.log(`  跳过 ${d}`);
    console.log('下一步:打开项目让 agent 读 .ai/memory/MEMORY.md;把项目命令补进 CLAUDE.md/AGENTS.md。');
  });

program
  .command('update')
  .description('检查当前项目升级到本 CLI 版本所需的变更')
  .option('--dry-run', '只输出升级计划,不修改任何文件')
  .option('--yes', '应用无冲突的安全更新;存在合并/审查项时拒绝写入')
  .action(async (opts) => {
    if (opts.dryRun === opts.yes) throw new Error('update 必须且只能指定 --dry-run 或 --yes');
    const plan = await planFrameworkUpdate({
      targetDir: process.cwd(), templatesRoot: TEMPLATES, frameworkVersion: PACKAGE.version,
    });
    printUpdatePlan(plan);
    if (opts.yes) {
      const result = await applyFrameworkUpdate({ targetDir: process.cwd(), templatesRoot: TEMPLATES, plan });
      console.log(`安全更新完成:写入 ${result.written.length}`);
      for (const dest of result.written) console.log(`  ${dest}`);
    }
  });

program.parseAsync().catch((e) => {
  if (e.name === 'ExitPromptError') {
    console.log('已取消');
  } else {
    console.error('错误: ' + e.message);
    if (e.name === 'ScaffoldError') {
      console.error(`已写入 ${e.summary.written.length}:`);
      for (const d of e.summary.written) console.error(`  ${d}`);
      console.error(`尚未写入 ${e.notWritten.length}:`);
      for (const d of e.notWritten) console.error(`  ${d}`);
      if (e.summary.skipped.length) {
        console.error(`已跳过 ${e.summary.skipped.length}:`);
        for (const d of e.summary.skipped) console.error(`  ${d}`);
      }
    }
  }
  process.exit(1);
});

function printUpdatePlan(plan) {
  const current = plan.installation.kind === 'legacy'
    ? 'v0.1.0 legacy(无元数据)'
    : `${plan.installation.metadata.frameworkVersion} / schema ${plan.installation.metadata.schemaVersion}`;
  console.log(`当前:${current}`);
  console.log(`目标:${plan.frameworkVersion} / schema ${plan.schemaVersion}`);
  console.log(`工具:${plan.tools.length ? plan.tools.join(',') : '(仅 common)'}`);

  const groups = [
    ['add', '新增'],
    ['update', '可安全更新'],
    ['merge', '需要合并'],
    ['review', '需要人工审查'],
    ['review-remove', '需要确认移除'],
    ['preserve', '保留用户资产'],
    ['unchanged', '无需变化'],
  ];
  for (const [action, label] of groups) {
    const items = plan.actions.filter(item => item.action === action);
    console.log(`${label} ${items.length}`);
    if (action !== 'unchanged') for (const item of items) console.log(`  ${item.dest}`);
  }
  if (plan.migrations.length) {
    console.log(`Schema 迁移 ${plan.migrations.length}(当前仅规划,不执行)`);
    for (const migration of plan.migrations) {
      console.log(`  ${migration.id}: ${migration.from} → ${migration.to}`);
    }
  }
  console.log('升级计划完成');
  if (process.argv.includes('--dry-run')) console.log('dry-run:未修改任何文件');
}
