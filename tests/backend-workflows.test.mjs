import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scrypt } from 'node:crypto';
import { promisify } from 'node:util';
import { createApplication } from '../server.mjs';

const password = 'a-private-test-password';
async function fixture({legacy}={}) {
  const directory = await mkdtemp(join(tmpdir(),'kar-workflows-test-'));
  if (legacy) await writeFile(join(directory,'database.json'),JSON.stringify(legacy));
  const server = createServer(await createApplication({dataDirectory:directory,allowSetup:true,secureCookies:false}));
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  async function request(path,{method='GET',body,session,originHeader=origin,csrfHeader=session?.csrf}={}) {
    const response = await fetch(origin+path,{method,headers:{'Content-Type':'application/json','X-KAR-Request':'1',Origin:originHeader,...(session ? {Cookie:session.cookie,'X-CSRF-Token':csrfHeader} : {})},...(body ? {body:JSON.stringify(body)} : {})});
    let data; try { data = await response.json(); } catch { data = null; }
    return {response,data};
  }
  function sessionFrom(result) {
    assert.equal(result.response.status,200,JSON.stringify(result.data));
    return {cookie:result.response.headers.get('set-cookie').split(';')[0],csrf:result.data.csrf,user:result.data.user};
  }
  async function login(email='owner@example.test') { return sessionFrom(await request('/api/admin/login',{method:'POST',body:{email,password}})); }
  const owner = legacy ? await login(legacy.admin.email) : sessionFrom(await request('/api/admin/setup',{method:'POST',body:{email:'owner@example.test',name:'Owner',password}}));
  return {request,login,owner,directory,origin,close:async () => { await new Promise(resolve => server.close(resolve)); await rm(directory,{recursive:true,force:true}); }};
}
function assertPrivateUser(user) {
  for (const field of ['hash','salt','password','authVersion']) assert.equal(user[field],undefined,field);
}
const baseApplicant = {name:'Integration Applicant',email:'applicant@example.test',countryCode:'+91',phone:'9000000000',address:'Test address',degree:'B.E.',experienceType:'fresher',consent:true,robotCheck:true,website:''};
const enquiry = {...baseApplicant,service:'Web development',message:'Please discuss this test project.',company:'Integration tests'};

