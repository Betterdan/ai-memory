import { readdir } from 'node:fs/promises';
import path from 'node:path';

const GROUPS = {
  common: () => true,
  claude: (tools) => tools.includes('claude'),
  codex: (tools) => tools.includes('codex'),
};

export async function buildManifest(templatesRoot, tools) {
  const entries = [];
  for (const [group, enabled] of Object.entries(GROUPS)) {
    if (!enabled(tools)) continue;
    const groupDir = path.join(templatesRoot, group);
    for (const rel of await walk(groupDir, '')) {
      entries.push({ src: path.join(groupDir, ...rel.split('/')), dest: rel });
    }
  }
  const sorted = entries.sort((a, b) => a.dest < b.dest ? -1 : a.dest > b.dest ? 1 : 0);
  assertUniqueDestinations(sorted);
  return sorted;
}

function assertUniqueDestinations(entries) {
  const sourcesByDest = new Map();
  for (const { src, dest } of entries) {
    const sources = sourcesByDest.get(dest) ?? [];
    sources.push(src);
    sourcesByDest.set(dest, sources);
  }

  const conflicts = [...sourcesByDest]
    .filter(([, sources]) => sources.length > 1)
    .map(([dest, sources]) => `- ${dest}\n${sources.map(src => `  - ${src}`).join('\n')}`);

  if (conflicts.length > 0) {
    throw new Error(`Duplicate template destinations:\n${conflicts.join('\n')}`);
  }
}

async function walk(dir, prefix) {
  let dirents;
  try {
    dirents = await readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  const out = [];
  for (const d of dirents) {
    const rel = prefix ? `${prefix}/${d.name}` : d.name;
    if (d.isDirectory()) out.push(...(await walk(path.join(dir, d.name), rel)));
    else out.push(rel);
  }
  return out;
}
