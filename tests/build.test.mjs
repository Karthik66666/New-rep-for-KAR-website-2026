import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { build } from '../scripts/build.mjs';

test('build copies the page and required assets to dist', async () => {
  await build();

  const sourceHtml = await readFile(new URL('../src/index.html', import.meta.url), 'utf8');
  const builtHtml = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
  assert.equal(builtHtml, sourceHtml);

  for (const path of [
    '../dist/assets/kar-logo.png',
    '../dist/scripts/app.js',
    '../dist/scripts/puzzle.js',
    '../dist/scripts/services.js',
    '../dist/scripts/service-visuals.js',
    '../dist/styles/styles.css',
    '../dist/styles/services.css',
    '../dist/styles/service-visuals.css'
  ]) {
    await access(new URL(path, import.meta.url));
  }
});