test('role access is enforced by the API and account changes revoke sessions',async t => {
  const f = await fixture();
  const {request,owner,login} = f;
  try {
    let sales, admin, employee, salesSession, adminSession, employeeSession;
    await t.test('initial administrator is a super administrator; user responses never expose credentials',async () => {
      assert.equal(owner.user.role,'super_admin');
      assert.deepEqual(owner.user.permissions,['cms','crm','hr']);
      assertPrivateUser(owner.user);
      const session = await request('/api/admin/session',{session:owner});
      assertPrivateUser(session.data.user);
      for (const [role,name] of [['sales','Sales'],['admin','CMS Admin'],['employee','Employee']]) {
        const created = await request('/api/admin/users',{method:'POST',session:owner,body:{name,email:`${role}@example.test`,role,password}});
        assert.equal(created.response.status,201,JSON.stringify(created.data)); assertPrivateUser(created.data.item);
        if (role === 'sales') sales = created.data.item;
        if (role === 'admin') admin = created.data.item;
        if (role === 'employee') employee = created.data.item;
      }
      const accounts = await request('/api/admin/users',{session:owner});
      accounts.data.items.forEach(assertPrivateUser);
      salesSession = await login(sales.email); adminSession = await login(admin.email); employeeSession = await login(employee.email);
    });
    await t.test('sales defaults to CRM and cannot access CMS, HR, users, uploads or private media',async () => {
      assert.deepEqual(salesSession.user.permissions,['crm']);
      assert.equal((await request('/api/admin/contacts',{session:salesSession})).response.status,200);
      const contact = await request('/api/admin/contacts',{method:'POST',session:salesSession,body:{name:'Sales contact',stage:'New'}});
      assert.equal(contact.response.status,201);
      for (const resource of ['jobs','clients','projects','employees','applications','users']) {
        assert.equal((await request(`/api/admin/${resource}`,{session:salesSession})).response.status,403,resource);
        assert.equal((await request(`/api/admin/${resource}`,{session:salesSession,method:'POST',body:{name:'Blocked',title:'Blocked'}})).response.status,403,resource);
      }
      assert.equal((await request('/api/admin/uploads',{method:'POST',session:salesSession,body:{data:'invalid'}})).response.status,403);
      assert.equal((await request('/api/admin/media/00000000-0000-0000-0000-000000000000.png',{session:salesSession})).response.status,403);
    });
    await t.test('admin can manage CMS and HR; employees have no data access until assigned',async () => {
      for (const resource of ['jobs','clients','projects','employees','applications']) assert.equal((await request(`/api/admin/${resource}`,{session:adminSession})).response.status,200,resource);
      for (const resource of ['contacts','users']) assert.equal((await request(`/api/admin/${resource}`,{session:adminSession})).response.status,403,resource);
      for (const resource of ['jobs','contacts','employees','applications','users']) assert.equal((await request(`/api/admin/${resource}`,{session:employeeSession})).response.status,403,resource);
      const saved = await request('/api/admin/employees',{method:'POST',session:adminSession,body:{name:'Test Employee',email:'person@example.test',department:'Engineering',jobTitle:'Developer',status:'Active',joiningDate:'2026-10-21'}});
      assert.equal(saved.response.status,201,JSON.stringify(saved.data));
      assert.equal((await request(`/api/admin/employees/${saved.data.item.id}`,{method:'PUT',session:adminSession,body:{status:'On leave'}})).data.item.status,'On leave');
      const publicData = (await request('/api/content')).data;
      assert.equal(publicData.employees,undefined); assert.ok(!JSON.stringify(publicData).includes('person@example.test'));
    });
    await t.test('staff cannot grant themselves permissions through any account mutation route',async () => {
      for (const method of ['PUT','PATCH','DELETE']) assert.equal((await request(`/api/admin/users/${sales.id}`,{method,session:salesSession,body:{role:'super_admin',permissions:['cms','crm','hr'],archived:false}})).response.status,403,method);
    });
    await t.test('permission changes invalidate old sessions, and a new login gets assigned access',async () => {
      const updated = await request(`/api/admin/users/${employee.id}`,{method:'PUT',session:owner,body:{permissions:['hr']}});
      assert.equal(updated.response.status,200,JSON.stringify(updated.data)); assertPrivateUser(updated.data.item);
      assert.equal((await request('/api/admin/employees',{session:employeeSession})).response.status,401);
      employeeSession = await login(employee.email);
      assert.equal((await request('/api/admin/employees',{session:employeeSession})).response.status,200);
      assert.equal((await request('/api/admin/contacts',{session:employeeSession})).response.status,403);
    });
    await t.test('deactivation invalidates existing sessions and blocks new logins',async () => {
      assert.equal((await request(`/api/admin/users/${sales.id}`,{method:'PUT',session:owner,body:{active:false}})).response.status,200);
      assert.equal((await request('/api/admin/contacts',{session:salesSession})).response.status,401);
      assert.equal((await request('/api/admin/login',{method:'POST',body:{email:sales.email,password}})).response.status,401);
      assert.equal((await request('/api/admin/session',{session:salesSession})).data.user,null);
    });
    await t.test('super administrator cannot disable or demote their own account',async () => {
      for (const [method,body] of [['DELETE',{}],['PATCH',{archived:true}],['PUT',{active:false}],['PUT',{role:'admin',permissions:['cms']}]] ) {
        assert.equal((await request(`/api/admin/users/${owner.user.id}`,{method,body,session:owner})).response.status,400);
      }
      assert.equal((await request('/api/admin/users',{session:owner})).response.status,200);
    });
    await t.test('super administrator can reset a worker password without exposing it or keeping old sessions',async () => {
      const changed = await request(`/api/admin/users/${employee.id}`,{method:'PUT',session:owner,body:{password:'a-new-worker-password'}});
      assert.equal(changed.response.status,200); assertPrivateUser(changed.data.item);
      assert.equal((await request('/api/admin/employees',{session:employeeSession})).response.status,401);
      assert.equal((await request('/api/admin/login',{method:'POST',body:{email:employee.email,password}})).response.status,401);
      const signedIn = await request('/api/admin/login',{method:'POST',body:{email:employee.email,password:'a-new-worker-password'}});
      assert.equal(signedIn.response.status,200); assertPrivateUser(signedIn.data.user);
    });
  } finally { await f.close(); }
});

