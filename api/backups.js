'use strict';
/* Backup & restore data analisis per pengguna (disimpan di server). */
const crypto = require('crypto');
const C = require('./_lib/core');
const MAX_BYTES = 900 * 1024, MAX_COUNT = 30;

module.exports = C.handler(async (req, res) => {
  const me = await C.auth(req, res);
  if (!me) return;
  const key = C.K.backups(me.id), q = C.query(req), addr = C.ip(req);

  if (req.method === 'GET') {
    const all = await C.S.hgetall(key);
    if (q.id) {
      const s = all[q.id]; if (!s) return C.fail(res, 404, 'notfound', 'Backup tidak ditemukan');
      const b = JSON.parse(s);
      await C.log(me, 'backup.restore_server', 'Memulihkan backup server "' + b.name + '"', addr);
      return C.send(res, 200, { ok: true, backup: b });
    }
    const list = Object.keys(all).map(k => { try { const b = JSON.parse(all[k]); return { id: b.id, name: b.name, createdAt: b.createdAt, size: b.size, summary: b.summary || '' }; } catch (e) { return null; } })
      .filter(Boolean).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return C.send(res, 200, { ok: true, backups: list, max: MAX_COUNT });
  }
  if (req.method === 'POST') {
    const b = await C.body(req);
    if (!b.data || typeof b.data !== 'object') return C.fail(res, 400, 'input', 'Data backup kosong');
    const json = JSON.stringify(b.data);
    if (json.length > MAX_BYTES) return C.fail(res, 413, 'size', 'Backup terlalu besar untuk disimpan di server (maks. 900 KB). Gunakan unduh file backup.');
    if ((await C.S.hlen(key)) >= MAX_COUNT) return C.fail(res, 400, 'count', 'Maksimal ' + MAX_COUNT + ' backup di server. Hapus backup lama terlebih dahulu.');
    const rec = { id: 'b_' + Date.now().toString(36) + crypto.randomBytes(3).toString('hex'), name: String(b.name || 'Backup').trim().slice(0, 80) || 'Backup',
      createdAt: new Date().toISOString(), size: json.length, summary: String(b.summary || '').slice(0, 200), data: b.data };
    await C.S.hset(key, rec.id, JSON.stringify(rec));
    await C.log(me, 'backup.save_server', 'Menyimpan backup "' + rec.name + '" (' + Math.round(rec.size / 1024) + ' KB)', addr);
    return C.send(res, 201, { ok: true, id: rec.id });
  }
  if (req.method === 'DELETE') {
    if (!q.id) return C.fail(res, 400, 'input', 'ID backup wajib');
    const s = await C.S.hget(key, q.id); if (!s) return C.fail(res, 404, 'notfound', 'Backup tidak ditemukan');
    await C.S.hdel(key, q.id);
    await C.log(me, 'backup.delete_server', 'Menghapus backup "' + JSON.parse(s).name + '"', addr);
    return C.send(res, 200, { ok: true });
  }
  C.fail(res, 405, 'method', 'Metode tidak didukung');
});
