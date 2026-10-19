'use strict';
const C = require('../_lib/core');

module.exports = C.handler(async (req, res) => {
  if (req.method !== 'POST') return C.fail(res, 405, 'method', 'Metode tidak didukung');
  if (!C.csrfOk(req)) return C.fail(res, 403, 'csrf', 'Permintaan ditolak');
  await C.ensureSeed();
  const b = await C.body(req);
  const username = String(b.username || '').trim().slice(0, 64), password = String(b.password || '');
  if (!username || !password) return C.fail(res, 400, 'input', 'Username dan password wajib diisi');
  const addr = C.ip(req), rlKey = C.K.rl(addr, username.toLowerCase());
  const n = await C.S.incr(rlKey);
  if (n === 1) await C.S.expire(rlKey, 900);
  if (n > 8) { await C.log(null, 'auth.locked', 'Terlalu banyak percobaan untuk "' + username + '"', addr); return C.fail(res, 429, 'locked', 'Terlalu banyak percobaan gagal. Coba lagi dalam 15 menit.'); }
  const u = await C.findByUsername(username);
  if (!u || !C.checkPw(password, u.hash)) {
    await C.log(u, 'auth.login_failed', 'Login gagal untuk "' + username + '"', addr);
    return C.fail(res, 401, 'invalid', 'Username atau password salah');
  }
  const st = C.accStatus(u);
  if (st !== 'active') {
    await C.log(u, 'auth.login_blocked', 'Login ditolak: status ' + st, addr);
    const msg = st === 'expired' ? 'Masa berlaku akun Anda telah habis. Hubungi admin.' : st === 'notyet' ? 'Akun Anda belum berlaku (mulai ' + u.validFrom + ').' : 'Akun Anda dinonaktifkan. Hubungi admin.';
    return C.fail(res, 403, 'status_' + st, msg);
  }
  await C.S.del(rlKey);
  u.lastLogin = new Date().toISOString();
  await C.saveUser(u);
  await C.setSession(req, res, u, !!b.remember);
  await C.log(u, 'auth.login', 'Login berhasil' + (b.remember ? ' (ingat saya)' : ''), addr);
  C.send(res, 200, { ok: true, user: C.publicUser(u), mustChange: !!u.mustChange });
});
