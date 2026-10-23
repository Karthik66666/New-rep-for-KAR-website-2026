import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createCloudStore,createEmptyState,isEmptyWorkspace} from '../cloud-store.mjs';
import {migrateLocalData,parseMigrationArgs} from '../scripts/migrate-vercel.mjs';

const filename = '550e8400-e29b-41d4-a716-446655440000.png';
const blobApi = {get:async () => null,put:async () => {}};
const settings = {connectionString:'postgresql://localhost/kar_test',environment:{},blobApi};

class FakeDatabase {
  constructor({failOn,connectFailure,endFailure,tableExists=true}={}) {
    this.state = createEmptyState(); this.clients = []; this.tail = Promise.resolve(); this.failOn = failOn; this.connectFailure = connectFailure; this.endFailure = endFailure; this.tableExists = tableExists;
  }
  clientFactory = async config => {
    const database = this;
    const client = {
      config,queries:[],closed:false,released:false,
      async connect() { if (database.connectFailure) throw database.connectFailure; },
      async query(sql,values=[]) {
        this.queries.push({sql,values});
        if (database.failOn && sql.startsWith(database.failOn)) throw new Error('Injected database failure');
        if (sql.startsWith('SELECT to_regclass')) return {rows:[{table_name:database.tableExists ? 'kar_workspaces' : null}]};
        if (sql.startsWith('CREATE TABLE')) database.tableExists = true;
        if (sql.startsWith('SELECT state')) {
          const previous = database.tail;
          database.tail = new Promise(resolve => { this.unlock = resolve; });
          await previous;
          this.draft = structuredClone(database.state);
          return {rows:[{state:this.draft}]};
        }
        if (sql.startsWith('UPDATE')) this.draft = JSON.parse(values[1]);
        if (sql === 'COMMIT') {
          if (this.draft) database.state = structuredClone(this.draft);
          this.unlock?.(); this.released = true;
        }
        if (sql === 'ROLLBACK') { this.unlock?.(); this.released = true; }
        return {rows:[]};
      },
      async end() { this.closed = true; if (database.endFailure) throw database.endFailure; }
    };
    database.clients.push(client); return client;
  };
}

test('cloud transactions lock, parameterize state, commit before returning and skip unchanged writes',async () => {
  const database = new FakeDatabase();
  const store = createCloudStore({...settings,namespace:'test-workspace',clientFactory:database.clientFactory});
  const result = await store.withState(state => {
    state.database.contacts.push({id:'contact',notes:"Text with a ' quote"});
    state.runtime.sessions.push(['session-token',{userId:'owner'}]);
    return 'saved';
  });
  assert.equal(result,'saved');
  const client = database.clients[0];
  assert.equal(client.closed,true);
  assert.equal(client.queries[0].sql,'BEGIN');
  assert.equal(client.queries.at(-1).sql,'COMMIT');
  assert.ok(client.queries.find(query => /SELECT state.*FOR UPDATE/.test(query.sql)));
  const update = client.queries.find(query => query.sql.startsWith('UPDATE'));
  assert.equal(update.values[0],'test-workspace');
  assert.equal(update.sql.includes("Text with a ' quote"),false);
  assert.equal(database.state.database.contacts[0].notes,"Text with a ' quote");
  assert.equal(database.state.runtime.sessions.length,1);
  await store.withState(state => state.database.contacts.length);
  assert.equal(database.clients[1].queries.some(query => query.sql.startsWith('UPDATE')),false);
});

test('separate store instances serialize a challenge consume against the same row',async () => {
  const database = new FakeDatabase();
  database.state.runtime.challenges.push(['one-time-token',{until:9999999999999}]);
  const first = createCloudStore({...settings,clientFactory:database.clientFactory});
  const second = createCloudStore({...settings,clientFactory:database.clientFactory});
  let releaseFirst,enteredFirst;
  const entered = new Promise(resolve => { enteredFirst = resolve; });
  const wait = new Promise(resolve => { releaseFirst = resolve; });
  const a = first.withState(async state => {
    assert.equal(state.runtime.challenges.length,1);
    enteredFirst(); await wait;
    state.runtime.challenges = [];
    state.database.contacts.push({id:'accepted'});
    return 'accepted';
  });
  await entered;
  let secondEntered = false;
  const b = second.withState(state => {
    secondEntered = true;
    assert.equal(state.runtime.challenges.length,0);
    return 'already-used';
  });
  await Promise.resolve();
  assert.equal(secondEntered,false);
  releaseFirst();
  assert.deepEqual(await Promise.all([a,b]),['accepted','already-used']);
  assert.equal(database.state.database.contacts.length,1);
});

