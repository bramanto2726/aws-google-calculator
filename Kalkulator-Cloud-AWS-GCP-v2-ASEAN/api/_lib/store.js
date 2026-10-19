/* Penyimpanan data server.
 * Produksi (Vercel): Upstash Redis via REST API (Vercel Marketplace → Upstash / "KV").
 *   Env yang dikenali: KV_REST_API_URL + KV_REST_API_TOKEN, atau UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN.
 * Pengembangan lokal: file JSON di .data/db.json (otomatis bila env Redis tidak ada dan bukan di Vercel).
 */
'use strict';
const fs = require('fs');
const path = require('path');

/* Cari env Redis REST; Vercel bisa memberi awalan nama (mis. "namaproject_KV_REST_API_URL"). */
function env(suffixes) {
  for (const sfx of suffixes) if (process.env[sfx]) return process.env[sfx];
  const keys = Object.keys(process.env).sort();
  for (const sfx of suffixes) { const k = keys.find(n => n.endsWith('_' + sfx) && process.env[n]); if (k) return process.env[k]; }
  return '';
}
const URL_ = env(['KV_REST_API_URL', 'UPSTASH_REDIS_REST_URL']);
const TOKEN = env(['KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_TOKEN']); // token tulis (bukan READ_ONLY)
const ON_VERCEL = !!process.env.VERCEL;

class StoreError extends Error {}

/* ---------------- Redis REST ---------------- */
async function redis(args) {
  const r = await fetch(URL_.replace(/\/$/, ''), {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(args.map(a => (typeof a === 'number' ? String(a) : a)))
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new StoreError('Redis: ' + (j.error || r.status));
  return j.result;
}

/* ---------------- File store (lokal) ---------------- */
const DB_FILE = path.join(process.cwd(), '.data', 'db.json');
let mem = null;
function load() {
  if (mem) return mem;
  try { mem = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch (e) { mem = {}; }
  return mem;
}
function persist() {
  try { fs.mkdirSync(path.dirname(DB_FILE), { recursive: true }); fs.writeFileSync(DB_FILE, JSON.stringify(mem)); } catch (e) { /* abaikan */ }
}
function expired(k) { const e = mem['__exp:' + k]; if (e && e < Date.now()) { delete mem[k]; delete mem['__exp:' + k]; return true; } return false; }
async function local(args) {
  load();
  const [c, k, ...a] = args; const C = c.toUpperCase();
  if (k) expired(k);
  let res = null;
  switch (C) {
    case 'GET': res = typeof mem[k] === 'string' ? mem[k] : null; break;
    case 'SET': {
      const nx = a.includes('NX'); if (nx && mem[k] != null) { res = null; break; }
      mem[k] = String(a[0]); delete mem['__exp:' + k];
      const ex = a.indexOf('EX'); if (ex >= 0) mem['__exp:' + k] = Date.now() + Number(a[ex + 1]) * 1000;
      res = 'OK'; break;
    }
    case 'DEL': res = mem[k] != null ? 1 : 0; delete mem[k]; delete mem['__exp:' + k]; break;
    case 'INCR': mem[k] = String((parseInt(mem[k] || '0', 10) || 0) + 1); res = Number(mem[k]); break;
    case 'EXPIRE': if (mem[k] != null) mem['__exp:' + k] = Date.now() + Number(a[0]) * 1000; res = 1; break;
    case 'HGET': res = (mem[k] && mem[k][a[0]] != null) ? mem[k][a[0]] : null; break;
    case 'HSET': mem[k] = mem[k] || {}; for (let i = 0; i < a.length; i += 2) mem[k][a[i]] = String(a[i + 1]); res = 1; break;
    case 'HDEL': res = mem[k] && mem[k][a[0]] != null ? 1 : 0; if (mem[k]) delete mem[k][a[0]]; break;
    case 'HGETALL': { const o = mem[k] || {}; res = []; Object.keys(o).forEach(x => res.push(x, o[x])); break; }
    case 'HLEN': res = Object.keys(mem[k] || {}).length; break;
    case 'LPUSH': mem[k] = mem[k] || []; a.forEach(v => mem[k].unshift(String(v))); res = mem[k].length; break;
    case 'LTRIM': mem[k] = (mem[k] || []).slice(Number(a[0]), Number(a[1]) + 1); res = 'OK'; break;
    case 'LRANGE': { const l = mem[k] || []; const s = Number(a[0]), e = Number(a[1]); res = l.slice(s, e < 0 ? l.length + e + 1 : e + 1); break; }
    default: throw new StoreError('Perintah tidak didukung: ' + C);
  }
  if (!/^(GET|HGET|HGETALL|HLEN|LRANGE)$/.test(C)) persist();
  return res;
}

function mode() { return URL_ && TOKEN ? 'redis' : (ON_VERCEL ? 'none' : 'file'); }
async function cmd(...args) {
  const m = mode();
  if (m === 'redis') return redis(args);
  if (m === 'file') return local(args);
  throw new StoreError('Penyimpanan server belum dikonfigurasi. Hubungkan Upstash Redis (Vercel → Storage / Marketplace) lalu redeploy.');
}

function hashToObj(arr) { const o = {}; if (Array.isArray(arr)) for (let i = 0; i < arr.length; i += 2) o[arr[i]] = arr[i + 1]; else if (arr) Object.assign(o, arr); return o; }

module.exports = {
  mode, StoreError,
  get: k => cmd('GET', k),
  set: (k, v, ex) => (ex ? cmd('SET', k, v, 'EX', ex) : cmd('SET', k, v)),
  setNX: (k, v) => cmd('SET', k, v, 'NX'),
  del: k => cmd('DEL', k),
  incr: k => cmd('INCR', k),
  expire: (k, s) => cmd('EXPIRE', k, s),
  hget: (k, f) => cmd('HGET', k, f),
  hset: (k, f, v) => cmd('HSET', k, f, v),
  hdel: (k, f) => cmd('HDEL', k, f),
  hgetall: async k => hashToObj(await cmd('HGETALL', k)),
  hlen: k => cmd('HLEN', k),
  lpush: (k, v) => cmd('LPUSH', k, v),
  ltrim: (k, a, b) => cmd('LTRIM', k, a, b),
  lrange: (k, a, b) => cmd('LRANGE', k, a, b)
};
