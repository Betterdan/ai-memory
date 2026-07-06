#!/usr/bin/env node
import { Command } from 'commander';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scaffold } from '../src/scaffold.js';

const TEMPLATES = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'templates');
const program = new Command();

program.name('ai-memory').description('AI memory + requirements workflow scaffolder');

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

    const tools = toolsRaw.split(',').map(s => s.trim()).filter(Boolean);
    if (tools.length === 0) {
      console.log('未启用任何工具适配,仅生成 .ai/ 通用层');
    }

    const onConflict = opts.yes
      ? () => 'skip'
      : async (dest) => {
          const { confirm } = await import('@inquirer/prompts');
          return (await confirm({ message: `${dest} 已存在,覆盖?`, default: false })) ? 'overwrite' : 'skip';
        };

    const vars = { projectName: name, techStack: stack, date: new Date().toISOString().slice(0, 10) };
    const r = await scaffold({ templatesRoot: TEMPLATES, targetDir, vars, tools, onConflict, importFrom });
    console.log(`完成:写入 ${r.written.length},跳过 ${r.skipped.length}`);
    if (r.skipped.length) for (const d of r.skipped) console.log(`  跳过 ${d}`);
    console.log('下一步:打开项目让 agent 读 .ai/memory/MEMORY.md;把项目命令补进 CLAUDE.md/AGENTS.md。');
  });

program.parseAsync().catch((e) => {
  if (e.name === 'ExitPromptError') {
    console.log('已取消');
  } else {
    console.error('错误: ' + e.message);
  }
  process.exit(1);
});
