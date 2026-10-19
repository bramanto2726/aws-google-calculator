/* =====================================================================
 * Mata uang: pilihan mata uang output & input, kurs (basis USD),
 * konversi otomatis, format angka uang, update kurs online.
 * ===================================================================== */
(function () {
  'use strict';
  var UID = (window.KC_USER && window.KC_USER.id) || 'anon';
  var LS = 'kc_cur_v1_' + UID;
  var LIST = [
    ['IDR', 'Rupiah Indonesia', 'Rp', 0], ['SGD', 'Dolar Singapura', 'S$', 2], ['MYR', 'Ringgit Malaysia', 'RM', 2],
    ['THB', 'Baht Thailand', '฿', 2], ['PHP', 'Peso Filipina', '₱', 2], ['USD', 'Dolar Amerika Serikat', 'US$', 2]
  ];
  var INFO = {}; LIST.forEach(function (c) { INFO[c[0]] = { code: c[0], name: c[1], sym: c[2], dec: c[3] }; });
  var DEFAULT_RATES = { IDR: 17870, SGD: 1.3, MYR: 4.25, THB: 33, PHP: 58, USD: 1 };
  var DEF = { out: 'IDR', in: 'IDR', rates: Object.assign({}, DEFAULT_RATES), updated: '2026-10-15', source: 'bawaan aplikasi (perkiraan)' };
  var st = load(), subs = [];

  function load() {
    try { var s = JSON.parse(localStorage.getItem(LS) || 'null'); if (s && s.rates && INFO[s.out] && INFO[s.in]) { LIST.forEach(function (c) { if (!(+s.rates[c[0]] > 0)) s.rates[c[0]] = DEFAULT_RATES[c[0]]; }); s.rates.USD = 1; return s; } } catch (e) {}
    return JSON.parse(JSON.stringify(DEF));
  }
  function save() { try { localStorage.setItem(LS, JSON.stringify(st)); } catch (e) {} }
  function emit(kind) { subs.forEach(function (f) { try { f(kind, st); } catch (e) { console.error(e); } }); }
  function L() { return window.KCL ? window.KCL() : 'id-ID'; }
  function rate(c) { return +st.rates[c] || DEFAULT_RATES[c] || 1; }
  /** Konversi nilai dari mata uang `from` ke `to` (lewat USD). */
  function conv(v, from, to) { if (from === to) return +v || 0; return (+v || 0) / rate(from) * rate(to); }
  function sym(c) { return INFO[c || st.out].sym; }
  function dec(c) { return INFO[c || st.out].dec; }
  /** Format nilai yang SUDAH dalam mata uang output. */
  function money(v, c) {
    c = c || st.out; var d = INFO[c].dec;
    return INFO[c].sym + ' ' + (+v || 0).toLocaleString(L(), { minimumFractionDigits: d, maximumFractionDigits: d });
  }
  function units() { return L() === 'en-US' ? [[1e12, ' T'], [1e9, ' B'], [1e6, ' M'], [1e3, ' K']] : [[1e12, ' T'], [1e9, ' M'], [1e6, ' jt'], [1e3, ' rb']]; }
  /** Angka ringkas (jt/M atau M/B) tanpa simbol. minUnit: 1e6 default. */
  function compactNum(v, maxFrac, minUnit) {
    var a = Math.abs(v), U = units(), m = minUnit || 1e6;
    for (var i = 0; i < U.length; i++) if (U[i][0] >= m && a >= U[i][0]) return (v / U[i][0]).toLocaleString(L(), { maximumFractionDigits: maxFrac == null ? (U[i][0] >= 1e9 ? 2 : 1) : maxFrac }) + U[i][1];
    return Math.round(v).toLocaleString(L());
  }
  function compact(v) {
    var a = Math.abs(v);
    if (a < 1e6) return money(v);
    return sym() + ' ' + compactNum(v);
  }
  /** Format angka Excel untuk mata uang output. */
  function xlsxFmt(c) { c = c || st.out; return '"' + INFO[c].sym.replace(/"/g, '') + '"#,##0' + (INFO[c].dec ? '.00' : ''); }

  function setOut(c) { if (!INFO[c] || c === st.out) return; st.out = c; save(); emit('out'); }
  function setIn(c) { if (!INFO[c] || c === st.in) return; st.in = c; save(); emit('in'); }
  function setRate(c, v) { if (!INFO[c] || c === 'USD' || !(+v > 0)) return; st.rates[c] = +v; save(); emit('rates'); }
  function setRates(rates, meta) {
    LIST.forEach(function (c) { if (+rates[c[0]] > 0) st.rates[c[0]] = +rates[c[0]]; });
    st.rates.USD = 1; if (meta) { st.updated = meta.updated || st.updated; st.source = meta.source || st.source; if (meta.fetchedAt) st.fetchedAt = meta.fetchedAt; }
    save(); emit('rates');
  }
  function resetRates() { st.rates = Object.assign({}, DEFAULT_RATES); st.updated = DEF.updated; st.source = DEF.source; save(); emit('rates'); }
  function replace(s) { if (!s || !s.rates) return; st = JSON.parse(JSON.stringify(s)); if (!INFO[st.out]) st.out = 'IDR'; if (!INFO[st.in]) st.in = 'IDR'; st.rates.USD = 1; save(); emit('all'); }

  window.KCCur = {
    LIST: LIST, INFO: INFO, DEFAULT_RATES: DEFAULT_RATES,
    get: function () { return st; }, out: function () { return st.out; }, inp: function () { return st.in; },
    rate: rate, conv: conv, sym: sym, dec: dec, money: money, compact: compact, compactNum: compactNum, xlsxFmt: xlsxFmt,
    syncIdr: function (v) { if (+v > 0 && st.rates.IDR !== +v) { st.rates.IDR = +v; save(); } },
    setOut: setOut, setIn: setIn, setRate: setRate, setRates: setRates, resetRates: resetRates, replace: replace,
    onChange: function (f) { subs.push(f); },
    snapshot: function () { return JSON.parse(JSON.stringify(st)); }
  };
  // dipakai Engine untuk menulis nilai uang di catatan
  window.KCMoney = function (v) { return money(v); };
})();
