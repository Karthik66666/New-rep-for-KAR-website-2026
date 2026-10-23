import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
async function files(directory) {
  const entries = await readdir(directory,{withFileTypes:true});
  return (await Promise.all(entries.map(entry => entry.isDirectory() ? files(`${directory}/${entry.name}`) : entry.name.endsWith('.js') ? [`${directory}/${entry.name}`] : []))).flat();
}
for (const file of ['server.mjs','backend.mjs',...await files('dist')]) {
  const result = spawnSync(process.execPath,['--check',file],{stdio:'inherit'});
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log('All server and browser JavaScript syntax checks passed.');
