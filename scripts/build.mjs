import { cp, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const source = fileURLToPath(new URL('../src/', import.meta.url));
const output = fileURLToPath(new URL('../dist/', import.meta.url));

export async function build() {
  await rm(output, { recursive: true, force: true });
  await cp(source, output, { recursive: true });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await build();
  console.log('Built static site in dist/');
}