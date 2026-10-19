'use strict';
/* Menyajikan aplikasi utama HANYA untuk pengguna yang sudah login & sudah mengganti password.
 * Modul admin (HTML + JS) dihapus dari halaman untuk pengguna non-admin. */
const C = require('./_lib/core');
const TPL = require('./_lib/app-html.js'); // dibuat oleh build.js
function template() { return TPL; }
function redirect(res, to) { res.statusCode = 302; res.setHeader('Location', to); res.setHeader('Cache-Control', 'no-store'); res.end(); }

module.exports = C.handler(async (req, res) => {
  await C.ensureSeed();
  const p = await C.verify(C.parseCookies(req)[C.COOKIE]);
  const u = p && await C.getUser(p.u);
  if (!u || (u.sv || 0) !== p.v || C.accStatus(u) !== 'active') { C.clearSession(req, res); return redirect(res, '/'); }
  if (u.mustChange) return redirect(res, '/?change=1');
  let html = template();
  if (u.role !== 'admin') html = html.replace(/<!--ADMIN-->[\s\S]*?<!--\/ADMIN-->/g, '');
  const pub = C.publicUser(u);
  html = html.replace('/*__USER__*/null', JSON.stringify({ id: pub.id, name: pub.name, username: pub.username, role: pub.role, validUntil: pub.validUntil }).replace(/</g, '\\u003c'));
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, private');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.end(html);
});
