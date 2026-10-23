import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { readFile } from 'node:fs/promises';
import { createVercelHandler } from '../api/index.mjs';
import { createEmptyState } from '../cloud-store.mjs';

const environment = {PUBLIC_ORIGIN:'https://kar.example',VERCEL_URL:'kar-deploy.vercel.app',VERCEL_BRANCH_URL:'kar-branch.vercel.app',VERCEL_PROJECT_PRODUCTION_URL:'kar-production.vercel.app'};
function request({url='/api/content',method='GET',headers={},body,parsedBody,address='127.0.0.1',query}={}) {
  const req = Readable.from(body === undefined ? [] : [body]);
  req.url = url; req.method = method; req.headers = {host:'kar.example',...headers}; req.socket = {remoteAddress:address};
  if (parsedBody !== undefined) req.body = parsedBody;
  if (query !== undefined) req.query = query;
  return req;
}
function response() {
  return {
    writes:0,ended:false,status:0,headers:{},body:Buffer.alloc(0),
    writeHead(status,headers) { this.writes++; this.status = status; this.headers = Object.fromEntries(Object.entries(headers).map(([key,value]) => [key.toLowerCase(),value])); },
    end(body) { this.ended = true; this.body = Buffer.from(body ?? ''); },
    json() { return JSON.parse(this.body.toString()); }
  };
}
function fixture({env=environment,backendFactory,withState}={}) {
  const calls = [], options = [], state = createEmptyState();
  let transactions = 0;
  const store = {media:{read:async () => Buffer.from('media'),write:async () => {}},async withState(callback) { transactions++; return withState ? withState(callback,state) : callback(state); }};
  const factory = backendFactory ?? (settings => {
    options.push(settings);
    return async (req,res,url) => {
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      calls.push({method:req.method,url:req.url,path:url.pathname,origin:settings.publicOrigin,address:req.socket.remoteAddress,body:Buffer.concat(chunks),headers:req.headers});
      res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({ok:true})); return true;
    };
  });
  const handler = createVercelHandler({store,environment:env,backendFactory:factory});
  return {calls,options,state,store,handler,get transactions(){return transactions;},async send(settings) { const req = request(settings), res = response(); await handler(req,res); return {req,res}; }};
}
const deferred = () => { let resolve; const promise = new Promise(done => {resolve = done;}); return {promise,resolve}; };

test('missing cloud configuration returns a generic unavailable response without local bootstrap',async () => {
  for (const env of [{},environment,{...environment,DATABASE_URL:'postgresql://private-connection'}]) {
    const res = response(); await createVercelHandler({environment:env})(request(),res);
    assert.equal(res.status,503); assert.match(res.json().error,/temporarily unavailable/);
    assert.equal(res.headers['set-cookie'],undefined);
    assert.doesNotMatch(res.body.toString(),/DATABASE_URL|private-connection|BLOB|password|\.kar-data/);
  }
});

test('only exact configured hosts are allowed and each preview uses its own HTTPS origin',async () => {
  const f = fixture();
  for (const host of ['kar.example','kar-deploy.vercel.app','kar-branch.vercel.app','kar-production.vercel.app','KAR.EXAMPLE']) {
    const {res} = await f.send({headers:{host}}); assert.equal(res.status,200);
    const settings = f.options.at(-1);
    assert.equal(settings.publicOrigin,`https://${host.toLowerCase()}`);
    assert.equal(settings.allowSetup,false); assert.equal(settings.secureCookies,true);
    assert.equal(settings.state,f.state); assert.equal(settings.mediaStore,f.store.media);
  }
  const before = f.transactions;
  for (const host of ['kar.example.evil.test','evil.test','kar.example:444','kar.example@evil.test','kar.example/path',['kar.example','evil.test']]) {
    const {res} = await f.send({headers:{host}}); assert.equal(res.status,403);
  }
  assert.equal(f.transactions,before,'Rejected hosts never take a database lock');
  const generated = fixture({env:{VERCEL_URL:'kar-deploy.vercel.app'}});
  assert.equal((await generated.send({headers:{host:'kar-deploy.vercel.app'}})).res.status,200);
  const invalid = fixture({env:{...environment,PUBLIC_ORIGIN:'http://kar.example'}});
  assert.equal((await invalid.send()).res.status,503);
});

test('client IP forwarding is trusted only on Vercel and never mutates the original socket',async () => {
  const local = fixture();
  const {req} = await local.send({headers:{'x-vercel-forwarded-for':'203.0.113.6','x-forwarded-for':'198.51.100.9'},address:'::1'});
  assert.equal(local.calls[0].address,'::1'); assert.equal(req.socket.remoteAddress,'::1');
  const cloud = fixture({env:{...environment,VERCEL:'1'}});
  const cloudRequest = await cloud.send({headers:{'x-vercel-forwarded-for':'2001:db8::8','x-forwarded-for':'198.51.100.9'}});
  assert.equal(cloud.calls[0].address,'2001:db8::8'); assert.equal(cloudRequest.req.socket.remoteAddress,'127.0.0.1');
  assert.equal((await cloud.send()).res.status,200,'A valid socket is used if the platform header is absent');
  const before = cloud.transactions;
  for (const forwarded of ['203.0.113.5, 198.51.100.1','not-an-ip',['203.0.113.5']]) assert.equal((await cloud.send({headers:{'x-vercel-forwarded-for':forwarded}})).res.status,400);
  assert.equal((await cloud.send({address:'invalid'})).res.status,400);
  assert.equal(cloud.transactions,before);
});

