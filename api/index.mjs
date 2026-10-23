import { isIP } from 'node:net';
import { Readable } from 'node:stream';
import { createBackend } from '../backend.mjs';

const maximumBody = 3*1024*1024;
const routeParameter = '__kar_route';
const securityHeaders = {
  'X-Content-Type-Options':'nosniff',
  'Referrer-Policy':'strict-origin-when-cross-origin',
  'X-Frame-Options':'DENY',
  'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  'Cache-Control':'no-store'
};
class RequestError extends Error {
  constructor(status,message) { super(message); this.status = status; }
}
function hostname(value,{origin=false}={}) {
  const url = new URL(origin ? value : `https://${value}`);
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.pathname !== '/' || url.search || url.hash) throw new Error('Invalid configured host.');
  return url.hostname;
}
function requestOrigin(headers,environment) {
  const allowed = new Set();
  if (environment.PUBLIC_ORIGIN) allowed.add(hostname(environment.PUBLIC_ORIGIN,{origin:true}));
  for (const key of ['VERCEL_URL','VERCEL_BRANCH_URL','VERCEL_PROJECT_PRODUCTION_URL']) if (environment[key]) allowed.add(hostname(environment[key]));
  if (!allowed.size) throw new Error('No configured host.');
  const host = headers.host;
  if (typeof host !== 'string' || !host || /[\s/@?#\\]/.test(host)) throw new RequestError(403,'Request host is not allowed.');
  let normalized;
  try { normalized = hostname(host); } catch { throw new RequestError(403,'Request host is not allowed.'); }
  if (!allowed.has(normalized)) throw new RequestError(403,'Request host is not allowed.');
  return `https://${normalized}`;
}
function routeURL(req) {
  if (typeof req.url !== 'string' || !req.url.startsWith('/') || req.url.startsWith('//')) throw new RequestError(404,'Not found.');
  const url = new URL(req.url,'https://routing.invalid');
  const values = url.searchParams.getAll(routeParameter);
  const queryValue = req.query?.[routeParameter];
  if (values.length > 1 || (queryValue !== undefined && typeof queryValue !== 'string')) throw new RequestError(400,'Invalid request route.');
  if (values.length && queryValue !== undefined && values[0] !== queryValue) throw new RequestError(400,'Invalid request route.');
  const path = values[0] ?? queryValue ?? url.pathname;
  // The rewrite passes the full public route explicitly. Never accept file paths.
  if (typeof path !== 'string' || !/^\/(api|media)\/[A-Za-z0-9_./-]*$/.test(path) || path.includes('//') || path.split('/').some(segment => segment === '.' || segment === '..')) throw new RequestError(404,'Not found.');
  if (url.pathname !== '/api/index' && url.pathname !== path) throw new RequestError(400,'Invalid request route.');
  url.pathname = path;
  url.searchParams.delete(routeParameter);
  return url;
}
function clientAddress(req,environment) {
  const forwarded = environment.VERCEL === '1' ? req.headers['x-vercel-forwarded-for'] : undefined;
  const address = forwarded === undefined ? req.socket?.remoteAddress : forwarded;
  if (typeof address !== 'string' || !isIP(address.trim())) throw new RequestError(400,'Invalid client address.');
  return address.trim();
}
async function bodyBuffer(req) {
  const declared = req.headers['content-length'];
  if (declared !== undefined && (typeof declared !== 'string' || !/^\d+$/.test(declared))) throw new RequestError(400,'Invalid request body.');
  if (Number(declared) > maximumBody) throw new RequestError(413,'Request is too large.');
  let body;
  if (req.body !== undefined) {
    try { body = Buffer.isBuffer(req.body) ? req.body : Buffer.from(typeof req.body === 'string' ? req.body : JSON.stringify(req.body)); }
    catch { throw new RequestError(400,'Invalid request body.'); }
  } else {
    let size = 0; const chunks = [];
    for await (const chunk of req) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      if (size > maximumBody) throw new RequestError(413,'Request is too large.');
      chunks.push(buffer);
    }
    body = Buffer.concat(chunks);
  }
  if (body.length > maximumBody) throw new RequestError(413,'Request is too large.');
  return body;
}
function bufferedResponse() {
  const headers = new Map(Object.entries(securityHeaders).map(([key,value]) => [key.toLowerCase(),value]));
  const chunks = [];
  return {
    statusCode:200,writableEnded:false,
    setHeader(name,value) { headers.set(name.toLowerCase(),value); return this; },
    getHeader(name) { return headers.get(name.toLowerCase()); },
    removeHeader(name) { headers.delete(name.toLowerCase()); },
    writeHead(status,messageOrHeaders,extraHeaders) {
      this.statusCode = status;
      for (const [key,value] of Object.entries(extraHeaders ?? (typeof messageOrHeaders === 'object' ? messageOrHeaders : {}))) this.setHeader(key,value);
      return this;
    },
    write(chunk,encoding) { if (chunk != null) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk,encoding)); return true; },
    end(chunk,encoding) { this.write(chunk,encoding); this.writableEnded = true; return this; },
    result() { return {status:this.statusCode,headers:Object.fromEntries(headers),body:Buffer.concat(chunks)}; }
  };
}
function errorResponse(res,status,message) {
  res.writeHead(status,{...securityHeaders,'Content-Type':'application/json; charset=utf-8'});
  res.end(JSON.stringify({error:message}));
}
function configured(environment) {
  return Boolean(environment.DATABASE_URL && (environment.BLOB_READ_WRITE_TOKEN || (environment.BLOB_STORE_ID && environment.VERCEL_OIDC_TOKEN)));
}

export function createVercelHandler({store,environment=process.env,backendFactory=createBackend}={}) {
  let pendingStore;
  async function storage() {
    if (store) return store;
    pendingStore ??= import('../cloud-store.mjs').then(module => module.createCloudStore({environment}));
    try { return await pendingStore; } catch (error) { pendingStore = undefined; throw error; }
  }
  return async function handler(req,res) {
    try {
      const url = routeURL(req);
      const origin = requestOrigin(req.headers,environment);
      if (!store && !configured(environment)) throw new Error('Storage is not configured.');
      const address = clientAddress(req,environment);
      // Read and validate the complete upload before taking the workspace's DB lock.
      const body = await bodyBuffer(req);
      const currentStore = await storage();
      const response = await currentStore.withState(async state => {
        const incoming = Readable.from(body.length ? [body] : []);
        incoming.headers = {...req.headers,host:new URL(origin).host};
        incoming.method = req.method;
        incoming.url = `${url.pathname}${url.search}`;
        incoming.socket = {remoteAddress:address};
        const output = bufferedResponse();
        const backend = await backendFactory({state,mediaStore:currentStore.media,allowSetup:false,secureCookies:true,publicOrigin:origin});
        const handled = await backend(incoming,output,new URL(incoming.url,origin));
        if (!handled) { output.writeHead(404,{'Content-Type':'application/json; charset=utf-8'}); output.end(JSON.stringify({error:'Not found.'})); }
        if (!output.writableEnded) output.end();
        return output.result();
      });
      // withState resolves only after COMMIT: never expose an uncommitted cookie/save.
      res.writeHead(response.status,response.headers);
      res.end(req.method === 'HEAD' ? undefined : response.body);
    } catch (error) {
      if (error instanceof RequestError) errorResponse(res,error.status,error.message);
      else errorResponse(res,503,'The service is temporarily unavailable. Please try again.');
    }
  };
}

export default createVercelHandler();
