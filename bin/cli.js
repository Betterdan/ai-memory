#!/usr/bin/env node
import { Command } from 'commander';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyFrameworkUpdate, detectInstallation, METADATA_DEST, planFrameworkUpdate, writeFrameworkMetadata } from '../src/framework.js';
import {
  createModelRoutingConfig, MODEL_PROFILES, readModelRoutingConfig,
  resolveModelRouting, writeModelRoutingConfig,
} from '../src/model-routing.js';
import { ScaffoldError, scaffold } from '../src/scaffold.js';
import { prepareHandoff, recordStageResult, verifyHandoff } from '../src/workflow.js';

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
  .option('--model-profile <profile>', '模型路由策略:inherit,balanced,quality', 'inherit')
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
    if (!MODEL_PROFILES.includes(opts.modelProfile)) {
      throw new Error(`model profile 仅支持 ${MODEL_PROFILES.join('、')},收到: ${opts.modelProfile}`);
    }

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
      const { input, checkbox, select } = await import('@inquirer/prompts');
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
      if (opts.modelProfile === 'inherit') {
        opts.modelProfile = await select({
          message: '模型路由策略:',
          choices: [
            { name: 'inherit - 继承当前会话模型,兼容旧行为', value: 'inherit' },
            { name: 'balanced - 高级规划/中等实现/便宜测试/高级审查', value: 'balanced' },
            { name: 'quality - 关键实现与诊断也使用高级模型', value: 'quality' },
          ],
          default: 'inherit',
        });
      }
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
    const vars = {
      projectName: name, techStack: stack, date, modelProfile: opts.modelProfile, frameworkVersion: PACKAGE.version,
    };
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
    console.log(`模型路由:${opts.modelProfile}`);
    if (r.imported.length) for (const d of r.imported) console.log(`  已导入 ${d}`);
    if (r.fallback.length) for (const d of r.fallback) console.log(`  导入源缺失,使用模板 ${d}`);
    if (r.skipped.length) for (const d of r.skipped) console.log(`  跳过 ${d}`);
    console.log('下一步:打开项目让 agent 读 .ai/memory/MEMORY.md;把项目命令补进 CLAUDE.md/AGENTS.md。');
  });

const models = program.command('models').description('查看或配置阶段模型路由');

models
  .command('show')
  .description('显示当前模型路由配置与阶段映射')
  .action(async () => {
    const config = await readModelRoutingConfig(process.cwd());
    console.log(`模型路由:${config.profile}`);
    for (const [stage, tier] of Object.entries(resolveModelRouting(config))) console.log(`  ${stage}: ${tier}`);
  });

models
  .command('configure')
  .description('切换模型路由预设;不修改需求、设计或代码')
  .requiredOption('--profile <profile>', 'inherit,balanced,quality')
  .action(async (opts) => {
    const installation = await detectInstallation(process.cwd());
    if (installation.kind === 'none') throw new Error('当前目录不是 ai-memory 项目,请先运行 init');
    const current = await readModelRoutingConfig(process.cwd());
    const next = createModelRoutingConfig(opts.profile);
    next.overrides = current.overrides;
    await writeModelRoutingConfig(process.cwd(), next);
    console.log(`模型路由已切换:${current.profile} → ${next.profile}`);
  });

const workflow = program.command('workflow').description('创建并校验跨模型阶段交接');

workflow
  .command('prepare')
  .description('根据正式文档生成带哈希的本地交接清单')
  .requiredOption('--feature <id>', '功能标识,不得包含路径分隔符')
  .requiredOption('--stage <stage>', '目标工作流阶段')
  .requiredOption('--risk <level>', 'S,M,L')
  .option('--input <path>', '正式输入文件,可重复', collect, [])
  .option('--acceptance <id>', '验收标准编号,可重复', collect, [])
  .option('--scope <path>', '允许变更范围,可重复', collect, [])
  .option('--unresolved <text>', '未决问题,可重复;存在时 verify 会阻止进入阶段', collect, [])
  .action(async (opts) => {
    const result = await prepareHandoff({
      targetDir: process.cwd(), feature: opts.feature, stage: opts.stage, risk: opts.risk,
      inputs: opts.input, acceptanceCriteria: opts.acceptance, allowedChangeScope: opts.scope,
      unresolvedDecisions: opts.unresolved,
    });
    console.log(`交接清单已生成:${result.path}`);
    console.log(`执行等级:${result.handoff.executorTier}`);
    if (result.handoff.unresolvedDecisions.length) console.log(`警告:仍有 ${result.handoff.unresolvedDecisions.length} 个未决问题`);
  });

workflow
  .command('verify')
  .description('验证交接输入、哈希、路由和未决问题')
  .requiredOption('--feature <id>', '功能标识')
  .option('--stage <stage>', '期望工作流阶段')
  .action(async (opts) => {
    const handoff = await verifyHandoff({ targetDir: process.cwd(), feature: opts.feature, expectedStage: opts.stage });
    console.log(`交接校验通过:${handoff.featureId} / ${handoff.stage} / ${handoff.executorTier}`);
  });

workflow
  .command('complete')
  .description('校验阶段回执并保存到对应 run 目录')
  .requiredOption('--feature <id>', '功能标识')
  .requiredOption('--result <path>', '项目内阶段回执 JSON 路径')
  .action(async (opts) => {
    const recorded = await recordStageResult({ targetDir: process.cwd(), feature: opts.feature, resultPath: opts.result });
    console.log(`阶段回执已记录:${recorded.path} / ${recorded.result.status}`);
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

function collect(value, previous) {
  return [...previous, value];
}
