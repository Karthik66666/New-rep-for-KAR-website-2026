import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import ignore from 'ignore';

const root = fileURLToPath(new URL('../',import.meta.url));

async function deploymentFiles(rules) {
  const matcher = ignore().add(rules), files = [];
  async function walk(relative='') {
    for (const entry of await readdir(join(root,relative),{withFileTypes:true})) {
      const path = relative ? `${relative}/${entry.name}` : entry.name;
      // Vercel evaluates bare directory names and prunes ignored parents.
      if (matcher.ignores(path)) continue;
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile()) files.push(path);
    }
  }
  await walk();
  return files;
}

test('deployment traversal includes the homepage, admin, assets and backend',async () => {
  const rules = await readFile(join(root,'.vercelignore'),'utf8');
  const files = await deploymentFiles(rules);
  for (const path of [
    'dist/index.html','dist/styles.css','dist/app.js','dist/kar-logo.png',
    'dist/content.css','dist/content.js','dist/client-logos.js','dist/locales/ta.json',
    'dist/admin/index.html','dist/admin/admin.js','dist/admin/admin.css',
    'api/index.mjs','backend.mjs','cloud-store.mjs','package.json','package-lock.json','vercel.json'
  ]) assert.ok(files.includes(path),`${path} must reach Vercel`);
  assert.ok(files.every(path => /^(?:dist\/|api\/|backend\.mjs$|cloud-store\.mjs$|package(?:-lock)?\.json$|vercel\.json$|\.vercelignore$)/.test(path)));
  for (const path of ['.kar-data/database.json','.env.local','.git/config','.openai/hosting.json','node_modules/ignore/package.json']) {
    assert.equal(ignore().add(rules).ignores(path),true,`${path} stays private`);
  }
});

test('directory-only negations cannot silently remove all website and API files again',async () => {
  const rules = await readFile(join(root,'.vercelignore'),'utf8');
  const broken = rules.replace(/^!\/api$/m,'!/api/').replace(/^!\/dist$/m,'!/dist/');
  const files = await deploymentFiles(broken);
  assert.equal(files.some(path => path.startsWith('dist/') || path.startsWith('api/')),false);
});
