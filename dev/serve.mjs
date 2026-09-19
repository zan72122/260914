// Zero-dependency static file server for local development.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = Number(process.env.PORT || 8080);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.webp': 'image/webp', '.map': 'application/json',
};

/**
 * Start the dev server.
 *
 * `port` is a PREFERENCE, not a demand: 0 asks the OS for any free port, and a
 * port that is already taken (another harness run, a stale server) silently
 * falls back to a free one instead of throwing EADDRINUSE. The resolved object
 * always carries the port actually bound, so callers must use the returned
 * `url` and never rebuild one from the number they asked for.
 */
export function startServer(port = PORT) {
  return new Promise((resolve, reject) => {
    const server = createServer(handler);
    let retried = false;
    server.on('error', (e) => {
      if ((e.code === 'EADDRINUSE' || e.code === 'EACCES') && !retried) {
        retried = true;
        server.listen(0);
        return;
      }
      reject(e);
    });
    const done = () => {
      const a = server.address();
      const p = a && typeof a === 'object' ? a.port : port;
      resolve({ server, port: p, url: 'http://127.0.0.1:' + p });
    };
    server.listen(port, done);
  });
}

async function handler(req, res) {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = join(ROOT, normalize(p).replace(/^(\.\.[/\\])+/, ''));
    if (!file.startsWith(ROOT)) { res.writeHead(403).end('forbidden'); return; }
    const s = await stat(file);
    if (s.isDirectory()) { res.writeHead(302, { Location: p + '/' }).end(); return; }
    const body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(body);
  } catch (e) {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('404');
  }
}

if (import.meta.url === 'file://' + process.argv[1]) {
  createServer(handler).listen(PORT, () => console.log('serving ' + ROOT + ' on http://localhost:' + PORT));
}
