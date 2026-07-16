import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp, readFile, writeFile, access, mkdir, cp } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'cli.js');
const LEGACY_FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'legacy-v0.1');
const PACKAGE_VERSION = JSON.parse(
  await readFile(path.join(path.dirname(CLI), '..', 'package.json'), 'utf8')
).version;

test('init --yes 全量生成且渲染变量', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'aim-cli-'));
  const { stdout } = await run(process.execPath, [CLI, 'init', '--name', 'demo', '--stack', 'Go', '--tools', 'claude,codex', '--yes'], { cwd: dir });
  assert.ok(stdout.includes('agent 读 .ai/README.md'));
  const state = await readFile(path.join(dir, '.ai/memory/project-state.md'), 'utf8');
  assert.ok(state.includes('- 项目:demo'));
  assert.ok(state.includes('- 技术栈:Go'));
  await access(path.join(dir, 'CLAUDE.md'));
  await access(path.join(dir, 'AGENTS.md'));
  const metadata = JSON.parse(await readFile(path.join(dir, '.ai/ai-memory.json'), 'utf8'));
  assert.equal(metadata.frameworkVersion, PACKAGE_VERSION);
  assert.equal(metadata.schemaVersion, 1);
  assert.deepEqual(metadata.tools, ['claude', 'codex']);
  assert.equal(metadata.templateVars.projectName, 'demo');
  assert.equal(metadata.files['.ai/memory/project-state.md'].ownership, 'user');
  assert.equal(metadata.files['.ai/config/model-routing.json'].ownership, 'user');
  assert.equal(metadata.files['.ai/skills/critic.md'].ownership, 'framework');
  assert.equal(metadata.files['AGENTS.md'].ownership, 'mixed');
  const routing = JSON.parse(await readFile(path.join(dir, '.ai/config/model-routing.json'), 'utf8'));
  assert.equal(routing.profile, 'inherit');
});

test('init --tools claude 不生成 Codex 侧', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'aim-cli-'));
  await run(process.execPath, [CLI, 'init', '--name', 'demo', '--stack', 'Go', '--tools', 'claude', '--yes'], { cwd: dir });
  await access(path.join(dir, 'CLAUDE.md'));
  await assert.rejects(access(path.join(dir, 'AGENTS.md')));
});

test('init --yes 冲突时跳过既有文件', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'aim-cli-'));
  await writeFile(path.join(dir, 'CLAUDE.md'), 'MINE\n');
  const { stdout } = await run(process.execPath, [CLI, 'init', '--name', 'demo', '--stack', 'Go', '--tools', 'claude', '--yes'], { cwd: dir });
  assert.equal(await readFile(path.join(dir, 'CLAUDE.md'), 'utf8'), 'MINE\n');
  assert.ok(stdout.includes('跳过 1'));
  assert.ok(stdout.includes('未创建框架元数据'));
  await assert.rejects(access(path.join(dir, '.ai/ai-memory.json')));
});

test('非法 --tools 值报错退出(验证在交互前)', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'aim-cli-'));
  await assert.rejects(
    run(process.execPath, [CLI, 'init', '--tools', 'cursor', '--yes'], { cwd: dir }),
    /tools 仅支持 claude、codex/
  );
});

test('--tools "" 空工具:输出提示且正常退出,仅生成通用层', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'aim-cli-'));
  const { stdout } = await run(process.execPath, [CLI, 'init', '--tools', '', '--yes'], { cwd: dir });
  assert.ok(stdout.includes('未启用任何工具适配'), `期望提示未启用工具, 实际: ${stdout}`);
  await assert.rejects(access(path.join(dir, 'CLAUDE.md')), '不应生成 CLAUDE.md');
  await assert.rejects(access(path.join(dir, 'AGENTS.md')), '不应生成 AGENTS.md');
  await access(path.join(dir, '.ai/memory/MEMORY.md')); // 通用层应存在
});