test('first-use schema initialization is protected and closing errors preserve committed success',async () => {
  const database = new FakeDatabase({tableExists:false,endFailure:new Error('cleanup failed')});
  const store = createCloudStore({...settings,clientFactory:database.clientFactory});
  assert.equal(await store.withState(state => { state.database.contacts.push({id:'committed'}); return 'saved'; }),'saved');
  const queries = database.clients[0].queries;
  const lock = queries.findIndex(query => query.sql.startsWith('SELECT pg_advisory_xact_lock'));
  const create = queries.findIndex(query => query.sql.startsWith('CREATE TABLE IF NOT EXISTS'));
  assert.ok(lock >= 0 && lock < create);
  assert.ok(queries.find(query => query.sql.includes("set_config('lock_timeout'") && query.values[0] === '10000'));
  assert.equal(database.state.database.contacts[0].id,'committed');
  assert.equal(queries.some(query => query.sql === 'ROLLBACK'),false);
  await store.withState(() => {});
  assert.equal(database.clients[1].queries.some(query => query.sql.startsWith('CREATE TABLE')),false);
});

test('callback and commit failures roll back and close without persisting state',async t => {
  await t.test('callback throws',async () => {
    const database = new FakeDatabase(), failure = new Error('callback failed');
    const store = createCloudStore({...settings,clientFactory:database.clientFactory});
    await assert.rejects(store.withState(state => { state.database.contacts.push({id:'rolled-back'}); throw failure; }),error => error === failure);
    assert.equal(database.state.database.contacts.length,0);
    assert.equal(database.clients[0].queries.at(-1).sql,'ROLLBACK');
    assert.equal(database.clients[0].closed,true);
  });
  await t.test('commit fails',async () => {
    const database = new FakeDatabase({failOn:'COMMIT'});
    const store = createCloudStore({...settings,clientFactory:database.clientFactory});
    await assert.rejects(store.withState(state => { state.database.jobs.push({id:'rolled-back'}); }),/Injected database failure/);
    assert.equal(database.state.database.jobs.length,0);
    assert.equal(database.clients[0].queries.at(-1).sql,'ROLLBACK');
    assert.equal(database.clients[0].closed,true);
  });
  await t.test('connection fails',async () => {
    const failure = new Error('connection failed'), database = new FakeDatabase({connectFailure:failure});
    const store = createCloudStore({...settings,clientFactory:database.clientFactory});
    await assert.rejects(store.withState(() => {}),error => error === failure);
    assert.equal(database.clients[0].closed,true);
    assert.equal(database.clients[0].queries.length,0);
  });
});

test('missing cloud configuration and corrupt state fail closed',async () => {
  assert.throws(() => createCloudStore({environment:{}}),/DATABASE_URL/);
  assert.throws(() => createCloudStore({environment:{},connectionString:'https://example.test'}),/PostgreSQL/);
  assert.throws(() => createCloudStore({environment:{},connectionString:settings.connectionString}),/private Vercel Blob/);
  assert.throws(() => createCloudStore({...settings,namespace:'../production'}),/KAR_WORKSPACE/);
  const database = new FakeDatabase(); database.state.runtime.sessions = {};
  const store = createCloudStore({...settings,clientFactory:database.clientFactory});
  await assert.rejects(store.withState(() => assert.fail('callback must not run')),/state is invalid/);
  assert.equal(database.clients[0].queries.at(-1).sql,'ROLLBACK');
  assert.equal(database.clients[0].closed,true);
});

test('private media validates paths, preserves bytes and forbids overwrite',async () => {
  const calls = [], body = Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]);
  const api = {
    async get(path,options) { calls.push({kind:'get',path,options}); return {statusCode:200,stream:new Response(body).body}; },
    async put(path,content,options) { calls.push({kind:'put',path,content,options}); }
  };
  const store = createCloudStore({...settings,namespace:'kar-production',blobApi:api});
  await store.media.write(filename,body);
  assert.deepEqual(await store.media.read(filename),body);
  assert.equal(calls[0].path,`kar-production/media/${filename}`);
  assert.deepEqual(calls[0].options,{access:'private',addRandomSuffix:false,allowOverwrite:false,contentType:'image/png'});
  assert.deepEqual(calls[1].options,{access:'private',useCache:false});
  for (const name of ['../database.json','/media/'+filename,'https://example.test/'+filename,'x.png']) {
    await assert.rejects(store.media.read(name),/filename/);
    await assert.rejects(store.media.write(name,body),/filename/);
  }
  assert.equal(calls.length,2);
  await assert.rejects(store.media.write(filename,'not a buffer'),/Buffer/);
});

test('missing media is distinguishable from provider failures and invalid responses',async () => {
  const missing = createCloudStore(settings);
  await assert.rejects(missing.media.read(filename),error => error.code === 'ENOENT');
  const denied = new Error('provider denied access');
  const failed = createCloudStore({...settings,blobApi:{get:async () => { throw denied; }}});
  await assert.rejects(failed.media.read(filename),error => error === denied && error.code !== 'ENOENT');
  const invalid = createCloudStore({...settings,blobApi:{get:async () => ({statusCode:304,stream:null})}});
  await assert.rejects(invalid.media.read(filename),/invalid response/);
});

