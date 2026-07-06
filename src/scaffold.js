import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { buildManifest } from './manifest.js';
import { render } from './render.js';

const IMPORT_DESTS = new Set(['.ai/memory/user-profile.md', '.ai/memory/feedback.md']);

export async function scaffold({ templatesRoot, targetDir, vars, tools, onConflict, importFrom }) {
  const manifest = await buildManifest(templatesRoot, tools);
  const summary = { written: [], skipped: [] };
  for (const { src, dest } of manifest) {
    const destPath = path.join(targetDir, ...dest.split('/'));
    if (await exists(destPath)) {
      if ((await onConflict(dest)) !== 'overwrite') { summary.skipped.push(dest); continue; }
    }
    let content;
    if (importFrom && IMPORT_DESTS.has(dest)) {
      const importSrc = path.join(importFrom, '.ai', 'memory', path.basename(dest));
      if (await exists(importSrc)) {
        content = await readFile(importSrc, 'utf8');
      }
    }
    if (content === undefined) {
      content = render(await readFile(src, 'utf8'), vars);
    }
    await mkdir(path.dirname(destPath), { recursive: true });
    await writeFile(destPath, content);
    summary.written.push(dest);
  }
  return summary;
}

const exists = (p) => access(p).then(() => true, () => false);
