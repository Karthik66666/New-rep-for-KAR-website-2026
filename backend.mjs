import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const derive = promisify(scrypt);
const passwordHash = (password,salt) => derive(password,salt,64,{N:32768,r:8,p:3,maxmem:64*1024*1024});
const fail = (status,message) => Object.assign(new Error(message),{status});
const roles = ['super_admin','admin','sales','employee'];
const permissions = ['cms','crm','hr'];
const defaults = {super_admin:permissions,admin:['cms','hr'],sales:['crm'],employee:[]};
const resourcePermission = {jobs:'cms',clients:'cms',projects:'cms',contacts:'crm',employees:'hr',applications:'hr'};
const definitions = {
  jobs:{title:180,titleTa:250,description:10000,descriptionTa:15000,location:160,locationTa:200,type:80,typeTa:100,experienceMin:40},
  clients:{name:160,logo:500},
  projects:{title:180,titleTa:250,summary:8000,summaryTa:12000,clientName:160,url:500,image:500},
  contacts:{name:160,email:200,company:180,phone:60,countryCode:5,address:2000,stage:40,notes:15000,nextFollowUp:10,service:180,message:15000},
  employees:{name:160,email:200,phone:60,department:160,jobTitle:180,employmentType:100,status:30,joiningDate:10,manager:160,notes:15000}
};
const publicFields = {
  jobs:['id','title','titleTa','description','descriptionTa','location','locationTa','type','typeTa','nature','candidateLevel','experienceMin','questions'],
  clients:['id','name','logo'],
  projects:['id','title','titleTa','summary','summaryTa','clientName','url','image']
};
const contactStages = ['New','Contacted','Proposal','Won','Lost'];
const applicationStages = ['New','Reviewing','Interview','Offered','Hired','Rejected'];
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function clean(value,key,length,{required=false}={}) {
  if (value != null && typeof value !== 'string') throw fail(400,`Invalid ${key}.`);
  const text = (value ?? '').trim();
  if (text.length > length) throw fail(400,`${key} is too long.`);
  if (required && !text) throw fail(400,`${key} is required.`);
  return text;
}
function email(value,required=false) {
  const result = clean(value,'email',200,{required}).toLowerCase();
  if (result && !emailPattern.test(result)) throw fail(400,'Enter a valid email address.');
  return result;
}
function date(value,label) {
  if (value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value)) || new Date(value).toISOString().slice(0,10) !== value)) throw fail(400,`Invalid ${label}.`);
  return value;
}
function safeURL(value,{image=false}={}) {
  if (!value) return '';
  if (image && /^\/media\/[\da-f-]+\.(png|jpg|webp)$/.test(value)) return value;
  try { const url = new URL(value); if (url.protocol === 'https:' && !url.username && !url.password) return url.href; } catch { /* Reject other protocols. */ }
  throw fail(400,'Use an HTTPS URL or an uploaded image.');
}
function questions(input=[]) {
  if (!Array.isArray(input) || input.length > 30) throw fail(400,'Use up to 30 application questions.');
  const ids = new Set();
  return input.map(question => {
    if (!question || typeof question !== 'object' || Array.isArray(question)) throw fail(400,'Invalid application question.');
    const id = clean(question.id || randomUUID(),'question ID',80,{required:true});
    if (!/^[\w-]+$/.test(id) || ['__proto__','constructor','prototype'].includes(id) || ids.has(id)) throw fail(400,'Question IDs must be unique letters, numbers, hyphens or underscores.');
    ids.add(id);
    const label = clean(question.label,'question label',500,{required:true});
    if (!['text','textarea','select','checkbox'].includes(question.type)) throw fail(400,'Choose a supported question type.');
    const item = {id,label,type:question.type,required:question.required === true};
    if (question.type === 'select') {
      if (!Array.isArray(question.options) || question.options.length < 1 || question.options.length > 30) throw fail(400,'Select questions need 1–30 choices.');
      item.options = question.options.map(option => clean(option,'question choice',250,{required:true}));
      if (new Set(item.options).size !== item.options.length) throw fail(400,'Question choices must be unique.');
    }
    return item;
  });
}
function validate(resource,input) {
  const record = {};
  for (const [key,length] of Object.entries(definitions[resource])) record[key] = clean(key === 'experienceMin' && typeof input[key] === 'number' ? String(input[key]) : input[key],key,length);
  if (!(record.title || record.name)) throw fail(400,'A title or name is required.');
  if (resource === 'contacts') {
    record.email = email(record.email);
    record.stage ||= 'New';
    if (!contactStages.includes(record.stage)) throw fail(400,'Choose a valid contact stage.');
    date(record.nextFollowUp,'follow-up date');
  } else if (resource === 'employees') {
    record.email = email(record.email);
    record.status ||= 'Active';
    if (!['Active','On leave','Exited'].includes(record.status)) throw fail(400,'Choose a valid employee status.');
    date(record.joiningDate,'joining date');
  } else {
    record.status = input.status ?? 'draft';
    if (!['draft','published'].includes(record.status)) throw fail(400,'Choose draft or published.');
    record.publicApproved = input.publicApproved === true;
    if (record.status === 'published' && ['clients','projects'].includes(resource) && !record.publicApproved) throw fail(400,'Confirm permission to publish this client or project.');
    if (record.status === 'published' && resource !== 'clients' && !(record.description || record.summary)) throw fail(400,'Add a description before publishing.');
    if (resource === 'jobs') {
      record.nature = input.nature ?? 'Remote';
      if (!['Remote','Hybrid','On-site'].includes(record.nature)) throw fail(400,'Choose Remote, Hybrid or On-site.');
      record.candidateLevel = input.candidateLevel ?? 'any';
      if (!['fresher','experienced','any'].includes(record.candidateLevel)) throw fail(400,'Choose a candidate experience level.');
      if (record.experienceMin && (!/^\d+(\.\d{1,2})?$/.test(record.experienceMin) || Number(record.experienceMin) > 70)) throw fail(400,'Minimum experience must be a number between 0 and 70.');
      record.questions = questions(input.questions);
    }
  }
  for (const key of ['url','logo','image']) if (key in record) record[key] = safeURL(record[key],{image:['logo','image'].includes(key)});
  if (resource === 'clients' && record.status === 'published' && !record.logo) throw fail(400,'Upload a client logo before publishing.');
  return record;
}
function safeUser(user) {
  return {id:user.id,name:user.name,email:user.email,role:user.role,permissions:user.role === 'super_admin' ? [...permissions] : [...user.permissions],active:user.active !== false,archived:user.archived === true,createdAt:user.createdAt,updatedAt:user.updatedAt};
}
async function validateUser(input,existing) {
  const result = {
    name:clean(input.name,'name',160,{required:true}),email:email(input.email,true),
    role:input.role ?? existing?.role ?? 'employee',active:input.active !== false
  };
  if (!roles.includes(result.role)) throw fail(400,'Choose a valid account role.');
  const assigned = input.permissions ?? defaults[result.role];
  if (!Array.isArray(assigned) || assigned.some(item => !permissions.includes(item))) throw fail(400,'Choose valid account permissions.');
  result.permissions = result.role === 'super_admin' ? [...permissions] : [...new Set(assigned)];
  if (!existing || (input.password != null && input.password !== '')) {
    if (typeof input.password !== 'string' || input.password.length < 12 || input.password.length > 200) throw fail(400,'Use a password between 12 and 200 characters.');
    result.salt = randomBytes(32).toString('hex');
    result.hash = (await passwordHash(input.password,result.salt)).toString('hex');
  }
  return result;
}
function applicantBasics(input) {
  const record = {
    name:clean(input.name,'name',160,{required:true}),email:email(input.email,true),
    countryCode:clean(input.countryCode,'country code',5,{required:true}),phone:clean(input.phone,'phone number',30,{required:true}),
    address:clean(input.address,'address',2000),
  };
  if (!/^\+[1-9]\d{0,3}$/.test(record.countryCode)) throw fail(400,'Enter a country code such as +91.');
  if (!/^[\d ()-]{5,30}$/.test(record.phone) || record.phone.replace(/\D/g,'').length < 5 || record.phone.replace(/\D/g,'').length > 15) throw fail(400,'Enter a valid phone number.');
  return record;
}
function applicationInput(input,job) {
  const record = {...applicantBasics(input),jobId:job.id,jobTitle:job.title};
  record.address = clean(input.address,'address',2000,{required:true});
  record.degree = clean(input.degree,'degree or qualification',250,{required:true});
  record.experienceType = input.experienceType;
  if (!['fresher','experienced'].includes(record.experienceType)) throw fail(400,'Choose fresher or experienced.');
  if (job.candidateLevel !== 'any' && job.candidateLevel !== record.experienceType) throw fail(400,`This role is for ${job.candidateLevel} candidates.`);
  record.yearsExperience = '';
  record.latestCompany = '';
  record.noticePeriod = '';
  if (record.experienceType === 'experienced') {
    record.yearsExperience = clean(typeof input.yearsExperience === 'number' ? String(input.yearsExperience) : input.yearsExperience,'years of experience',20,{required:true});
    if (!/^\d+(\.\d{1,2})?$/.test(record.yearsExperience) || Number(record.yearsExperience) > 70) throw fail(400,'Enter years of experience between 0 and 70.');
    if (job.experienceMin && Number(record.yearsExperience) < Number(job.experienceMin)) throw fail(400,`This role requires at least ${job.experienceMin} years of experience.`);
    record.latestCompany = clean(input.latestCompany,'latest company',250,{required:true});
    record.noticePeriod = clean(input.noticePeriod,'notice period',160,{required:true});
  }
  record.portfolioUrl = safeURL(clean(input.portfolioUrl,'portfolio URL',500));
  if (input.answers != null && (!input.answers || typeof input.answers !== 'object' || Array.isArray(input.answers))) throw fail(400,'Invalid application answers.');
  record.answers = {};
  for (const question of job.questions ?? []) {
    const answer = input.answers?.[question.id];
    if (question.type === 'checkbox') {
      if (answer != null && typeof answer !== 'boolean') throw fail(400,`Invalid answer for ${question.label}.`);
      if (question.required && answer !== true) throw fail(400,`Please confirm: ${question.label}`);
      record.answers[question.id] = answer === true;
    } else {
      const value = clean(answer,question.label,question.type === 'textarea' ? 8000 : 1000,{required:question.required});
      if (question.type === 'select' && value && !question.options.includes(value)) throw fail(400,`Choose a valid answer for ${question.label}.`);
      record.answers[question.id] = value;
    }
  }
  // Snapshot the questions so HR can understand answers after a job is edited.
  record.questions = structuredClone(job.questions ?? []);
  return record;
}
async function jsonBody(req) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw fail(415,'Send JSON data.');
  let size = 0; const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 3*1024*1024) throw fail(413,'Request is too large.');
    chunks.push(chunk);
  }
  try { const data = JSON.parse(Buffer.concat(chunks).toString()); if (!data || Array.isArray(data) || typeof data !== 'object') throw new Error(); return data; }
  catch { throw fail(400,'Invalid JSON data.'); }
}
export async function createBackend({directory=resolve('.kar-data'),state,mediaStore,allowSetup=process.env.NODE_ENV !== 'production',secureCookies=process.env.NODE_ENV === 'production',publicOrigin=process.env.PUBLIC_ORIGIN}={}) {
  const shared = state !== undefined;
  const media = resolve(directory,'media'), file = resolve(directory,'database.json');
  let database;
  if (shared) {
    if (!state || !state.database || typeof state.database !== 'object' || Array.isArray(state.database) || !mediaStore?.read || !mediaStore?.write) throw new Error('Shared database and private media storage are required.');
    database = state.database;
  } else {
    await mkdir(media,{recursive:true,mode:0o700});
    try { database = JSON.parse(await readFile(file,'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; database = {version:2,admin:null,users:[],jobs:[],clients:[],projects:[],contacts:[],employees:[],applications:[]}; }
  }
  // Migrate the original single administrator without changing their credentials or content.
  let migrated = database.version !== 2;
  for (const resource of ['users','jobs','clients','projects','contacts','employees','applications']) {
    if (!Array.isArray(database[resource])) { database[resource] = []; migrated = true; }
  }
  if (!database.users.length && database.admin?.hash && database.admin?.salt) {
    const now = new Date().toISOString();
    database.users.push({...database.admin,id:randomUUID(),name:database.admin.name || 'KAR Administrator',role:'super_admin',permissions:[...permissions],active:true,archived:false,authVersion:1,createdAt:now,updatedAt:now});
    database.admin = {id:database.users[0].id,email:database.users[0].email};
    migrated = true;
  }
  for (const job of database.jobs) {
    job.nature ??= 'Remote'; job.candidateLevel ??= 'any'; job.questions ??= []; job.experienceMin ??= '';
  }
  database.version = 2;
  const saved = shared ? state.runtime ?? {} : {};
  const sessions = new Map(saved.sessions), attempts = new Map(saved.attempts), submissions = new Map(saved.submissions), challengeAttempts = new Map(saved.challengeAttempts), challenges = new Map(saved.challenges);
  let writes = Promise.resolve();
  function transact(change) {
    const work = writes.then(async () => {
      const next = structuredClone(database);
      const result = await change(next);
      if (!shared) {
        const temporary = `${file}.${randomUUID()}.tmp`;
        await writeFile(temporary,JSON.stringify(next,null,2),{mode:0o600});
        await rename(temporary,file);
      }
      database = next;
      if (shared) state.database = next;
      return result;
    });
    writes = work.catch(() => {});
    return work;
  }
  if (migrated) await transact(() => {});
  const reply = (res,status,data,headers={}) => {
    res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers});
    res.end(JSON.stringify(data));
  };
  function originCheck(req) {
    const expected = publicOrigin ?? `${secureCookies ? 'https' : 'http'}://${req.headers.host}`;
    if (req.headers.origin !== expected || req.headers['x-kar-request'] !== '1') throw fail(403,'Request origin is not allowed.');
  }
  const cookie = (token,age=28800) => `kar_session=${token}; Path=/api/admin; HttpOnly; SameSite=Strict; Max-Age=${age}${secureCookies ? '; Secure' : ''}`;
  function authenticate(req) {
    const token = /(?:^|;\s*)kar_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie ?? '')?.[1];
    const session = sessions.get(token);
    const user = session && database.users.find(item => item.id === session.userId);
    if (!session || !user || user.active === false || user.archived || (user.authVersion ?? 1) !== session.authVersion || session.expires < Date.now() || session.touched < Date.now()-60*60*1000) {
      if (token) sessions.delete(token);
      throw fail(401,'Please sign in.');
    }
    session.touched = Date.now();
    return {token,session,user};
  }
  function authorize(user,permission) {
    if (user.role !== 'super_admin' && (permission === 'users' || !user.permissions.includes(permission))) throw fail(403,'Your account does not have access to this area.');
  }
  function authorizeWrite(next,user,session,permission) {
    const current = next.users.find(item => item.id === user.id);
    if (!current || current.active === false || current.archived || (current.authVersion ?? 1) !== session.authVersion) throw fail(401,'Your account changed. Please sign in again.');
    if (permission) authorize(current,permission);
  }
  function limit(req,map=attempts,{max=8,window=15*60*1000}={}) {
    const now = Date.now(), key = req.socket.remoteAddress;
    for (const [ip,record] of map) if (record.until < now) map.delete(ip);
    const entry = map.get(key) ?? {count:0,until:now+window};
    if (++entry.count > max) throw fail(429,'Too many attempts. Try again in 15 minutes.');
    map.set(key,entry);
  }
  function startSession(res,user) {
    const now = Date.now();
    for (const [key,value] of sessions) if (value.expires < now || value.touched < now-3600000) sessions.delete(key);
    if (sessions.size > 100) sessions.delete(sessions.keys().next().value);
    const token = randomBytes(32).toString('hex'), csrf = randomBytes(32).toString('hex');
    sessions.set(token,{userId:user.id,authVersion:user.authVersion ?? 1,csrf,expires:now+8*3600000,touched:now});
    reply(res,200,{user:safeUser(user),csrf},{'Set-Cookie':cookie(token)});
  }
  function verifyForm(req,input) {
    if (input.website != null && input.website !== '') throw fail(400,'The form could not be accepted.');
    if (input.robotCheck !== true) throw fail(400,'Confirm the “I’m not a robot” checkbox.');
    if (input.consent !== true) throw fail(400,'Consent is required to submit this form.');
    const challenge = typeof input.formToken === 'string' && challenges.get(input.formToken);
    if (!challenge || challenge.until < Date.now() || challenge.ip !== req.socket.remoteAddress) throw fail(400,'This form expired or was already submitted. Please refresh the form and try again.');
  }
  async function serveImage(req,res,name,{privateImage=false}={}) {
    if (!/^[\da-f-]+\.(png|jpg|webp)$/.test(name)) { reply(res,404,{error:'Image not found.'}); return; }
    try {
      const body = shared ? await mediaStore.read(name) : await readFile(resolve(media,name));
      res.writeHead(200,{'Content-Type':name.endsWith('.png')?'image/png':name.endsWith('.webp')?'image/webp':'image/jpeg','Cache-Control':privateImage ? 'no-store' : 'no-cache','X-Content-Type-Options':'nosniff'});
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch (error) {
      if (shared && error.code !== 'ENOENT' && error.status !== 404) throw error;
      reply(res,404,{error:'Image not found.'});
    }
  }
  function protectUserChange(next,existing,record,actorId) {
    const losesAccess = record.active === false || record.archived === true || record.role !== 'super_admin';
    if (existing.id === actorId && losesAccess) throw fail(400,'You cannot disable, archive or demote your own super administrator account.');
    if (existing.role === 'super_admin' && losesAccess && !next.users.some(user => user.id !== existing.id && user.role === 'super_admin' && user.active !== false && !user.archived)) throw fail(400,'Keep at least one active super administrator.');
  }
  async function handle(req,res,url) {
    if (url.pathname.startsWith('/media/')) {
      if (!['GET','HEAD'].includes(req.method) || !/^\/media\/[\da-f-]+\.(png|jpg|webp)$/.test(url.pathname)) { reply(res,404,{error:'Not found.'}); return true; }
      const published = [...database.clients,...database.projects].some(item => item.status === 'published' && !item.archived && (item.logo === url.pathname || item.image === url.pathname));
      if (!published) reply(res,404,{error:'Image not found.'});
      else await serveImage(req,res,url.pathname.slice('/media/'.length));
      return true;
    }
    if (!url.pathname.startsWith('/api/')) return false;
    try {
      if (req.method === 'GET' && url.pathname === '/api/content') {
        const content = Object.fromEntries(Object.entries(publicFields).map(([resource,fields]) => [resource,database[resource].filter(item => item.status === 'published' && !item.archived).map(item => Object.fromEntries(fields.filter(key => item[key] !== undefined).map(key => [key,item[key]])))]));
        reply(res,200,content); return true;
      }
      if (req.method === 'GET' && url.pathname === '/api/forms/challenge') {
        limit(req,challengeAttempts,{max:120});
        const now = Date.now();
        for (const [token,item] of challenges) if (item.until < now) challenges.delete(token);
        if (challenges.size > 10000) throw fail(429,'Forms are busy. Please try again later.');
        const token = randomBytes(32).toString('hex');
        challenges.set(token,{ip:req.socket.remoteAddress,until:now+30*60*1000});
        reply(res,200,{token}); return true;
      }
      if (['/api/enquiries','/api/applications'].includes(url.pathname) && req.method === 'POST') {
        originCheck(req);
        limit(req,submissions,{max:30});
        const input = await jsonBody(req);
        verifyForm(req,input);
        const now = new Date().toISOString(), id = randomUUID();
        const reference = `KAR-${url.pathname.endsWith('applications') ? 'JOB' : 'PRJ'}-${id.slice(0,8).toUpperCase()}`;
        let record;
        if (url.pathname === '/api/enquiries') {
          record = {...applicantBasics(input),service:clean(input.service,'service',180,{required:true}),message:clean(input.message,'project details',15000,{required:true})};
          record.company = clean(input.company,'company',180);
        } else {
          const job = database.jobs.find(item => item.id === input.jobId && item.status === 'published' && !item.archived);
          if (!job) throw fail(400,'This job is no longer accepting applications.');
          record = applicationInput(input,job);
        }
        // Delete before awaiting the write queue so concurrent retries cannot submit twice.
        challenges.delete(input.formToken);
        await transact(next => {
          if (url.pathname === '/api/enquiries') {
            next.contacts.unshift({...record,id,reference,source:'website',stage:'New',notes:record.message,nextFollowUp:'',consentAt:now,archived:false,createdAt:now,updatedAt:now});
          } else {
            const job = next.jobs.find(item => item.id === record.jobId && item.status === 'published' && !item.archived);
            if (!job) throw fail(400,'This job is no longer accepting applications.');
            record = applicationInput(input,job);
            const contactId = randomUUID();
            next.applications.unshift({...record,id,reference,contactId,stage:'New',notes:'',consentAt:now,archived:false,createdAt:now,updatedAt:now});
            next.contacts.unshift({id:contactId,name:record.name,email:record.email,phone:record.phone,countryCode:record.countryCode,address:record.address,company:'',source:'job_application',applicationId:id,jobId:record.jobId,jobTitle:record.jobTitle,reference,stage:'New',service:'Careers',message:`Application for ${record.jobTitle}`,notes:`Application for ${record.jobTitle} (${reference})`,nextFollowUp:'',consentAt:now,archived:false,createdAt:now,updatedAt:now});
          }
        });
        reply(res,201,{ok:true,id,reference}); return true;
      }
      if (!url.pathname.startsWith('/api/admin/')) throw fail(404,'Not found.');
      const route = url.pathname.slice('/api/admin/'.length);
      if (route === 'session' && req.method === 'GET') {
        let current; try { current = authenticate(req); } catch { /* Initial sign-in screen. */ }
        reply(res,200,{initialized:database.users.length > 0,setupAllowed:allowSetup,user:current ? safeUser(current.user) : null,csrf:current?.session.csrf ?? null}); return true;
      }
      if (!['GET','HEAD'].includes(req.method)) originCheck(req);
      if (['setup','login'].includes(route) && req.method === 'POST') {
        limit(req);
        const input = await jsonBody(req);
        let user;
        if (route === 'setup') {
          if (!allowSetup || database.users.length) throw fail(403,'Account setup is unavailable.');
          const record = await validateUser({...input,name:input.name || 'KAR Administrator',role:'super_admin'});
          const now = new Date().toISOString();
          user = {...record,id:randomUUID(),active:true,archived:false,authVersion:1,createdAt:now,updatedAt:now};
          await transact(next => { if (next.users.length) throw fail(409,'An administrator already exists.'); next.users.push(user); next.admin = {id:user.id,email:user.email}; });
        } else {
          user = database.users.find(item => item.email === String(input.email).trim().toLowerCase() && item.active !== false && !item.archived);
          if (!user || typeof input.password !== 'string' || input.password.length > 200) throw fail(401,'Email or password is incorrect.');
          const hash = await passwordHash(input.password,user.salt);
          if (!timingSafeEqual(hash,Buffer.from(user.hash,'hex'))) throw fail(401,'Email or password is incorrect.');
        }
        attempts.delete(req.socket.remoteAddress);
        startSession(res,user); return true;
      }
      const {token,session,user} = authenticate(req);
      if (route.startsWith('media/') && ['GET','HEAD'].includes(req.method)) {
        authorize(user,'cms');
        await serveImage(req,res,route.slice('media/'.length),{privateImage:true}); return true;
      }
      if (!['GET','HEAD'].includes(req.method) && req.headers['x-csrf-token'] !== session.csrf) throw fail(403,'Your session changed. Refresh and try again.');
      if (route === 'logout' && req.method === 'POST') {
        sessions.delete(token); reply(res,200,{ok:true},{'Set-Cookie':cookie('',0)}); return true;
      }
      if (route === 'password' && req.method === 'POST') {
        const input = await jsonBody(req);
        if (typeof input.currentPassword !== 'string' || input.currentPassword.length > 200 || typeof input.password !== 'string' || input.password.length < 12 || input.password.length > 200) throw fail(400,'Use a new password between 12 and 200 characters.');
        limit(req);
        const check = await passwordHash(input.currentPassword,user.salt);
        if (!timingSafeEqual(check,Buffer.from(user.hash,'hex'))) throw fail(401,'Current password is incorrect.');
        const salt = randomBytes(32).toString('hex'), hash = (await passwordHash(input.password,salt)).toString('hex');
        const updated = await transact(next => {
          authorizeWrite(next,user,session);
          const current = next.users.find(item => item.id === user.id);
          Object.assign(current,{salt,hash,authVersion:(current.authVersion ?? 1)+1,updatedAt:new Date().toISOString()});
          return current;
        });
        attempts.delete(req.socket.remoteAddress); startSession(res,updated); return true;
      }
      if (route === 'uploads' && req.method === 'POST') {
        authorize(user,'cms');
        const {data} = await jsonBody(req);
        const match = typeof data === 'string' && /^data:image\/(png|jpeg|webp);base64,([\w+/=]+)$/.exec(data);
        if (!match) throw fail(400,'Upload a PNG, JPEG or WebP image.');
        const buffer = Buffer.from(match[2],'base64');
        if (buffer.length > 2*1024*1024 || buffer.length < 12) throw fail(400,'Upload an image smaller than 2 MB.');
        const valid = match[1] === 'png' ? buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : match[1] === 'jpeg' ? buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255 : buffer.toString('ascii',0,4) === 'RIFF' && buffer.toString('ascii',8,12) === 'WEBP';
        if (!valid) throw fail(400,'The file is not a supported image.');
        const filename = `${randomUUID()}.${match[1] === 'jpeg' ? 'jpg' : match[1]}`;
        if (shared) await mediaStore.write(filename,buffer);
        else await writeFile(resolve(media,filename),buffer,{flag:'wx',mode:0o600});
        reply(res,201,{url:`/media/${filename}`}); return true;
      }
      const [resource,id,...extra] = route.split('/');
      if (!(Object.hasOwn(definitions,resource) || ['users','applications'].includes(resource)) || extra.length) throw fail(404,'Not found.');
      authorize(user,resource === 'users' ? 'users' : resourcePermission[resource]);
      if (req.method === 'GET' && !id) { reply(res,200,{items:resource === 'users' ? database.users.map(safeUser) : database[resource]}); return true; }
      if (req.method === 'POST' && !id) {
        if (resource === 'applications') throw fail(405,'Applications must be submitted through a published job.');
        const input = await jsonBody(req);
        const record = resource === 'users' ? await validateUser(input) : validate(resource,input);
        const now = new Date().toISOString();
        const item = {...record,id:randomUUID(),archived:false,createdAt:now,updatedAt:now,...(resource === 'users' ? {authVersion:1} : {})};
        await transact(next => {
          authorizeWrite(next,user,session,resource === 'users' ? 'users' : resourcePermission[resource]);
          if (resource === 'users' && next.users.some(existing => existing.email === item.email)) throw fail(409,'An account with this email already exists.');
          next[resource].unshift(item);
        });
        reply(res,201,{item:resource === 'users' ? safeUser(item) : item}); return true;
      }
      if (id && ['PUT','DELETE','PATCH'].includes(req.method)) {
        const input = req.method !== 'DELETE' ? await jsonBody(req) : {};
        const previous = database[resource].find(item => item.id === id);
        if (!previous) throw fail(404,'Record not found.');
        const userRecord = resource === 'users' && req.method === 'PUT' ? await validateUser({...previous,...input},previous) : null;
        const result = await transact(next => {
          authorizeWrite(next,user,session,resource === 'users' ? 'users' : resourcePermission[resource]);
          const index = next[resource].findIndex(item => item.id === id);
          if (index < 0) throw fail(404,'Record not found.');
          const existing = next[resource][index];
          let updated;
          if (req.method === 'PUT') {
            if (resource === 'users') {
              if (next.users.some(item => item.id !== id && item.email === userRecord.email)) throw fail(409,'An account with this email already exists.');
              updated = {...existing,...userRecord,archived:existing.archived && !userRecord.active,authVersion:(existing.authVersion ?? 1)+1};
              protectUserChange(next,existing,updated,user.id);
            } else if (resource === 'applications') {
              const stage = input.stage ?? existing.stage;
              if (!applicationStages.includes(stage)) throw fail(400,'Choose a valid application stage.');
              updated = {...existing,stage,notes:clean(input.notes ?? existing.notes,'notes',15000)};
            } else updated = {...existing,...validate(resource,{...existing,...input})};
          } else {
            updated = {...existing,archived:req.method === 'DELETE' ? true : input.archived === true};
            if (resource === 'users') {
              updated.active = !updated.archived;
              updated.authVersion = (existing.authVersion ?? 1)+1;
              protectUserChange(next,existing,updated,user.id);
            }
          }
          updated.updatedAt = new Date().toISOString();
          next[resource][index] = updated;
          return updated;
        });
        reply(res,200,{item:resource === 'users' ? safeUser(result) : result}); return true;
      }
      throw fail(405,'Method not allowed.');
    } catch (error) {
      reply(res,error.status ?? 500,{error:error.status ? error.message : 'The request could not be saved. Please try again.'});
    }
    return true;
  }
  return async (req,res,url) => {
    try { return await handle(req,res,url); }
    finally {
      if (shared) {
        state.database = database;
        state.runtime = Object.fromEntries(Object.entries({sessions,attempts,submissions,challengeAttempts,challenges}).map(([name,entries]) => [name,[...entries]]));
      }
    }
  };
}
