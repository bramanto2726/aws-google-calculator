'use strict';
const C = require('../_lib/core');

module.exports = C.handler(async (req, res) => {
  if (req.method !== 'POST') return C.fail(res, 405, 'method', 'Metode tidak didukung');
  if (!C.csrfOk(req)) return C.fail(res, 403, 'csrf', 'Permintaan ditolak');
  try {
    const p = await C.verify(C.parseCookies(req)[C.COOKIE]);
    if (p) { const u = await C.getUser(p.u); if (u) await C.log(u, 'auth.logout', 'Logout', C.ip(req)); }
  } catch (e) { /* tetap logout */ }
  C.clearSession(req, res);
  C.send(res, 200, { ok: true });
});