test('published jobs collect conditional applications and project enquiries reach the private CRM',async t => {
  const f = await fixture();
  const {request,owner} = f;
  const challenge = async () => (await request('/api/forms/challenge')).data.token;
  const submit = async (path,body) => request(path,{method:'POST',body:{...body,formToken:await challenge()}});
  try {
    let job, experienced, application;
    await t.test('only published CMS records appear, without application URLs or private fields',async () => {
      const draft = await request('/api/admin/jobs',{method:'POST',session:owner,body:{title:'Draft role',description:'Draft description',applyUrl:'https://example.test/old-link',status:'draft'}});
      assert.equal(draft.response.status,201);
      const published = await request('/api/admin/jobs',{method:'POST',session:owner,body:{title:'Junior developer',titleTa:'Legacy translation',description:'Build accessible applications.',status:'published',candidateLevel:'fresher',nature:'Remote',questions:[{id:'motivation',label:'Why this role?',type:'textarea',required:true},{id:'availability',label:'Preferred schedule',type:'select',required:true,options:['Full time','Part time']},{id:'remote',label:'Can you work remotely?',type:'checkbox',required:true}]}});
      assert.equal(published.response.status,201,JSON.stringify(published.data)); job = published.data.item;
      const content = (await request('/api/content')).data;
      assert.equal(content.jobs.length,1); assert.equal(content.jobs[0].id,job.id); assert.equal(content.jobs[0].applyUrl,undefined);
      assert.equal(content.jobs[0].publicApproved,undefined); assert.equal(content.jobs[0].createdAt,undefined);
      const update = await request(`/api/admin/jobs/${job.id}`,{method:'PUT',session:owner,body:{title:'Junior web developer'}});
      assert.equal(update.data.item.titleTa,'Legacy translation'); job = update.data.item;
      const role = await request('/api/admin/jobs',{method:'POST',session:owner,body:{title:'Experienced developer',description:'Build software.',status:'published',candidateLevel:'experienced',experienceMin:'2',nature:'Hybrid'}});
      assert.equal(role.response.status,201); experienced = role.data.item;
      const unpublishedSubmission = await submit('/api/applications',{...baseApplicant,jobId:draft.data.item.id});
      assert.equal(unpublishedSubmission.response.status,400);
    });
    await t.test('enquiry requires country code, phone, consent, robot check and same-origin request',async () => {
      for (const override of [{countryCode:''},{countryCode:'91'},{phone:'bad'},{email:'bad'},{consent:false},{robotCheck:false},{website:'spam.example'},{message:''}]) {
        assert.equal((await submit('/api/enquiries',{...enquiry,...override})).response.status,400,JSON.stringify(override));
      }
      assert.equal((await request('/api/enquiries',{method:'POST',originHeader:'https://example.test',body:{...enquiry,formToken:await challenge()}})).response.status,403);
    });
    await t.test('enquiry creates one CRM record and a token replay cannot duplicate it',async () => {
      const formToken = await challenge();
      const results = await Promise.all([1,2].map(() => request('/api/enquiries',{method:'POST',body:{...enquiry,formToken}})));
      assert.deepEqual(results.map(result => result.response.status).sort(),[201,400]);
      const saved = results.find(result => result.response.status === 201).data;
      assert.match(saved.reference,/^KAR-PRJ-/);
      const contacts = (await request('/api/admin/contacts',{session:owner})).data.items;
      assert.equal(contacts.length,1); assert.equal(contacts[0].source,'website'); assert.equal(contacts[0].notes,enquiry.message); assert.equal(contacts[0].countryCode,'+91');
      const content = (await request('/api/content')).data;
      assert.equal(content.contacts,undefined); assert.ok(!JSON.stringify(content).includes(enquiry.email));
    });
    await t.test('applications enforce candidate level and administrator-defined questions',async () => {
      for (const override of [
        {address:''},{degree:''},{answers:{}},{answers:{motivation:'Interested',availability:'Invalid',remote:true}},
        {answers:{motivation:'Interested',availability:'Full time',remote:false}},
        {experienceType:'experienced',yearsExperience:'3',latestCompany:'Previous firm',noticePeriod:'30 days'}
      ]) assert.equal((await submit('/api/applications',{...baseApplicant,jobId:job.id,...override})).response.status,400);
      const saved = await submit('/api/applications',{...baseApplicant,jobId:job.id,answers:{motivation:'I enjoy building websites.',availability:'Full time',remote:true}});
      assert.equal(saved.response.status,201,JSON.stringify(saved.data));
      assert.match(saved.data.reference,/^KAR-JOB-/);
      application = (await request('/api/admin/applications',{session:owner})).data.items[0];
      assert.equal(application.id,saved.data.id); assert.equal(application.experienceType,'fresher'); assert.equal(application.latestCompany,'');
      assert.deepEqual(application.questions,job.questions); assert.equal(application.answers.motivation,'I enjoy building websites.');
      const contacts = (await request('/api/admin/contacts',{session:owner})).data.items;
      const linked = contacts.find(item => item.applicationId === application.id);
      assert.equal(linked.source,'job_application'); assert.equal(linked.jobId,job.id);
      assert.equal(linked.degree,undefined); assert.equal(linked.answers,undefined); assert.equal(linked.yearsExperience,undefined);
      const publicData = (await request('/api/content')).data;
      assert.equal(publicData.applications,undefined); assert.ok(!JSON.stringify(publicData).includes('applicant@example.test'));
    });
    await t.test('experienced roles require company and notice period; freshers do not',async () => {
      const input = {...baseApplicant,jobId:experienced.id,experienceType:'experienced',yearsExperience:3,latestCompany:'Test company',noticePeriod:'30 days'};
      for (const override of [{experienceType:'fresher'},{yearsExperience:1},{yearsExperience:''},{latestCompany:''},{noticePeriod:''}]) assert.equal((await submit('/api/applications',{...input,...override})).response.status,400,JSON.stringify(override));
      assert.equal((await submit('/api/applications',input)).response.status,201);
    });
    await t.test('application review preserves applicant answers and original questions after job edits',async () => {
      assert.equal((await request(`/api/admin/jobs/${job.id}`,{method:'PUT',session:owner,body:{questions:[]}})).response.status,200);
      const updated = await request(`/api/admin/applications/${application.id}`,{method:'PUT',session:owner,body:{stage:'Interview',notes:'Contact next week.',name:'Attempted overwrite',answers:{}}});
      assert.equal(updated.response.status,200); assert.equal(updated.data.item.stage,'Interview'); assert.equal(updated.data.item.name,baseApplicant.name);
      assert.equal(updated.data.item.answers.motivation,'I enjoy building websites.'); assert.deepEqual(updated.data.item.questions,application.questions);
      assert.equal((await request(`/api/admin/applications/${application.id}`,{method:'PUT',session:owner,body:{stage:'Published'}})).response.status,400);
      assert.equal((await request('/api/admin/applications',{method:'POST',session:owner,body:baseApplicant})).response.status,405);
    });
    await t.test('archived jobs disappear and reject later applications; invalid question schemas are rejected',async () => {
      assert.equal((await request(`/api/admin/jobs/${job.id}`,{method:'DELETE',session:owner})).response.status,200);
      assert.equal((await submit('/api/applications',{...baseApplicant,jobId:job.id})).response.status,400);
      assert.ok(!(await request('/api/content')).data.jobs.some(item => item.id === job.id));
      for (const questions of [[{id:'duplicate',label:'A',type:'text'},{id:'duplicate',label:'B',type:'text'}],[{id:'__proto__',label:'Unsafe ID',type:'text'}],[{label:'Choice',type:'select',options:[]}],Array.from({length:31},(_,index) => ({id:`q${index}`,label:'Too many',type:'text'}))]) {
        assert.equal((await request('/api/admin/jobs',{method:'POST',session:owner,body:{title:'Invalid questions',questions}})).response.status,400);
      }
    });
  } finally { await f.close(); }
});

