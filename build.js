#!/usr/bin/env node
/* Rakit aplikasi:
 *  - private/app.html  : aplikasi utama (hanya disajikan oleh /api/app setelah login)
 *  - public/i18n.js, public/login-dict.js : untuk halaman login publik
 * Jalankan: node build.js  (otomatis dijalankan Vercel saat deploy) */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = __dirname, SRC = path.join(ROOT, 'src');
const read = f => fs.readFileSync(path.join(SRC, f), 'utf8');
const safe = js => js.replace(/<\/script/gi, '<\\/script');
const put = (html, marker, content) => { if (html.indexOf(marker) < 0) throw new Error('Marker tidak ditemukan: ' + marker); return html.split(marker).join(content); };

// Bila ada file sumber yang tidak ikut terunggah, pakai hasil build yang sudah ada di repo (api/_lib/app-html.js)
const NEED = ['index.html', 'styles.css', 'i18n.js', 'dict-en-engine.js', 'dict-en-app.js', 'dict-en-shell.js', 'dict-en-region.js',
  'engine.js', 'online.js', 'currency.js', 'app.js', 'exporter.js', 'shell.js', 'admin.js'];
const missing = NEED.filter(f => !fs.existsSync(path.join(SRC, f)));
if (missing.length || !fs.existsSync(path.join(ROOT, 'data', 'prices.json'))) {
  const prebuilt = ['api/_lib/app-html.js', 'public/i18n.js', 'public/login-dict.js'].filter(f => !fs.existsSync(path.join(ROOT, f)));
  console.warn('PERINGATAN: file sumber tidak lengkap (' + (missing.join(', ') || 'data/prices.json') + '). Build dilewati, memakai hasil build yang sudah ada.');
  if (prebuilt.length) { console.error('GAGAL: file hasil build juga tidak ada: ' + prebuilt.join(', ') + '. Unggah ulang semua folder (api/_lib, public, src, data).'); process.exit(1); }
  process.exit(0);
}

const dicts = ['dict-en-engine.js', 'dict-en-app.js', 'dict-en-shell.js', 'dict-en-region.js'].map(read).join('\n');
const prices = JSON.stringify(JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'prices.json'), 'utf8')));
const app = ['engine.js', 'online.js', 'currency.js', 'app.js', 'exporter.js', 'shell.js'].map(read).join('\n');

let html = read('index.html');
html = put(html, '/*__CSS__*/', read('styles.css'));
html = put(html, '/*__I18N__*/', safe(read('i18n.js') + '\n' + dicts));
html = put(html, '/*__PRICES__*/', safe(prices));
html = put(html, '/*__APP__*/', safe(app));
html = put(html, '/*__ADMIN__*/', safe(read('admin.js')));

// HTML aplikasi disimpan sebagai modul JS agar otomatis ikut ter-bundle di serverless function /api/app
fs.writeFileSync(path.join(ROOT, 'api', '_lib', 'app-html.js'), '/* DIBUAT OTOMATIS oleh build.js — jangan diedit manual */\nmodule.exports = ' + JSON.stringify(html) + ';\n');
fs.writeFileSync(path.join(ROOT, 'public', 'i18n.js'), read('i18n.js'));
fs.writeFileSync(path.join(ROOT, 'public', 'login-dict.js'), read('dict-en-shell.js'));
console.log('OK api/_lib/app-html.js (' + Math.round(html.length / 1024) + ' KB), public/i18n.js, public/login-dict.js');
