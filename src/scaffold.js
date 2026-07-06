import { mkdir, readFile, writeFile, access, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { buildManifest } from './manifest.js';
import { render } from './render.js';

export async function scaffold({ templatesRoot, targetDir, vars, tools, onConflict, importFrom }) {
  const manifest = await buildManifest(templatesRoot, tools);
  const summary = { written: [], skipped: [] };
  for (const { src, dest } of manifest) {
    const destPath = path.join(targetDir, ...dest.split('/'));
    if (await exists(destPath)) {
      if ((await onConflict(dest)) !== 'overwrite') { summary.skipped.push(dest); continue; }
    }
    const raw = await readFile(src, 'utf8');
    await mkdir(path.dirname(destPath), { recursive: true });
    await writeFile(destPath, render(raw, vars));
    summary.written.push(dest);
  }
  if (importFrom) {
    for (const name of ['user-profile.md', 'feedback.md']) {
      const from = path.join(importFrom, '.ai', 'memory', name);
      if (await exists(from)) {
        const to = path.join(targetDir, '.ai', 'memory', name);
        await mkdir(path.dirname(to), { recursive: true });
        await copyFile(from, to);
      }
    }
  }
  return summary;
}

const exists = (p) => access(p).then(() => true, () => false);
