/* Halaman login & ganti password wajib */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var I = window.KCI18n, T = function (s) { return s; }; // teks DOM diterjemahkan otomatis oleh KCI18n.observe
  var SAVED = 'kc_saved_login';
  var lastPw = '';
  var q = new URLSearchParams(location.search);

  function show(v) { ['vLoading', 'vLogin', 'vChange'].forEach(function (id) { $(id).hidden = id !== v; }); }
  function msg(el, kind, text) { el = $(el); el.className = 'msg ' + kind; el.textContent = T(text); el.hidden = !text; }
  async function api(method, url, body) {
    var r = await fetch(url, { method: method, credentials: 'same-origin', headers: Object.assign({ 'X-KC': '1' }, body ? { 'Content-Type': 'application/json' } : {}), body: body ? JSON.stringify(body) : undefined });
    var j = await r.json().catch(function () { return {}; });
    j.status = r.status; return j;
  }
  function readSaved() { try { var s = JSON.parse(localStorage.getItem(SAVED) || 'null'); if (s && s.u) return { u: s.u, p: s.p ? decodeURIComponent(escape(atob(s.p))) : '' }; } catch (e) {} return null; }
  function writeSaved(u, p) { try { localStorage.setItem(SAVED, JSON.stringify({ u: u, p: btoa(unescape(encodeURIComponent(p))) })); } catch (e) {} }
  function goApp() { location.replace('/app'); }
  function toChange(user) {
    $('cUser').value = user ? user.username : $('lUser').value;
    if (lastPw) $('cCur').value = lastPw;
    $('chLead').textContent = T(user && user.username === 'AdminCoba1'
      ? 'Login pertama admin: ganti password bawaan terlebih dahulu. Aplikasi dan modul admin baru dapat dibuka setelah password diganti.'
      : 'Demi keamanan, Anda wajib mengganti password sebelum aplikasi dapat dibuka.');
    show('vChange'); rules();
    (lastPw ? $('cNew') : $('cCur')).focus();
  }
  function rules() {
    var cur = $('cCur').value, n = $('cNew').value, n2 = $('cNew2').value;
    var ok = { len: n.length >= 8, mix: /[A-Za-z]/.test(n) && /\d/.test(n), diff: !!n && n !== cur, same: !!n && n === n2 };
    document.querySelectorAll('#rules li').forEach(function (li) { li.classList.toggle('ok', ok[li.dataset.r]); });
    return ok.len && ok.mix && ok.diff && ok.same;
  }

  async function check() {
    if (q.get('logout')) msg('loginMsg', 'ok', 'Anda telah logout.');
    else if (q.get('expired')) msg('loginMsg', 'info', 'Sesi berakhir atau akses berubah. Silakan login kembali.');
    try {
      var j = await api('GET', '/api/auth/me');
      if (j.status === 200 && j.ok) { if (j.mustChange) return toChange(j.user); return goApp(); }
      if (j.status === 503) msg('loginMsg', 'err', j.error || 'Penyimpanan server belum dikonfigurasi.');
      else if (j.status === 403 && j.error) msg('loginMsg', 'err', j.error);
    } catch (e) { msg('loginMsg', 'err', 'Tidak dapat terhubung ke server'); }
    var s = readSaved();
    if (s) { $('lUser').value = s.u; $('lPass').value = s.p || ''; $('lRemember').checked = true; }
    show('vLogin');
    ($('lUser').value ? $('lPass') : $('lUser')).focus();
  }

  $('vLogin').addEventListener('submit', async function (e) {
    e.preventDefault();
    var u = $('lUser').value.trim(), p = $('lPass').value, rem = $('lRemember').checked;
    if (!u || !p) { msg('loginMsg', 'err', 'Username dan password wajib diisi'); return; }
    $('lBtn').disabled = true; msg('loginMsg', 'info', 'Memeriksa…');
    try {
      var j = await api('POST', '/api/auth/login', { username: u, password: p, remember: rem });
      if (!j.ok) { msg('loginMsg', 'err', j.error || 'Login gagal'); return; }
      if (rem) writeSaved(u, p); else { try { localStorage.removeItem(SAVED); } catch (x) {} }
      lastPw = p;
      if (j.mustChange) { $('loginMsg').hidden = true; toChange(j.user); } else goApp();
    } catch (err) { msg('loginMsg', 'err', 'Tidak dapat terhubung ke server'); }
    finally { $('lBtn').disabled = false; }
  });

  ['cCur', 'cNew', 'cNew2'].forEach(function (id) { $(id).addEventListener('input', rules); });
  $('vChange').addEventListener('submit', async function (e) {
    e.preventDefault();
    if (!rules()) { msg('chMsg', 'err', 'Password baru belum memenuhi semua syarat'); return; }
    $('cBtn').disabled = true; msg('chMsg', 'info', 'Menyimpan…');
    try {
      var j = await api('POST', '/api/auth/change-password', { current: $('cCur').value, next: $('cNew').value });
      if (!j.ok) { msg('chMsg', 'err', j.error || 'Gagal mengganti password'); if (j.status === 401) setTimeout(function () { location.replace('/'); }, 1200); return; }
      var s = readSaved(); if (s && s.u) writeSaved(s.u, $('cNew').value);
      msg('chMsg', 'ok', 'Password berhasil diganti. Membuka aplikasi…');
      setTimeout(goApp, 600);
    } catch (err) { msg('chMsg', 'err', 'Tidak dapat terhubung ke server'); }
    finally { $('cBtn').disabled = false; }
  });
  $('cLogout').addEventListener('click', async function () { await api('POST', '/api/auth/logout'); location.replace('/?logout=1'); });
  document.querySelectorAll('[data-toggle]').forEach(function (b) {
    b.addEventListener('click', function () { var i = $(b.dataset.toggle); var sh = i.type === 'password'; i.type = sh ? 'text' : 'password'; b.textContent = T(sh ? 'Sembunyikan' : 'Lihat'); });
  });
  function syncLang() { document.querySelectorAll('.lang button').forEach(function (b) { b.classList.toggle('on', b.dataset.lang === I.lang()); }); }
  document.querySelectorAll('.lang button').forEach(function (b) { b.addEventListener('click', function () { I.setLang(b.dataset.lang); syncLang(); }); });
  try { var th = localStorage.getItem('kc_theme'); if (th === 'light' || th === 'dark') document.documentElement.setAttribute('data-theme', th); } catch (e) {}
  syncLang();
  I.observe(document.body);
  document.title = I.tr(document.documentElement.getAttribute('data-title'));
  check();
})();
