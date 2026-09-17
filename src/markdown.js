import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { marked } from 'marked';

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
export function renderMarkdown(body) {
  return marked.parse(body, { async: false });
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