test('all website/admin/media routes reach the shared backend through direct and explicit rewrite URLs',async () => {
  const f = fixture();
  for (const [method,path] of [
    ['GET','/api/content'],['GET','/api/forms/challenge'],['POST','/api/enquiries'],['POST','/api/applications'],
    ['GET','/api/admin/session'],['POST','/api/admin/login'],['POST','/api/admin/logout'],['POST','/api/admin/password'],
    ['POST','/api/admin/uploads'],['GET','/api/admin/media/123.png'],['GET','/media/123.png'],
    ...['jobs','clients','projects','contacts','employees','applications','users'].flatMap(resource => [['GET',`/api/admin/${resource}`],['PUT',`/api/admin/${resource}/abc-123`]])
  ]) {
    const {res} = await f.send({url:`/api/index?__kar_route=${encodeURIComponent(path)}&filter=active`,method,parsedBody:{name:'Example'},headers:{'content-type':'application/json'}});
    assert.equal(res.status,200); assert.equal(f.calls.at(-1).path,path); assert.equal(f.calls.at(-1).method,method);
    assert.equal(f.calls.at(-1).url,`${path}?filter=active`);
    assert.deepEqual(JSON.parse(f.calls.at(-1).body),{name:'Example'});
  }
  await f.send({url:'/media/abc.png',method:'HEAD'});
  assert.equal(f.calls.at(-1).path,'/media/abc.png');
  await f.send({url:'/api/index',query:{__kar_route:'/api/admin/session'}});
  assert.equal(f.calls.at(-1).path,'/api/admin/session');
});

test('route metadata cannot expose private paths or override a preserved public route',async () => {
  const f = fixture();
  for (const url of ['/.kar-data/database.json','/backend.mjs','/admin','//evil.test/api/content','/api/index?__kar_route=/.kar-data/database.json','/api/index?__kar_route=/api/../../.kar-data/database.json','/api/index?__kar_route=/media/%252e%252e/database.json']) {
    assert.equal((await f.send({url})).res.status,404,url);
  }
  for (const settings of [
    {url:'/api/content?__kar_route=/api/admin/session'},
    {url:'/api/index?__kar_route=/api/content&__kar_route=/api/admin/session'},
    {url:'/api/index',query:{__kar_route:['/api/content','/api/admin/session']}},
    {url:'/api/index?__kar_route=/api/content',query:{__kar_route:'/api/admin/session'}}
  ]) assert.equal((await f.send(settings)).res.status,400);
  assert.equal(f.transactions,0);
  const unknown = fixture({backendFactory:() => async () => false});
  assert.equal((await unknown.send({url:'/api/unknown'})).res.status,404);
});

test('the complete raw or pre-parsed body is bounded before the workspace lock',async () => {
  const f = fixture(), limit = 3*1024*1024;
  const exact = Buffer.alloc(limit,97);
  assert.equal((await f.send({method:'POST',body:exact})).res.status,200);
  assert.equal(f.calls[0].body.length,limit);
  for (const settings of [
    {body:Buffer.alloc(limit+1)},
    {parsedBody:'x'.repeat(limit+1)},
    {headers:{'content-length':String(limit+1)},body:'small'}
  ]) {
    const before = f.transactions; assert.equal((await f.send(settings)).res.status,413); assert.equal(f.transactions,before);
  }
  assert.equal((await f.send({headers:{'content-length':'invalid'}})).res.status,400);
  await f.send({parsedBody:{unicode:'தமிழ்'},headers:{'content-type':'application/json'}});
  assert.deepEqual(JSON.parse(f.calls.at(-1).body),{unicode:'தமிழ்'});
  await f.send({parsedBody:Buffer.from('raw')}); assert.equal(f.calls.at(-1).body.toString(),'raw');
  const ready = deferred(), release = deferred(); let complete = false;
  const req = Readable.from((async function* () { yield Buffer.from('one'); ready.resolve(); await release.promise; yield Buffer.from('two'); complete = true; })());
  Object.assign(req,{url:'/api/content',method:'POST',headers:{host:'kar.example'},socket:{remoteAddress:'127.0.0.1'}});
  const ordered = fixture({withState:async callback => { assert.equal(complete,true); return callback(createEmptyState()); }});
  const pending = ordered.handler(req,response()); await ready.promise;
  assert.equal(ordered.transactions,0); release.resolve(); await pending;
  assert.equal(ordered.calls[0].body.toString(),'onetwo');
});

