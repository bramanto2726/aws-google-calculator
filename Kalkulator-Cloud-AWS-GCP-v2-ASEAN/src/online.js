/* =====================================================================
 * Update online harga & katalog — langsung dari browser, tanpa skrip
 *  - AWS  : AWS Price List Bulk API (pricing.us-east-1.amazonaws.com), publik, tanpa kredensial
 *  - GCP  : pricing.yml (Cyclenerd/google-cloud-pricing-cost-calculator, dibangkitkan harian
 *           dari Google Cloud Billing Catalog API resmi), publik via raw.githubusercontent.com
 *  - Kurs : open.er-api.com
 * ===================================================================== */
(function (root) {
  'use strict';
  var AWS_BASE = 'https://pricing.us-east-1.amazonaws.com';
  var GCP_YML = 'https://raw.githubusercontent.com/Cyclenerd/google-cloud-pricing-cost-calculator/master/pricing.yml';
  var FX_URL = 'https://open.er-api.com/v6/latest/USD';
  var HRS = 730;

  /* ------------------------------ util ------------------------------ */
  function parseCsvLine(line) {
    var out = [], i = 0, n = line.length, cur = '', q = false;
    while (i < n) {
      var ch = line.charCodeAt(i);
      if (q) {
        if (ch === 34) { if (line.charCodeAt(i + 1) === 34) { cur += '"'; i += 2; continue; } q = false; i++; continue; }
        cur += line[i]; i++;
      } else {
        if (ch === 34) { q = true; i++; }
        else if (ch === 44) { out.push(cur); cur = ''; i++; }
        else { cur += line[i]; i++; }
      }
    }
    out.push(cur.replace(/\r$/, ''));
    return out;
  }
  function median(a) { if (!a.length) return null; a = a.slice().sort(function (x, y) { return x - y; }); var m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; }
  function r6(v) { return Math.round(v * 1e6) / 1e6; }
  function memGb(s) { var m = String(s || '').match(/([\d.,]+)\s*GiB/i); return m ? +m[1].replace(',', '') : null; }

  // Unduh CSV secara streaming; filter cepat per baris sebelum di-parse penuh.
  async function streamCsv(url, prefilter, onRow, ctx) {
    var resp = await fetch(url, { signal: ctx.signal });
    if (!resp.ok) throw new Error('HTTP ' + resp.status + ' untuk ' + url);
    var total = +resp.headers.get('content-length') || 0, got = 0;
    var reader = resp.body.getReader(), dec = new TextDecoder(), buf = '', lineNo = 0, idx = null;
    function handle(line) {
      lineNo++;
      if (lineNo <= 5) return;
      if (lineNo === 6) { idx = {}; parseCsvLine(line).forEach(function (h, i) { idx[h] = i; }); return; }
      if (!line || !prefilter(line)) return;
      var f = parseCsvLine(line);
      if (idx.TermType != null && f[idx.TermType] !== 'OnDemand') return;
      onRow(function (name) { var i = idx[name]; return i == null ? '' : f[i]; });
    }
    for (;;) {
      var r = await reader.read();
      if (r.done) break;
      got += r.value.length; ctx.bytes(r.value.length, total);
      buf += dec.decode(r.value, { stream: true });
      var parts = buf.split('\n'); buf = parts.pop();
      for (var k = 0; k < parts.length; k++) handle(parts[k]);
    }
    buf += dec.decode(); if (buf) handle(buf);
    return got;
  }
  async function regionUrl(svc, reg, cache, ctx) {
    if (!cache[svc]) cache[svc] = await (await fetch(AWS_BASE + '/offers/v1.0/aws/' + svc + '/current/region_index.json', { signal: ctx.signal })).json();
    var r = cache[svc].regions[reg];
    return r ? AWS_BASE + r.currentVersionUrl.replace(/\.json$/, '.csv') : null;
  }
  async function headSize(url, ctx) { try { var h = await fetch(url, { method: 'HEAD', signal: ctx.signal }); return +h.headers.get('content-length') || 0; } catch (e) { return 0; } }

  /* ------------------------------ AWS ------------------------------ */
  async function fetchAwsRegion(reg, opt, cache, ctx) {
    var R = { ec2: {}, rds: {}, prices: {}, egress: [] };
    var OD = '"OnDemand"';
    // Data transfer keluar internet (bertingkat)
    var u = await regionUrl('AWSDataTransfer', reg, cache, ctx);
    if (u) await streamCsv(u, function (l) { return l.indexOf(OD) > 0 && l.indexOf('DataTransfer-Out-Bytes') > 0; }, function (g) {
      if (g('Transfer Type') !== 'AWS Outbound' || g('To Location') !== 'External' || g('Unit') !== 'GB') return;
      if (!/^([A-Z]{2,4}\d+-)?DataTransfer-Out-Bytes$/.test(g('usageType'))) return;
      var end = g('EndingRange'); R.egress.push({ start: +g('StartingRange'), upto_gb: end === 'Inf' ? null : +end, price: +g('PricePerUnit') });
    }, ctx);
    // Load balancer
    u = await regionUrl('AWSELB', reg, cache, ctx);
    if (u) await streamCsv(u, function (l) { return l.indexOf(OD) > 0 && l.indexOf('Load Balancer-Application') > 0; }, function (g) {
      var ut = g('usageType');
      if (g('Location Type') !== 'AWS Region' || g('operation') !== 'LoadBalancing:Application') return;
      if (/^([A-Z]{2,4}\d+-)?LoadBalancerUsage$/.test(ut) && g('Unit') === 'Hrs') R.prices.lb_hr = +g('PricePerUnit');
      if (/^([A-Z]{2,4}\d+-)?LCUUsage$/.test(ut)) R.prices.lb_unit_hr = +g('PricePerUnit');
    }, ctx);
    // S3
    u = await regionUrl('AmazonS3', reg, cache, ctx);
    if (u) await streamCsv(u, function (l) { return l.indexOf(OD) > 0 && l.indexOf('TimedStorage') > 0; }, function (g) {
      var ut = g('usageType');
      if (/^([A-Z]{2,4}\d+-)?TimedStorage-ByteHrs$/.test(ut) && g('Volume Type') === 'Standard' && g('StartingRange') === '0') R.prices.object_gb = +g('PricePerUnit');
      if (/TimedStorage-GDA-ByteHrs$/.test(ut)) R.prices.archive_gb = +g('PricePerUnit');
    }, ctx);
    // VPN site-to-site
    u = await regionUrl('AmazonVPC', reg, cache, ctx);
    if (u) await streamCsv(u, function (l) { return l.indexOf(OD) > 0 && l.indexOf('VPN-Usage-Hours') > 0; }, function (g) {
      if (g('operation') === 'CreateVpnConnection') R.prices.vpn_hr = +g('PricePerUnit');
    }, ctx);
    // RDS (MySQL Single-AZ sebagai acuan)
    u = await regionUrl('AmazonRDS', reg, cache, ctx);
    if (u) await streamCsv(u, function (l) { return l.indexOf(OD) > 0 && l.indexOf('"MySQL"') > 0 && l.indexOf('"Single-AZ"') > 0; }, function (g) {
      var pf = g('Product Family');
      if (pf === 'Database Instance' && g('Unit') === 'Hrs' && /^No license required$/i.test(g('License Model')) && /^([A-Z]{2,4}\d+-)?InstanceUsage:db\./.test(g('usageType'))) {
        var t = g('Instance Type'); if (t) R.rds[t] = { price: +g('PricePerUnit'), vcpu: +g('vCPU'), ram: memGb(g('Memory')) };
      }
      if (pf === 'Database Storage' && g('Volume Type') === 'General Purpose-GP3' && /^([A-Z]{2,4}\d+-)?RDS:GP3-Storage$/.test(g('usageType'))) R.prices.db_storage_gb = +g('PricePerUnit');
    }, ctx);
    // EC2 (file besar) – instans Linux on-demand, EBS gp3, snapshot, NAT Gateway
    if (opt.ec2) {
      u = await regionUrl('AmazonEC2', reg, cache, ctx);
      ctx.log('  EC2 ' + reg + ': mengunduh & memindai daftar harga (file besar)…');
      if (u) await streamCsv(u, function (l) {
        return l.indexOf(OD) > 0 && (l.indexOf('"Compute Instance"') > 0 ? (l.indexOf('"Linux"') > 0 && l.indexOf('"Shared"') > 0) : (l.indexOf('"Storage"') > 0 || l.indexOf('Snapshot') > 0 || l.indexOf('NatGateway') > 0));
      }, function (g) {
        var pf = g('Product Family');
        if (pf === 'Compute Instance') {
          if (g('Operating System') !== 'Linux' || g('Tenancy') !== 'Shared' || g('Pre Installed S/W') !== 'NA' || g('CapacityStatus') !== 'Used' || g('Unit') !== 'Hrs') return;
          if (g('operation') !== 'RunInstances' || !/^([A-Z]{2,4}\d+-)?BoxUsage:/.test(g('usageType'))) return;
          var p = +g('PricePerUnit'); if (!(p > 0)) return;
          R.ec2[g('Instance Type')] = { price: p, vcpu: +g('vCPU'), ram: memGb(g('Memory')), gpu: g('GPU') };
        } else if (pf === 'Storage' && g('Volume API Name') === 'gp3' && g('Unit') === 'GB-Mo') R.prices.block_gb = +g('PricePerUnit');
        else if (pf === 'Storage Snapshot' && /EBS:SnapshotUsage$/.test(g('usageType'))) R.prices.backup_gb = +g('PricePerUnit');
        else if (/^([A-Z]{2,4}\d+-)?NatGateway-Hours$/.test(g('usageType'))) R.prices.nat_hr = +g('PricePerUnit');
        else if (/^([A-Z]{2,4}\d+-)?NatGateway-Bytes$/.test(g('usageType'))) R.prices.nat_gb = +g('PricePerUnit');
      }, ctx);
    }
    R.egress.sort(function (a, b) { return a.start - b.start; });
    return R;
  }

  // nilai lama efektif (harga region tersimpan, atau turunan basis × pengali) untuk ringkasan perubahan
  var KLABEL = { block_gb: 'Disk blok (USD/GB-bln)', db_storage_gb: 'Storage database (USD/GB-bln)', object_gb: 'Object storage (USD/GB-bln)', archive_gb: 'Arsip (USD/GB-bln)', backup_gb: 'Snapshot/backup (USD/GB-bln)',
    lb_hr: 'Load balancer (USD/jam)', lb_unit_hr: 'LCU load balancer (USD/jam)', nat_hr: 'NAT gateway (USD/jam)', nat_gb: 'NAT data (USD/GB)', nat_hr_per_vm: 'Cloud NAT per VM (USD/jam)', nat_hr_max: 'Cloud NAT maks. (USD/jam)', vpn_hr: 'VPN (USD/jam)' };
  function kl(k, rid) { return (KLABEL[k] || k) + ' – ' + rid; }
  function derived(D, R, k) {
    if (R.prices && R.prices[k] != null) return R.prices[k];
    var st = { block_gb: 1, db_storage_gb: 1, object_gb: 1, archive_gb: 1, backup_gb: 1 }, lb = { lb_hr: 1, lb_unit_hr: 1 };
    var base = st[k] ? D.storage[k] : D.network[k];
    if (base == null) return null;
    return Math.round(base * (st[k] ? R.mult.storage : lb[k] ? R.mult.lb : R.mult.other) * 1e6) / 1e6;
  }
  function nextGen(type) { var m = type.match(/^(db\.)?([a-z])(\d+)([a-z]*)\.(.+)$/); return m ? { pre: m[1] || '', fam: m[2], gen: +m[3], suf: m[4], size: m[5] } : null; }

  function applyAws(P, data, opt, ctx, changes) {
    var D = P.aws, regs = Object.keys(data), US = data['us-east-1'];
    function note(what, oldV, newV) { if (oldV == null || Math.abs(oldV - newV) > 1e-9) changes.push({ prov: 'AWS', item: what, old: oldV, val: newV }); }
    // ---- katalog: generasi terbaru
    if (opt.catalog && opt.ec2) {
      [['compute', 'c'], ['general', 'm'], ['memory', 'r']].forEach(function (fr) {
        var cur = D.compute.filter(function (x) { return x.family === fr[0]; });
        if (!cur.length) return;
        var g0 = nextGen(cur[0].type); if (!g0) return;
        var sizes = cur.map(function (x) { return nextGen(x.type).size; });
        for (var gen = g0.gen + 3; gen > g0.gen; gen--) {
          var ok = sizes.every(function (sz) { return regs.every(function (rg) { return data[rg].ec2[fr[1] + gen + g0.suf + '.' + sz]; }); });
          if (!ok) continue;
          var items = sizes.map(function (sz) {
            var t = fr[1] + gen + g0.suf + '.' + sz, any = data[regs[0]].ec2[t];
            return { type: t, family: fr[0], vcpu: any.vcpu, ram: any.ram, hourly: 0 };
          });
          D.compute = D.compute.filter(function (x) { return x.family !== fr[0]; }).concat(items);
          changes.push({ prov: 'AWS', item: 'Katalog ' + fr[0] + ': ' + cur[0].type.split('.')[0] + ' → ' + fr[1] + gen + g0.suf, old: null, val: null, catalog: true });
          break;
        }
      });
      [['general', 'm'], ['memory', 'r']].forEach(function (fr) {
        var cur = D.db.filter(function (x) { return x.family === fr[0]; });
        if (!cur.length) return;
        var g0 = nextGen(cur[0].type); if (!g0) return;
        var sizes = cur.map(function (x) { return nextGen(x.type).size; });
        for (var gen = g0.gen + 3; gen > g0.gen; gen--) {
          var ok = sizes.every(function (sz) { return regs.every(function (rg) { return data[rg].rds['db.' + fr[1] + gen + g0.suf + '.' + sz]; }); });
          if (!ok) continue;
          var items = sizes.map(function (sz) { var t = 'db.' + fr[1] + gen + g0.suf + '.' + sz, any = data[regs[0]].rds[t]; return { type: t, family: fr[0], vcpu: any.vcpu, ram: any.ram, hourly: 0 }; });
          D.db = D.db.filter(function (x) { return x.family !== fr[0]; }).concat(items);
          changes.push({ prov: 'AWS', item: 'Katalog database ' + fr[0] + ': ' + cur[0].type.split('.').slice(0, 2).join('.') + ' → db.' + fr[1] + gen + g0.suf, old: null, val: null, catalog: true });
          break;
        }
      });
    }
    // ---- harga instans per region
    function priceList(list, key, multKey) {
      var ratios = {};
      list.forEach(function (it) {
        it.byRegion = it.byRegion || {};
        regs.forEach(function (rg) { var d = data[rg][key][it.type]; if (d) it.byRegion[rg] = d.price; });
        var usP = US && US[key][it.type] ? US[key][it.type].price : null;
        if (usP != null) { note(it.type + ' (US, USD/jam)', it.hourly || null, usP); it.hourly = usP; }
        regs.forEach(function (rg) { if (rg !== 'us-east-1' && it.byRegion[rg] && it.hourly) (ratios[rg] = ratios[rg] || []).push(it.byRegion[rg] / it.hourly); });
      });
      P.regions.aws.forEach(function (R) {
        var m = median(ratios[R.id] || []);
        if (m) { m = Math.round(m * 1000) / 1000; note('Pengali harga ' + multKey + ' – ' + R.id, R.mult[multKey], m); R.mult[multKey] = m; }
        if (R.id === 'us-east-1' && US) R.mult[multKey] = 1;
      });
      // item tanpa harga US: turunkan dari region pertama yang ada
      list.forEach(function (it) {
        if (it.hourly) return;
        var R0 = P.regions.aws.filter(function (R) { return it.byRegion[R.id]; })[0];
        if (R0) it.hourly = r6(it.byRegion[R0.id] / (R0.mult[multKey] || 1));
      });
    }
    if (opt.ec2) priceList(D.compute, 'ec2', 'compute');
    priceList(D.db, 'rds', 'db');
    // ---- harga per region (storage, jaringan)
    P.regions.aws.forEach(function (R) {
      var d = data[R.id]; if (!d) return;
      R.prices = R.prices || {};
      Object.keys(d.prices).forEach(function (k) { if (d.prices[k] > 0 || k === 'nat_gb') { note(kl(k, R.id), derived(D, R, k), d.prices[k]); R.prices[k] = d.prices[k]; } });
      if (d.egress.length) {
        var tiers = d.egress.filter(function (t) { return t.price > 0; }).map(function (t) { return { upto_gb: t.upto_gb, price: t.price }; });
        if (tiers.length) { note('Egress internet tier-1 (USD/GB) – ' + R.id, R.egress[0].price, tiers[0].price); R.egress = tiers; }
      }
    });
    if (US) ['block_gb', 'object_gb', 'db_storage_gb', 'archive_gb', 'backup_gb'].forEach(function (k) { if (US.prices[k]) D.storage[k] = US.prices[k]; });
    if (US) { if (US.prices.lb_hr) D.network.lb_hr = US.prices.lb_hr; if (US.prices.lb_unit_hr) D.network.lb_unit_hr = US.prices.lb_unit_hr; if (US.prices.nat_hr) D.network.nat_hr = US.prices.nat_hr; if (US.prices.nat_gb) D.network.nat_gb = US.prices.nat_gb; if (US.prices.vpn_hr) D.network.vpn_hr = US.prices.vpn_hr; }
  }

  async function updateAws(P, opt, ctx, changes) {
    var regs = P.regions.aws.map(function (r) { return r.id; }), cache = {}, data = {};
    if (opt.ec2) {
      var tot = 0;
      for (var i = 0; i < regs.length; i++) tot += await headSize(await regionUrl('AmazonEC2', regs[i], cache, ctx), ctx);
      ctx.log('AWS: perkiraan unduhan daftar harga EC2 ±' + Math.round(tot / 1e6) + ' MB (bisa beberapa menit)');
      ctx.expect(tot);
    }
    for (var j = 0; j < regs.length; j++) {
      ctx.log('AWS ' + regs[j] + ': RDS, S3, load balancer, VPN, data transfer…');
      data[regs[j]] = await fetchAwsRegion(regs[j], opt, cache, ctx);
      var d = data[regs[j]];
      ctx.log('  ✓ ' + Object.keys(d.ec2).length + ' tipe EC2, ' + Object.keys(d.rds).length + ' kelas RDS, ' + Object.keys(d.prices).length + ' harga layanan');
    }
    applyAws(P, data, opt, ctx, changes);
  }

  /* ------------------------------ GCP ------------------------------ */
  // Parser YAML minimal (map bersarang & skalar) – cukup untuk pricing.yml
  function parseYaml(text) {
    var rootObj = {}, stack = [{ ind: -1, obj: rootObj }], lines = text.split('\n'), blockInd = -1;
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (!line.trim() || /^\s*#/.test(line) || /^---/.test(line)) continue;
      var ind = line.length - line.replace(/^ +/, '').length;
      if (blockInd >= 0) { if (ind > blockInd) continue; blockInd = -1; }
      var m = line.match(/^ *([^:#]+?):(?: (.*))?$/);
      if (!m) continue; // item list "- x" diabaikan
      while (stack.length > 1 && stack[stack.length - 1].ind >= ind) stack.pop();
      var parent = stack[stack.length - 1].obj, key = m[1].trim().replace(/^['"]|['"]$/g, ''), val = m[2] == null ? '' : m[2].trim();
      if (val === '' ) { parent[key] = {}; stack.push({ ind: ind, obj: parent[key] }); }
      else if (/^[|>]/.test(val)) { parent[key] = ''; blockInd = ind; }
      else { var n = Number(val); parent[key] = isNaN(n) ? val.replace(/^['"]|['"]$/g, '') : n; }
    }
    return rootObj;
  }

  function applyGcp(P, Y, opt, ctx, changes) {
    var D = P.gcp, regs = P.regions.gcp.map(function (r) { return r.id; }), US = 'us-central1';
    var inst = (Y.compute || {}).instance || {};
    function note(what, oldV, newV) { if (oldV == null || Math.abs(oldV - newV) > 1e-9) changes.push({ prov: 'Google Cloud', item: what, old: oldV, val: newV }); }
    function cost(t, rg) { var c = inst[t] && inst[t].cost && inst[t].cost[rg]; return c && c.hour ? c : null; }
    // katalog: info seri lebih baru (N4) – tidak diterapkan otomatis karena memakai Hyperdisk
    if (opt.catalog) {
      var sizes = [2, 4, 8, 16, 32];
      ['standard', 'highcpu', 'highmem'].forEach(function (k) {
        if (sizes.every(function (s) { return regs.every(function (rg) { return cost('n4-' + k + '-' + s, rg); }); }))
          changes.push({ prov: 'Google Cloud', item: 'Info katalog: seri n4-' + k + ' tersedia di semua region (tidak dipakai otomatis: wajib Hyperdisk, tanpa SUD)', old: null, val: null, catalog: true });
      });
      // tambahkan ukuran yang hilang untuk seri yang sudah dipakai
      ['n2-standard', 'n2-highcpu', 'n2-highmem'].forEach(function (pre) {
        var fam = { 'n2-standard': 'general', 'n2-highcpu': 'compute', 'n2-highmem': 'memory' }[pre];
        sizes.forEach(function (s) {
          var t = pre + '-' + s;
          if (!D.compute.some(function (x) { return x.type === t; }) && inst[t] && regs.every(function (rg) { return cost(t, rg); })) {
            D.compute.push({ type: t, family: fam, vcpu: inst[t].cpu, ram: inst[t].ram, hourly: 0, sud: true });
            changes.push({ prov: 'Google Cloud', item: 'Katalog: tambah ' + t, old: null, val: null, catalog: true });
          }
        });
      });
    }
    // harga instans
    var ratios = {};
    D.compute.forEach(function (it) {
      if (!inst[it.type]) return;
      it.byRegion = it.byRegion || {};
      regs.forEach(function (rg) { var c = cost(it.type, rg); if (c) it.byRegion[rg] = c.hour; });
      var u = cost(it.type, US);
      if (u) { note(it.type + ' (US, USD/jam)', it.hourly || null, u.hour); it.hourly = u.hour; }
      if (inst[it.type].cpu) it.vcpu = inst[it.type].cpu; if (inst[it.type].ram) it.ram = inst[it.type].ram;
      regs.forEach(function (rg) { if (rg !== US && it.byRegion[rg] && it.hourly && it.family !== 'gpu') (ratios[rg] = ratios[rg] || []).push(it.byRegion[rg] / it.hourly); });
    });
    P.regions.gcp.forEach(function (R) {
      var m = median(ratios[R.id] || []); if (m) { m = Math.round(m * 1000) / 1000; note('Pengali harga compute – ' + R.id, R.mult.compute, m); R.mult.compute = m; }
    });
    // diskon CUD & SUD dari n2-standard-4 di region Jakarta (atau region pertama)
    var ref = cost('n2-standard-4', 'asia-southeast2') || cost('n2-standard-4', US);
    if (ref && ref.month_1y && ref.month_3y) {
      var od = ref.hour * HRS;
      var d1 = Math.round((1 - ref.month_1y / od) * 1000) / 1000, d3 = Math.round((1 - ref.month_3y / od) * 1000) / 1000, sud = Math.round((1 - ref.month / od) * 1000) / 1000;
      note('Diskon CUD 1 tahun', D.discounts.compute_1y, d1); D.discounts.compute_1y = d1;
      note('Diskon CUD 3 tahun', D.discounts.compute_3y, d3); D.discounts.compute_3y = d3;
      if (sud > 0 && sud < 0.35) { note('Sustained use discount maks.', D.discounts.sud_max, sud); D.discounts.sud_max = sud; }
    }
    // storage & jaringan per region
    var st = (Y.compute || {}).storage || {}, bk = (Y.storage || {}).bucket || {}, net = (Y.compute || {}).network || {};
    function m(o, rg) { return o && o.cost && o.cost[rg] && o.cost[rg].month; }
    P.regions.gcp.forEach(function (R) {
      R.prices = R.prices || {};
      var set = function (k, v) { if (v != null && v > 0) { note(kl(k, R.id), derived(D, R, k), v); R.prices[k] = v; } };
      set('block_gb', m(st.balanced, R.id));
      set('backup_gb', m(st.snapshot, R.id));
      set('object_gb', m(bk.standard, R.id));
      set('archive_gb', m(bk.archiv, R.id));
      var natGw = net.nat && net.nat.gateway && net.nat.gateway.cost && net.nat.gateway.cost[R.id];
      if (natGw && natGw.hour) { set('nat_hr_max', natGw.hour); set('nat_hr_per_vm', r6(natGw.hour / 32)); }
      var natD = net.nat && net.nat.data && net.nat.data.cost && net.nat.data.cost[R.id];
      if (natD) set('nat_gb', natD.month);
      var vpn = net.vpn && net.vpn.tunnel && net.vpn.tunnel.cost && net.vpn.tunnel.cost[R.id];
      if (vpn) set('vpn_hr', vpn.hour);
      var eg = net.traffic && net.traffic.egress && net.traffic.egress.internet && net.traffic.egress.internet.cost;
      if (eg && eg['0-1'] && eg['0-1'][R.id]) {
        var tiers = [{ upto_gb: 1024, price: eg['0-1'][R.id].month }];
        if (eg['1-10'] && eg['1-10'][R.id]) tiers.push({ upto_gb: 10240, price: eg['1-10'][R.id].month });
        if (eg['10n'] && eg['10n'][R.id]) tiers.push({ upto_gb: null, price: eg['10n'][R.id].month });
        note('Egress internet tier-1 (USD/GB) – ' + R.id, R.egress[0].price, tiers[0].price); R.egress = tiers;
      }
    });
    var bUS = P.regions.gcp.filter(function (R) { return R.id === US; })[0];
    if (bUS && bUS.prices) ['block_gb', 'object_gb', 'archive_gb', 'backup_gb'].forEach(function (k) { if (bUS.prices[k]) D.storage[k] = bUS.prices[k]; });
  }

  async function updateGcp(P, opt, ctx, changes) {
    ctx.log('Google Cloud: mengunduh pricing.yml (dibangkitkan harian dari Cloud Billing Catalog API)…');
    var resp = await fetch(GCP_YML, { signal: ctx.signal, cache: 'no-store' });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    var text = await resp.text(); ctx.bytes(text.length, 0);
    var Y = parseYaml(text);
    var gen = Y.about && Y.about.generated;
    ctx.log('  ✓ ' + Object.keys((Y.compute || {}).instance || {}).length + ' tipe mesin, data dibangkitkan: ' + (gen || '?'));
    applyGcp(P, Y, opt, ctx, changes);
    return gen;
  }

  async function updateFx(P, ctx, changes) {
    var j = await (await fetch(FX_URL, { signal: ctx.signal, cache: 'no-store' })).json();
    if (!j.rates || !j.rates.IDR) throw new Error('format kurs tidak dikenal');
    var v = Math.round(j.rates.IDR);
    changes.push({ prov: 'Kurs', item: 'USD → IDR', old: P.meta.fx_usd_idr, val: v });
    P.meta.fx_usd_idr = v;
    ctx.log('Kurs USD→IDR: ' + v.toLocaleString('id-ID') + ' (' + (j.time_last_update_utc || '').slice(5, 16) + ')');
    return v;
  }

  /* ------------------------------ RUN ------------------------------ */
  // opt: {aws, gcp, fx, ec2, catalog}; ui: {log, progress(frac,text), signal}
  async function run(P0, opt, ui) {
    var P = JSON.parse(JSON.stringify(P0)), changes = [], errors = [], expected = 0, got = 0;
    var ctx = {
      signal: ui.signal, log: ui.log,
      expect: function (n) { expected += n; },
      bytes: function (n) { got += n; ui.progress(expected ? Math.min(0.99, got / expected) : null, Math.round(got / 1e6) + ' MB diunduh' + (expected ? ' dari ±' + Math.round(expected / 1e6) + ' MB' : '')); }
    };
    var src = [], gcpGen = null;
    if (opt.fx) { try { await updateFx(P, ctx, changes); src.push('kurs open.er-api.com'); } catch (e) { if (e.name === 'AbortError') throw e; errors.push('Kurs: ' + e.message); ui.log('✗ Kurs gagal: ' + e.message); } }
    if (opt.gcp) { try { gcpGen = await updateGcp(P, opt, ctx, changes); src.push('GCP pricing.yml (' + (gcpGen || '') + ')'); } catch (e) { if (e.name === 'AbortError') throw e; errors.push('Google Cloud: ' + e.message); ui.log('✗ Google Cloud gagal: ' + e.message); } }
    if (opt.aws) { try { await updateAws(P, opt, ctx, changes); src.push('AWS Price List API' + (opt.ec2 ? ' (termasuk EC2)' : ' (tanpa EC2)')); } catch (e) { if (e.name === 'AbortError') throw e; errors.push('AWS: ' + e.message); ui.log('✗ AWS gagal: ' + e.message); } }
    if (!src.length) throw new Error('Semua sumber gagal diakses (' + errors.join('; ') + ')');
    var today = new Date().toISOString().slice(0, 10);
    P.meta.updated = today + ' (online)';
    P.meta.version = today.replace(/-/g, '.') + '-online';
    P.meta.last_online = { date: new Date().toISOString(), sources: src, errors: errors, changes: changes.length };
    ui.progress(1, 'Selesai');
    return { prices: P, changes: changes, errors: errors };
  }

  var api = { run: run, parseYaml: parseYaml, parseCsvLine: parseCsvLine, applyAws: applyAws, applyGcp: applyGcp, fetchAwsRegion: fetchAwsRegion, updateGcp: updateGcp, URLS: { AWS_BASE: AWS_BASE, GCP_YML: GCP_YML, FX_URL: FX_URL } };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.OnlineUpdate = api;
})(this);
