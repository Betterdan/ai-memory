import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

async function findTests(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await findTests(entryPath));
    } else if (entry.isFile() && entry.name.endsWith('.test.js')) {
      files.push(entryPath);
    }
  }

  return files;
}

const testFiles = (await findTests(path.resolve('test'))).sort();
if (testFiles.length === 0) {
  throw new Error('No test files matching **/*.test.js were found under test/.');
}

const child = spawn(process.execPath, ['--test', ...testFiles], {
  stdio: 'inherit',
});

child.on('error', (error) => {
  console.error(error);
  process.exitCode = 1;
});

child.on('exit', (code, signal) => {
  if (signal) {
    console.error(`Test runner terminated by signal ${signal}.`);
    process.exitCode = 1;
  } else {
    process.exitCode = code ?? 1;
  }
});