test('public submission rate limiting stops repeated requests before any CRM data is created',async () => {
  const f = await fixture();
  try {
    const formToken = (await f.request('/api/forms/challenge')).data.token;
    for (let index=0; index<30; index++) assert.equal((await f.request('/api/enquiries',{method:'POST',body:{...enquiry,formToken,robotCheck:false}})).response.status,400);
    assert.equal((await f.request('/api/enquiries',{method:'POST',body:{...enquiry,formToken}})).response.status,429);
    assert.equal((await f.request('/api/admin/contacts',{session:f.owner})).data.items.length,0);
  } finally { await f.close(); }
});

test('legacy administrator migration preserves credentials, content and a stable super administrator ID',async () => {
  const salt = 'fixed-salt-for-legacy-test';
  const hash = (await promisify(scrypt)(password,salt,64,{N:32768,r:8,p:3,maxmem:64*1024*1024})).toString('hex');
  const legacy = {version:1,admin:{email:'legacy@example.test',salt,hash},jobs:[{id:'legacy-job',title:'Saved role',description:'Saved description',status:'published',applyUrl:'https://example.test/old-link',archived:false}],clients:[],projects:[{id:'legacy-project',title:'Saved project',summary:'Saved summary',status:'published',archived:false}],contacts:[{id:'legacy-contact',name:'Private saved contact',stage:'New',notes:'Preserve this'}]};
  const f = await fixture({legacy});
  try {
    assert.equal(f.owner.user.role,'super_admin'); assertPrivateUser(f.owner.user);
    const persisted = JSON.parse(await readFile(join(f.directory,'database.json'),'utf8'));
    assert.equal(persisted.version,2); assert.equal(persisted.users.length,1); assert.equal(persisted.users[0].hash,hash); assert.equal(persisted.users[0].salt,salt);
    assert.equal(persisted.contacts[0].notes,'Preserve this'); assert.equal(persisted.users[0].id,f.owner.user.id);
    const content = (await f.request('/api/content')).data;
    assert.equal(content.jobs[0].id,'legacy-job'); assert.equal(content.jobs[0].applyUrl,undefined); assert.equal(content.projects[0].id,'legacy-project');
    const restarted = createServer(await createApplication({dataDirectory:f.directory,allowSetup:false,secureCookies:false}));
    await new Promise(resolve => restarted.listen(0,'127.0.0.1',resolve));
    try {
      const origin = `http://127.0.0.1:${restarted.address().port}`;
      const result = await fetch(origin+'/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json','X-KAR-Request':'1',Origin:origin},body:JSON.stringify({email:legacy.admin.email,password})});
      assert.equal(result.status,200); assert.equal((await result.json()).user.id,f.owner.user.id);
    } finally { await new Promise(resolve => restarted.close(resolve)); }
  } finally { await f.close(); }
});
