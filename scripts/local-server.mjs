/** Dependency-free local preview. Run: node --use-env-proxy scripts/local-server.mjs */
import http from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { resolve, dirname, extname, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzip } from 'node:zlib';
import { promisify } from 'node:util';
import { fetchNews } from '../server/news.mjs';
import { fetchOrbits, primeOrbitCache, ORBIT_CACHE_MS } from '../server/live-data.mjs';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publicRoot = await realpath(resolve(projectRoot, 'public'));
const gzipAsync = promisify(gzip);
const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || '127.0.0.1';
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) throw new Error('PORT must be between 1 and 65535');
const newsSeed = JSON.parse(await readFile(resolve(publicRoot, 'data/news.json'), 'utf8'));
let news = newsSeed;
let orbits = JSON.parse(await readFile(resolve(publicRoot, 'data/orbits.json'), 'utf8'));
primeOrbitCache(orbits);
let newsNextRefreshAt = Date.parse(newsSeed.fetchedAt) + 15 * 60 * 1000;
let orbitNextRefreshAt = Date.parse(orbits.fetchedAt) + ORBIT_CACHE_MS;
let newsRefresh;
let orbitRefresh;

async function bounded(promise, timeoutMs, name) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${name} refresh exceeded ${timeoutMs / 1000} seconds`)), timeoutMs);
    })]);
  } finally { clearTimeout(timer); }
}

async function getNews() {
  if (newsRefresh) return newsRefresh;
  if (Date.now() < newsNextRefreshAt) return news;
  newsRefresh = bounded(fetchNews({ fallbackItems: newsSeed.items }), 28000, 'News')
    .then(value => { news = value; newsNextRefreshAt = Date.now() + 15 * 60 * 1000; return news; })
    .catch(error => { newsNextRefreshAt = Date.now() + 60000; news = { ...news, refreshError: error.message }; return news; })
    .finally(() => { newsRefresh = undefined; });
  return newsRefresh;
}

async function getOrbits() {
  if (orbitRefresh) return orbitRefresh;
  if (Date.now() < orbitNextRefreshAt) return orbits;
  orbitRefresh = bounded(fetchOrbits(), 24000, 'Orbit')
    .then(value => { orbits = value; orbitNextRefreshAt = Date.now() + ORBIT_CACHE_MS; return orbits; })
    .catch(error => { orbitNextRefreshAt = Date.now() + 60000; orbits = { ...orbits, cached: true, refreshError: error.message }; return orbits; })
    .finally(() => { orbitRefresh = undefined; });
  return orbitRefresh;
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.geojson': 'application/geo+json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.wasm': 'application/wasm', '.bin': 'application/octet-stream',
  '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.ktx2': 'image/ktx2',
  '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8', '.tle': 'text/plain; charset=utf-8',
};
const gzipCache = new Map();
function withinPublic(path) {
  const rel = relative(publicRoot, path);
  return !isAbsolute(rel) && rel !== '..' && !rel.startsWith('../') && !rel.startsWith('..\\');
}
function simple(res, status, body, headers = {}) {
  res.writeHead(status, {'Content-Type':'text/plain; charset=utf-8','X-Content-Type-Options':'nosniff', ...headers});
  res.end(body);
}
async function json(req, res, data, maxAge) {
  let body = Buffer.from(JSON.stringify(data));
  const headers = {'Content-Type':'application/json; charset=utf-8','Cache-Control':`public, max-age=${maxAge}`,'X-Content-Type-Options':'nosniff','Vary':'Accept-Encoding'};
  if (body.length > 1024 && /\bgzip\b/i.test(req.headers['accept-encoding'] || '')) {
    body = await gzipAsync(body);
    headers['Content-Encoding'] = 'gzip';
  }
  headers['Content-Length'] = String(body.length);
  res.writeHead(200,headers);
  res.end(req.method === 'HEAD' ? undefined : body);
}

const server = http.createServer(async (req,res) => {
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') return simple(res,405,'Method not allowed',{'Allow':'GET, HEAD'});
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url || '/', 'http://localhost').pathname); }
    catch { return simple(res,400,'Invalid URL'); }
    if (pathname.includes('\0') || pathname.includes('\\')) return simple(res,400,'Invalid path');
    if (pathname === '/api/news') {
      return await json(req,res,{...await getNews(),refreshPending:false},60);
    }
    if (pathname === '/api/orbits') {
      return await json(req,res,{...await getOrbits(),refreshPending:false},60);
    }
    if (pathname === '/api/health') return await json(req,res,{ok:true,orbitCount:orbits.satellites.length,newsCount:news.items.length},0);
    if (pathname === '/') pathname = '/dashboard.html';
    let path = resolve(publicRoot, '.' + pathname);
    if (!withinPublic(path)) return simple(res,403,'Forbidden');
    let info;
    try {
      path = await realpath(path);
      if (!withinPublic(path)) return simple(res,403,'Forbidden');
      info = await stat(path);
      if (!info.isFile()) return simple(res,404,'Not found');
    } catch (error) {
      if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return simple(res,404,'Not found');
      throw error;
    }
    const ext = extname(path).toLowerCase();
    const mime = MIME[ext] || 'application/octet-stream';
    const compress = info.size > 1024 && /^(text\/|application\/(json|geo\+json|xml|wasm)|image\/svg\+xml)/.test(mime) && /\bgzip\b/i.test(req.headers['accept-encoding'] || '');
    const etag = `W/"${info.size}-${Math.floor(info.mtimeMs)}-${compress?'gz':'raw'}"`;
    const headers = {'Content-Type':mime, 'Cache-Control':pathname.startsWith('/vendor/')?'public, max-age=86400':'no-cache', 'ETag':etag, 'Vary':'Accept-Encoding','X-Content-Type-Options':'nosniff'};
    if (req.headers['if-none-match'] === etag) { res.writeHead(304,headers); return res.end(); }
    let body;
    if (compress) {
      const cached = gzipCache.get(path);
      if (cached?.etag === etag) body = cached.body;
      else {
        body = await gzipAsync(await readFile(path));
        if (gzipCache.size > 50) gzipCache.delete(gzipCache.keys().next().value);
        gzipCache.set(path,{etag,body});
      }
      headers['Content-Encoding']='gzip';
    } else if (req.method !== 'HEAD') body = await readFile(path);
    headers['Content-Length'] = String(body?.length ?? info.size);
    res.writeHead(200,headers);
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch (error) {
    console.error('Preview request failed:', error.message);
    if (!res.headersSent) simple(res,500,'Preview request failed');
    else res.destroy();
  }
});
server.listen(PORT,HOST,()=>console.log(`Local: http://${HOST}:${PORT}/dashboard.html`));
server.on('error',error=>{console.error(error.message);process.exitCode=1;});
for (const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>server.close(()=>process.exit(0)));