test('--import 导入存在文件并明确报告缺失文件回退', async () => {
  const source = await mkdtemp(path.join(os.tmpdir(), 'aim-cli-source-'));
  await mkdir(path.join(source, '.ai', 'memory'), { recursive: true });
  await writeFile(path.join(source, '.ai', 'memory', 'user-profile.md'), 'IMPORTED_PROFILE\n');
  const dir = await mkdtemp(path.join(os.tmpdir(), 'aim-cli-'));
  const { stdout } = await run(process.execPath, [CLI, 'init', '--tools', '', '--import', source, '--yes'], { cwd: dir });
  assert.equal(await readFile(path.join(dir, '.ai', 'memory', 'user-profile.md'), 'utf8'), 'IMPORTED_PROFILE\n');
  assert.ok(stdout.includes('已导入 .ai/memory/user-profile.md'));
  assert.ok(stdout.includes('导入源缺失,使用模板 .ai/memory/feedback.md'));
});

test('--import 目录不存在时报错且不生成文件', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'aim-cli-'));
  const missing = path.join(dir, 'missing-import');
  await assert.rejects(
    run(process.execPath, [CLI, 'init', '--tools', '', '--import', missing, '--yes'], { cwd: dir }),
    /导入目录不存在/
  );
  await assert.rejects(access(path.join(dir, '.ai', 'memory', 'MEMORY.md')));
});

test('准备阶段失败时报告已写入与尚未写入文件', async () => {
  const source = await mkdtemp(path.join(os.tmpdir(), 'aim-cli-source-'));
  await mkdir(path.join(source, '.ai', 'memory', 'feedback.md'), { recursive: true });
  const dir = await mkdtemp(path.join(os.tmpdir(), 'aim-cli-'));
  await assert.rejects(
    run(process.execPath, [CLI, 'init', '--tools', '', '--import', source, '--yes'], { cwd: dir }),
    (err) => {
      assert.match(err.stderr, /错误: 生成 \.ai\/memory\/feedback\.md 失败\(prepare\)/);
      assert.match(err.stderr, /已写入 0:/);
      assert.match(err.stderr, /尚未写入 \d+:/);
      assert.match(err.stderr, /\.ai\/README\.md/);
      return true;
    }
  );
  await assert.rejects(access(path.join(dir, '.ai', 'README.md')));
});

test('update --dry-run 对元数据项目识别用户修改且不写文件', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'aim-cli-'));
  await run(process.execPath, [CLI, 'init', '--tools', '', '--yes'], { cwd: dir });
  const criticPath = path.join(dir, '.ai', 'skills', 'critic.md');
  await writeFile(criticPath, 'USER_EDITED\n');
  const metadataBefore = await readFile(path.join(dir, '.ai', 'ai-memory.json'), 'utf8');

  const { stdout } = await run(process.execPath, [CLI, 'update', '--dry-run'], { cwd: dir });
  assert.ok(stdout.includes(`当前:${PACKAGE_VERSION} / schema 1`));
  assert.ok(stdout.includes('需要人工审查 1'));
  assert.ok(stdout.includes('.ai/skills/critic.md'));
  assert.ok(stdout.includes('dry-run:未修改任何文件'));
  assert.equal(await readFile(criticPath, 'utf8'), 'USER_EDITED\n');
  assert.equal(await readFile(path.join(dir, '.ai', 'ai-memory.json'), 'utf8'), metadataBefore);

  await assert.rejects(
    run(process.execPath, [CLI, 'update', '--yes'], { cwd: dir }),
    /需合并\/审查项/
  );
  assert.equal(await readFile(criticPath, 'utf8'), 'USER_EDITED\n');
});

