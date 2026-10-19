'use strict';
const C = require('../_lib/core');

module.exports = C.handler(async (req, res) => {
  if (req.method !== 'POST') return C.fail(res, 405, 'method', 'Metode tidak didukung');
  const u = await C.auth(req, res, { allowMustChange: true });
  if (!u) return;
  const b = await C.body(req);
  const cur = String(b.current || ''), next = String(b.next || '');
  if (!C.checkPw(cur, u.hash)) { await C.log(u, 'auth.password_change_failed', 'Password lama salah', C.ip(req)); return C.fail(res, 400, 'current', 'Password saat ini salah'); }
  const prob = C.pwProblem(next);
  if (prob) return C.fail(res, 400, 'weak', prob);
  if (next === cur) return C.fail(res, 400, 'same', 'Password baru harus berbeda dari password lama');
  if (next === C.DEFAULT_ADMIN.password) return C.fail(res, 400, 'default', 'Password bawaan tidak boleh dipakai lagi');
  const tokRemember = await C.verify(C.parseCookies(req)[C.COOKIE]);
  u.hash = C.hashPw(next); u.mustChange = false; u.sv = (u.sv || 0) + 1; u.pwChangedAt = new Date().toISOString();
  await C.saveUser(u);
  await C.setSession(req, res, u, !!(tokRemember && tokRemember.r));
  await C.log(u, 'auth.password_changed', 'Password diganti', C.ip(req));
  C.send(res, 200, { ok: true, user: C.publicUser(u) });
});
