/* Inti server: HTTP helper, sesi bertanda tangan (HMAC), hash password (scrypt), pengguna & log aktivitas. */
'use strict';
const crypto = require('crypto');
const S = require('./store');

const K = { users: 'kc:users', logs: 'kc:logs', secret: 'kc:secret', rates: 'kc:rates', backups: uid => 'kc:bk:' + uid, rl: (ip, u) => 'kc:rl:' + ip + ':' + u };
const COOKIE = 'kc_s';
const DEFAULT_ADMIN = { username: 'AdminCoba1', password: 'Trial1!', name: 'Administrator' };
const MAX_LOGS = 2000;

/* ---------------- HTTP ---------------- */
function send(res, status, data, headers) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (headers) Object.keys(headers).forEach(h => res.setHeader(h, headers[h]));
  res.end(JSON.stringify(data));
}
function fail(res, status, code, msg) { send(res, status, { ok: false, code: code, error: msg }); }
async function body(req) {
  if (req.body !== undefined && req.body !== null && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body || '{}'); } catch (e) { return {}; } }
  const chunks = []; let size = 0;
  for await (const c of req) { size += c.length; if (size > 2.5e6) throw new Error('Body terlalu besar'); chunks.push(c); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch (e) { return {}; }
}
function ip(req) { return String(req.headers['x-forwarded-for'] || req.socket && req.socket.remoteAddress || '').split(',')[0].trim() || '-'; }
function parseCookies(req) {
  const o = {}; String(req.headers.cookie || '').split(';').forEach(p => { const i = p.indexOf('='); if (i > 0) o[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); });
  return o;
}
function isHttps(req) { return String(req.headers['x-forwarded-proto'] || '').indexOf('https') === 0 || !!process.env.VERCEL; }
/** Perlindungan CSRF: permintaan yang mengubah data wajib membawa header khusus (tidak bisa dikirim form lintas situs). */
function csrfOk(req) { return req.method === 'GET' || req.method === 'HEAD' || req.headers['x-kc'] === '1'; }
function query(req) { const u = new URL(req.url, 'http://x'); const o = {}; u.searchParams.forEach((v, k) => { o[k] = v; }); return o; }

/* ---------------- Rahasia & token sesi ---------------- */
let SECRET = null;
async function secret() {
  if (SECRET) return SECRET;
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 16) return (SECRET = process.env.SESSION_SECRET);
  let s = await S.get(K.secret);
  if (!s) { await S.setNX(K.secret, crypto.randomBytes(48).toString('base64url')); s = await S.get(K.secret); }
  return (SECRET = s);
}
const b64 = s => Buffer.from(s).toString('base64url');
async function sign(payload) { const p = b64(JSON.stringify(payload)); const mac = crypto.createHmac('sha256', await secret()).update(p).digest('base64url'); return p + '.' + mac; }
async function verify(tok) {
  if (!tok || tok.indexOf('.') < 0) return null;
  const [p, mac] = tok.split('.');
  const exp = crypto.createHmac('sha256', await secret()).update(p).digest('base64url');
  const a = Buffer.from(mac), b = Buffer.from(exp);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try { const o = JSON.parse(Buffer.from(p, 'base64url').toString('utf8')); return o.e > Date.now() ? o : null; } catch (e) { return null; }
}
async function setSession(req, res, user, remember) {
  const ttl = remember ? 30 * 864e5 : 12 * 3600e3;
  const tok = await sign({ u: user.id, v: user.sv || 0, e: Date.now() + ttl, r: remember ? 1 : 0 });
  const parts = [COOKIE + '=' + tok, 'Path=/', 'HttpOnly', 'SameSite=Strict'];
  if (remember) parts.push('Max-Age=' + Math.floor(ttl / 1000));
  if (isHttps(req)) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}
function clearSession(req, res) { res.setHeader('Set-Cookie', COOKIE + '=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0' + (isHttps(req) ? '; Secure' : '')); }

