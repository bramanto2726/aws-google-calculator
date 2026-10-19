/* =====================================================================
 * Modul admin: kelola pengguna & catatan aktivitas.
 * Skrip ini hanya dikirim server kepada admin; semua endpoint /api/admin/*
 * juga memeriksa peran admin di server pada setiap permintaan.
 * ===================================================================== */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var S, USERS = [], ME = null, TODAY = '', LOGS = [];
  var T = function (s) { return s; }, TT = function (s) { return window.KCI18n.tr(s); }; // T: biarkan DOM diterjemahkan otomatis; TT: terjemahan langsung
  function esc(s) { return KCUtil.esc(s == null ? '' : s); }
  function toast(m) { KCUtil.toast(T(m)); }
  function fd(iso, t) { return KCShell.fmtDate(iso, t); }
  var ST_LABEL = { active: 'Aktif', inactive: 'Nonaktif', expired: 'Kedaluwarsa', notyet: 'Belum berlaku' };
  var ACT_LABEL = {
    'auth.login': 'Login', 'auth.logout': 'Logout', 'auth.login_failed': 'Login gagal', 'auth.login_blocked': 'Login ditolak', 'auth.locked': 'Dikunci sementara',
    'auth.password_changed': 'Ganti password', 'auth.password_change_failed': 'Ganti password gagal',
    'admin.user_created': 'Buat akun', 'admin.password_reset': 'Reset password', 'admin.validity': 'Ubah masa berlaku', 'admin.user_activated': 'Aktifkan akun',
    'admin.user_deactivated': 'Nonaktifkan akun', 'admin.role': 'Ubah peran', 'admin.rename': 'Ubah nama', 'admin.user_deleted': 'Hapus akun',
    'security.denied': 'Akses ditolak', 'system.seed': 'Sistem',
    'backup.save_server': 'Simpan backup', 'backup.restore_server': 'Pulihkan backup', 'backup.delete_server': 'Hapus backup',
    'app.recompute': 'Recompute', 'app.reset_data': 'Reset data', 'app.export': 'Ekspor laporan', 'app.backup_download': 'Unduh backup', 'app.backup_restore_file': 'Pulihkan dari file',
    'app.project_save': 'Simpan proyek', 'app.project_load': 'Muat proyek', 'app.price_update': 'Update harga online', 'app.price_import': 'Impor harga', 'app.price_reset': 'Reset harga',
    'app.currency_change': 'Ubah mata uang', 'app.lang_change': 'Ganti bahasa', 'currency.update': 'Update kurs online'
  };

  /* ---------------- Pengguna ---------------- */
  async function loadUsers() {
    $('userTable').innerHTML = '<p class="muted">' + T('Memuat…') + '</p>';
    try { var j = await S.api('GET', '/api/admin/users'); USERS = j.users; ME = j.me; TODAY = j.today; renderUsers(); }
    catch (e) { $('userTable').innerHTML = '<div class="empty-small">' + esc(e.message) + '</div>'; }
  }
  function validityText(u) {
    if (!u.validFrom && !u.validUntil) return T('tanpa batas');
    return (u.validFrom ? fd(u.validFrom) : '…') + ' – ' + (u.validUntil ? fd(u.validUntil) : T('tanpa batas'));
  }
  function renderUsers() {
    var q = ($('userFilter').value || '').toLowerCase(), fs = $('userFilterStatus').value;
    var list = USERS.filter(function (u) { return (!q || (u.name + ' ' + u.username).toLowerCase().indexOf(q) >= 0) && (!fs || u.status === fs); });
    if (!list.length) { $('userTable').innerHTML = '<div class="empty-small">' + T('Tidak ada pengguna yang cocok.') + '</div>'; return; }
    var h = '<div class="table-wrap"><table><thead><tr><th>' + T('Pengguna') + '</th><th>' + T('Peran') + '</th><th>' + T('Status') + '</th><th>' + T('Masa berlaku') + '</th><th>' + T('Login terakhir') + '</th><th>' + T('Aksi') + '</th></tr></thead><tbody>';
    list.forEach(function (u) {
      var self = u.id === ME;
      h += '<tr><td><b data-notr>' + esc(u.name) + '</b>' + (self ? ' <span class="muted">(' + T('Anda') + ')</span>' : '') + '<br><span class="mono" data-notr>' + esc(u.username) + '</span></td>' +
        '<td><span class="st ' + u.role + '">' + (u.role === 'admin' ? 'Admin' : T('Pengguna')) + '</span></td>' +
        '<td><span class="st ' + u.status + '">' + T(ST_LABEL[u.status]) + '</span>' + (u.mustChange ? '<br><span class="st must" title="' + esc(T('Pengguna wajib mengganti password saat login berikutnya')) + '">' + T('wajib ganti password') + '</span>' : '') + '</td>' +
        '<td>' + validityText(u) + '</td><td>' + (u.lastLogin ? fd(u.lastLogin, true) : '<span class="muted">' + T('belum pernah') + '</span>') + '</td>' +
        '<td><div class="actions">' +
          btn('reset', u, 'Reset password') + btn('validity', u, 'Masa berlaku') +
          (u.active ? btn('deactivate', u, 'Nonaktifkan', self) : btn('activate', u, 'Aktifkan')) +
          (u.role === 'admin' ? btn('demote', u, 'Jadikan pengguna', self) : btn('promote', u, 'Jadikan admin')) +
          btn('rename', u, 'Ubah nama') + btn('delete', u, 'Hapus', self, true) +
        '</div></td></tr>';
    });
    $('userTable').innerHTML = h + '</tbody></table></div>';
    $('userTable').querySelectorAll('button[data-act]').forEach(function (b) { b.addEventListener('click', function () { action(b.dataset.act, USERS.find(function (x) { return x.id === b.dataset.id; })); }); });
  }
  function btn(act, u, label, disabled, danger) {
    return '<button class="btn ghost small' + (danger ? ' danger' : '') + '" data-act="' + act + '" data-id="' + u.id + '"' + (disabled ? ' disabled title="' + esc(T('Tidak berlaku untuk akun Anda sendiri')) + '"' : '') + '>' + T(label) + '</button>';
  }
  function credText(u, pw, title) {
    var rows = [[TT('Alamat'), location.origin + '/'], [TT('Nama'), u.name], ['Username', u.username], ['Password', pw], [TT('Peran'), u.role === 'admin' ? 'Admin' : TT('Pengguna')], [TT('Berlaku'), TT(validityText(u))]];
    var w = Math.max.apply(null, rows.map(function (r) { return r[0].length; }));
    var lines = [TT(title), ''].concat(rows.map(function (r) { return r[0] + new Array(w - r[0].length + 2).join(' ') + ': ' + r[1]; }));
    if (u.mustChange) lines.push('', TT('Setelah login, Anda akan diminta mengganti password.'));
    return lines.join('\n');
  }
  function showCred(u, pw, heading, title) {
    $('credTitle').textContent = T(heading);
    $('credText').value = credText(u, pw, title);
    $('credStatus').textContent = T('Password hanya ditampilkan sekali. Salin sekarang.');
    $('userCred').hidden = false; $('userCred').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  async function patch(body, okMsg) {
    try { var j = await S.api('PATCH', '/api/admin/users', body); toast(okMsg); await loadUsers(); return j; }
    catch (e) { toast(e.message); return null; }
  }
  async function action(act, u) {
    if (!u) return;
    var who = '<b data-notr>' + esc(u.name) + '</b> (<span class="mono" data-notr>' + esc(u.username) + '</span>)';
    if (act === 'reset') {
      var r = await S.dialog({ title: 'Reset password', html: '<p>' + T('Reset password untuk') + ' ' + who + '.</p><label>' + T('Password baru (kosongkan untuk dibuat acak)') + '<input id="dRpw" autocomplete="new-password" data-notr></label><label class="chk"><input type="checkbox" id="dRmust" checked> ' + T('Wajib ganti password saat login berikutnya') + '</label>', ok: 'Reset password' });
      if (!r.ok) return;
      var j = await patch({ id: u.id, action: 'reset', password: $('dRpw').value, mustChange: $('dRmust').checked }, 'Password direset');
      if (j) showCred(j.user, j.password, 'Password direset – kirim informasi ini ke pengguna', 'Reset password akun Kalkulator Cloud AWS / Google Cloud');
    } else if (act === 'validity') {
      var r2 = await S.dialog({ title: 'Masa berlaku akun', html: '<p>' + who + '</p><div class="row2"><label>' + T('Berlaku mulai') + '<input type="date" id="dVf" value="' + esc(u.validFrom) + '"></label><label>' + T('Berlaku sampai') + '<input type="date" id="dVu" value="' + esc(u.validUntil) + '"></label></div><p class="hint" style="margin-left:0">' + T('Kosongkan tanggal untuk tanpa batas.') + '</p>', ok: 'Simpan' });
      if (!r2.ok) return;
      await patch({ id: u.id, action: 'validity', validFrom: $('dVf').value, validUntil: $('dVu').value }, 'Masa berlaku disimpan');
    } else if (act === 'deactivate' || act === 'activate') {
      var on = act === 'activate';
      var r3 = await S.dialog({ title: on ? 'Aktifkan akun?' : 'Nonaktifkan akun?', html: '<p>' + who + '</p><p class="muted">' + T(on ? 'Pengguna dapat login kembali.' : 'Pengguna langsung keluar dan tidak dapat login sampai diaktifkan lagi.') + '</p>', ok: on ? 'Aktifkan' : 'Nonaktifkan', danger: !on });
      if (!r3.ok) return;
      await patch({ id: u.id, action: 'active', active: on }, on ? 'Akun diaktifkan' : 'Akun dinonaktifkan');
    } else if (act === 'promote' || act === 'demote') {
      var adm = act === 'promote';
      var r4 = await S.dialog({ title: adm ? 'Jadikan admin?' : 'Jadikan pengguna biasa?', html: '<p>' + who + '</p><p class="muted">' + T(adm ? 'Admin dapat mengelola semua akun dan melihat catatan aktivitas.' : 'Akses ke menu admin akan dicabut.') + '</p>', ok: adm ? 'Jadikan admin' : 'Jadikan pengguna' });
      if (!r4.ok) return;
      await patch({ id: u.id, action: 'role', role: adm ? 'admin' : 'user' }, 'Peran diperbarui');
    } else if (act === 'rename') {
      var r5 = await S.dialog({ title: 'Ubah nama', html: '<label>' + T('Nama lengkap') + '<input id="dNm" maxlength="80" value="' + esc(u.name) + '" data-notr></label>', ok: 'Simpan' });
      if (!r5.ok) return;
      await patch({ id: u.id, action: 'name', name: $('dNm').value }, 'Nama diperbarui');
    } else if (act === 'delete') {
      var r6 = await S.dialog({ title: 'Hapus akun?', html: '<p>' + who + '</p><p class="muted">' + T('Akun dan backup server miliknya akan dihapus permanen. Catatan aktivitas tetap disimpan.') + '</p>', ok: 'Hapus', danger: true });
      if (!r6.ok) return;
      try { await S.api('DELETE', '/api/admin/users?id=' + encodeURIComponent(u.id)); toast('Akun dihapus'); loadUsers(); } catch (e) { toast(e.message); }
    }
  }
  function randomPw() {
    var U = 'ABCDEFGHJKLMNPQRSTUVWXYZ', Lw = 'abcdefghijkmnopqrstuvwxyz', D = '23456789', Y = '!@#$%*?', all = U + Lw + D + Y;
    var rnd = function (n) { var a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n; };
    var arr = [U[rnd(U.length)], Lw[rnd(Lw.length)], D[rnd(D.length)], Y[rnd(Y.length)]];
    while (arr.length < 12) arr.push(all[rnd(all.length)]);
    for (var i = arr.length - 1; i > 0; i--) { var j = rnd(i + 1), t = arr[i]; arr[i] = arr[j]; arr[j] = t; }
    return arr.join('');
  }
  function initUsers() {
    $('btnUserNew').addEventListener('click', function () {
      var f = $('userForm'); f.hidden = !f.hidden;
      if (!f.hidden) { f.reset(); $('nuPass').value = randomPw(); $('nuFrom').value = TODAY || new Date().toISOString().slice(0, 10); $('nuMust').checked = true; $('nuStatus').textContent = ''; $('nuName').focus(); }
    });
    $('btnNuRandom').addEventListener('click', function () { $('nuPass').value = randomPw(); });
    $('btnNuCancel').addEventListener('click', function () { $('userForm').hidden = true; });
    $('userForm').addEventListener('submit', async function () {
      var body = { name: $('nuName').value.trim(), username: $('nuUser').value.trim(), password: $('nuPass').value, role: $('nuRole').value, validFrom: $('nuFrom').value, validUntil: $('nuUntil').value, mustChange: $('nuMust').checked };
      $('btnNuSave').disabled = true; $('nuStatus').textContent = T('Menyimpan…');
      try {
        var j = await S.api('POST', '/api/admin/users', body);
        $('userForm').hidden = true; $('nuStatus').textContent = '';
        showCred(j.user, j.password, 'Akun berhasil dibuat – kirim informasi ini ke pengguna', 'Akun Kalkulator Cloud AWS / Google Cloud');
        toast('Akun dibuat'); loadUsers();
      } catch (e) { $('nuStatus').textContent = e.message; }
      finally { $('btnNuSave').disabled = false; }
    });
    $('btnCredCopy').addEventListener('click', async function () {
      var t = $('credText'); t.select();
      try { await navigator.clipboard.writeText(t.value); } catch (e) { document.execCommand('copy'); }
      $('credStatus').textContent = T('Tersalin ke clipboard ✓');
    });
    $('btnCredClose').addEventListener('click', function () { $('userCred').hidden = true; $('credText').value = ''; });
    $('userFilter').addEventListener('input', renderUsers);
    $('userFilterStatus').addEventListener('change', renderUsers);
  }

  /* ---------------- Catatan aktivitas ---------------- */
  async function loadLogs() {
    $('logTable').innerHTML = '<p class="muted">' + T('Memuat…') + '</p>';
    try { var j = await S.api('GET', '/api/admin/logs?limit=500'); LOGS = j.logs; renderLogs(); }
    catch (e) { $('logTable').innerHTML = '<div class="empty-small">' + esc(e.message) + '</div>'; }
  }
  function filteredLogs() {
    var q = ($('logFilter').value || '').toLowerCase(), t = $('logType').value;
    return LOGS.filter(function (l) { return (!t || l.action.indexOf(t) === 0) && (!q || (l.user + ' ' + l.action + ' ' + TT(ACT_LABEL[l.action] || '') + ' ' + (ACT_LABEL[l.action] || '') + ' ' + l.detail + ' ' + l.ip).toLowerCase().indexOf(q) >= 0); });
  }
  function renderLogs() {
    var list = filteredLogs();
    if (!list.length) { $('logTable').innerHTML = '<div class="empty-small">' + T('Belum ada catatan yang cocok.') + '</div>'; return; }
    var h = '<p class="muted">' + list.length + ' ' + T('catatan') + '</p><div class="table-wrap" style="max-height:65vh;overflow:auto"><table><thead><tr><th>' + T('Waktu') + '</th><th>' + T('Pengguna') + '</th><th>' + T('Aksi') + '</th><th>' + T('Detail') + '</th><th>IP</th></tr></thead><tbody>';
    list.forEach(function (l) {
      var warn = /failed|blocked|locked|denied|deleted|deactivated/.test(l.action);
      h += '<tr><td style="white-space:nowrap">' + fd(l.t, true) + '</td><td class="mono" data-notr>' + esc(l.user) + '</td><td><span class="st ' + (warn ? 'expired' : 'user') + '">' + T(ACT_LABEL[l.action] || l.action) + '</span><br><span class="log-act muted">' + esc(l.action) + '</span></td><td>' + esc(l.detail) + '</td><td class="mono">' + esc(l.ip) + '</td></tr>';
    });
    $('logTable').innerHTML = h + '</tbody></table></div>';
  }
  function csv() {
    var rows = [['time', 'user', 'action', 'label', 'detail', 'ip']].concat(filteredLogs().map(function (l) { return [l.t, l.user, l.action, TT(ACT_LABEL[l.action] || ''), TT(l.detail), l.ip]; }));
    var txt = rows.map(function (r) { return r.map(function (c) { c = String(c == null ? '' : c); return /[",\n;]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; }).join(','); }).join('\r\n');
    KCUtil.download(new Blob(['﻿' + txt], { type: 'text/csv;charset=utf-8' }), 'catatan-aktivitas-' + new Date().toISOString().slice(0, 10) + '.csv');
  }
  function initLogs() {
    $('btnLogsRefresh').addEventListener('click', loadLogs);
    $('btnLogsCsv').addEventListener('click', csv);
    $('logFilter').addEventListener('input', renderLogs);
    $('logType').addEventListener('change', renderLogs);
  }

  window.KCAdmin = {
    onTab: function (name) { if (name === 'users') loadUsers(); if (name === 'logs') loadLogs(); },
    refresh: function () { if (document.querySelector('#tab-users.active')) renderUsers(); if (document.querySelector('#tab-logs.active')) renderLogs(); }
  };
  document.addEventListener('DOMContentLoaded', function () { S = window.KCShell; initUsers(); initLogs(); });
})();
