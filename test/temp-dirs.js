import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export function createTempDirs() {
  const directories = new Set();

  return {
    async make(prefix = 'ai-memory-') {
      const directory = await mkdtemp(path.join(os.tmpdir(), prefix));
      directories.add(directory);
      return directory;
    },
    async cleanup() {
      const pending = [...directories];
      directories.clear();
      await Promise.all(pending.map(directory => rm(directory, { recursive: true, force: true })));
    },
  };
}
