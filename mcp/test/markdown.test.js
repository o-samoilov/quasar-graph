import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseDoc, firstParagraph } from '../src/read/markdown.js';

const here = dirname(fileURLToPath(import.meta.url));

test('parseDoc returns frontmatter data and body content', () => {
  const { data, content } = parseDoc(join(here, 'fixtures/sample.md'));
  assert.equal(data.name, 'acme-backend');
  assert.equal(data.language, 'typescript');
  assert.match(content, /core API service/);
});

test('firstParagraph skips the heading and returns the first prose paragraph', () => {
  const { content } = parseDoc(join(here, 'fixtures/sample.md'));
  assert.equal(firstParagraph(content), 'The core API service for acme. Handles goals and auth.');
});

test('firstParagraph returns null when there is no prose', () => {
  assert.equal(firstParagraph('# Heading only\n'), null);
});
