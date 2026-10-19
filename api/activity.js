'use strict';
/* Catatan aktivitas dari aplikasi (hitung ulang, reset, ekspor, restore, dsb.). */
const C = require('./_lib/core');
const ALLOWED = /^app\.(recompute|reset_data|export|backup_download|backup_restore_file|project_save|project_load|price_update|price_import|price_reset|currency_change|lang_change)$/;

module.exports = C.handler(async (req, res) => {
  const me = await C.auth(req, res);
  if (!me) return;
  if (req.method !== 'POST') return C.fail(res, 405, 'method', 'Metode tidak didukung');
  const b = await C.body(req);
  if (!ALLOWED.test(String(b.action || ''))) return C.fail(res, 400, 'action', 'Aksi tidak dikenal');
  await C.log(me, String(b.action), String(b.detail || '').slice(0, 300), C.ip(req));
  C.send(res, 200, { ok: true });
});
