/* =====================================================================
 * Shell aplikasi: menu samping, tombol atas (recompute/reset/logout),
 * bahasa, tema, mata uang & kurs, backup & restore, akun saya.
 * ===================================================================== */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var USER = window.KC_USER || { name: '-', username: '-', role: 'user' };
  var I = window.KCI18n;
  // Teks untuk DOM ditulis dalam bahasa sumber; penerjemah DOM (KCI18n.observe) menerjemahkan & mengembalikannya saat bahasa diganti.
  var T = function (s) { return s; };
  function toast(m) { KCUtil.toast(T(m)); }
  function esc(s) { return KCUtil.esc(s == null ? '' : s); }
  function L() { return KCL(); }
  function fmtDate(iso, withTime) {
    if (!iso) return '–';
    var d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso);
    return withTime ? d.toLocaleString(L(), { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString(L(), { day: '2-digit', month: 'short', year: 'numeric' });
  }

  /* ---------------- API ---------------- */
  async function api(method, url, body) {
    var r;
    try {
      r = await fetch(url, { method: method, credentials: 'same-origin', headers: Object.assign({ 'X-KC': '1' }, body ? { 'Content-Type': 'application/json' } : {}), body: body ? JSON.stringify(body) : undefined });
    } catch (e) { throw new Error(T('Tidak dapat terhubung ke server')); }
    var j = await r.json().catch(function () { return {}; });
    if (r.status === 401 || (r.status === 403 && /^status_/.test(j.code || ''))) { location.href = '/?expired=1'; throw new Error(T(j.error || 'Silakan login')); }
    if (r.status === 403 && j.code === 'must_change') { location.href = '/?change=1'; throw new Error(T(j.error)); }
    if (!r.ok || j.ok === false && !j.rates) { var err = new Error(T(j.error || ('HTTP ' + r.status))); err.code = j.code; err.status = r.status; throw err; }
    return j;
  }
  function activity(action, detail) { api('POST', '/api/activity', { action: action, detail: detail || '' }).catch(function () {}); }

  /* ---------------- Dialog ---------------- */
  function dialog(o) {
    var d = $('dlg');
    $('dlgTitle').textContent = T(o.title || '');
    $('dlgBody').innerHTML = o.html || '';
    $('dlgOk').textContent = T(o.ok || 'OK');
    $('dlgOk').className = 'btn' + (o.danger ? ' warn' : '');
    $('dlgCancel').textContent = T(o.cancel || 'Batal');
    $('dlgCancel').hidden = o.noCancel === true;
    return new Promise(function (res) {
      if (typeof d.showModal !== 'function') { res({ ok: window.confirm(I.tr(o.title)), body: $('dlgBody') }); return; }
      function done() { d.removeEventListener('close', done); res({ ok: d.returnValue === 'ok', body: $('dlgBody') }); }
      d.returnValue = ''; d.addEventListener('close', done); d.showModal();
      var f = $('dlgBody').querySelector('input,select'); if (f) setTimeout(function () { f.focus(); }, 30);
    });
  }

  /* ---------------- Menu samping ---------------- */
  var mobile = function () { return window.innerWidth < 900; };
  function setSidebar(open, persist) {
    document.documentElement.classList.toggle('sb-closed', !open);
    if (persist && !mobile()) { try { localStorage.setItem('kc_sb', open ? '1' : '0'); } catch (e) {} $('sbPinned').checked = open; }
  }
  function initSidebar() {
    $('btnSbToggle').addEventListener('click', function () { setSidebar(document.documentElement.classList.contains('sb-closed'), true); });
    $('btnSbClose').addEventListener('click', function () { setSidebar(false, true); });
    $('sbBackdrop').addEventListener('click', function () { setSidebar(false); });
    window.addEventListener('kc:tab', function (e) { if (mobile()) setSidebar(false); onTab(e.detail); });
    var pinned = true; try { pinned = localStorage.getItem('kc_sb') !== '0'; } catch (e) {}
    $('sbPinned').checked = pinned;
    $('sbPinned').addEventListener('change', function () { try { localStorage.setItem('kc_sb', this.checked ? '1' : '0'); } catch (e) {} setSidebar(this.checked); });
    document.querySelectorAll('[data-goto]').forEach(function (b) { b.addEventListener('click', function () { KC.switchTab(b.dataset.goto); }); });
    $('sbUser').innerHTML = '<b>' + esc(USER.name) + '</b>@' + esc(USER.username) + ' · ' + (USER.role === 'admin' ? 'Admin' : T('Pengguna'));
  }
  function onTab(name) {
    if (name === 'backup') loadBackups();
    if (name === 'currency') renderRates();
    if (name === 'account') renderAccount();
    if (window.KCAdmin) window.KCAdmin.onTab(name);
  }

  /* ---------------- Bahasa & tema ---------------- */
  function syncLangUi() {
    var l = I.lang();
    document.querySelectorAll('.lang-switch button').forEach(function (b) { b.classList.toggle('on', b.dataset.lang === l); });
    document.querySelectorAll('input[name=lang]').forEach(function (r) { r.checked = r.value === l; });
  }
  function setLanguage(l) {
    if (l === I.lang()) return;
    var inp = KC.readInput();             // baca angka dengan format bahasa lama
    I.setLang(l);
    KC.writeInput(inp);                   // tulis ulang dengan format bahasa baru
    KC.renderPriceEditor();
    if (KC.last) KC.recompute();
    renderRates(); renderAccount(); refreshCurrencyUi(); syncLangUi();
    if (window.KCAdmin) window.KCAdmin.refresh();
    activity('app.lang_change', l.toUpperCase());
  }
  function initLangTheme() {
    document.querySelectorAll('.lang-switch button').forEach(function (b) { b.addEventListener('click', function () { setLanguage(b.dataset.lang); }); });
    document.querySelectorAll('input[name=lang]').forEach(function (r) { r.addEventListener('change', function () { if (r.checked) setLanguage(r.value); }); });
    syncLangUi();
    var t = 'auto'; try { t = localStorage.getItem('kc_theme') || 'auto'; } catch (e) {}
    $('themeSel').value = t;
    $('themeSel').addEventListener('change', function () {
      var v = this.value; try { localStorage.setItem('kc_theme', v); } catch (e) {}
      if (v === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', v);
    });
  }

  /* ---------------- Tombol atas ---------------- */
  function initTopbar() {
    $('btnRecompute').addEventListener('click', function () {
      var onInput = document.querySelector('.panel.active') && document.querySelector('.panel.active').id === 'tab-input';
      KC.recompute();
      if (onInput || !/^tab-(solusi|biaya|tco|catatan|ekspor)$/.test(document.querySelector('.panel.active').id)) KC.switchTab('solusi');
      toast('Hasil dihitung ulang dengan data terbaru');
      activity('app.recompute', KC.readInput().custName);
    });
    $('btnResetData').addEventListener('click', async function () {
      var r = await dialog({ title: 'Reset data?', html: '<p>' + esc(T('Semua input akan dikembalikan ke contoh dan hasil perhitungan dikosongkan. Data harga, kurs, dan backup tidak terhapus. Unduh backup terlebih dahulu bila perlu.')) + '</p>', ok: 'Reset Data', danger: true });
      if (!r.ok) return;
      KC.resetData(); KCCur.setIn('IDR'); refreshCurrencyUi();
      KC.switchTab('input'); toast('Data direset ke contoh');
      activity('app.reset_data', '');
    });
    $('btnLogout').addEventListener('click', async function () {
      try { await fetch('/api/auth/logout', { method: 'POST', headers: { 'X-KC': '1' }, credentials: 'same-origin' }); } catch (e) {}
      location.href = '/?logout=1';
    });
    $('curBadge').addEventListener('click', function () { KC.switchTab('currency'); });
  }

  /* ---------------- Mata uang ---------------- */
  function curOptions(sel) {
    return KCCur.LIST.map(function (c) { return '<option value="' + c[0] + '"' + (c[0] === sel ? ' selected' : '') + '>' + c[0] + ' – ' + esc(c[1]) + '</option>'; }).join('');
  }
  function refreshCurrencyUi() {
    var c = KCCur.get();
    document.querySelectorAll('select.cur-select').forEach(function (s) { var v = s.dataset.role === 'in' ? c.in : c.out; s.innerHTML = curOptions(v); s.value = v; });
    document.querySelectorAll('.cur-in').forEach(function (e) { e.textContent = KCCur.sym(c.in); });
    $('curBadge').textContent = c.out;
    $('curBadge').title = T('Mata uang output') + ': ' + c.out + ' · ' + T('klik untuk mengubah');
    var fx = $('fx'); if (fx && document.activeElement !== fx) fx.value = KC.edNum(KCCur.rate('IDR'));
    suggestCurrency();
  }
  /* Saran mata uang lokal sesuai negara pelanggan */
  function suggestCurrency() {
    var box = $('curSuggest'); if (!box) return;
    var RMx = Engine.RM($('regionKey').value), cur = RMx.currency, out = KCCur.out();
    if (!cur || cur === out || !KCCur.INFO[cur]) { box.innerHTML = ''; return; }
    box.innerHTML = esc(T('Mata uang lokal')) + ' ' + esc(T(RMx.label)) + ': <b>' + cur + '</b>' + (RMx.country === 'BN' ? ' (' + esc(T('BND setara SGD')) + ')' : '') + ' <button type="button" class="btn ghost small" id="btnUseCur" style="margin:0 0 0 6px">' + esc(T('Gunakan')) + ' ' + cur + '</button>';
    $('btnUseCur').addEventListener('click', function () { KCCur.setOut(cur); activity('app.currency_change', 'Mata uang output → ' + cur + ' (saran negara)'); });
  }
  function renderRates() {
    var c = KCCur.get(), out = c.out, h = '<div class="table-wrap"><table class="rates"><thead><tr><th>' + T('Kode') + '</th><th>' + T('Mata uang') + '</th><th class="num">1 USD =</th><th class="num">1 ' + out + ' =</th><th class="num">' + T('Nilai 1 unit dalam') + ' ' + out + '</th></tr></thead><tbody>';
    KCCur.LIST.forEach(function (x) {
      var code = x[0], r = KCCur.rate(code);
      h += '<tr class="' + (code === out || code === c.in ? 'sel' : '') + '"><td><b>' + code + '</b> <span class="muted">' + esc(x[2]) + '</span>' + (code === out ? ' <span class="st active">' + T('output') + '</span>' : '') + (code === c.in ? ' <span class="st user">' + T('input') + '</span>' : '') + '</td><td>' + esc(x[1]) + '</td>' +
        '<td class="num">' + (code === 'USD' ? '1' : '<input data-rate="' + code + '" value="' + KC.edNum(r) + '" inputmode="decimal">') + '</td>' +
        '<td class="num">' + (KCCur.conv(1, out, code)).toLocaleString(L(), { maximumFractionDigits: 6 }) + ' ' + code + '</td>' +
        '<td class="num">' + KCCur.money(KCCur.conv(1, code, out)) + '</td></tr>';
    });
    h += '</tbody></table></div>';
    $('ratesTable').innerHTML = h;
    $('ratesTable').querySelectorAll('input[data-rate]').forEach(function (inp) {
      inp.addEventListener('change', function () {
        var v = KC.parseNum(inp.value); if (!(v > 0)) { toast('Nilai harus angka'); inp.value = KC.edNum(KCCur.rate(inp.dataset.rate)); return; }
        KCCur.setRates(Object.assign({}, KCCur.get().rates, (function () { var o = {}; o[inp.dataset.rate] = v; return o; })()), { updated: new Date().toISOString().slice(0, 10) + ' (edit manual)', source: 'manual' });
        activity('app.currency_change', 'Kurs ' + inp.dataset.rate + ' = ' + v + ' per USD (manual)');
      });
    });
    $('ratesMeta').textContent = T('Kurs per') + ' ' + (c.updated || '–') + ' · ' + T('sumber') + ': ' + T(c.source || '–') + ' · ' + T('basis USD');
  }
  async function updateRatesOnline() {
    var btns = [$('btnRatesOnline'), $('btnFx')];
    btns.forEach(function (b) { if (b) b.disabled = true; });
    $('ratesStatus').textContent = T('mengambil…'); $('fxStatus').textContent = T('mengambil…');
    try {
      var j = await api('GET', '/api/rates?refresh=1');
      var R = j.rates;
      KCCur.setRates(R.rates, { updated: R.updated, source: R.source, fetchedAt: R.fetchedAt });
      var msg = j.ok === false ? T(j.error) : (T('Kurs diperbarui') + ': 1 USD = ' + KCCur.money(KCCur.rate('IDR'), 'IDR') + ' (' + T(R.source) + ')');
      $('ratesStatus').textContent = msg; $('fxStatus').textContent = msg;
      if (j.ok !== false) toast('Kurs diperbarui');
    } catch (e) { $('ratesStatus').textContent = e.message; $('fxStatus').textContent = e.message; }
    finally { btns.forEach(function (b) { if (b) b.disabled = false; }); }
  }
  async function syncServerRates() {
    try {
      var j = await api('GET', '/api/rates'), R = j.rates, c = KCCur.get();
      if (R && R.fetchedAt && (!c.fetchedAt || R.fetchedAt > c.fetchedAt) && c.source !== 'manual') {
        KCCur.setRates(R.rates, { updated: R.updated, source: R.source, fetchedAt: R.fetchedAt });
      }
    } catch (e) { /* offline: pakai kurs lokal */ }
  }
  function initCurrency() {
    refreshCurrencyUi();
    document.querySelectorAll('select.cur-select').forEach(function (s) {
      s.addEventListener('change', async function () {
        var v = s.value, c = KCCur.get();
        if (s.dataset.role === 'out') { KCCur.setOut(v); activity('app.currency_change', 'Mata uang output → ' + v); return; }
        var old = c.in; if (v === old) return;
        var r = await dialog({ title: 'Ubah mata uang data input', html: '<p>' + esc(T('Konversi nilai asumsi on-premise yang sudah diisi dari')) + ' <b>' + old + '</b> ' + esc(T('ke')) + ' <b>' + v + '</b> ' + esc(T('dengan kurs saat ini?')) + '</p><p class="muted">' + esc(T('Pilih "Hanya ganti label" bila angka yang Anda isi memang sudah dalam')) + ' ' + v + '.</p>', ok: 'Konversi nilai', cancel: 'Hanya ganti label' });
        var inp = KC.readInput();
        if (r.ok) { Object.keys(inp.op).forEach(function (k) { if (/_idr$/.test(k)) inp.op[k] = Math.round(KCCur.conv(inp.op[k], old, v) * 100) / 100; }); KC.writeInput(inp); }
        KCCur.setIn(v);
        activity('app.currency_change', 'Mata uang input ' + old + ' → ' + v + (r.ok ? ' (dikonversi)' : ' (label)'));
      });
    });
    KCCur.onChange(function (kind) {
      refreshCurrencyUi();
      if (document.querySelector('#tab-currency.active')) renderRates();
      if (KC.last) KC.recompute();
    });
    $('btnRatesOnline').addEventListener('click', updateRatesOnline);
    $('btnRatesReset').addEventListener('click', async function () {
      var r = await dialog({ title: 'Kembalikan kurs bawaan?', html: '<p>' + esc(T('Kurs yang sudah diperbarui atau diedit akan diganti dengan kurs bawaan aplikasi.')) + '</p>', ok: 'Kembalikan' });
      if (!r.ok) return; KCCur.resetRates(); toast('Kurs bawaan dipulihkan');
    });
    $('fx').addEventListener('change', function () { var v = KC.parseNum(this.value); if (v > 0) KCCur.setRates({ IDR: v }, { updated: new Date().toISOString().slice(0, 10) + ' (edit manual)', source: 'manual' }); });
    syncServerRates();
    window.addEventListener('kc:country', suggestCurrency);
  }

  /* ---------------- Backup & restore ---------------- */
  function snapshot() {
    var inp = KC.readInput();
    return { app: 'kalkulator-cloud', type: 'backup', version: 2, createdAt: new Date().toISOString(), by: USER.username, lang: I.lang(),
      currency: KCCur.snapshot(), input: inp, prices: KC.prices, hadResult: !!KC.last };
  }
  function summaryOf(s) { var i = s.input || {}; return (i.custName || '-') + ' · ' + (i.projName || '-') + ' · ' + ((s.currency && s.currency.out) || 'IDR'); }
  function restore(b) {
    if (!b || b.app !== 'kalkulator-cloud' || !(b.input || b.type === 'backup')) throw new Error(T('File bukan backup Kalkulator Cloud yang valid'));
    if (b.prices && !KC.setPrices(b.prices)) throw new Error(T('Data harga di dalam backup tidak valid'));
    if (b.currency) KCCur.replace(b.currency);
    if (b.input) KC.writeInput(b.input);
    if (b.input && b.input.fx) KCCur.syncIdr(b.input.fx);
    refreshCurrencyUi();
    KC.recompute(); KC.switchTab('solusi');
  }
  function download(obj, name) { KCUtil.download(new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' }), name); }
  async function loadBackups() {
    var box = $('bkList'); box.innerHTML = '<p class="muted">' + T('Memuat daftar backup…') + '</p>';
    try {
      var j = await api('GET', '/api/backups');
      if (!j.backups.length) { box.innerHTML = '<div class="empty-small">' + T('Belum ada backup di server.') + '</div>'; return; }
      var h = '<h3>' + T('Backup tersimpan di server') + ' (' + j.backups.length + '/' + j.max + ')</h3><div class="table-wrap"><table><thead><tr><th>' + T('Nama') + '</th><th>' + T('Isi') + '</th><th>' + T('Waktu') + '</th><th class="num">' + T('Ukuran') + '</th><th>' + T('Aksi') + '</th></tr></thead><tbody>';
      j.backups.forEach(function (b) {
        h += '<tr><td data-notr><b>' + esc(b.name) + '</b></td><td class="muted" data-notr>' + esc(b.summary) + '</td><td>' + fmtDate(b.createdAt, true) + '</td><td class="num">' + Math.max(1, Math.round(b.size / 1024)) + ' KB</td>' +
          '<td><div class="actions"><button class="btn small" data-bk-restore="' + b.id + '">' + T('Pulihkan') + '</button><button class="btn ghost small" data-bk-dl="' + b.id + '">' + T('Unduh') + '</button><button class="btn ghost small danger" data-bk-del="' + b.id + '">' + T('Hapus') + '</button></div></td></tr>';
      });
      box.innerHTML = h + '</tbody></table></div>';
      box.querySelectorAll('[data-bk-restore]').forEach(function (btn) { btn.addEventListener('click', async function () {
        var r = await dialog({ title: 'Pulihkan backup?', html: '<p>' + esc(T('Input, data harga, dan pengaturan mata uang saat ini akan diganti dengan isi backup.')) + '</p>', ok: 'Pulihkan' });
        if (!r.ok) return;
        try { var j2 = await api('GET', '/api/backups?id=' + encodeURIComponent(btn.dataset.bkRestore)); restore(j2.backup.data); toast('Backup dipulihkan'); } catch (e) { toast(e.message); }
      }); });
      box.querySelectorAll('[data-bk-dl]').forEach(function (btn) { btn.addEventListener('click', async function () {
        try { var j2 = await api('GET', '/api/backups?id=' + encodeURIComponent(btn.dataset.bkDl)); download(j2.backup.data, 'backup-' + KCUtil.slug(j2.backup.name) + '.json'); } catch (e) { toast(e.message); }
      }); });
      box.querySelectorAll('[data-bk-del]').forEach(function (btn) { btn.addEventListener('click', async function () {
        var r = await dialog({ title: 'Hapus backup ini?', html: '<p>' + esc(T('Backup yang dihapus dari server tidak dapat dikembalikan.')) + '</p>', ok: 'Hapus', danger: true });
        if (!r.ok) return;
        try { await api('DELETE', '/api/backups?id=' + encodeURIComponent(btn.dataset.bkDel)); toast('Backup dihapus'); loadBackups(); } catch (e) { toast(e.message); }
      }); });
    } catch (e) { box.innerHTML = '<div class="empty-small">' + esc(e.message) + '</div>'; }
  }
  function initBackup() {
    $('btnBackupDownload').addEventListener('click', function () {
      var s = snapshot(); download(s, 'backup-kalkulator-cloud-' + KCUtil.slug(s.input.custName) + '-' + new Date().toISOString().slice(0, 10) + '.json');
      activity('app.backup_download', summaryOf(s));
    });
    $('fileBackup').addEventListener('change', function () {
      var f = this.files[0], input = this; if (!f) return;
      var fr = new FileReader();
      fr.onload = async function () {
        input.value = '';
        var b; try { b = JSON.parse(fr.result); } catch (e) { toast('File JSON tidak valid'); return; }
        var r = await dialog({ title: 'Pulihkan dari file?', html: '<p>' + esc(T('Input, data harga, dan pengaturan mata uang saat ini akan diganti dengan isi file')) + ' <b data-notr>' + esc(f.name) + '</b>.</p>', ok: 'Pulihkan' });
        if (!r.ok) return;
        try { restore(b); toast('Backup dipulihkan'); activity('app.backup_restore_file', f.name + ' – ' + summaryOf(b)); } catch (e) { toast(e.message); }
      };
      fr.readAsText(f);
    });
    $('btnBackupServer').addEventListener('click', async function () {
      var s = snapshot(), name = $('bkName').value.trim() || (s.input.custName + ' – ' + new Date().toLocaleString(L()));
      this.disabled = true; $('bkStatus').textContent = T('Menyimpan…');
      try { await api('POST', '/api/backups', { name: name, summary: summaryOf(s), data: s }); $('bkName').value = ''; $('bkStatus').textContent = T('Backup tersimpan di server'); toast('Backup tersimpan di server'); loadBackups(); }
      catch (e) { $('bkStatus').textContent = e.message; }
      finally { this.disabled = false; }
    });
  }

  /* ---------------- Akun saya ---------------- */
  function renderAccount() {
    $('accInfo').innerHTML = '<span>' + T('Nama') + '</span><b data-notr>' + esc(USER.name) + '</b><span>Username</span><b data-notr>' + esc(USER.username) + '</b><span>' + T('Peran') + '</span><b>' + (USER.role === 'admin' ? 'Admin' : T('Pengguna')) + '</b><span>' + T('Berlaku sampai') + '</span><b>' + (USER.validUntil ? fmtDate(USER.validUntil) : T('tanpa batas')) + '</b>';
  }
  function initAccount() {
    $('pwUser').value = USER.username;
    $('pwForm').addEventListener('submit', async function () {
      var cur = $('pwCur').value, n1 = $('pwNew').value, n2 = $('pwNew2').value, st = $('pwStatus');
      if (n1 !== n2) { st.textContent = T('Konfirmasi password baru tidak sama'); return; }
      $('btnPwChange').disabled = true; st.textContent = T('Menyimpan…');
      try { await api('POST', '/api/auth/change-password', { current: cur, next: n1 }); $('pwCur').value = $('pwNew').value = $('pwNew2').value = ''; st.textContent = T('Password berhasil diganti'); toast('Password berhasil diganti'); }
      catch (e) { st.textContent = e.message; }
      finally { $('btnPwChange').disabled = false; }
    });
  }

  function init() {
    initSidebar(); initLangTheme(); initTopbar(); initCurrency(); initBackup(); initAccount(); renderAccount();
    I.observe(document.body);
  }
  window.KCShell = { api: api, activity: activity, dialog: dialog, updateRatesOnline: updateRatesOnline, fmtDate: fmtDate, user: USER };
  document.addEventListener('DOMContentLoaded', init);
})();
