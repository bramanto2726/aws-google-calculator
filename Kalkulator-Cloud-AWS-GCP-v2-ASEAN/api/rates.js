'use strict';
/* Kurs mata uang (basis USD). Online: open.er-api.com, di-cache di server. */
const C = require('./_lib/core');
const CODES = ['IDR', 'SGD', 'MYR', 'THB', 'PHP', 'USD'];
// Kurs bawaan (perkiraan Okt 2026) — dipakai bila belum pernah update online
const DEFAULT = { base: 'USD', updated: '2026-10-15', source: 'bawaan aplikasi (perkiraan)', rates: {
  IDR: 17870, SGD: 1.3, MYR: 4.25, THB: 33, PHP: 58, USD: 1 } };

module.exports = C.handler(async (req, res) => {
  const me = await C.auth(req, res);
  if (!me) return;
  if (req.method !== 'GET') return C.fail(res, 405, 'method', 'Metode tidak didukung');
  let cached = null;
  try { cached = JSON.parse((await C.S.get(C.K.rates)) || 'null'); } catch (e) { cached = null; }
  const q = C.query(req);
  if (q.refresh === '1') {
    if (cached && cached.fetchedAt && Date.now() - Date.parse(cached.fetchedAt) < 10 * 60e3) return C.send(res, 200, { ok: true, fresh: false, rates: cached, codes: CODES });
    try {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 8000);
      const r = await fetch('https://open.er-api.com/v6/latest/USD', { signal: ctl.signal }); clearTimeout(t);
      const j = await r.json();
      if (!j || !j.rates || !j.rates.IDR) throw new Error('format');
      const rates = {}; CODES.forEach(c => { rates[c] = c === 'USD' ? 1 : (+j.rates[c] || DEFAULT.rates[c]); });
      const rec = { base: 'USD', rates, updated: (j.time_last_update_utc || new Date().toUTCString()), source: 'open.er-api.com', fetchedAt: new Date().toISOString() };
      await C.S.set(C.K.rates, JSON.stringify(rec));
      await C.log(me, 'currency.update', 'Kurs diperbarui online (USD→IDR ' + Math.round(rates.IDR) + ')', C.ip(req));
      return C.send(res, 200, { ok: true, fresh: true, rates: rec, codes: CODES });
    } catch (e) {
      return C.send(res, 200, { ok: false, error: 'Gagal mengambil kurs online; memakai kurs tersimpan.', rates: cached || DEFAULT, codes: CODES });
    }
  }
  C.send(res, 200, { ok: true, rates: cached || DEFAULT, codes: CODES });
});
module.exports.DEFAULT = DEFAULT;
