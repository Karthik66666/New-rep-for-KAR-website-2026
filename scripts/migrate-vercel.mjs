/* One-way, explicit import; the original local database and media are never changed. */
import {readFile,readdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createCloudStore,createEmptyState,isEmptyWorkspace,mediaNamePattern} from '../cloud-store.mjs';

class MigrationError extends Error {}
const resources = ['users','jobs','clients','projects','contacts','employees','applications'];

export function parseMigrationArgs(args) {
  const options = {apply:false,source:'.kar-data'};
  let mode;
  for (let index=0; index<args.length; index++) {
    const arg = args[index];
    if (['--apply','--dry-run'].includes(arg)) {
      if (mode && mode !== arg) throw new MigrationError('Choose either --dry-run or --apply.');
      mode = arg; options.apply = arg === '--apply';
    } else if (['--source','--workspace'].includes(arg)) {
      const value = args[++index];
      if (!value || value.startsWith('--')) throw new MigrationError(`${arg} needs a value.`);
      options[arg === '--source' ? 'source' : 'namespace'] = value;
    } else throw new MigrationError('Unknown argument. Use --dry-run or --apply, optionally --source <directory> and --workspace <name>.');
  }
  return options;
}

export async function migrateLocalData({source='.kar-data',apply=false,namespace,environment=process.env,store,log=console.log}={}) {
  const directory = resolve(source);
  let database;
  try { database = JSON.parse(await readFile(join(directory,'database.json'),'utf8')); }
  catch { throw new MigrationError('The source database.json could not be read as JSON. The original files were not changed.'); }
  if (!database || typeof database !== 'object' || Array.isArray(database)) throw new MigrationError('The source database is invalid.');
  for (const resource of resources) {
    if (database[resource] === undefined) database[resource] = [];
    if (!Array.isArray(database[resource])) throw new MigrationError('The source database contains an invalid record collection.');
  }
  if (!database.users.length && !(database.admin?.hash && database.admin?.salt)) throw new MigrationError('The source database has no administrator account. Create your own local account before importing.');
  let entries;
  try { entries = await readdir(join(directory,'media'),{withFileTypes:true}); }
  catch (error) {
    if (error.code !== 'ENOENT') throw new MigrationError('The source media directory could not be read.');
    entries = [];
  }
  if (entries.some(entry => !entry.isFile() || !mediaNamePattern.test(entry.name))) throw new MigrationError('The source media directory contains an unsupported filename or non-file entry.');
  const referenced = new Set();
  for (const record of [...database.clients,...database.projects]) for (const field of ['logo','image']) {
    const value = record?.[field];
    if (typeof value !== 'string' || !value.startsWith('/media/')) continue;
    const name = value.slice('/media/'.length);
    if (!mediaNamePattern.test(name)) throw new MigrationError('The source database contains an invalid media reference.');
    referenced.add(name);
  }
  const available = new Set(entries.map(entry => entry.name));
  const missing = [...referenced].filter(name => !available.has(name));
  if (missing.length) throw new MigrationError(`${missing.length} referenced media file(s) are missing. Restore them before importing.`);
  const images = [];
  for (const entry of entries) {
    let buffer;
    try { buffer = await readFile(join(directory,'media',entry.name)); }
    catch { throw new MigrationError('A source media file could not be read.'); }
    images.push({name:entry.name,buffer});
  }
  const counts = Object.fromEntries(resources.map(resource => [resource,database[resource].length]));
  if (!counts.users && database.admin?.hash) counts.users = 1;
  const summary = {...counts,media:images.length};
  log(`${apply ? 'Import' : 'Dry run'} counts: ${JSON.stringify(summary)}`);
  if (!apply) { log('Dry run complete. No cloud service was contacted and no source file was changed.'); return {applied:false,counts:summary}; }
  const target = store ?? createCloudStore({environment,...(namespace === undefined ? {} : {namespace})});
  await target.withState(async state => {
    if (!isEmptyWorkspace(state)) throw new MigrationError('The target workspace is not empty. Import refused; existing cloud data was preserved.');
    for (const image of images) {
      // A previously interrupted import may have left private, unreferenced files.
      // Reuse only an exact match; never overwrite existing media.
      let existing;
      try { existing = await target.media.read(image.name); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (existing) {
        if (!Buffer.isBuffer(existing) || !existing.equals(image.buffer)) throw new MigrationError('Existing cloud media differs from the source. Import refused without overwriting it.');
      } else await target.media.write(image.name,image.buffer);
    }
    state.database = database;
    state.runtime = createEmptyState().runtime;
  });
  log('Import committed. Original local files and administrator password hashes were preserved.');
  return {applied:true,counts:summary};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await migrateLocalData(parseMigrationArgs(process.argv.slice(2))); }
  catch (error) {
    // Driver/provider errors can contain connection details; never print them.
    const message = error instanceof MigrationError || /^(Set DATABASE_URL|DATABASE_URL must|KAR_WORKSPACE must|Connect a private Vercel Blob)/.test(error.message)
      ? error.message : 'Import failed. Verify database and private Blob access, then retry. No source files were changed; an incomplete import may leave private, unreferenced images.';
    console.error(message); process.exitCode = 1;
  }
}
