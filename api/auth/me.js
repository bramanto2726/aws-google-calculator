'use strict';
const C = require('../_lib/core');

module.exports = C.handler(async (req, res) => {
  const u = await C.auth(req, res, { allowMustChange: true });
  if (!u) return;
  C.send(res, 200, { ok: true, user: C.publicUser(u), mustChange: !!u.mustChange, storage: C.S.mode() });
});
