import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApplication } from '../server.mjs';

const directory = await mkdtemp(join(tmpdir(),'kar-backend-test-'));
const server = createServer(await createApplication({dataDirectory:directory,allowSetup:true,secureCookies:false}));
await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let cookie = '', csrf = '';
async function request(path,{method='GET',body,authenticated=true,originHeader=origin,csrfHeader=csrf}={}) {
  const response = await fetch(`${origin}${path}`,{method,headers:{'Content-Type':'application/json','X-KAR-Request':'1',Origin:originHeader,...(authenticated ? {Cookie:cookie,'X-CSRF-Token':csrfHeader} : {})},...(body ? {body:JSON.stringify(body)} : {})});
  let data; try { data = await response.json(); } catch { data = null; }
  return {response,data};
}
after(async () => { await new Promise(resolve => server.close(resolve)); await rm(directory,{recursive:true,force:true}); });
test('admin authentication, publication and private CRM boundaries',async t => {
  await t.test('private records reject anonymous access',async () => {
    assert.equal((await request('/api/admin/contacts')).response.status,401);
    const {data} = await request('/api/admin/session'); assert.equal(data.initialized,false);
  });
  await t.test('setup rejects foreign origins and short passwords',async () => {
    assert.equal((await request('/api/admin/setup',{method:'POST',originHeader:'https://example.com',body:{email:'owner@example.test',password:'a-long-test-password'}})).response.status,403);
    assert.equal((await request('/api/admin/setup',{method:'POST',body:{email:'owner@example.test',password:'short'}})).response.status,400);
  });
  await t.test('local setup creates a session and cannot be repeated',async () => {
    const {response,data} = await request('/api/admin/setup',{method:'POST',body:{email:'owner@example.test',password:'a-long-test-password'}});
    assert.equal(response.status,200); cookie = response.headers.get('set-cookie').split(';')[0]; csrf = data.csrf;
    assert.match(response.headers.get('set-cookie'),/HttpOnly/); assert.match(response.headers.get('set-cookie'),/SameSite=Strict/);
    assert.equal((await request('/api/admin/setup',{method:'POST',body:{email:'other@example.test',password:'another-long-password'}})).response.status,403);
  });
  await t.test('mutations require a session-specific CSRF token',async () => {
    assert.equal((await request('/api/admin/jobs',{method:'POST',csrfHeader:'invalid',body:{title:'Test role'}})).response.status,403);
  });
  let project, contact;
  await t.test('publishing requires permission and safe links',async () => {
    assert.equal((await request('/api/admin/projects',{method:'POST',body:{title:'Test project',summary:'Internal test',status:'published'}})).response.status,400);
    assert.equal((await request('/api/admin/projects',{method:'POST',body:{title:'Test project',url:'javascript:alert(1)'}})).response.status,400);
    const saved = await request('/api/admin/projects',{method:'POST',body:{title:'Test project',titleTa:'சோதனைத் திட்டம்',summary:'Test only',status:'draft'}});
    assert.equal(saved.response.status,201); project = saved.data.item;
    assert.equal((await request('/api/content')).data.projects.length,0);
    const published = await request(`/api/admin/projects/${project.id}`,{method:'PUT',body:{...project,status:'published',publicApproved:true}});
    assert.equal(published.response.status,200);
    const content = (await request('/api/content')).data;
    assert.equal(content.projects.length,1); assert.equal(content.projects[0].titleTa,'சோதனைத் திட்டம்'); assert.equal(content.projects[0].publicApproved,undefined);
  });
  await t.test('CRM contacts never appear in public content',async () => {
    const saved = await request('/api/admin/contacts',{method:'POST',body:{name:'Private test contact',email:'private@example.test',stage:'New',notes:'Private notes'}});
    assert.equal(saved.response.status,201); contact = saved.data.item;
    const publicData = (await request('/api/content')).data;
    assert.equal(publicData.contacts,undefined); assert.ok(!JSON.stringify(publicData).includes('private@example.test'));
  });
  await t.test('archiving removes public content and restoring recovers it',async () => {
    assert.equal((await request(`/api/admin/projects/${project.id}`,{method:'DELETE'})).response.status,200);
    assert.equal((await request('/api/content')).data.projects.length,0);
    assert.equal((await request(`/api/admin/projects/${project.id}`,{method:'PATCH',body:{archived:false}})).response.status,200);
    assert.equal((await request('/api/content')).data.projects.length,1);
  });
  await t.test('uploads reject executable SVG and mismatched image data',async () => {
    assert.equal((await request('/api/admin/uploads',{method:'POST',body:{data:'data:image/svg+xml;base64,PHN2Zz4='}})).response.status,400);
    assert.equal((await request('/api/admin/uploads',{method:'POST',body:{data:'data:image/png;base64,'+Buffer.from('not-an-image-content').toString('base64')}})).response.status,400);
    const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9S8AAAAASUVORK5CYII=';
    const {response,data} = await request('/api/admin/uploads',{method:'POST',body:{data:`data:image/png;base64,${png}`}});
    assert.equal(response.status,201);
    assert.equal((await fetch(origin+data.url)).status,404);
    assert.equal((await fetch(origin+'/api/admin'+data.url,{headers:{Cookie:cookie}})).status,200);
    const client = await request('/api/admin/clients',{method:'POST',body:{name:'Test client',logo:data.url,status:'published',publicApproved:true}});
    assert.equal(client.response.status,201);
    const media = await fetch(origin+data.url); assert.equal(media.status,200); assert.equal(media.headers.get('content-type'),'image/png');
    await request(`/api/admin/clients/${client.data.item.id}`,{method:'DELETE'});
    assert.equal((await fetch(origin+data.url)).status,404);
  });
  await t.test('data persists after the backend is recreated',async () => {
    const restarted = createServer(await createApplication({dataDirectory:directory,allowSetup:false,secureCookies:false}));
    await new Promise(resolve => restarted.listen(0,'127.0.0.1',resolve));
    try {
      const base = `http://127.0.0.1:${restarted.address().port}`;
      assert.equal((await (await fetch(base+'/api/content')).json()).projects.length,1);
      assert.equal((await (await fetch(base+'/api/admin/session')).json()).initialized,true);
    } finally { await new Promise(resolve => restarted.close(resolve)); }
  });
  await t.test('private database and source cannot be downloaded',async () => {
    for (const path of ['/.kar-data/database.json','/backend.mjs','/%2e%2e%2fbackend.mjs']) assert.notEqual((await fetch(origin+path)).status,200);
  });
  await t.test('password update revokes old sessions and old credentials',async () => {
    const oldCookie = cookie;
    const {response,data} = await request('/api/admin/password',{method:'POST',body:{currentPassword:'a-long-test-password',password:'a-new-long-test-password'}});
    assert.equal(response.status,200); csrf = data.csrf; cookie = response.headers.get('set-cookie').split(';')[0];
    const oldSession = await fetch(origin+'/api/admin/contacts',{headers:{Cookie:oldCookie}}); assert.equal(oldSession.status,401);
    assert.equal((await request('/api/admin/login',{method:'POST',body:{email:'owner@example.test',password:'a-long-test-password'}})).response.status,401);
    assert.equal((await request('/api/admin/login',{method:'POST',body:{email:'owner@example.test',password:'a-new-long-test-password'}})).response.status,200);
  });
  await t.test('logout invalidates the active session',async () => {
    assert.equal((await request('/api/admin/logout',{method:'POST'})).response.status,200);
    assert.equal((await request('/api/admin/contacts')).response.status,401);
  });
});
