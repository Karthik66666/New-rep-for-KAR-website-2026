import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
async function files(directory) {
  const entries = await readdir(directory,{withFileTypes:true});
  return (await Promise.all(entries.map(entry => entry.isDirectory() ? files(`${directory}/${entry.name}`) : /\.(m?js)$/.test(entry.name) ? [`${directory}/${entry.name}`] : []))).flat();
}
for (const file of ['server.mjs','backend.mjs','cloud-store.mjs',...await files('dist'),...await files('api'),...await files('scripts')]) {
  const result = spawnSync(process.execPath,['--check',file],{stdio:'inherit'});
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log('All server and browser JavaScript syntax checks passed.');
