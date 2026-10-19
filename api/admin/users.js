'use strict';
/* Manajemen pengguna — HANYA admin. Setiap permintaan dicek ulang perannya dari database (C.auth admin:true). */
const C = require('../_lib/core');

const DATE = /^\d{4}-\d{2}-\d{2}$/;
function cleanDate(v) { v = String(v || '').trim(); return DATE.test(v) ? v : ''; }
function validUsername(u) { return /^[A-Za-z0-9._-]{3,32}$/.test(u); }
async function otherActiveAdmins(exceptId) { return (await C.allUsers()).filter(x => x.id !== exceptId && x.role === 'admin' && C.accStatus(x) === 'active').length; }

module.exports = C.handler(async (req, res) => {
  const me = await C.auth(req, res, { admin: true });
  if (!me) return;
  const addr = C.ip(req);

  if (req.method === 'GET') {
    const list = (await C.allUsers()).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))).map(C.publicUser);
    return C.send(res, 200, { ok: true, users: list, me: me.id, today: C.today() });
  }

  if (req.method === 'POST') {
    const b = await C.body(req);
    const name = String(b.name || '').trim().slice(0, 80), username = String(b.username || '').trim();
    const role = b.role === 'admin' ? 'admin' : 'user';
    if (!name) return C.fail(res, 400, 'input', 'Nama wajib diisi');
    if (!validUsername(username)) return C.fail(res, 400, 'input', 'Username 3–32 karakter: huruf, angka, titik, garis bawah, atau tanda hubung');
    if (await C.findByUsername(username)) return C.fail(res, 409, 'exists', 'Username sudah dipakai');
    const pw = String(b.password || '') || C.randomPw();
    const prob = C.pwProblem(pw); if (prob) return C.fail(res, 400, 'weak', prob);
    const vf = cleanDate(b.validFrom), vu = cleanDate(b.validUntil);
    if (vf && vu && vu < vf) return C.fail(res, 400, 'input', 'Tanggal akhir berlaku tidak boleh sebelum tanggal mulai');
    const u = { id: C.newId(), name, username, role, hash: C.hashPw(pw), active: true, validFrom: vf, validUntil: vu,
      mustChange: b.mustChange !== false, sv: 0, createdAt: new Date().toISOString(), createdBy: me.username, lastLogin: null };
    await C.saveUser(u);
    await C.log(me, 'admin.user_created', 'Membuat akun ' + username + ' (' + role + ')' + (vu ? ', berlaku s.d. ' + vu : ''), addr);
    return C.send(res, 201, { ok: true, user: C.publicUser(u), password: pw });
  }

  if (req.method === 'PATCH') {
    const b = await C.body(req);
    const u = await C.getUser(String(b.id || ''));
    if (!u) return C.fail(res, 404, 'notfound', 'Pengguna tidak ditemukan');
    const self = u.id === me.id;
    let extra = {};
    switch (b.action) {
      case 'reset': {
        const pw = String(b.password || '') || C.randomPw();
        const prob = C.pwProblem(pw); if (prob) return C.fail(res, 400, 'weak', prob);
        u.hash = C.hashPw(pw); u.mustChange = b.mustChange !== false; u.sv = (u.sv || 0) + 1;
        extra.password = pw;
        await C.log(me, 'admin.password_reset', 'Reset password ' + u.username, addr);
        break;
      }
      case 'validity': {
        const vf = cleanDate(b.validFrom), vu = cleanDate(b.validUntil);
        if (vf && vu && vu < vf) return C.fail(res, 400, 'input', 'Tanggal akhir berlaku tidak boleh sebelum tanggal mulai');
        if (self && vu && vu < C.today()) return C.fail(res, 400, 'self', 'Tidak dapat membuat akun Anda sendiri kedaluwarsa');
        if (u.role === 'admin' && vu && vu < C.today() && !(await otherActiveAdmins(u.id))) return C.fail(res, 400, 'lastadmin', 'Minimal harus ada satu admin aktif');
        u.validFrom = vf; u.validUntil = vu;
        await C.log(me, 'admin.validity', 'Masa berlaku ' + u.username + ': ' + (vf || '–') + ' s.d. ' + (vu || 'tanpa batas'), addr);
        break;
      }
      case 'active': {
        const on = !!b.active;
        if (!on && self) return C.fail(res, 400, 'self', 'Tidak dapat menonaktifkan akun Anda sendiri');
        if (!on && u.role === 'admin' && !(await otherActiveAdmins(u.id))) return C.fail(res, 400, 'lastadmin', 'Minimal harus ada satu admin aktif');
        u.active = on; if (!on) u.sv = (u.sv || 0) + 1;
        await C.log(me, on ? 'admin.user_activated' : 'admin.user_deactivated', (on ? 'Mengaktifkan ' : 'Menonaktifkan ') + u.username, addr);
        break;
      }
      case 'role': {
        const role = b.role === 'admin' ? 'admin' : 'user';
        if (self && role !== 'admin') return C.fail(res, 400, 'self', 'Tidak dapat menurunkan peran akun Anda sendiri');
        if (u.role === 'admin' && role !== 'admin' && !(await otherActiveAdmins(u.id))) return C.fail(res, 400, 'lastadmin', 'Minimal harus ada satu admin aktif');
        u.role = role; u.sv = (u.sv || 0) + 1;
        await C.log(me, 'admin.role', u.username + ' dijadikan ' + role, addr);
        break;
      }
      case 'name': {
        const name = String(b.name || '').trim().slice(0, 80); if (!name) return C.fail(res, 400, 'input', 'Nama wajib diisi');
        await C.log(me, 'admin.rename', 'Nama ' + u.username + ': ' + u.name + ' → ' + name, addr);
        u.name = name; break;
      }
      default: return C.fail(res, 400, 'action', 'Aksi tidak dikenal');
    }
    await C.saveUser(u);
    return C.send(res, 200, Object.assign({ ok: true, user: C.publicUser(u) }, extra));
  }

  if (req.method === 'DELETE') {
    const id = C.query(req).id || (await C.body(req)).id;
    const u = await C.getUser(String(id || ''));
    if (!u) return C.fail(res, 404, 'notfound', 'Pengguna tidak ditemukan');
    if (u.id === me.id) return C.fail(res, 400, 'self', 'Tidak dapat menghapus akun Anda sendiri');
    if (u.role === 'admin' && !(await otherActiveAdmins(u.id))) return C.fail(res, 400, 'lastadmin', 'Minimal harus ada satu admin aktif');
    await C.S.hdel(C.K.users, u.id);
    await C.S.del(C.K.backups(u.id));
    await C.log(me, 'admin.user_deleted', 'Menghapus akun ' + u.username + ' (' + u.name + ')', addr);
    return C.send(res, 200, { ok: true });
  }
  C.fail(res, 405, 'method', 'Metode tidak didukung');
});