test('v0.1 legacy 项目只能先 update --dry-run,不能重新 init', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'aim-cli-legacy-'));
  await mkdir(path.join(dir, '.ai', 'memory'), { recursive: true });
  await writeFile(path.join(dir, '.ai', 'README.md'), '# legacy\n由 @betterdanlins/ai-memory 生成于 2026-07-01。\n');
  await writeFile(path.join(dir, '.ai', 'memory', 'project-state.md'), '- 项目:demo\n- 技术栈:Go\n');
  await writeFile(path.join(dir, '.ai', 'memory', 'session-log.md'), 'KEEP_MEMORY\n');

  const { stdout } = await run(process.execPath, [CLI, 'update', '--dry-run'], { cwd: dir });
  assert.ok(stdout.includes('v0.1.0 legacy(无元数据)'));
  assert.ok(stdout.includes('Schema 迁移 1(当前仅规划,不执行)'));
  assert.equal(await readFile(path.join(dir, '.ai', 'memory', 'session-log.md'), 'utf8'), 'KEEP_MEMORY\n');
  await assert.rejects(access(path.join(dir, '.ai', 'ai-memory.json')));

  await assert.rejects(
    run(process.execPath, [CLI, 'init', '--yes'], { cwd: dir }),
    /不要重新运行 init,请先执行 ai-memory update --dry-run/
  );
});

test('update 必须且只能选择 dry-run 或 yes', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'aim-cli-'));
  await run(process.execPath, [CLI, 'init', '--tools', '', '--yes'], { cwd: dir });
  await assert.rejects(
    run(process.execPath, [CLI, 'update'], { cwd: dir }),
    /update 必须且只能指定 --dry-run 或 --yes/
  );
  await assert.rejects(
    run(process.execPath, [CLI, 'update', '--dry-run', '--yes'], { cwd: dir }),
    /update 必须且只能指定 --dry-run 或 --yes/
  );
});

test('未修改的 v0.1 legacy 项目可安全升级且保留记忆', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'aim-cli-legacy-'));
  await cp(LEGACY_FIXTURE, dir, { recursive: true });

  const preview = await run(process.execPath, [CLI, 'update', '--dry-run'], { cwd: dir });
  assert.match(preview.stdout, /可安全更新 [1-9]\d*/);
  assert.ok(preview.stdout.includes('保留用户资产'));

  const { stdout } = await run(process.execPath, [CLI, 'update', '--yes'], { cwd: dir });
  assert.ok(stdout.includes('安全更新完成'));
  assert.equal(await readFile(path.join(dir, '.ai', 'memory', 'session-log.md'), 'utf8'), 'KEEP_SESSION_MEMORY\n');
  assert.ok((await readFile(path.join(dir, '.ai', 'memory', 'project-state.md'), 'utf8')).includes('KEEP_PROJECT_MEMORY'));
  assert.ok((await readFile(path.join(dir, '.ai', 'README.md'), 'utf8')).includes('project-inception'));
  assert.ok((await readFile(path.join(dir, 'docs', 'requirements', 'README.md'), 'utf8')).includes('外部行为契约'));

  const metadata = JSON.parse(await readFile(path.join(dir, '.ai', 'ai-memory.json'), 'utf8'));
  assert.equal(metadata.schemaVersion, 1);
  assert.equal(metadata.templateVars.projectName, 'legacy-demo');
});

test('init 可显式启用 balanced 模型路由且拒绝未知 profile', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'aim-cli-routing-'));
  const { stdout } = await run(process.execPath, [CLI, 'init', '--tools', '', '--model-profile', 'balanced', '--yes'], { cwd: dir });
  assert.ok(stdout.includes('模型路由:balanced'));
  const config = JSON.parse(await readFile(path.join(dir, '.ai/config/model-routing.json'), 'utf8'));
  assert.equal(config.profile, 'balanced');

  const invalid = await mkdtemp(path.join(os.tmpdir(), 'aim-cli-routing-'));
  await assert.rejects(
    run(process.execPath, [CLI, 'init', '--tools', '', '--model-profile', 'fast', '--yes'], { cwd: invalid }),
    /model profile 仅支持/
  );
});

