/* =====================================================================
 * Dwibahasa (Indonesia / English)
 * Teks sumber aplikasi berbahasa Indonesia. Saat bahasa = EN, setiap teks
 * di layar (dan di file ekspor) diterjemahkan per frasa memakai kamus.
 * ===================================================================== */
(function () {
  'use strict';
  var LS = 'kc_lang';
  var LANG = 'id';
  try { LANG = localStorage.getItem(LS) === 'en' ? 'en' : 'id'; } catch (e) {}
  var IDX = Object.create(null); // char pertama -> [[kunci, terjemahan], ...] (terpanjang dulu)
  var NT_A = '⁣', NT_B = '⁤'; // penanda teks yang tidak boleh diterjemahkan (data pengguna)
  var WORD = /[0-9A-Za-zÀ-ɏ]/;
  function isW(c) { return !!c && WORD.test(c); }
  function lf(s) { return s.charAt(0).toLowerCase() + s.slice(1); }
  function uf(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function reg(k, v) {
    if (!k || v == null || k === v) return;
    var c = k.charAt(0), a = IDX[c] || (IDX[c] = []);
    for (var i = 0; i < a.length; i++) if (a[i][0] === k) return; // pertama menang
    a.push([k, v]);
  }
  function add(dict) {
    Object.keys(dict).forEach(function (k) { reg(k, dict[k]); });
    Object.keys(dict).forEach(function (k) {
      var v = dict[k];
      if (/^[A-Z][a-z]/.test(k)) reg(lf(k), /^[A-Z][a-z]/.test(v) ? lf(v) : v);
      else if (/^[a-z]/.test(k)) reg(uf(k), uf(v));
    });
    Object.keys(IDX).forEach(function (c) { IDX[c].sort(function (x, y) { return y[0].length - x[0].length; }); });
  }
  function strip(s) { return s.indexOf(NT_A) >= 0 || s.indexOf(NT_B) >= 0 ? s.replace(/[⁣⁤]/g, '') : s; }
  function tr(s, keep) {
    if (s == null) return s;
    s = String(s);
    if (LANG !== 'en' || !/[A-Za-z]/.test(s)) return keep ? s : strip(s);
    var out = '', i = 0, n = s.length;
    while (i < n) {
      var ch = s.charAt(i);
      if (ch === NT_A) { var e = s.indexOf(NT_B, i + 1); if (e < 0) e = n; out += keep ? s.slice(i, e + 1) : s.slice(i + 1, e); i = e + 1; continue; }
      var cand = IDX[ch], hit = null;
      if (cand && (!isW(ch) || !isW(s.charAt(i - 1)))) {
        for (var j = 0; j < cand.length; j++) {
          var k = cand[j][0];
          if (s.startsWith(k, i)) {
            var after = s.charAt(i + k.length);
            if (!isW(k.charAt(k.length - 1)) || !isW(after)) { hit = cand[j]; break; }
          }
        }
      }
      if (hit) { out += hit[1]; i += hit[0].length; }
      else { out += ch; i++; }
    }
    out = post(out);
    return keep ? out : strip(out);
  }
  /* Perbaikan tata bahasa Inggris setelah terjemahan frasa (jamak/tunggal) */
  function post(s) {
    return s.replace(/\b(\d+) (Month|Year)\b(?!s)/g, function (m, n, w) { return n + ' ' + w + (n === '1' ? '' : 's'); })
      .replace(/\b1 (month|year|hour|day|minute)s\b/g, '1 $1');
  }
  /** Terjemahkan isi teks di dalam string SVG/HTML (bukan atributnya). */
  function trMarkup(html) {
    if (LANG !== 'en') return html;
    return String(html).replace(/>([^<]+)</g, function (m, t) {
      var raw = t.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
      return '>' + tr(raw).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '<';
    });
  }
  /** Terjemahkan semua string di dalam objek/array (untuk model laporan). */
  function trDeep(o, keep) {
    if (typeof o === 'string') return tr(o, keep);
    if (Array.isArray(o)) return o.map(function (x) { return trDeep(x, keep); });
    if (o && typeof o === 'object' && Object.getPrototypeOf(o) === Object.prototype) { var r = {}; Object.keys(o).forEach(function (k) { r[k] = trDeep(o[k], keep); }); return r; }
    return o;
  }
  function NT(s) { return NT_A + String(s == null ? '' : s) + NT_B; }

  /* ---------------- DOM ---------------- */
  var TXT = new WeakMap(), ATT = new WeakMap(), ATTRS = ['title', 'placeholder', 'aria-label'];
  function skip(el) { return el && el.closest && el.closest('script,style,textarea,[data-notr]'); }
  function doText(node) {
    var cur = node.nodeValue; if (!cur || !/[A-Za-z⁣]/.test(cur)) return;
    var rec = TXT.get(node), src = rec && rec.out === cur ? rec.src : cur, out = tr(src);
    TXT.set(node, { src: src, out: out });
    if (out !== cur) node.nodeValue = out;
  }
  function doAttrs(el) {
    var m = ATT.get(el); if (!m) { m = {}; ATT.set(el, m); }
    ATTRS.forEach(function (a) {
      if (!el.hasAttribute(a)) return;
      var cur = el.getAttribute(a), rec = m[a], src = rec && rec.out === cur ? rec.src : cur, out = tr(src);
      m[a] = { src: src, out: out };
      if (out !== cur) el.setAttribute(a, out);
    });
  }
  function apply(root) {
    if (!root) return;
    if (root.nodeType === 3) { if (!skip(root.parentNode)) doText(root); return; }
    if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;
    if (root.nodeType === 1) { if (skip(root)) return; doAttrs(root); }
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
      acceptNode: function (n) { if (n.nodeType === 1) return /^(SCRIPT|STYLE|TEXTAREA)$/.test(n.tagName) || n.hasAttribute('data-notr') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT; return NodeFilter.FILTER_ACCEPT; }
    });
    var n; while ((n = w.nextNode())) { if (n.nodeType === 3) doText(n); else doAttrs(n); }
  }
  var pending = [], scheduled = false;
  function flush() { scheduled = false; var list = pending; pending = []; list.forEach(apply); }
  function observe(root) {
    root = root || document.body;
    apply(root);
    new MutationObserver(function (muts) {
      muts.forEach(function (m) {
        if (m.type === 'characterData') pending.push(m.target);
        else if (m.type === 'attributes') pending.push(m.target);
        else m.addedNodes.forEach(function (x) { pending.push(x); });
      });
      if (!scheduled) { scheduled = true; (window.queueMicrotask || setTimeout)(flush); }
    }).observe(root, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }
  function setLang(l) {
    l = l === 'en' ? 'en' : 'id';
    if (l === LANG) return;
    LANG = l;
    try { localStorage.setItem(LS, l); } catch (e) {}
    document.documentElement.lang = l;
    apply(document.body);
    document.title = tr(document.documentElement.getAttribute('data-title') || document.title);
    try { window.dispatchEvent(new CustomEvent('kc:lang', { detail: l })); } catch (e) {}
  }
  window.KCI18n = {
    add: add, tr: tr, trMarkup: trMarkup, trDeep: trDeep, NT: NT, observe: observe, apply: apply, setLang: setLang,
    lang: function () { return LANG; }, locale: function () { return LANG === 'en' ? 'en-US' : 'id-ID'; }
  };
  window.T = tr;
  window.KCL = function () { return LANG === 'en' ? 'en-US' : 'id-ID'; };
  if (document.documentElement) document.documentElement.lang = LANG;
})();
