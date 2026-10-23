import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createBackend } from '../backend.mjs';

const ownerAccount = {name:'Test owner',email:'owner@example.test',password:'synthetic-owner-password'};
const emptyDatabase = () => ({version:2,admin:null,users:[],jobs:[],clients:[],projects:[],contacts:[],employees:[],applications:[]});

async function sharedFixture(t,{allowSetup=true,directory,secureCookies=false}={}) {
  let persisted = {database:emptyDatabase(),runtime:{}};
  let transaction = Promise.resolve(), instances = 0, origin;
  const images = new Map();
  const mediaStore = {
    async read(name) {
      if (!images.has(name)) throw Object.assign(new Error('Missing test image'),{code:'ENOENT'});
      return Buffer.from(images.get(name));
    },
    async write(name,bytes) { images.set(name,Buffer.from(bytes)); }
  };
  // A fresh, JSON-round-tripped snapshot and handler for every HTTP request model
  // independent functions protected by the shared store's transaction lock.
  const server = createServer((req,res) => {
    transaction = transaction.then(async () => {
      const state = JSON.parse(JSON.stringify(persisted));
      const handle = await createBackend({state,mediaStore,allowSetup,directory,secureCookies,publicOrigin:origin});
      instances++;
      try {
        if (!await handle(req,res,new URL(req.url,origin))) { res.writeHead(404); res.end(); }
      } finally { persisted = JSON.parse(JSON.stringify(state)); }
    }).catch(error => {
      if (!res.headersSent) res.writeHead(500);
      res.end(String(error));
    });
  });
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    await transaction;
    await new Promise(resolve => server.close(resolve));
  });
  async function request(path,{method='GET',body,session,csrf=session?.csrf}={}) {
    const response = await fetch(origin+path,{
      method,
      headers:{Origin:origin,'X-KAR-Request':'1','Content-Type':'application/json',
        ...(session ? {Cookie:session.cookie} : {}),...(csrf ? {'X-CSRF-Token':csrf} : {})},
      ...(body !== undefined ? {body:JSON.stringify(body)} : {})
    });
    const bytes = Buffer.from(await response.arrayBuffer());
    let data = null;
    try { data = JSON.parse(bytes.toString()); } catch { /* Media is binary. */ }
    await transaction;
    return {status:response.status,headers:response.headers,data,bytes};
  }
  async function signIn(route='login',account=ownerAccount) {
    const result = await request(`/api/admin/${route}`,{method:'POST',body:account});
    assert.equal(result.status,200,JSON.stringify(result.data));
    return {cookie:result.headers.get('set-cookie').split(';')[0],csrf:result.data.csrf,user:result.data.user};
  }
  return {request,signIn,snapshot:() => structuredClone(persisted),instances:() => instances,images};
}

test('shared sessions and CSRF survive a new backend instance for every request',async t => {
  const fixture = await sharedFixture(t);
  const original = await fixture.signIn('setup');
  const session = await fixture.signIn();
  assert.notEqual(session.cookie,original.cookie);
  assert.notEqual(session.csrf,original.csrf);
  const restored = await fixture.request('/api/admin/session',{session});
  assert.equal(restored.data.user.email,ownerAccount.email);
  assert.equal(restored.data.csrf,session.csrf);
  assert.equal((await fixture.request('/api/admin/contacts',{session})).status,200);
  for (const csrf of [null,original.csrf]) {
    const denied = await fixture.request('/api/admin/contacts',{method:'POST',session,csrf,body:{name:'Test enquiry'}});
    assert.equal(denied.status,403);
  }
  assert.equal((await fixture.request('/api/admin/contacts',{method:'POST',session,body:{name:'Test enquiry',email:'enquiry@example.test'}})).status,201);
  assert.equal((await fixture.request('/api/admin/contacts',{session})).data.items.length,1);
  assert.equal(fixture.snapshot().runtime.sessions.length,2);
  assert.equal((await fixture.request('/api/admin/logout',{method:'POST',session})).status,200);
  assert.equal((await fixture.request('/api/admin/contacts',{session})).status,401);
  assert.equal(fixture.snapshot().runtime.sessions.length,1);
  assert.equal(fixture.instances(),10);
});

test('a persisted staff authVersion change revokes a session on another instance',async t => {
  const fixture = await sharedFixture(t);
  const owner = await fixture.signIn('setup');
  const staffAccount = {name:'Test staff',email:'staff@example.test',password:'synthetic-staff-password',role:'sales',permissions:['crm']};
  const created = await fixture.request('/api/admin/users',{method:'POST',session:owner,body:staffAccount});
  assert.equal(created.status,201);
  const staff = await fixture.signIn('login',staffAccount);
  assert.equal((await fixture.request('/api/admin/contacts',{session:staff})).status,200);
  const before = fixture.snapshot().database.users.find(user => user.id === staff.user.id).authVersion;
  assert.equal((await fixture.request(`/api/admin/users/${staff.user.id}`,{
    method:'PUT',session:owner,body:{name:staffAccount.name,email:staffAccount.email,role:'employee',permissions:[],active:true}
  })).status,200);
  assert.equal(fixture.snapshot().database.users.find(user => user.id === staff.user.id).authVersion,before+1);
  assert.equal((await fixture.request('/api/admin/contacts',{session:staff})).status,401);
  assert.equal(fixture.snapshot().runtime.sessions.length,1);
  const replacement = await fixture.signIn('login',staffAccount);
  assert.equal((await fixture.request('/api/admin/contacts',{session:replacement})).status,403);
});