/* ---------------- Password ---------------- */
function hashPw(pw) { const salt = crypto.randomBytes(16).toString('base64url'); const h = crypto.scryptSync(String(pw), salt, 64, { N: 16384, r: 8, p: 1 }).toString('base64url'); return 'scrypt$' + salt + '$' + h; }
function checkPw(pw, stored) {
  if (!stored) return false; const [alg, salt, h] = stored.split('$'); if (alg !== 'scrypt') return false;
  const a = crypto.scryptSync(String(pw), salt, 64, { N: 16384, r: 8, p: 1 }), b = Buffer.from(h, 'base64url');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
/** Aturan password: min. 8 karakter, ada huruf dan angka. */
function pwProblem(pw) {
  pw = String(pw || '');
  if (pw.length < 8) return 'Password minimal 8 karakter';
  if (pw.length > 128) return 'Password terlalu panjang';
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return 'Password harus mengandung huruf dan angka';
  return null;
}
function randomPw() {
  const U = 'ABCDEFGHJKLMNPQRSTUVWXYZ', L = 'abcdefghijkmnopqrstuvwxyz', D = '23456789', Y = '!@#$%*?';
  const all = U + L + D + Y, pick = s => s[crypto.randomInt(s.length)];
  const arr = [pick(U), pick(L), pick(D), pick(Y)]; while (arr.length < 12) arr.push(pick(all));
  for (let i = arr.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [arr[i], arr[j]] = [arr[j], arr[i]]; }
  return arr.join('');
}

/* ---------------- Pengguna ---------------- */
function today() { return new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10); } // WIB
async function allUsers() { const h = await S.hgetall(K.users); return Object.keys(h).map(k => { try { return JSON.parse(h[k]); } catch (e) { return null; } }).filter(Boolean); }
async function getUser(id) { const s = await S.hget(K.users, id); return s ? JSON.parse(s) : null; }
async function saveUser(u) { await S.hset(K.users, u.id, JSON.stringify(u)); return u; }
async function findByUsername(name) { const n = String(name || '').trim().toLowerCase(); return (await allUsers()).find(u => u.username.toLowerCase() === n) || null; }
function newId() { return 'u_' + crypto.randomBytes(8).toString('hex'); }
async function ensureSeed() {
  const n = await S.hlen(K.users);
  if (n > 0) return;
  const u = { id: newId(), name: DEFAULT_ADMIN.name, username: DEFAULT_ADMIN.username, role: 'admin', hash: hashPw(DEFAULT_ADMIN.password), active: true,
    validFrom: '', validUntil: '', mustChange: true, sv: 0, createdAt: new Date().toISOString(), createdBy: 'system', lastLogin: null };
  await saveUser(u);
  await log(null, 'system.seed', 'Akun admin awal dibuat: ' + u.username, '-');
}
/** Status akun: active | inactive | expired | notyet */
function accStatus(u) {
  if (!u.active) return 'inactive';
  const t = today();
  if (u.validFrom && t < u.validFrom) return 'notyet';
  if (u.validUntil && t > u.validUntil) return 'expired';
  return 'active';
}
function publicUser(u) {
  return { id: u.id, name: u.name, username: u.username, role: u.role, active: u.active, validFrom: u.validFrom || '', validUntil: u.validUntil || '',
    mustChange: !!u.mustChange, createdAt: u.createdAt, createdBy: u.createdBy, lastLogin: u.lastLogin, status: accStatus(u) };
}

/* ---------------- Log aktivitas ---------------- */
async function log(user, action, detail, ipAddr) {
  const e = { t: new Date().toISOString(), uid: user ? user.id : null, user: user ? user.username : '-', action: action, detail: String(detail || '').slice(0, 500), ip: ipAddr || '-' };
  try { await S.lpush(K.logs, JSON.stringify(e)); await S.ltrim(K.logs, 0, MAX_LOGS - 1); } catch (err) { /* log tidak boleh menggagalkan permintaan */ }
}

/* ---------------- Guard ---------------- */
/**
 * Ambil pengguna dari cookie sesi. Peran & status SELALU dibaca ulang dari database,
 * sehingga perubahan admin (nonaktif, reset password, turun peran) langsung berlaku.
 * opts.allowMustChange: izinkan akun yang wajib ganti password (hanya endpoint ganti password/me/logout).
 * opts.admin: wajib peran admin.
 */
async function auth(req, res, opts) {
  opts = opts || {};
  try {
    if (!csrfOk(req)) { fail(res, 403, 'csrf', 'Permintaan ditolak'); return null; }
    await ensureSeed();
    const tok = parseCookies(req)[COOKIE];
    const p = await verify(tok);
    if (!p) { fail(res, 401, 'unauth', 'Silakan login'); return null; }
    const u = await getUser(p.u);
    if (!u || (u.sv || 0) !== p.v) { clearSession(req, res); fail(res, 401, 'unauth', 'Sesi berakhir, silakan login kembali'); return null; }
    const st = accStatus(u);
    if (st !== 'active') { clearSession(req, res); fail(res, 403, 'status_' + st, st === 'expired' ? 'Masa berlaku akun telah habis' : st === 'notyet' ? 'Akun belum berlaku' : 'Akun dinonaktifkan'); return null; }
    if (u.mustChange && !opts.allowMustChange) { fail(res, 403, 'must_change', 'Anda wajib mengganti password terlebih dahulu'); return null; }
    if (opts.admin && u.role !== 'admin') { await log(u, 'security.denied', 'Akses admin ditolak: ' + req.method + ' ' + req.url, ip(req)); fail(res, 403, 'forbidden', 'Hanya admin yang boleh mengakses fitur ini'); return null; }
    return u;
  } catch (e) {
    if (e instanceof S.StoreError) { fail(res, 503, 'store', e.message); return null; }
    throw e;
  }
}
/** Bungkus handler: tangani error tak terduga & error storage. */
function handler(fn) {
  return async function (req, res) {
    try { await fn(req, res); }
    catch (e) {
      console.error(e);
      if (res.headersSent) return;
      if (e instanceof S.StoreError) fail(res, 503, 'store', e.message);
      else fail(res, 500, 'server', 'Terjadi kesalahan server');
    }
  };
}

module.exports = { K, S, COOKIE, DEFAULT_ADMIN, send, fail, body, ip, query, csrfOk, setSession, clearSession, hashPw, checkPw, pwProblem, randomPw,
  today, allUsers, getUser, saveUser, findByUsername, newId, ensureSeed, accStatus, publicUser, log, auth, handler, parseCookies, verify };