test('models configure/show 切换路由但不修改框架元数据', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'aim-cli-routing-'));
  await run(process.execPath, [CLI, 'init', '--tools', '', '--yes'], { cwd: dir });
  const metadataBefore = await readFile(path.join(dir, '.ai/ai-memory.json'), 'utf8');
  const configured = await run(process.execPath, [CLI, 'models', 'configure', '--profile', 'balanced'], { cwd: dir });
  assert.ok(configured.stdout.includes('inherit → balanced'));
  const shown = await run(process.execPath, [CLI, 'models', 'show'], { cwd: dir });
  assert.ok(shown.stdout.includes('implementation: standard'));
  assert.ok(shown.stdout.includes('final-review: premium'));
  assert.equal(await readFile(path.join(dir, '.ai/ai-memory.json'), 'utf8'), metadataBefore);
});

test('workflow prepare/verify 检测正式输入变化', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'aim-cli-workflow-'));
  await run(process.execPath, [CLI, 'init', '--tools', '', '--model-profile', 'balanced', '--yes'], { cwd: dir });
  await mkdir(path.join(dir, 'docs', 'design', 'v1.0.0'), { recursive: true });
  const designPath = path.join(dir, 'docs', 'design', 'v1.0.0', 'login.md');
  await writeFile(designPath, '# login\n');

  const prepared = await run(process.execPath, [
    CLI, 'workflow', 'prepare', '--feature', 'login', '--stage', 'implementation', '--risk', 'M',
    '--input', 'docs/design/v1.0.0/login.md', '--acceptance', 'AC-01', '--scope', 'src/auth/**',
  ], { cwd: dir });
  assert.ok(prepared.stdout.includes('执行等级:standard'));
  const verified = await run(process.execPath, [CLI, 'workflow', 'verify', '--feature', 'login', '--stage', 'implementation'], { cwd: dir });
  assert.ok(verified.stdout.includes('交接校验通过'));

  const result = {
    stage: 'implementation', status: 'completed', changedFiles: [], acceptanceCoverage: { 'AC-01': 'covered' },
    tests: ['npm test'], designDeviations: [], unresolvedRisks: [],
  };
  await writeFile(path.join(dir, 'result.json'), JSON.stringify(result));
  const completed = await run(process.execPath, [CLI, 'workflow', 'complete', '--feature', 'login', '--result', 'result.json'], { cwd: dir });
  assert.ok(completed.stdout.includes('implementation-result.json / completed'));

  await writeFile(designPath, '# changed\n');
  await assert.rejects(
    run(process.execPath, [CLI, 'workflow', 'verify', '--feature', 'login'], { cwd: dir }),
    /交接输入已变化/
  );
});

test('update 只替换 AGENTS.md 受管区块并保留用户内容', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'aim-cli-managed-'));
  await run(process.execPath, [CLI, 'init', '--tools', 'codex', '--yes'], { cwd: dir });
  const agentsPath = path.join(dir, 'AGENTS.md');
  const original = await readFile(agentsPath, 'utf8');
  const customized = original
    .replace('进场先读 `.ai/README.md`', 'BROKEN_MANAGED')
    .replace('<!-- 在此补充启动/测试/构建命令 -->', 'USER_CUSTOM_COMMAND=npm test');
  await writeFile(agentsPath, customized);

  const preview = await run(process.execPath, [CLI, 'update', '--dry-run'], { cwd: dir });
  assert.ok(preview.stdout.includes('更新受管区块 1'));
  const applied = await run(process.execPath, [CLI, 'update', '--yes'], { cwd: dir });
  assert.ok(applied.stdout.includes('安全更新完成'));

  const result = await readFile(agentsPath, 'utf8');
  assert.ok(!result.includes('BROKEN_MANAGED'));
  assert.ok(result.includes('进场先读 `.ai/README.md`'));
  assert.ok(result.includes('USER_CUSTOM_COMMAND=npm test'));
});
