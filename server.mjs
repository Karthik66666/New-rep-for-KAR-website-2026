import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname, sep } from 'node:path';
import { createBackend } from './backend.mjs';

const root = fileURLToPath(new URL('./dist/', import.meta.url));
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json':'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.webp':'image/webp' };
export async function createApplication(options={}) {
  const backend = await createBackend({directory:options.dataDirectory ?? process.env.KAR_DATA_DIR,...options});
  return async (req, res) => {
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  try {
    const url = new URL(req.url,`http://${req.headers.host}`);
    const allowed = ['127.0.0.1','localhost'];
    if (process.env.PUBLIC_ORIGIN) allowed.push(new URL(process.env.PUBLIC_ORIGIN).hostname);
    if (!allowed.includes(url.hostname)) { res.writeHead(403); res.end('Invalid host'); return; }
    if (await backend(req,res,url)) return;
    if (!['GET','HEAD'].includes(req.method)) { res.writeHead(405); res.end('Method not allowed'); return; }
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === '/admin' || pathname === '/admin/') pathname = '/admin/index.html';
    const path = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!path.startsWith(root.endsWith(sep) ? root : root + sep)) { res.writeHead(403); res.end('Forbidden'); return; }
    const body = await readFile(path);
    res.writeHead(200, { 'Content-Type': types[extname(path)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch { res.writeHead(404); res.end('Not found'); }
  };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 4173);
  const app = await createApplication();
  createServer(app).listen(port,'127.0.0.1',() => console.log(`Local: http://127.0.0.1:${port}\nAdmin: http://127.0.0.1:${port}/admin`));
}
