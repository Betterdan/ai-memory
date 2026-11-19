import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function headingSlug(text) {
  return text.trim().toLowerCase().normalize('NFC')
    .replace(/[^\p{L}\p{N}\p{M}_\s-]/gu, '').replace(/\s+/g, '-');
}

export function wikiLinks(pages, { targetDir, destination }) {
  const bySource = new Map(pages.map(page => [page.source, page]));
  const byName = new Map();
  for (const page of pages.filter(item => item.source.startsWith('docs/wiki/'))) {
    const name = path.posix.basename(page.source).toLowerCase();
    byName.set(name, byName.has(name) ? null : page);
  }
  const unresolved = new Set();

  function markdown(page, href) {
    if (!href || /^(?:[a-z][a-z0-9+.-]*:|\/)/i.test(href)) return href;
    const [, rawPath, suffix] = /^([^?#]*)([\s\S]*)$/.exec(href);
    let decoded;
    try {
      decoded = decodeURIComponent(rawPath);
    } catch {
      return href;
    }
    if (!decoded) return suffix.startsWith('#') ? sectionLink(page, suffix.slice(1)) : href;
    const source = path.posix.join(path.posix.dirname(page.source), decoded);
    const target = bySource.get(source);
    if (target) return sectionLink(target, suffix.split('#')[1]);

    const absolute = path.resolve(targetDir, ...source.split('/'));
    const relative = path.relative(path.dirname(destination), absolute);
    const rebased = path.isAbsolute(relative) ? pathToFileURL(absolute).href
      : (relative || '.').split(path.sep).map(encodeURIComponent).join('/');
    return rebased + suffix;
  }

  function obsidian(page, reference) {
    const [name, anchor] = reference.split('#', 2);
    if (!name) return sectionLink(page, anchor);
    const file = /\.md$/i.test(name) ? name : `${name}.md`;
    const target = bySource.get(path.posix.join(path.posix.dirname(page.source), file))
      ?? bySource.get(path.posix.join('docs/wiki', file))
      ?? (file.includes('/') ? undefined : byName.get(file.toLowerCase()));
    if (target) return sectionLink(target, anchor);
    unresolved.add(reference);
    return null;
  }

  return { markdown, obsidian, unresolved };
}

function sectionLink(page, anchor) {
  if (!anchor) return `#${page.id}`;
  let section = anchor;
  try { section = decodeURIComponent(anchor); } catch { /* keep literal text */ }
  const slug = headingSlug(section);
  return `#${page.id}${slug ? `:${slug}` : ''}`;
}
