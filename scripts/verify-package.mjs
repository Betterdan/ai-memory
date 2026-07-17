import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const workDir = await mkdtemp(path.join(os.tmpdir(), 'ai-memory-package-'));

try {
  const packDir = path.join(workDir, 'pack');
  const installDir = path.join(workDir, 'install');
  const projectDir = path.join(workDir, 'project');
  await Promise.all([
    mkdir(packDir, { recursive: true }),
    mkdir(installDir, { recursive: true }),
    mkdir(projectDir, { recursive: true }),
  ]);

  const packed = await runNpm([
    'pack', '--json', '--pack-destination', packDir,
  ], { cwd: root });
  const [manifest] = JSON.parse(packed.stdout);
  assert.equal(manifest.name, packageJson.name);
  assert.equal(manifest.version, packageJson.version);

  const publishedFiles = new Set(manifest.files.map(file => file.path.replaceAll('\\', '/')));
  const forbiddenExact = ['AGENTS.md', 'CLAUDE.md', '.claude/settings.local.json'];
  const forbiddenPrefixes = ['.github/', 'docs/', 'test/', 'scripts/'];
  for (const file of forbiddenExact) {
    assert.ok(!publishedFiles.has(file), `发布包不应包含本地文件: ${file}`);
  }
  for (const prefix of forbiddenPrefixes) {
    assert.ok(![...publishedFiles].some(file => file.startsWith(prefix)), `发布包不应包含: ${prefix}`);
  }
  for (const required of ['bin/cli.js', 'src/framework.js', 'templates/common/.ai/README.md']) {
    assert.ok(publishedFiles.has(required), `发布包缺少: ${required}`);
  }

  const tarball = path.join(packDir, manifest.filename);
  await runNpm([
    'install', tarball, '--ignore-scripts', '--no-audit', '--no-fund', '--prefer-offline',
  ], { cwd: installDir });

  const installedRoot = path.join(installDir, 'node_modules', '@betterdanlins', 'ai-memory');
  const cli = path.join(installedRoot, 'bin', 'cli.js');
  await access(cli);
  const installedVersion = await run(process.execPath, [cli, '--version'], { cwd: projectDir });
  assert.equal(installedVersion.stdout.trim(), packageJson.version);
  const initialized = await run(process.execPath, [
    cli, 'init', '--name', 'package-smoke', '--stack', 'Node.js',
    '--tools', 'claude,codex', '--yes',
  ], { cwd: projectDir });
  assert.match(initialized.stdout, /完成:写入/);

  const metadata = JSON.parse(await readFile(path.join(projectDir, '.ai', 'ai-memory.json'), 'utf8'));
  assert.equal(metadata.frameworkVersion, packageJson.version);
  assert.deepEqual(metadata.tools, ['claude', 'codex']);
  await Promise.all([
    access(path.join(projectDir, '.ai', 'runs', '.gitignore')),
    access(path.join(projectDir, 'AGENTS.md')),
    access(path.join(projectDir, 'CLAUDE.md')),
  ]);

  const preview = await run(process.execPath, [cli, 'update', '--dry-run'], { cwd: projectDir });
  assert.ok(preview.stdout.includes(`当前:${packageJson.version} / schema 1`));
  assert.ok(preview.stdout.includes('需要合并 0'));
  assert.ok(preview.stdout.includes('需要人工审查 0'));

  console.log(`package verification passed: ${manifest.filename} (${manifest.files.length} files)`);
} finally {
  await rm(workDir, { recursive: true, force: true });
}

function runNpm(args, options) {
  const npmCli = process.env.npm_execpath;
  if (!npmCli) throw new Error('缺少 npm_execpath；请通过 npm run test:package 执行发布包验证');
  return run(process.execPath, [npmCli, ...args], options);
}

function run(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${command} ${args.join(' ')} 退出码 ${code}\n${stdout}${stderr}`));
    });
  });
}
