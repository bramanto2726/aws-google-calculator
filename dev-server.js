#!/usr/bin/env node
/* Server pengembangan lokal (meniru Vercel): node dev-server.js → http://localhost:3000
 * Data disimpan di .data/db.json bila env Upstash Redis tidak diisi. */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = __dirname, PUB = path.join(ROOT, 'public'), PORT = +process.env.PORT || 3000;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
http.createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/app' || p === '/app/') p = '/api/app';
  if (p.startsWith('/api/')) {
    const file = path.join(ROOT, p.replace(/\/$/, '') + '.js');
    if (!file.startsWith(path.join(ROOT, 'api')) || /\/_/.test(p) || !fs.existsSync(file)) { res.statusCode = 404; return res.end('Not found'); }
    try { delete require.cache[require.resolve(file)]; return await require(file)(req, res); } catch (e) { console.error(e); res.statusCode = 500; return res.end('error'); }
  }
  let f = path.join(PUB, p === '/' ? 'index.html' : p);
  if (!f.startsWith(PUB) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.statusCode = 404; return res.end('Not found'); }
  res.setHeader('Content-Type', TYPES[path.extname(f)] || 'application/octet-stream');
  fs.createReadStream(f).pipe(res);
}).listen(PORT, () => console.log('Kalkulator Cloud dev server: http://localhost:' + PORT));