test('workspace defaults isolate production and previews',() => {
  assert.equal(createCloudStore({...settings,environment:{VERCEL_ENV:'production'}}).namespace,'kar-production');
  assert.equal(createCloudStore({...settings,environment:{VERCEL_ENV:'preview'}}).namespace,'kar-preview');
  assert.equal(createCloudStore({...settings,environment:{KAR_WORKSPACE:'specific-workspace'}}).namespace,'specific-workspace');
  const oidc = createCloudStore({connectionString:settings.connectionString,environment:{BLOB_STORE_ID:'store_test',VERCEL_OIDC_TOKEN:'test-only-oidc'}});
  assert.equal(oidc.namespace,'kar-preview');
});

async function localFixture() {
  const directory = await mkdtemp(join(tmpdir(),'kar-cloud-import-'));
  await mkdir(join(directory,'media'));
  const database = createEmptyState().database;
  database.users.push({id:'owner',email:'owner@example.test',role:'super_admin',hash:'preserved-test-hash',salt:'preserved-test-salt'});
  database.admin = {id:'owner',email:'owner@example.test'};
  database.clients.push({id:'client',name:'Approved client',logo:`/media/${filename}`,status:'published'});
  await writeFile(join(directory,'database.json'),JSON.stringify(database));
  await writeFile(join(directory,'media',filename),Buffer.from('test image bytes'));
  return {directory,database,close:() => rm(directory,{recursive:true,force:true})};
}

test('migration defaults to dry-run, validates missing files and never contacts a store',async () => {
  assert.deepEqual(parseMigrationArgs([]),{apply:false,source:'.kar-data'});
  assert.throws(() => parseMigrationArgs(['--apply','--dry-run']),/either/);
  const fixture = await localFixture();
  const before = await readFile(join(fixture.directory,'database.json'),'utf8');
  try {
    const output = [];
    const result = await migrateLocalData({source:fixture.directory,log:line => output.push(line),store:{withState:() => assert.fail('dry-run must be local')}});
    assert.equal(result.applied,false);
    assert.equal(result.counts.users,1);
    assert.equal(result.counts.media,1);
    assert.equal(output.join('\n').includes('preserved-test-hash'),false);
    assert.equal(await readFile(join(fixture.directory,'database.json'),'utf8'),before);
    await rm(join(fixture.directory,'media',filename));
    await assert.rejects(migrateLocalData({source:fixture.directory,apply:true,store:{withState:() => assert.fail('missing files must stop first')},log:() => {}}),/referenced media file.*missing/);
  } finally { await fixture.close(); }
});

test('migration refuses populated targets and preserves hashes only after all media succeeds',async () => {
  const fixture = await localFixture();
  try {
    const state = createEmptyState(), images = new Map();
    const target = {
      async withState(callback) {
        const draft = structuredClone(state); await callback(draft);
        Object.assign(state,draft);
      },
      media:{
        async read(name) { if (!images.has(name)) throw Object.assign(new Error('missing'),{code:'ENOENT'}); return images.get(name); },
        async write(name,buffer) { assert.equal(isEmptyWorkspace(state),true); images.set(name,buffer); }
      }
    };
    state.database.contacts.push({id:'existing'});
    await assert.rejects(migrateLocalData({source:fixture.directory,apply:true,store:target,log:() => {}}),/not empty/);
    assert.equal(images.size,0);
    state.database.contacts = [];
    await migrateLocalData({source:fixture.directory,apply:true,store:target,log:() => {}});
    assert.deepEqual(state.database,fixture.database);
    assert.equal(state.database.users[0].hash,'preserved-test-hash');
    assert.deepEqual(state.runtime,createEmptyState().runtime);
    assert.equal(images.size,1);
    await assert.rejects(migrateLocalData({source:fixture.directory,apply:true,store:target,log:() => {}}),/not empty/);
  } finally { await fixture.close(); }
});

test('an interrupted media import leaves state empty and safely reuses exact files on retry',async () => {
  const fixture = await localFixture();
  try {
    const secondName = '550e8400-e29b-41d4-a716-446655440001.webp';
    await writeFile(join(fixture.directory,'media',secondName),Buffer.from('second image bytes'));
    const original = await readFile(join(fixture.directory,'database.json'),'utf8');
    const state = createEmptyState(), images = new Map();
    let writes = 0, failOnce = true;
    const target = {
      async withState(callback) {
        const draft = structuredClone(state); await callback(draft); Object.assign(state,draft);
      },
      media:{
        async read(name) { if (!images.has(name)) throw Object.assign(new Error('missing'),{code:'ENOENT'}); return images.get(name); },
        async write(name,buffer) {
          writes++;
          if (writes === 2 && failOnce) { failOnce = false; throw new Error('temporary provider failure'); }
          assert.equal(images.has(name),false,'migration must not overwrite existing media');
          images.set(name,buffer);
        }
      }
    };
    const options = {source:fixture.directory,apply:true,store:target,log:() => {}};
    await assert.rejects(migrateLocalData(options),/temporary provider failure/);
    assert.equal(isEmptyWorkspace(state),true);
    assert.equal(images.size,1);
    await migrateLocalData(options);
    assert.equal(images.size,2);
    assert.equal(writes,3,'the matching first upload is read and reused');
    assert.deepEqual(state.database,fixture.database);
    assert.equal(await readFile(join(fixture.directory,'database.json'),'utf8'),original);
  } finally { await fixture.close(); }
});