test('cookies and response bodies are withheld until a successful commit',async () => {
  const reachedCommit = deferred(), releaseCommit = deferred();
  const backendFactory = () => async (req,res) => { res.writeHead(201,{'Set-Cookie':['kar_session=committed; Secure; HttpOnly'],'Content-Type':'application/json'}); res.end('{"saved":true}'); return true; };
  const f = fixture({backendFactory,withState:async (callback,state) => { const result = await callback(state); reachedCommit.resolve(); await releaseCommit.promise; return result; }});
  const res = response(), pending = f.handler(request(),res); await reachedCommit.promise;
  assert.equal(res.writes,0); assert.equal(res.ended,false); assert.equal(res.headers['set-cookie'],undefined);
  releaseCommit.resolve(); await pending;
  assert.equal(res.status,201); assert.equal(res.json().saved,true); assert.deepEqual(res.headers['set-cookie'],['kar_session=committed; Secure; HttpOnly']);
  const failed = fixture({backendFactory,withState:async (callback,state) => { await callback(state); throw new Error('private postgres password and token'); }});
  const failure = (await failed.send()).res;
  assert.equal(failure.status,503); assert.equal(failure.headers['set-cookie'],undefined);
  assert.doesNotMatch(failure.body.toString(),/saved|password|postgres|token|kar_session/);
});

test('storage/backend failures stay generic and HEAD/media security headers are retained',async () => {
  for (const options of [
    {withState:async () => { throw new Error('DATABASE_URL=secret'); }},
    {backendFactory:() => { throw new Error('private runtime contents'); }}
  ]) {
    const res = (await fixture(options).send()).res;
    assert.equal(res.status,503); assert.match(res.headers['cache-control'],/no-store/); assert.equal(res.headers['x-frame-options'],'DENY');
    assert.doesNotMatch(res.body.toString(),/secret|DATABASE_URL|runtime/);
  }
  const media = fixture({backendFactory:() => async (req,res) => { res.writeHead(200,{'Content-Type':'image/png','Cache-Control':'no-cache'}); res.end(Buffer.from([1,2,3])); return true; }});
  const {res} = await media.send({url:'/media/image.png',method:'HEAD'});
  assert.equal(res.body.length,0); assert.equal(res.headers['content-type'],'image/png'); assert.equal(res.headers['cache-control'],'no-cache');
  assert.match(res.headers['content-security-policy'],/frame-ancestors 'none'/);
});

test('the real shared backend serves public content and disables cloud account setup on preview origins',async () => {
  const state = createEmptyState(), store = {media:{read:async () => {throw Object.assign(new Error('missing'),{code:'ENOENT'});},write:async () => {}},withState:callback => callback(state)};
  const handler = createVercelHandler({store,environment});
  const send = async settings => { const res = response(); await handler(request(settings),res); return res; };
  assert.deepEqual((await send()).json(),{jobs:[],clients:[],projects:[]});
  const session = await send({url:'/api/admin/session'}); assert.equal(session.json().setupAllowed,false); assert.equal(session.json().initialized,false);
  const preview = {host:'kar-branch.vercel.app',origin:'https://kar-branch.vercel.app','x-kar-request':'1','content-type':'application/json'};
  const setup = await send({url:'/api/admin/setup',method:'POST',headers:preview,parsedBody:{email:'admin@example.com',password:'long-local-password'}});
  assert.equal(setup.status,403); assert.match(setup.json().error,/setup is unavailable/);
  const wrongOrigin = await send({url:'/api/admin/setup',method:'POST',headers:{...preview,origin:'https://kar.example'},parsedBody:{}});
  assert.equal(wrongOrigin.status,403); assert.match(wrongOrigin.json().error,/origin/);
  assert.equal((await send({url:'/media/01234567-0123-0123-0123-0123456789ab.png'})).status,404);
  assert.equal((await send({url:'/api/not-found'})).status,404);
  assert.equal(state.database.users.length,0,'The cloud path never creates a bootstrap account');
});

test('Vercel config serves only explicit routes and keeps private local files outside the upload allowlist',async () => {
  const config = JSON.parse(await readFile(new URL('../vercel.json',import.meta.url),'utf8'));
  assert.equal(config.framework,null); assert.equal(config.outputDirectory,'dist'); assert.equal(config.installCommand,'npm ci');
  assert.deepEqual(config.rewrites.map(rule => rule.source),['/api/:path*','/media/:path*','/admin','/admin/']);
  assert.equal(config.rewrites[0].destination,'/api/index?__kar_route=/api/:path*');
  assert.equal(config.rewrites[1].destination,'/api/index?__kar_route=/media/:path*');
  assert.ok(config.rewrites.slice(2).every(rule => rule.destination === '/admin/index.html'));
  const ignored = await readFile(new URL('../.vercelignore',import.meta.url),'utf8');
  assert.match(ignored,/^\/\*$/m);
  for (const required of ['!/api/','!/dist/','!/backend.mjs','!/cloud-store.mjs','!/package.json','!/package-lock.json']) assert.ok(ignored.split('\n').includes(required));
  for (const privateName of ['.kar-data','.env','.git','.openai','node_modules','tests','recordings']) assert.ok(ignored.includes(`**/${privateName}`));
});
