import { createServer } from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import { resolve, dirname, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export async function createHandler() {
  const root = await realpath(resolve(dirname(fileURLToPath(import.meta.url)), '../dist'));
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon' };
  return async (req, res) => {
    try {
      if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { Allow: 'GET, HEAD' }); res.end(); return; }
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (pathname.includes('\0') || pathname.includes('\\')) { res.writeHead(400); res.end(); return; }
      const requested = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
      if (!requested.startsWith(root + sep)) { res.writeHead(403); res.end(); return; }
      const file = await realpath(requested);
      if (!file.startsWith(root + sep)) { res.writeHead(403); res.end(); return; }
      const data = await readFile(file);
      res.writeHead(200, {
        'Content-Type': types[extname(file)] ?? 'application/octet-stream',
        'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store',
        'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"
      });
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch (error) {
      res.writeHead(error instanceof URIError ? 400 : 404); res.end('Not found');
    }
  };
}
export async function startServer({ port = 4173, host = '127.0.0.1' } = {}) {
  const server = createServer(await createHandler());
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, resolve); });
  return server;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 4173);
  startServer({ port }).then(() => console.log(`CampusTwin 2.0: http://127.0.0.1:${port} （按 Ctrl+C 停止）`)).catch(error => {
    console.error(`启动失败：${error.code === 'EADDRINUSE' ? '端口被占用，请设置 PORT 后重试' : error.message}`);
    process.exitCode = 1;
  });
}