test('a challenge issued on one instance is consumed once across concurrent requests',async t => {
  const fixture = await sharedFixture(t,{allowSetup:false});
  const challenge = await fixture.request('/api/forms/challenge');
  assert.equal(challenge.status,200);
  assert.equal(fixture.snapshot().runtime.challenges.length,1);
  const body = {name:'Test prospect',email:'prospect@example.test',countryCode:'+91',phone:'9999900000',
    company:'Example test company',service:'Web development',message:'Synthetic shared-state test enquiry.',
    robotCheck:true,consent:true,website:'',formToken:challenge.data.token};
  const results = await Promise.all([
    fixture.request('/api/enquiries',{method:'POST',body}),
    fixture.request('/api/enquiries',{method:'POST',body})
  ]);
  assert.deepEqual(results.map(result => result.status).sort(),[201,400]);
  const state = fixture.snapshot();
  assert.equal(state.runtime.challenges.length,0);
  assert.equal(state.database.contacts.length,1);
  assert.equal(state.database.contacts[0].email,body.email);
  assert.equal(state.database.contacts[0].id,results.find(result => result.status === 201).data.id);
  assert.equal((await fixture.request('/api/enquiries',{method:'POST',body})).status,400);
  assert.equal(fixture.snapshot().database.contacts.length,1);
});

test('login, form and challenge rate limits persist across backend instances, including errors',async t => {
  const fixture = await sharedFixture(t,{allowSetup:false});
  for (let index=0;index<8;index++) {
    assert.equal((await fixture.request('/api/admin/login',{method:'POST',body:{email:'missing@example.test',password:'synthetic-missing-password'}})).status,401);
  }
  assert.equal((await fixture.request('/api/admin/login',{method:'POST',body:{email:'missing@example.test',password:'synthetic-missing-password'}})).status,429);
  assert.equal(fixture.snapshot().runtime.attempts.length,1);
  for (let index=0;index<30;index++) assert.equal((await fixture.request('/api/enquiries',{method:'POST',body:{}})).status,400);
  assert.equal((await fixture.request('/api/enquiries',{method:'POST',body:{}})).status,429);
  assert.equal(fixture.snapshot().runtime.submissions.length,1);
  for (let index=0;index<120;index++) assert.equal((await fixture.request('/api/forms/challenge')).status,200);
  assert.equal((await fixture.request('/api/forms/challenge')).status,429);
  assert.equal(fixture.snapshot().runtime.challengeAttempts.length,1);
  assert.equal(fixture.snapshot().runtime.challenges.length,120);
  assert.equal(fixture.snapshot().database.contacts.length,0);
});

test('shared private media survives publication and archive changes without creating a local directory',async t => {
  const directory = join(tmpdir(),`kar-shared-no-files-${randomUUID()}`);
  await assert.rejects(stat(directory),{code:'ENOENT'});
  const fixture = await sharedFixture(t,{directory});
  const owner = await fixture.signIn('setup');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9S8AAAAASUVORK5CYII=','base64');
  const uploaded = await fixture.request('/api/admin/uploads',{method:'POST',session:owner,body:{data:`data:image/png;base64,${png.toString('base64')}`}});
  assert.equal(uploaded.status,201);
  const mediaPath = uploaded.data.url;
  assert.equal(fixture.images.size,1);
  assert.equal((await fixture.request(mediaPath)).status,404);
  assert.equal((await fixture.request('/api/admin'+mediaPath)).status,401);
  const privateImage = await fixture.request('/api/admin'+mediaPath,{session:owner});
  assert.equal(privateImage.status,200);
  assert.equal(privateImage.headers.get('cache-control'),'no-store');
  assert.deepEqual(privateImage.bytes,png);
  const created = await fixture.request('/api/admin/clients',{method:'POST',session:owner,body:{name:'Example test client',logo:mediaPath,status:'draft'}});
  assert.equal(created.status,201);
  assert.equal((await fixture.request(mediaPath)).status,404);
  assert.equal((await fixture.request(`/api/admin/clients/${created.data.item.id}`,{
    method:'PUT',session:owner,body:{...created.data.item,status:'published',publicApproved:true}
  })).status,200);
  const publicImage = await fixture.request(mediaPath);
  assert.equal(publicImage.status,200);
  assert.equal(publicImage.headers.get('content-type'),'image/png');
  assert.deepEqual(publicImage.bytes,png);
  const head = await fixture.request(mediaPath,{method:'HEAD'});
  assert.equal(head.status,200);
  assert.equal(head.bytes.length,0);
  assert.equal((await fixture.request('/api/content')).data.clients[0].logo,mediaPath);
  assert.equal((await fixture.request(`/api/admin/clients/${created.data.item.id}`,{method:'DELETE',session:owner})).status,200);
  assert.equal((await fixture.request(mediaPath)).status,404);
  assert.equal((await fixture.request('/api/content')).data.clients.length,0);
  assert.equal((await fixture.request('/api/admin'+mediaPath,{session:owner})).status,200);
  await assert.rejects(stat(directory),{code:'ENOENT'});
});

test('production shared backend refuses public administrator bootstrap',async t => {
  const fixture = await sharedFixture(t,{allowSetup:false,secureCookies:true});
  const initial = await fixture.request('/api/admin/session');
  assert.equal(initial.status,200);
  assert.equal(initial.data.setupAllowed,false);
  assert.equal(initial.data.initialized,false);
  assert.equal((await fixture.request('/api/admin/setup',{method:'POST',body:ownerAccount})).status,403);
  assert.equal((await fixture.request('/api/admin/session')).data.initialized,false);
  assert.equal(fixture.snapshot().database.users.length,0);
  assert.equal(fixture.snapshot().runtime.sessions.length,0);
});
