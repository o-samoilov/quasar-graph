import { readFileSync } from 'node:fs';
import matter from 'gray-matter';
import yaml from 'js-yaml';

// js-yaml 4 removed `safeLoad` (which gray-matter 4 calls by default), so we
// supply a custom engine using `load` — safe by default in js-yaml 4. We only
// ever parse frontmatter, never stringify it.
const matterOptions = { engines: { yaml: (str) => yaml.load(str) } };

export function parseDoc(path) {
  const raw = readFileSync(path, 'utf8');
  const { data, content } = matter(raw, matterOptions);
  return { data: data ?? {}, content: content ?? '' };
}

export function firstParagraph(content) {
  const blocks = content
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);
  for (const block of blocks) {
    if (block.startsWith('#')) continue;
    if (block.startsWith('-') || block.startsWith('*')) continue;
    return block.replace(/\s+/g, ' ').trim();
  }
  return null;
}
