'use strict';
const C = require('../_lib/core');

module.exports = C.handler(async (req, res) => {
  const me = await C.auth(req, res, { admin: true });
  if (!me) return;
  if (req.method !== 'GET') return C.fail(res, 405, 'method', 'Metode tidak didukung');
  const q = C.query(req), limit = Math.min(2000, Math.max(1, parseInt(q.limit || '500', 10) || 500));
  const raw = await C.S.lrange(C.K.logs, 0, limit - 1);
  const logs = (raw || []).map(s => { try { return JSON.parse(s); } catch (e) { return null; } }).filter(Boolean);
  C.send(res, 200, { ok: true, logs });
});
