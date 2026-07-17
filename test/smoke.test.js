import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const cli = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'cli.js');

test('CLI 可启动并公开核心命令', async () => {
  const { stdout } = await run(process.execPath, [cli, '--help']);
  for (const command of ['init', 'update', 'models', 'workflow']) {
    assert.match(stdout, new RegExp(`\\b${command}\\b`));
  }
});
