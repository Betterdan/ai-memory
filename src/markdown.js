import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Marked, marked } from 'marked';
import { headingSlug } from './wiki-links.js';

// 单张图片内联上限:超过就跳过,避免一张大图把单文件撑爆
export const IMAGE_LIMIT = 2 * 1024 * 1024;

const MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
};

// 知识页与文档是本仓库自己的文件,与源码同等信任,因此不净化内联 HTML。
// 这是「支持任意 Markdown」的必然含义;若将来引入外部来源内容,此处需重新评估。
export function renderMarkdown(body, { pageId, link, wikiLink } = {}) {
  if (!pageId) return marked.parse(body, { async: false });
  const used = new Set();
  const parser = new Marked({
    renderer: {
      heading({ depth, tokens }) {
        const slug = headingSlug(this.parser.parseInline(tokens, this.parser.textRenderer)) || 'section';
        let id = slug;
        for (let index = 1; used.has(id); index++) id = `${slug}-${index}`;
        used.add(id);
        return `<h${depth} id="${escapeHtml(`${pageId}:${id}`)}">${this.parser.parseInline(tokens)}</h${depth}>\n`;
      },
      link({ href, tokens, title }) {
        const resolved = link(href);
        return resolved === href ? false : renderLink(resolved, this.parser.parseInline(tokens),
          title || (resolved.startsWith('#') ? '' : '项目文件，需与项目目录一同打开'));
      },
    },
    extensions: wikiLink ? [{
      name: 'projectWikiLink',
      level: 'inline',
      start: source => source.indexOf('[['),
      tokenizer(source) {
        const match = /^\[\[([^\[\]\r\n]+)\]\]/.exec(source);
        if (!match) return undefined;
        const [target, label = target] = match[1].split('|', 2);
        return { type: 'projectWikiLink', raw: match[0], target: target.trim(), label };
      },
      renderer({ target, label }) {
        const href = wikiLink(target);
        return href ? renderLink(href, escapeHtml(label)) : `<span title="无法定位 Wiki 文档">${escapeHtml(label)}</span>`;
      },
    }] : [],
  });
  return parser.parse(body, { async: false });
}

function renderLink(href, content, title) {
  const hint = title ? ` title="${escapeHtml(title)}"` : '';
  return `<a href="${escapeHtml(href)}"${hint}>${content}</a>`;
}

export async function inlineImages(html, { baseDir, warnings = [] } = {}) {
  const matches = [...html.matchAll(/<img\b[^>]*\bsrc="([^"]+)"[^>]*>/g)];
  let out = html;
  const done = new Map();

  for (const match of matches) {
    const source = match[1];
    if (/^[a-z][a-z0-9+.-]*:/i.test(source) || source.startsWith('//')) continue;
    if (done.has(source)) { out = replaceAll(out, source, done.get(source)); continue; }

    const target = path.resolve(baseDir, decodeURIComponent(source.split('#')[0].split('?')[0]));
    let buffer;
    try {
      buffer = await readFile(target);
    } catch {
      warnings.push(`图片读不到,已保留原始路径:${source}`);
      continue;
    }
    if (buffer.length > IMAGE_LIMIT) {
      warnings.push(`图片超过 ${Math.round(IMAGE_LIMIT / 1024 / 1024)}MB,未内联:${source}`);
      continue;
    }
    const mime = MIME[path.extname(target).toLowerCase()];
    if (!mime) {
      warnings.push(`不支持的图片格式,未内联:${source}`);
      continue;
    }
    const encoded = `data:${mime};base64,${buffer.toString('base64')}`;
    done.set(source, encoded);
    out = replaceAll(out, source, encoded);
  }
  return out;
}

export function extractTitle(body, fallback) {
  for (const line of body.split('\n')) {
    const match = line.match(/^#\s+(.+?)\s*$/);
    if (match) return match[1].trim();
  }
  return fallback;
}

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function replaceAll(haystack, needle, replacement) {
  return haystack.split(`src="${needle}"`).join(`src="${replacement}"`);
}

const MERMAID_BLOCK = /<pre><code class="language-mermaid">([\s\S]*?)<\/code><\/pre>/g;

export function hasMermaid(html) {
  return html.includes('class="language-mermaid"');
}

// marked 把 ```mermaid 渲染成 <pre><code class="language-mermaid">,
// mermaid 运行时认的是 .mermaid 容器,这里做一次搬运;不改内容本身
export function activateMermaid(html) {
  return html.replace(MERMAID_BLOCK, (match, source) => `<pre class="mermaid">${source}</pre>`);
}
