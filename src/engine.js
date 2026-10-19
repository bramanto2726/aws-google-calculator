/* =====================================================================
 * Mesin perhitungan: sizing → pemilihan layanan → BOM → 12 bulan → TCO
 * Murni fungsi (tanpa DOM) agar bisa diuji di Node.
 * ===================================================================== */
(function (root) {
  'use strict';
  var HRS = 730;
  // locale angka & format uang mengikuti bahasa/mata uang aplikasi (bila tersedia)
  function KCL() { return root.KCL ? root.KCL() : 'id-ID'; }
  function money(v) { return root.KCMoney ? root.KCMoney(v) : 'Rp ' + Math.round(v).toLocaleString(KCL()); }

  var WORKLOADS = {
    web:        { label: 'Aplikasi Web / Portal / CMS',        upv: 150, ramRatio: 4, family: 'general', dbFamily: 'general', dbDiv: 3 },
    ecommerce:  { label: 'E-Commerce / Marketplace',           upv: 100, ramRatio: 4, family: 'general', dbFamily: 'memory',  dbDiv: 2.5 },
    erp:        { label: 'ERP / Aplikasi Bisnis Internal',     upv: 40,  ramRatio: 8, family: 'memory',  dbFamily: 'memory',  dbDiv: 2 },
    api:        { label: 'Mobile Backend / API',               upv: 200, ramRatio: 2, family: 'compute', dbFamily: 'general', dbDiv: 3 },
    analytics:  { label: 'Data Analytics / BI / Data Lake',    upv: 20,  ramRatio: 8, family: 'memory',  dbFamily: 'memory',  dbDiv: 2, dw: true },
    ai:         { label: 'AI / ML Inference (GPU)',            upv: 250, ramRatio: 4, family: 'general', dbFamily: 'general', dbDiv: 4, gpu: true, usersPerGpu: 60 },
    fileserver: { label: 'File Server / Kolaborasi Dokumen',   upv: 250, ramRatio: 4, family: 'general', dbFamily: 'general', dbDiv: 4 }
  };
  /* Lokasi = negara pelanggan. Region usulan = region di negara tsb. bila tersedia, jika tidak region terdekat.
   * (kunci jakarta/singapore/us dipertahankan agar file proyek lama tetap terbaca) */
  var REGION_MAP = {
    jakarta:     { country: 'ID', label: 'Indonesia',         aws: 'ap-southeast-3', gcp: 'asia-southeast2', dr: { aws: 'ap-southeast-1', gcp: 'asia-southeast1' }, local: { aws: true, gcp: true },   tax: 11, taxName: 'PPN', currency: 'IDR' },
    malaysia:    { country: 'MY', label: 'Malaysia',          aws: 'ap-southeast-5', gcp: 'asia-southeast1', dr: { aws: 'ap-southeast-1', gcp: 'asia-southeast2' }, local: { aws: true, gcp: false },  tax: 8,  taxName: 'Service Tax', currency: 'MYR' },
    singapore:   { country: 'SG', label: 'Singapura',         aws: 'ap-southeast-1', gcp: 'asia-southeast1', dr: { aws: 'ap-southeast-3', gcp: 'asia-southeast2' }, local: { aws: true, gcp: true },   tax: 9,  taxName: 'GST', currency: 'SGD' },
    thailand:    { country: 'TH', label: 'Thailand',          aws: 'ap-southeast-7', gcp: 'asia-southeast3', dr: { aws: 'ap-southeast-1', gcp: 'asia-southeast1' }, local: { aws: true, gcp: true },   tax: 7,  taxName: 'VAT', currency: 'THB' },
    philippines: { country: 'PH', label: 'Filipina',          aws: 'ap-southeast-1', gcp: 'asia-southeast1', dr: { aws: 'ap-southeast-5', gcp: 'asia-southeast2' }, local: { aws: false, gcp: false }, tax: 12, taxName: 'VAT', currency: 'PHP' },
    brunei:      { country: 'BN', label: 'Brunei Darussalam', aws: 'ap-southeast-1', gcp: 'asia-southeast1', dr: { aws: 'ap-southeast-5', gcp: 'asia-southeast2' }, local: { aws: false, gcp: false }, tax: 0,  taxName: 'Pajak', currency: 'SGD' },
    us:          { country: 'US', label: 'Amerika Serikat',   aws: 'us-east-1',      gcp: 'us-central1',     dr: { aws: 'ap-southeast-1', gcp: 'asia-southeast1' }, local: { aws: true, gcp: true },   tax: 0,  taxName: 'Pajak', currency: 'USD' }
  };
  function RM(key) { return REGION_MAP[key] || REGION_MAP.jakarta; }
  /** Tarif & nama pajak jasa digital luar negeri sesuai negara (bisa diubah manual di form). */
  function taxInfo(inp) {
    var r = RM(inp.regionKey), rate = inp.taxRate != null && inp.taxRate !== '' && !isNaN(+inp.taxRate) ? +inp.taxRate : r.tax;
    return { rate: inp.includeTax ? rate / 100 : 0, pct: rate, name: r.taxName, def: r.tax, manual: rate !== r.tax };
  }
  var AVAIL = {
    standard: 'Standar – 1 zona (±99,5%)',
    high: 'Tinggi – Multi-AZ (±99,95%)',
    critical: 'Mission-critical – Multi-AZ + DR region'
  };
  var DB_LABEL = { none: 'Tidak ada', mysql: 'MySQL', postgresql: 'PostgreSQL', sqlserver: 'SQL Server Standard', oracle: 'Oracle (BYOL)' };
  var PRICING_LABEL = { ondemand: 'On-demand', '3m': 'Kontrak 3 bulan', '6m': 'Kontrak 6 bulan', '1y': 'Komitmen 1 tahun', '3y': 'Komitmen 3 tahun' };
  var PERIOD = { ondemand: 12, '3m': 3, '6m': 6, '1y': 12, '3y': 36 };
  function periodLabel(n) { return n === 36 ? '3 Tahun' : n + ' Bulan'; }
  var CAT = ['Compute', 'Database', 'Penyimpanan', 'Jaringan', 'Keamanan & Operasional', 'Keamanan Lanjutan', 'Hybrid & Multi-cloud', 'Video Streaming', 'AI & ML', 'Disaster Recovery', 'Support'];
  var SEC_LABEL = { standard: 'Standar (baseline)', enhanced: 'Ketat (deteksi ancaman, postur, audit)', strict: 'Sangat ketat / teregulasi (DDoS lanjutan, NGFW, HSM, DLP, SIEM)' };
  var HYB_LABEL = { vpn: 'VPN IPsec via internet', partner500: 'Partner/hosted 500 Mbps', partner1g: 'Partner/hosted 1 Gbps', dedicated1g: 'Dedicated 1 Gbps', dedicated10g: 'Dedicated 10 Gbps' };
  var MC_LABEL = { activepassive: 'Active-passive (cloud kedua sebagai DR)', activeactive: 'Active-active (beban dibagi di dua cloud)', bestofbreed: 'Best-of-breed (aplikasi di cloud utama, data/AI di cloud kedua)' };
  var AI_TIER = { eco: 'Hemat', balanced: 'Seimbang', premium: 'Premium' };
  var VIDEO_LABEL = { vod: 'Video on demand (VOD)', live: 'Live streaming', both: 'VOD + live streaming' };

  function region(P, prov, key) {
    var id = REGION_MAP[key] ? REGION_MAP[key][prov] : key; // kunci lokasi atau ID region langsung
    var list = P.regions[prov];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return list[0];
  }
  function fmtN(v, d) { return (+v || 0).toLocaleString(KCL(), { maximumFractionDigits: d == null ? 2 : d }); }
  // harga per region: pakai harga aktual region bila tersedia (hasil update online), jika tidak pakai harga dasar × pengali
  function px(item, R, mk) { var v = item && item.byRegion && item.byRegion[R.id]; return v != null ? +v : item.hourly * R.mult[mk]; }
  function rp(R, key, base, mk) { var v = R.prices && R.prices[key]; return v != null ? +v : base * R.mult[mk]; }
  function pow2ceil(x) { var p = 2; while (p < x) p *= 2; return p; }
  function familyForRatio(r) { return r <= 2.5 ? 'compute' : (r <= 5 ? 'general' : 'memory'); }

  // Pilih tipe instans + jumlah node untuk total vCPU T
  function pickInstance(list, family, T, minNodes, maxNodes) {
    var c = list.filter(function (x) { return x.family === family; }).sort(function (a, b) { return a.vcpu - b.vcpu; });
    if (!c.length) c = list.filter(function (x) { return x.family === 'general'; });
    var best = null;
    for (var i = 0; i < c.length; i++) {
      var n = Math.max(minNodes, Math.ceil(T / c[i].vcpu));
      if (n <= maxNodes) { best = { inst: c[i], n: n }; break; }
    }
    if (!best) { var L = c[c.length - 1]; best = { inst: L, n: Math.max(minNodes, Math.ceil(T / L.vcpu)) }; }
    return best;
  }
  function pickByVcpu(list, family, vcpu, ramMin) {
    var c = list.filter(function (x) { return x.family === family; }).sort(function (a, b) { return a.vcpu - b.vcpu || a.ram - b.ram; });
    for (var i = 0; i < c.length; i++) if (c[i].vcpu >= vcpu && c[i].ram >= (ramMin || 0)) return c[i];
    return c[c.length - 1];
  }
  function tieredEgress(gb, tiers, freeGb) {
    var rem = Math.max(0, gb - (freeGb || 0)), cost = 0, prev = 0;
    for (var i = 0; i < tiers.length && rem > 0; i++) {
      var cap = tiers[i].upto_gb == null ? Infinity : tiers[i].upto_gb - prev;
      var q = Math.min(rem, cap); cost += q * tiers[i].price; rem -= q;
      prev = tiers[i].upto_gb == null ? prev : tiers[i].upto_gb;
    }
    return cost;
  }
  function tiered(gb, tiers) { return tieredEgress(gb, tiers, 0); }
  function supportCost(plan, spend) {
    if (!plan || !plan.tiers || !plan.tiers.length) return 0;
    var cost = 0, rem = spend, prev = 0;
    for (var i = 0; i < plan.tiers.length && rem > 0; i++) {
      var up = plan.tiers[i][0], pct = plan.tiers[i][1];
      var cap = up == null ? Infinity : up - prev;
      var q = Math.min(rem, cap); cost += q * pct; rem -= q; prev = up == null ? prev : up;
    }
    return Math.max(plan.min, cost);
  }

  /* --------------------------- SIZING --------------------------- */
  function sizing(inp) {
    var W = WORKLOADS[inp.workload] || WORKLOADS.web;
    var s = { workload: W, minNodes: inp.availability === 'standard' ? 1 : 2 };
    if (inp.manualOn) {
      s.manual = true; s.appNodes = Math.max(1, +inp.mNodes); s.appVcpu = Math.max(1, +inp.mVcpu); s.appRam = Math.max(1, +inp.mRam);
      s.totalVcpu = s.appNodes * s.appVcpu; s.ratio = s.appRam / s.appVcpu; s.family = familyForRatio(s.ratio);
    } else {
      s.totalVcpu = Math.max(2, Math.ceil(inp.concurrent / W.upv));
      s.ratio = W.ramRatio; s.family = W.family;
    }
    s.gpuNodes = W.gpu ? (+inp.mGpu > 0 ? +inp.mGpu : Math.max(1, Math.ceil(inp.concurrent / W.usersPerGpu))) : 0;
    if (inp.dbEngine !== 'none') {
      s.dbVcpu = Math.min(16, pow2ceil(Math.max(2, Math.ceil(s.totalVcpu / W.dbDiv))));
      s.dbFamily = W.dbFamily;
      if (inp.dbSize > 1000 && s.dbVcpu < 4) s.dbVcpu = 4;
    }
    return s;
  }

  /* ------------------------ BUILD BOM ------------------------ */
  // Item: {cat, svc, desc, qty, unit, unitPrice, base, dC (diskon komitmen), dOD (diskon on-demand e.g. SUD), variable}
  function build(prov, inp, P) {
    var D = P[prov], R = region(P, prov, inp.regionKey), M = R.mult, S = sizing(inp);
    var items = [], svc = D.services;
    var commit = inp.pricing === '1y' || inp.pricing === '3y';
    // Kontrak 3/6 bulan: tarif on-demand (tidak ada komitmen resmi < 1 tahun) + diskon mitra/reseller opsional
    var dCon = inp.pricing === '3m' ? (D.discounts.contract_3m || 0) : inp.pricing === '6m' ? (D.discounts.contract_6m || 0) : 0;
    var dComp = inp.pricing === '1y' ? D.discounts.compute_1y : inp.pricing === '3y' ? D.discounts.compute_3y : dCon;
    var dDb = inp.pricing === '1y' ? D.discounts.db_1y : inp.pricing === '3y' ? D.discounts.db_3y : dCon;
    function odd(sudPart) { return 1 - (1 - (sudPart || 0)) * (1 - dCon); }
    var sud = D.discounts.sud_max || 0;
    function add(o) {
      o.base = o.qty * o.unitPrice; o.dC = o.dC || 0; o.dOD = o.dOD || 0;
      if (o.variable === undefined) o.variable = true; items.push(o); return o;
    }
    var tag = prov === 'aws' ? 'AWS' : 'GCP';

    // ---- Compute aplikasi
    var pick;
    if (S.manual) {
      pick = { inst: pickByVcpu(D.compute, S.family, S.appVcpu, S.appRam), n: S.appNodes };
    } else {
      var small = S.totalVcpu <= 2 && inp.availability === 'standard' && !S.workload.gpu;
      pick = small ? { inst: pickByVcpu(D.compute, 'burst', 2, 4 * 1), n: 1 } : pickInstance(D.compute, S.family, S.totalVcpu, S.minNodes, 4);
    }
    var inst = pick.inst, nApp = pick.n;
    var instOD = inst.sud ? sud : 0;
    var hrPrice = px(inst, R, 'compute');
    add({ cat: 'Compute', svc: svc.compute + (inp.platform === 'k8s' ? ' (node ' + (prov === 'aws' ? 'EKS' : 'GKE') + ')' : ''), key: 'app',
      desc: 'Server aplikasi ' + inst.type + ' (' + inst.vcpu + ' vCPU, ' + inst.ram + ' GB RAM)' + (S.minNodes > 1 ? ', tersebar di 2+ zona' : ''),
      qty: nApp * HRS, unit: 'jam', unitPrice: hrPrice, dC: commit ? dComp : odd(instOD), dOD: instOD });
    if (inp.os === 'windows') {
      add({ cat: 'Compute', svc: 'Lisensi Windows Server', key: 'win', desc: 'Lisensi OS termasuk (' + nApp * inst.vcpu + ' vCPU)',
        qty: nApp * inst.vcpu * HRS, unit: 'vCPU-jam', unitPrice: D.windows_per_vcpu_hr });
    }
    var gpuInst = null;
    if (S.gpuNodes) {
      gpuInst = D.compute.filter(function (x) { return x.family === 'gpu'; })[0];
      add({ cat: 'Compute', svc: svc.gpu, key: 'gpu', desc: 'Node inferensi ' + gpuInst.type + ' (' + gpuInst.gpu + ', ' + gpuInst.vcpu + ' vCPU)',
        qty: S.gpuNodes * HRS, unit: 'jam', unitPrice: px(gpuInst, R, 'compute'), dC: commit ? dComp * 0.5 : dCon });
    }
    if (inp.platform === 'k8s') {
      var credit = prov === 'gcp' && inp.availability === 'standard' ? (D.other.k8s_free_credit_month || 0) : 0;
      add({ cat: 'Compute', svc: svc.k8s, key: 'k8s', desc: 'Control plane terkelola' + (credit ? ' (dikurangi kredit gratis GKE zonal)' : ''),
        qty: 1, unit: 'cluster-bulan', unitPrice: Math.max(0, D.other.k8s_cluster_hr * HRS - credit), variable: false });
    }

    // ---- Database
    var dbInfo = null, multiAZ = inp.availability !== 'standard';
    if (inp.dbEngine !== 'none') {
      var dbCls = pickByVcpu(P.aws.db, S.dbFamily, S.dbVcpu, 0); // ukuran acuan (vCPU/RAM) disamakan
      var haF = multiAZ ? 2 : 1;
      if (inp.dbEngine === 'oracle' && prov === 'gcp') {
        var vm = pickByVcpu(D.compute, S.dbFamily, dbCls.vcpu, dbCls.ram);
        dbInfo = { name: 'Oracle self-managed di ' + vm.type + (multiAZ ? ' + standby (Data Guard)' : ''), vcpu: vm.vcpu, ram: vm.ram, ha: multiAZ, managed: false };
        add({ cat: 'Database', svc: svc.compute + ' (Oracle BYOL)', key: 'db', desc: 'VM database ' + vm.type + (multiAZ ? ' ×2 (primary + standby)' : ''),
          qty: haF * HRS, unit: 'jam', unitPrice: px(vm, R, 'compute'), dC: commit ? dComp : odd(vm.sud ? sud : 0), dOD: vm.sud ? sud : 0 });
        add({ cat: 'Database', svc: D.storage.names.block, key: 'dbstor', desc: 'Disk database ' + fmtN(inp.dbSize) + ' GB' + (multiAZ ? ' ×2' : ''),
          qty: inp.dbSize * haF, unit: 'GB-bulan', unitPrice: rp(R, 'block_gb', D.storage.block_gb, 'storage') });
      } else if (prov === 'aws') {
        dbInfo = { name: 'Amazon RDS for ' + DB_LABEL[inp.dbEngine] + ' ' + dbCls.type + (multiAZ ? ' Multi-AZ' : ' Single-AZ'), vcpu: dbCls.vcpu, ram: dbCls.ram, ha: multiAZ, managed: true };
        add({ cat: 'Database', svc: svc.db, key: 'db', desc: dbCls.type + ' (' + dbCls.vcpu + ' vCPU, ' + dbCls.ram + ' GB)' + (multiAZ ? ', Multi-AZ (standby sinkron)' : ''),
          qty: haF * HRS, unit: 'jam', unitPrice: px(dbCls, R, 'db'), dC: commit ? dDb : dCon });
        if (inp.dbEngine === 'sqlserver') add({ cat: 'Database', svc: 'Lisensi SQL Server SE (License Included)', key: 'dblic', desc: dbCls.vcpu + ' vCPU' + (multiAZ ? ' ×2' : ''),
          qty: dbCls.vcpu * haF * HRS, unit: 'vCPU-jam', unitPrice: D.db_license_per_vcpu_hr.sqlserver });
        add({ cat: 'Database', svc: D.storage.names.db_storage, key: 'dbstor', desc: fmtN(inp.dbSize) + ' GB' + (multiAZ ? ' ×2 (Multi-AZ)' : ''),
          qty: inp.dbSize * haF, unit: 'GB-bulan', unitPrice: rp(R, 'db_storage_gb', D.storage.db_storage_gb, 'storage') });
      } else {
        var c = D.db_custom;
        var perHr = (dbCls.vcpu * c.vcpu_hr + dbCls.ram * c.ram_gb_hr) * M.db;
        dbInfo = { name: 'Cloud SQL for ' + DB_LABEL[inp.dbEngine] + ' ' + c.edition + ' ' + dbCls.vcpu + ' vCPU / ' + dbCls.ram + ' GB' + (multiAZ ? ' (HA regional)' : ' (zonal)'), vcpu: dbCls.vcpu, ram: dbCls.ram, ha: multiAZ, managed: true };
        add({ cat: 'Database', svc: svc.db, key: 'db', desc: 'Custom ' + dbCls.vcpu + ' vCPU, ' + dbCls.ram + ' GB, edisi ' + c.edition + (multiAZ ? ', HA (failover regional)' : ''),
          qty: haF * HRS, unit: 'jam', unitPrice: perHr, dC: commit ? dDb : dCon });
        if (inp.dbEngine === 'sqlserver') add({ cat: 'Database', svc: 'Lisensi SQL Server Standard', key: 'dblic', desc: dbCls.vcpu + ' vCPU',
          qty: dbCls.vcpu * HRS, unit: 'vCPU-jam', unitPrice: D.db_license_per_vcpu_hr.sqlserver });
        add({ cat: 'Database', svc: D.storage.names.db_storage, key: 'dbstor', desc: fmtN(inp.dbSize) + ' GB' + (multiAZ ? ' ×2 (HA)' : ''),
          qty: inp.dbSize * haF, unit: 'GB-bulan', unitPrice: rp(R, 'db_storage_gb', D.storage.db_storage_gb, 'storage') });
      }
    }

    // ---- Penyimpanan
    var blockTotal = (nApp + S.gpuNodes) * inp.blockPer;
    add({ cat: 'Penyimpanan', svc: D.storage.names.block, key: 'block', desc: (nApp + S.gpuNodes) + ' disk × ' + fmtN(inp.blockPer) + ' GB (SSD)', qty: blockTotal, unit: 'GB-bulan', unitPrice: rp(R, 'block_gb', D.storage.block_gb, 'storage') });
    if (inp.objectTB > 0) add({ cat: 'Penyimpanan', svc: D.storage.names.object, key: 'obj', desc: fmtN(inp.objectTB) + ' TB file, media, dokumen', qty: inp.objectTB * 1024, unit: 'GB-bulan', unitPrice: rp(R, 'object_gb', D.storage.object_gb, 'storage') });
    if (inp.archiveTB > 0) add({ cat: 'Penyimpanan', svc: D.storage.names.archive, key: 'arc', desc: fmtN(inp.archiveTB) + ' TB arsip (akses jarang)', qty: inp.archiveTB * 1024, unit: 'GB-bulan', unitPrice: rp(R, 'archive_gb', D.storage.archive_gb, 'storage') });
    var backupGb = Math.round((blockTotal + (inp.dbEngine !== 'none' ? inp.dbSize : 0)) * (0.3 + 0.03 * inp.backupDays));
    add({ cat: 'Penyimpanan', svc: D.storage.names.backup, key: 'bak', desc: 'Backup inkremental, retensi ' + fmtN(inp.backupDays) + ' hari (±' + fmtN(backupGb) + ' GB)', qty: backupGb, unit: 'GB-bulan', unitPrice: rp(R, 'backup_gb', D.storage.backup_gb, 'storage') });

    // ---- Jaringan
    var N = D.network, egress = +inp.egressGB, cdnShare = inp.useCDN ? 0.8 : 0;
    var direct = egress * (1 - cdnShare);
    var egCost = tieredEgress(direct, R.egress, N.free_egress_gb);
    add({ cat: 'Jaringan', svc: 'Data transfer keluar (internet)', key: 'egress', desc: Math.round(direct) + ' GB/bulan langsung dari region' + (N.free_egress_gb ? ' (gratis ' + N.free_egress_gb + ' GB pertama)' : ''), qty: 1, unit: 'bulan', unitPrice: egCost });
    if (inp.useCDN) {
      var cdnGb = egress * cdnShare, cdnFree = N.cdn_free_gb || 0;
      add({ cat: 'Jaringan', svc: svc.cdn, key: 'cdn', desc: Math.round(cdnGb) + ' GB/bulan dari edge cache (±80% trafik)' + (cdnFree ? ', 1 TB pertama gratis' : ''), qty: Math.max(0, cdnGb - cdnFree), unit: 'GB', unitPrice: R.cdn_gb });
    }
    if (prov === 'aws') {
      var lcu = Math.max(1, Math.ceil(inp.concurrent / 1500));
      add({ cat: 'Jaringan', svc: svc.lb, key: 'lb', desc: '1 ALB + ' + lcu + ' LCU', qty: HRS, unit: 'jam', unitPrice: rp(R, 'lb_hr', N.lb_hr, 'lb') + rp(R, 'lb_unit_hr', N.lb_unit_hr, 'lb') * lcu });
      var natN = inp.availability === 'standard' ? 1 : 2;
      add({ cat: 'Jaringan', svc: svc.nat, key: 'nat', desc: natN + ' NAT Gateway (1 per AZ) + ' + (nApp * 30) + ' GB diproses', qty: 1, unit: 'bulan', unitPrice: natN * rp(R, 'nat_hr', N.nat_hr, 'other') * HRS + nApp * 30 * rp(R, 'nat_gb', N.nat_gb, 'other'), variable: false });
    } else {
      add({ cat: 'Jaringan', svc: svc.lb, key: 'lb', desc: 'Forwarding rule + ' + fmtN(Math.round(egress)) + ' GB data diproses', qty: 1, unit: 'bulan', unitPrice: rp(R, 'lb_hr', N.lb_hr, 'lb') * HRS + egress * N.lb_gb * R.mult.lb });
      add({ cat: 'Jaringan', svc: svc.nat, key: 'nat', desc: 'Gateway untuk ' + nApp + ' VM + ' + (nApp * 30) + ' GB diproses', qty: 1, unit: 'bulan', unitPrice: Math.min(nApp * rp(R, 'nat_hr_per_vm', N.nat_hr_per_vm, 'other'), rp(R, 'nat_hr_max', N.nat_hr_max, 'other')) * HRS + nApp * 30 * rp(R, 'nat_gb', N.nat_gb, 'other'), variable: false });
    }
    if (inp.useVPN) add({ cat: 'Jaringan', svc: svc.vpn, key: 'vpn', desc: N.vpn_tunnels + ' tunnel IPsec ke kantor/DC pelanggan', qty: N.vpn_tunnels * HRS, unit: 'tunnel-jam', unitPrice: rp(R, 'vpn_hr', N.vpn_hr, 'other'), variable: false });
    add({ cat: 'Jaringan', svc: svc.dns, key: 'dns', desc: '1 hosted zone publik', qty: 1, unit: 'zona-bulan', unitPrice: N.dns_zone_month, variable: false });

    // ---- Keamanan & operasional
    var O = D.other;
    if (inp.useWAF) {
      var mReq = Math.max(1, Math.round(inp.concurrent * 36000 / 1e6));
      add({ cat: 'Keamanan & Operasional', svc: svc.waf, key: 'waf', desc: '1 kebijakan, 10 aturan, ±' + mReq + ' juta request/bulan', qty: 1, unit: 'bulan', unitPrice: O.waf_acl_month + 10 * O.waf_rule_month + mReq * O.waf_per_million });
    }
    var nodesAll = nApp + S.gpuNodes + (inp.dbEngine !== 'none' ? 1 : 0);
    var logs = nodesAll * 5 + 5;
    var logCost = Math.max(0, logs - (O.log_free_gb || 0)) * O.log_ingest_gb + nodesAll * 10 * O.metric_month;
    add({ cat: 'Keamanan & Operasional', svc: svc.monitor, key: 'mon', desc: '±' + fmtN(logs) + ' GB log/bulan + metrik kustom & alarm', qty: 1, unit: 'bulan', unitPrice: logCost });
    add({ cat: 'Keamanan & Operasional', svc: svc.kms + ' & ' + svc.secrets, key: 'kms', desc: 'Kunci enkripsi & penyimpanan kredensial', qty: 1, unit: 'bulan', unitPrice: prov === 'aws' ? 7 : 1.5, variable: false });
    if (S.workload.dw || inp.dwTB > 0) {
      var tb = inp.dwTB > 0 ? +inp.dwTB : 5;
      add({ cat: 'Compute', svc: svc.dw, key: 'dw', desc: tb + ' TB data di-scan per bulan' + (O.dw_free_tb ? ' (1 TB pertama gratis)' : ''), qty: Math.max(0, tb - (O.dw_free_tb || 0)), unit: 'TB scan', unitPrice: O.dw_per_tb_scanned });
    }

    // ---- Opsi lanjutan: keamanan, hybrid, video, AI
    extras(prov, inp, P, D, R, M, S, { nApp: nApp, inst: inst, nodesAll: nodesAll, logs: logs, egress: egress, db: dbInfo, blockTotal: blockTotal }, add);

    // ---- Disaster Recovery (mission-critical)
    var drRegion = null;
    if (inp.availability === 'critical') {
      drRegion = region(P, prov, RM(inp.regionKey).dr[prov]);
      var DM = drRegion.mult, drNodes = Math.max(1, Math.ceil(nApp / 2));
      add({ cat: 'Disaster Recovery', svc: svc.compute + ' (warm standby)', key: 'dr_app', desc: drNodes + ' × ' + inst.type + ' di ' + drRegion.name + ' (50% kapasitas, scale-up saat failover)', qty: drNodes * HRS, unit: 'jam', unitPrice: px(inst, drRegion, 'compute'), dC: commit ? dComp : odd(instOD), dOD: instOD });
      if (dbInfo) {
        var drDb = prov === 'aws' ? px(pickByVcpu(P.aws.db, S.dbFamily, S.dbVcpu, 0), drRegion, 'db') : (dbInfo.vcpu * D.db_custom.vcpu_hr + dbInfo.ram * D.db_custom.ram_gb_hr) * DM.db;
        add({ cat: 'Disaster Recovery', svc: svc.db + ' (replika lintas region)', key: 'dr_db', desc: 'Read replica / standby di ' + drRegion.name, qty: HRS, unit: 'jam', unitPrice: drDb, dC: commit ? dDb : dCon });
      }
      var repl = (inp.objectTB * 1024 * 0.1) + (inp.dbEngine !== 'none' ? inp.dbSize * 0.5 : 0) + blockTotal * 0.1;
      add({ cat: 'Disaster Recovery', svc: 'Replikasi data antar-region', key: 'dr_xfer', desc: '±' + fmtN(Math.round(repl)) + ' GB perubahan data/bulan', qty: repl, unit: 'GB', unitPrice: N.inter_region_gb });
      add({ cat: 'Disaster Recovery', svc: D.storage.names.object + ' (salinan DR)', key: 'dr_obj', desc: 'Salinan object storage + backup di region DR', qty: inp.objectTB * 1024 + backupGb, unit: 'GB-bulan', unitPrice: rp(drRegion, 'object_gb', D.storage.object_gb, 'storage') });
    }

    return {
      provider: prov, label: D.label, region: R, drRegion: drRegion, sizing: S, items: items,
      app: { inst: inst, n: nApp }, gpu: gpuInst ? { inst: gpuInst, n: S.gpuNodes } : null, db: dbInfo,
      blockTotal: blockTotal, backupGb: backupGb, supportPlan: D.support[inp.support], supportName: (D.support_names || {})[inp.support] || inp.support
    };
  }

  // Biaya bulan ke-m (1..n) untuk satu item
  function itemMonth(it, m, g) {
    var f = it.variable ? Math.pow(1 + g, m - 1) : 1;
    return it.base * (1 - it.dC) + it.base * (f - 1) * (1 - it.dOD);
  }

  function project(B, inp, months) {
    var g = (+inp.growth || 0) / 100, fx = inp.fx * (1 + (+inp.fxBuffer || 0) / 100), tax = taxInfo(inp).rate;
    var rows = [];
    for (var m = 1; m <= months; m++) {
      var byCat = {}, sub = 0;
      CAT.forEach(function (c) { byCat[c] = 0; });
      B.items.forEach(function (it) { var v = itemMonth(it, m, g); byCat[it.cat] += v; sub += v; });
      var sup = supportCost(B.supportPlan, sub);
      byCat.Support = sup;
      var pre = sub + sup, t = pre * tax;
      rows.push({ m: m, byCat: byCat, subtotal: pre, tax: t, total: pre + t, totalIdr: (pre + t) * fx });
    }
    return rows;
  }

  function summarize(B, inp) {
    var fx = inp.fx * (1 + (+inp.fxBuffer || 0) / 100);
    var n = PERIOD[inp.pricing] || 12;
    var m1 = project(B, inp, Math.max(12, n));
    B.items.forEach(function (it) { it.m1 = itemMonth(it, 1, 0); it.m1Idr = it.m1 * fx; it.od = it.base; });
    var sup = m1[0].byCat.Support;
    var year1 = m1.slice(0, 12).reduce(function (a, r) { return a + r.total; }, 0);
    var pm = m1.slice(0, n), periodTotal = pm.reduce(function (a, r) { return a + r.total; }, 0);
    var od = B.items.reduce(function (a, it) { return a + it.base; }, 0);
    return { months: pm, period: n, periodLabel: periodLabel(n), periodTotal: periodTotal, periodTotalIdr: periodTotal * fx,
      month1: m1[0].total, month1Idr: m1[0].totalIdr, year1: year1, year1Idr: year1 * fx, support1: sup, ondemandBase: od, fxEff: fx };
  }

  /* ------------------------------ TCO ------------------------------ */
  function tco(B, inp, P, OP) {
    var Y = +inp.tcoYears || 3, months = Y * 12, fx = inp.fx * (1 + (+inp.fxBuffer || 0) / 100);
    var g = (+inp.growth || 0) / 100;
    var proj = project(B, inp, months);
    var cloudYear = [], opYear = [];
    for (var y = 0; y < Y; y++) {
      var s = 0; for (var k = y * 12; k < y * 12 + 12; k++) s += proj[k].totalIdr; cloudYear.push(s);
    }
    var staffCloud = OP.fte_cloud * OP.admin_salary_month_idr * 12;
    var oneTimeCloud = OP.migration_one_time_idr + OP.training_one_time_idr;
    var cloud = { infra: cloudYear, staff: staffCloud, oneTime: oneTimeCloud, years: [] };
    var cum = oneTimeCloud;
    for (y = 0; y < Y; y++) { var v = cloudYear[y] + staffCloud + (y === 0 ? oneTimeCloud : 0); cloud.years.push(v); }
    cloud.total = cloud.years.reduce(function (a, b) { return a + b; }, 0);

    // On-premise: kapasitas harus dibeli di depan untuk akhir periode (maks 36 bln pertumbuhan)
    var grow = Math.pow(1 + g, Math.min(36, months) - 1);
    var S = B.sizing, app = B.app;
    var vcpu = app.n * app.inst.vcpu + (B.gpu ? B.gpu.n * B.gpu.inst.vcpu : 0) + (B.db ? B.db.vcpu * (B.db.ha ? 2 : 1) : 0);
    var ram = app.n * app.inst.ram + (B.gpu ? B.gpu.n * B.gpu.inst.ram : 0) + (B.db ? B.db.ram * (B.db.ha ? 2 : 1) : 0);
    var need = 1 + OP.headroom_pct;
    var srv = Math.max(Math.ceil(vcpu * grow * need / OP.server_vcpu), Math.ceil(ram * grow * need / OP.server_ram_gb), 1);
    if (inp.availability !== 'standard') srv = Math.max(srv + 1, 2); // N+1
    var storTB = ((B.blockTotal + (B.db ? inp.dbSize * (B.db.ha ? 2 : 1) : 0) + inp.objectTB * 1024 + B.backupGb) / 1024) * grow * need + inp.archiveTB * 0.3;
    storTB = Math.max(2, Math.ceil(storTB));
    var gpuCards = B.gpu ? Math.ceil(B.gpu.n * grow) : 0;
    var mbps = Math.max(20, Math.ceil(inp.egressGB * grow * 8 * 1024 / (30 * 24 * 3600) * 3));
    var cores = srv * OP.server_vcpu / 2;
    var capex = srv * OP.server_price_idr + storTB * OP.storage_per_tb_idr + OP.network_security_idr + gpuCards * (OP.gpu_card_idr || 60000000);
    var sqlLic = inp.dbEngine === 'sqlserver' && B.db ? B.db.vcpu * (B.db.ha ? 2 : 1) * (OP.sqlserver_per_core_idr || 35000000) / 2 : 0;
    capex += sqlLic;
    var drF = inp.availability === 'critical' ? OP.dr_site_factor : 0;
    // opsi lanjutan versi on-premise
    var lvl = inp.security || 'standard', extraCap = 0, extraOpex = 0;
    if (lvl === 'strict') { extraCap += (OP.sec_strict_ngfw_idr || 0) + (OP.sec_strict_hsm_idr || 0); extraOpex += OP.sec_strict_siem_year_idr || 0; }
    if (lvl !== 'standard') { extraOpex += srv * (OP.sec_enhanced_per_server_year_idr || 0) + (lvl === 'enhanced' ? (OP.sec_enhanced_siem_year_idr || 0) : 0); }
    if (inp.videoOn) {
      if (inp.videoMode !== 'vod') extraCap += (+inp.liveChannels || 0) * (OP.video_encoder_per_channel_idr || 0);
      if (inp.videoMode !== 'live') extraCap += Math.max(1, Math.ceil((+inp.vodHours || 0) / 200)) * (OP.video_transcode_server_idr || 0);
    }
    // layanan yang tetap dibeli dari luar walau on-premise (CDN video & API AI)
    var extSvc = B.items.filter(function (it) { return it.key === 'vid_cdn' || /^ai_/.test(it.key); }).reduce(function (a, it) { return a + it.base; }, 0) * 12 * fx;
    capex += extraCap;
    capex *= (1 + drF);
    var opexY = {
      hypervisor: cores * OP.hypervisor_per_core_year_idr,
      os: inp.os === 'windows' ? srv * OP.os_windows_per_server_year_idr : 0,
      colo: (srv + Math.ceil(storTB / 50) + 1) * OP.colo_per_server_month_idr * 12,
      bandwidth: mbps * OP.bandwidth_per_mbps_month_idr * 12,
      staff: OP.fte_onprem * OP.admin_salary_month_idr * 12,
      security: extraOpex,
      external: extSvc
    };
    var op = { capex: capex, extraCap: extraCap, servers: srv, storageTB: storTB, mbps: mbps, gpuCards: gpuCards, cores: cores, sqlLic: sqlLic, opexY: opexY, years: [], dr: drF > 0 };
    for (y = 0; y < Y; y++) {
      var maint = y >= 3 ? capex * OP.hw_maintenance_pct_year : 0;
      var base = (opexY.hypervisor + opexY.os + opexY.colo + opexY.bandwidth) * (1 + drF) + opexY.staff + opexY.security + opexY.external + maint;
      op.years.push(base + (y === 0 ? capex : 0));
    }
    op.total = op.years.reduce(function (a, b) { return a + b; }, 0);
    // break-even kumulatif
    var cc = 0, oc = 0, be = null;
    for (y = 0; y < Y; y++) { cc += cloud.years[y]; oc += op.years[y]; if (be === null && cc > oc) be = y + 1; }
    return { years: Y, cloud: cloud, onprem: op, saving: op.total - cloud.total, savingPct: (op.total - cloud.total) / op.total, cloudExceedsYear: be, fx: fx };
  }

  /* ---------------------------- CATATAN ---------------------------- */
  function notes(inp, results) {
    var n = [], add = function (lvl, t) { n.push({ lvl: lvl, text: t }); };
    var rk = inp.regionKey, ind = inp.industry;
    if (rk === 'jakarta') {
      add('info', 'Region Jakarta (AWS ap-southeast-3 & GCP asia-southeast2) menyimpan data di Indonesia; sesuai preferensi lokalisasi data PP 71/2019 dan memudahkan kepatuhan UU 27/2022 tentang Pelindungan Data Pribadi (UU PDP). Latensi ke pengguna Indonesia umumnya < 10 ms di Jabodetabek.');
      if (ind === 'keuangan') add('warn', 'Untuk lembaga jasa keuangan: siapkan dokumen penilaian risiko penyelenggaraan TI oleh pihak ketiga, rencana keluar (exit plan), dan DRP sesuai ketentuan OJK. Kedua provider menyediakan laporan SOC 1/2, ISO 27001, PCI DSS melalui AWS Artifact / Google Compliance Reports Manager.');
    } else if (rk === 'malaysia') {
      add('info', 'Malaysia: AWS memiliki region di Malaysia (ap-southeast-5) sehingga data tersimpan di dalam negeri. Google Cloud belum memiliki region yang beroperasi di Malaysia, sehingga diusulkan region Singapura (asia-southeast1) dengan latensi ±10–15 ms dari Kuala Lumpur.');
      add('warn', 'Data pribadi di Malaysia diatur Personal Data Protection Act (PDPA) 2010 beserta amendemen 2024, termasuk ketentuan transfer data ke luar negeri — perhatikan bila memakai region Singapura.' + (ind === 'keuangan' ? ' Lembaga keuangan wajib mengikuti kebijakan Bank Negara Malaysia RMiT (Risk Management in Technology), termasuk konsultasi/notifikasi sebelum memakai cloud publik untuk sistem kritikal.' : '') + (ind === 'pemerintah' ? ' Untuk instansi pemerintah, ikuti kebijakan cloud pemerintah Malaysia (MyGovCloud) dan klasifikasi data.' : ''));
    } else if (rk === 'singapore') {
      add('info', 'Singapura: AWS (ap-southeast-1) dan Google Cloud (asia-southeast1) sama-sama memiliki region di Singapura dengan pilihan layanan terlengkap di Asia Tenggara.');
      add('warn', 'Data pribadi di Singapura diatur Personal Data Protection Act (PDPA) 2012.' + (ind === 'keuangan' ? ' Lembaga keuangan wajib mengikuti MAS Technology Risk Management Guidelines dan MAS Guidelines on Outsourcing (termasuk cloud).' : '') + (ind === 'pemerintah' ? ' Untuk instansi pemerintah, ikuti kebijakan Government on Commercial Cloud (GCC) dan klasifikasi data pemerintah.' : ''));
    } else if (rk === 'thailand') {
      add('info', 'Thailand: AWS (ap-southeast-7) dan Google Cloud (asia-southeast3) sama-sama memiliki region di Bangkok sehingga data tersimpan di dalam negeri. Region ini relatif baru — cek ketersediaan tipe instans, GPU, dan layanan terkelola tertentu sebelum finalisasi desain.');
      add('warn', 'Data pribadi di Thailand diatur Personal Data Protection Act (PDPA) B.E. 2562 (2019), termasuk ketentuan transfer data lintas negara.' + (ind === 'keuangan' ? ' Lembaga keuangan mengikuti ketentuan Bank of Thailand tentang manajemen risiko TI dan pemakaian cloud/outsourcing.' : ''));
    } else if (rk === 'philippines') {
      add('warn', 'Filipina: AWS dan Google Cloud belum memiliki region penuh di Filipina, sehingga diusulkan region Singapura (latensi ±30–40 ms dari Manila). AWS menyediakan Local Zone di Manila untuk beban yang sangat sensitif latensi (layanan terbatas).');
      add('warn', 'Data pribadi di Filipina diatur Data Privacy Act 2012 (RA 10173) dan diawasi National Privacy Commission; transfer data ke luar negeri tetap menjadi tanggung jawab pengendali data.' + (ind === 'keuangan' ? ' Bank dan lembaga keuangan mengikuti ketentuan Bangko Sentral ng Pilipinas (BSP) tentang manajemen risiko TI dan outsourcing, termasuk cloud.' : ''));
    } else if (rk === 'brunei') {
      add('warn', 'Brunei Darussalam: AWS dan Google Cloud belum memiliki region di Brunei, sehingga diusulkan region Singapura (latensi ±25–35 ms dari Bandar Seri Begawan); AWS Malaysia (ap-southeast-5) dapat menjadi alternatif atau situs DR.');
      add('warn', 'Perhatikan ketentuan pelindungan data pribadi Brunei (Personal Data Protection Order 2025) untuk transfer data ke luar negeri.' + (ind === 'keuangan' ? ' Lembaga keuangan mengikuti ketentuan Brunei Darussalam Central Bank (BDCB) tentang manajemen risiko teknologi dan outsourcing.' : ''));
    } else {
      add('warn', 'Region Amerika Serikat hanya sebagai pembanding biaya. Dari Asia Tenggara latensi ±180–250 ms dan data berada di luar kawasan — tidak disarankan untuk beban produksi pengguna Asia Tenggara.');
    }
    if (inp.availability === 'standard') add('warn', 'Ketersediaan standar (1 zona) tidak tahan terhadap gangguan zona. Untuk aplikasi produksi yang melayani pelanggan, disarankan Multi-AZ.');
    if (inp.availability === 'critical') add('info', 'Skenario DR menggunakan pola warm standby di region kedua (RPO menit, RTO < 1 jam). Lakukan uji failover minimal 2× setahun dan dokumentasikan runbook.');
    if (inp.pricing === '3m' || inp.pricing === '6m') {
      var nn = inp.pricing === '3m' ? 3 : 6;
      add('warn', 'AWS dan Google Cloud tidak menyediakan komitmen resmi ' + nn + ' bulan (Savings Plans, Reserved Instances, dan CUD hanya 1 atau 3 tahun). Kontrak ' + nn + ' bulan dihitung dengan tarif on-demand' + (results.gcp ? ' (GCP tetap mendapat Sustained Use Discount otomatis)' : '') + ' ditambah diskon mitra/reseller bila diisi di tab Data Harga (default 0%).');
      ['aws', 'gcp'].forEach(function (p) {
        var B = results[p]; if (!B || !B.alt1y) return;
        var d = B.alt1y.totalIdr - B.summary.periodTotalIdr;
        add('info', (p === 'aws' ? 'AWS' : 'Google Cloud') + ': membeli komitmen 1 tahun untuk kebutuhan ' + nn + ' bulan akan memakan biaya ±' + money(B.alt1y.totalIdr) + ' (komitmen tetap dibayar 12 bulan), ' + (d > 0 ? 'lebih mahal ' + money(d) + ' dibanding kontrak ' + nn + ' bulan on-demand.' : 'lebih murah ' + money(-d) + ' – pertimbangkan komitmen 1 tahun bila beban akan berlanjut.'));
      });
      if (inp.workload === 'ai') add('info', 'Untuk GPU jangka pendek, AWS menyediakan EC2 Capacity Blocks for ML (reservasi beberapa hari hingga beberapa bulan) dengan harga dinamis; GCP menyediakan Dynamic Workload Scheduler (flex-start/calendar mode).');
    }
    if (inp.pricing === 'ondemand') add('info', 'Harga on-demand paling fleksibel tetapi termahal. Setelah 2–3 bulan pemakaian stabil, komitmen 1 tahun biasanya menghemat 25–37% biaya compute.');
    else if (inp.pricing === '1y' || inp.pricing === '3y') add('warn', inp.pricing === '1y' ? 'Komitmen satu tahun (AWS Savings Plans / GCP CUD) mengikat pembayaran minimum meskipun pemakaian turun. Komitmen dihitung hanya untuk beban dasar; pertumbuhan dihitung tarif on-demand.' : 'Komitmen tiga tahun (AWS Savings Plans / GCP CUD) mengikat pembayaran minimum meskipun pemakaian turun. Komitmen dihitung hanya untuk beban dasar; pertumbuhan dihitung tarif on-demand.');
    if (results.gcp) add('info', 'Google Cloud memberikan Sustained Use Discount otomatis s.d. 20% untuk seri N2 bila VM berjalan sebulan penuh (tidak berlaku untuk E2 atau saat sudah memakai CUD). Egress Google Cloud ditagih per GiB dengan Premium Tier sebagai default; Standard Tier lebih murah untuk trafik satu region.');
    if (results.aws) add('info', 'AWS memberi 100 GB data transfer keluar gratis per bulan (agregat semua region). Gunakan Compute Savings Plans agar diskon tetap berlaku bila ganti tipe instans/region.');
    if (inp.egressGB > 5000) add('warn', 'Trafik keluar besar (' + inp.egressGB.toLocaleString(KCL()) + ' GB/bln). Biaya egress sering menjadi komponen tak terduga — maksimalkan cache CDN, kompresi, dan pertimbangkan peering/Direct Connect/Interconnect.');
    if (inp.workload === 'ai') add('risk', 'Harga dan ketersediaan GPU sangat dinamis pada 2026: AWS menaikkan harga EC2 Capacity Blocks for ML ±15% (Jan 2026) dan ±20% (Jul 2026). Cek ketersediaan instans GPU (G6/G2) di region yang dipilih — region Jakarta memiliki pilihan GPU terbatas — dan siapkan kuota sebelum go-live.');
    if (inp.dbEngine === 'oracle') add('warn', 'Oracle: AWS mendukung RDS for Oracle (BYOL) dan RDS Custom; Cloud SQL tidak mendukung Oracle sehingga di Google Cloud dihitung self-managed di Compute Engine (atau Oracle Database@Google Cloud). Lisensi Oracle di cloud mengikuti kebijakan Oracle (2 vCPU = 1 lisensi prosesor) dan tidak termasuk di estimasi.');
    if (inp.dbEngine === 'sqlserver') add('info', 'SQL Server dihitung dengan lisensi termasuk (License Included). Bila pelanggan punya lisensi + Software Assurance, gunakan License Mobility/BYOL untuk menekan biaya.');
    if (inp.os === 'windows') add('info', 'Lisensi Windows Server sudah termasuk pada tarif per vCPU-jam. Pertimbangkan Linux untuk menghemat ±30–45% biaya compute bila aplikasi memungkinkan.');
    if (inp.platform === 'k8s') add('info', 'Kubernetes terkelola menambah biaya control plane (±USD 73/bulan per cluster) dan memerlukan keahlian DevOps/platform. Cocok bila aplikasi sudah berbasis kontainer dan microservices.');
    var TX = taxInfo(inp);
    if (inp.includeTax && TX.manual) add('info', 'Estimasi memakai tarif pajak ' + fmtN(TX.pct) + '% (diubah manual; tarif bawaan negara ini ' + TX.def + '%).');
    else if (inp.includeTax) add('info', ({
      jakarta: 'Estimasi sudah termasuk PPN atas pemanfaatan jasa digital luar negeri (PMSE) efektif 11%. Tagihan dari reseller lokal/partner bisa berbeda (termasuk PPh 23 bila berlaku).',
      malaysia: 'Estimasi sudah termasuk Service Tax 8% atas layanan digital dari penyedia luar negeri (Malaysia). Tagihan dari reseller lokal bisa berbeda.',
      singapore: 'Estimasi sudah termasuk GST 9% atas layanan digital impor (Singapura). Tagihan dari reseller lokal bisa berbeda.',
      thailand: 'Estimasi sudah termasuk VAT 7% atas e-service dari penyedia luar negeri (Thailand). Tagihan dari reseller lokal bisa berbeda.',
      philippines: 'Estimasi sudah termasuk VAT 12% atas layanan digital dari penyedia non-residen (Filipina, RA 12023). Tagihan dari reseller lokal bisa berbeda.',
      brunei: 'Brunei Darussalam tidak memungut GST/VAT atas layanan digital, sehingga tidak ada pajak yang ditambahkan.',
      us: 'Tidak ada pajak yang ditambahkan untuk skenario pembanding Amerika Serikat. Sesuaikan tarif pajak dengan negara pelanggan bila perlu.'
    })[rk] || ('Estimasi memakai tarif pajak ' + fmtN(TX.pct) + '%.'));
    // ---- opsi lanjutan
    var lvl = inp.security || 'standard';
    if (lvl === 'enhanced') add('info', 'Keamanan ketat: deteksi ancaman (GuardDuty / Security Command Center), postur & kepatuhan (CIS, AWS FSBP), pemindaian kerentanan, log audit 12 bulan, dan kunci enkripsi milik pelanggan (CMK). Tetapkan proses respons insiden & pemilik temuan.');
    if (lvl === 'strict') add('warn', 'Keamanan sangat ketat/teregulasi: DDoS lanjutan, NGFW dengan IDS/IPS, HSM, penemuan data pribadi (UU PDP), sentralisasi log untuk SIEM/SOC, dan endpoint privat. Biaya tetap terbesar adalah ' + (results.aws ? 'AWS Shield Advanced (USD 3.000/bulan, komitmen 1 tahun)' : '') + (results.aws && results.gcp ? ' dan ' : '') + (results.gcp ? 'Cloud NGFW Enterprise (USD 1,75/jam per endpoint)' : '') + '. Lisensi SIEM/SOC (mis. Google SecOps, Splunk) dan layanan SOC 24×7 umumnya dikontrak terpisah. Catatan HSM: AWS CloudHSM adalah perangkat dedicated (single-tenant), sedangkan Cloud HSM Google dihitung per kunci (multi-tenant); bila regulasi mensyaratkan HSM dedicated di Google Cloud, gunakan Single-tenant Cloud HSM dengan biaya jauh lebih tinggi.');
    if (lvl !== 'standard' && (ind === 'keuangan' || ind === 'pemerintah')) add('info', 'Gunakan kerangka referensi: SNI ISO/IEC 27001, POJK 11/2022 & SEOJK 21/2017 (perbankan), Perpres 95/2018 SPBE dan Peraturan BSSN (pemerintah). AWS Artifact dan Google Compliance Reports Manager menyediakan laporan audit pihak ketiga.');
    if (inp.hybridOn) {
      add('info', 'Hybrid cloud (' + HYB_LABEL[inp.hybridConn] + '): ' + (inp.hybridConn === 'vpn' ? 'VPN murah dan cepat dipasang, tetapi bandwidth & latensi mengikuti internet (±1,25 Gbps per tunnel). Cocok untuk replikasi ringan dan akses admin.' : 'koneksi privat memberi latensi stabil dan tarif data keluar lebih rendah. Waktu provisioning sirkuit operator lokal biasanya 4–12 minggu.') + ' Rencanakan alamat IP tanpa tumpang tindih, DNS hybrid, dan identitas terpadu (AD/Entra ID ↔ IAM).');
      if (inp.hybridConn !== 'vpn' && !inp.hybridRedundant) add('warn', 'Koneksi hybrid tunggal adalah single point of failure. Untuk produksi, gunakan 2 link di lokasi/perangkat berbeda atau VPN sebagai cadangan.');
      if (results.aws) add('info', 'AWS Direct Connect kini menawarkan opsi tarif flat untuk koneksi dedicated 10/100 Gbps (diumumkan Sep 2026) tanpa biaya per-GB; layak dibandingkan bila volume data ke on-premise besar. Lokasi Direct Connect tersedia di Jakarta.');
      if (results.gcp && inp.hybridConn === 'dedicated1g') add('info', 'Google Cloud Dedicated Interconnect tersedia mulai 10 Gbps; untuk 1 Gbps digunakan Partner Interconnect melalui penyedia jaringan.');
    }
    if (inp.videoOn) {
      var tb = (+inp.watchHours || 0) * (+inp.videoBitrate || 3) * 3600 / 8 / 1e6;
      add('info', 'Video streaming: biaya terbesar biasanya pengiriman CDN (±' + fmtN(tb, 1) + ' TB/bulan). Optimalkan dengan codec efisien (HEVC/AV1), tangga ABR yang tepat, dan cache hit ratio tinggi. Di atas ±100 TB/bulan, negosiasikan harga privat (CloudFront private pricing / Media CDN).');
      if (inp.videoMode !== 'vod') add('info', 'Live streaming: siapkan encoder kontribusi (SRT/RTMP) dengan input redundan, uji latensi end-to-end (HLS standar 10–30 dtk; low-latency 3–6 dtk) dan kapasitas penonton puncak (' + (+inp.peakViewers || 0).toLocaleString(KCL()) + ' penonton).');
      add('info', 'Untuk konten berbayar/berlisensi gunakan DRM (Widevine/FairPlay/PlayReady) dan signed URL/cookie; perhatikan juga kewajiban klasifikasi konten dan PSE untuk layanan streaming di Indonesia.');
    }
    if (inp.multiOn) {
      add('info', 'Multi-cloud dengan pola ' + MC_LABEL[inp.mcPattern] + ' meningkatkan ketahanan dan daya tawar, tetapi menambah kompleksitas operasional, kebutuhan keahlian dua platform, dan biaya transfer data antar cloud. Standarkan dengan IaC (Terraform), kontainer/Kubernetes, observability terpadu, dan identitas tunggal.');
      if (inp.mcLink === 'interconnect') add('warn', 'AWS Interconnect – multicloud (GA April 2026, mitra pertama Google Cloud) dihitung pada tarif contoh 1 Gbps; ketersediaan rute di Asia Tenggara (Jakarta/Singapura) perlu dikonfirmasi ke AWS/Google sebelum dijadikan dasar desain.');
      if (inp.mcPattern === 'activeactive') add('warn', 'Active-active lintas cloud memerlukan desain data yang matang (replikasi dua arah, konsistensi, konflik tulis). Banyak organisasi memilih active-passive untuk database dan active-active hanya untuk tier aplikasi stateless.');
    }
    if (inp.aiOn) {
      add('info', 'Fitur AI memakai layanan terkelola: ' + (results.aws ? 'Amazon Bedrock' : '') + (results.aws && results.gcp ? ' / ' : '') + (results.gcp ? 'Vertex AI (Gemini)' : '') + ' dengan tier model "' + AI_TIER[inp.aiTier] + '". Biaya token sangat bergantung pada panjang prompt; gunakan prompt caching, batasi konteks RAG, dan pilih model terkecil yang memenuhi kualitas. Harga model berubah cepat — verifikasi sebelum penawaran.');
      if (rk === 'jakarta') add('warn', 'Residensi data AI: Amazon Bedrock tersedia di region Jakarta sejak Sep 2025 (cek model yang didukung). Gemini di Vertex AI belum tercantum untuk residensi data di Jakarta — wilayah Asia terdekat adalah Singapura (asia-southeast1); endpoint global tidak menjamin residensi data. Pastikan dasar transfer data sesuai UU PDP.');
      else if (rk === 'malaysia' || rk === 'thailand') add('warn', 'Residensi data AI: ketersediaan model AI generatif (Amazon Bedrock / Vertex AI Gemini) di region baru Malaysia/Thailand masih terbatas; sebagian model hanya tersedia lewat region Singapura atau endpoint global. Cek daftar model per region dan dasar transfer data sesuai PDPA setempat.');
      add('info', 'Tata kelola AI: aktifkan guardrail (filter konten, PII, prompt injection), logging prompt/respons untuk audit, evaluasi kualitas berkala, serta pastikan data pelanggan tidak dipakai untuk melatih model (default pada Bedrock dan Vertex AI).');
      if (inp.workload === 'ai') add('info', 'Anda juga memilih beban kerja "AI / ML Inference (GPU)" yang menghitung GPU self-hosted. Bandingkan dengan biaya API terkelola di kategori AI & ML — untuk volume kecil-menengah, API terkelola biasanya lebih murah dan lebih cepat diterapkan.');
    }
    add('info', 'Tagihan cloud dalam USD; estimasi memakai kurs ' + money(inp.fx) + '/USD + buffer ' + fmtN(inp.fxBuffer) + '%. Fluktuasi kurs langsung memengaruhi biaya dalam mata uang lokal — pertimbangkan pembelian melalui partner dengan kontrak mata uang lokal (mis. IDR).');
    add('info', 'Manfaatkan program migrasi: AWS Migration Acceleration Program (MAP) dan Google Cloud Rapid Migration & Modernization Program (RaMP) dapat memberikan kredit/biaya jasa migrasi. Alat migrasi: ' + (results.aws ? 'AWS Application Migration Service, AWS DMS' : '') + (results.aws && results.gcp ? '; ' : '') + (results.gcp ? 'Migrate to Virtual Machines, Database Migration Service' : '') + '.');
    add('info', 'Keamanan (shared responsibility): aktifkan MFA & SSO, prinsip least privilege, enkripsi at-rest (KMS) dan in-transit (TLS), logging audit (CloudTrail / Cloud Audit Logs), serta guardrail anggaran (AWS Budgets / GCP Budget alerts).');
    add('warn', 'Harga adalah list price publik dan dapat berubah sewaktu-waktu. Gunakan tab "Data Harga & Update" atau skrip update sebelum menerbitkan penawaran, lalu validasi dengan AWS Pricing Calculator / Google Cloud Pricing Calculator.');
    return n;
  }


  /* ------------------- OPSI LANJUTAN (per provider) ------------------- */
  function extras(prov, inp, P, D, R, M, S, c, add) {
    var svc = D.services, multiAZ = inp.availability !== 'standard', azs = multiAZ ? 2 : 1;
    var vcpuTotal = c.nApp * c.inst.vcpu + (S.gpuNodes ? S.gpuNodes * 4 : 0);
    var resources = c.nodesAll + 6;
    // ===== Keamanan
    var lvl = inp.security || 'standard';
    if (lvl !== 'standard') {
      var X = D.security, K = 'Keamanan Lanjutan';
      if (prov === 'aws') {
        add({ cat: K, svc: svc.sec_detect, key: 'sec_detect', desc: 'Deteksi ancaman: CloudTrail, flow log, DNS, runtime ' + vcpuTotal + ' vCPU', qty: 1, unit: 'bulan', unitPrice: X.threat_base_month + vcpuTotal * X.threat_per_vcpu_month + c.nodesAll * X.flowlog_gb_per_node * X.flowlog_per_gb });
        add({ cat: K, svc: svc.sec_posture, key: 'sec_posture', desc: 'Postur keamanan (CIS/AWS FSBP), pencatatan konfigurasi ±' + resources + ' resource', qty: 1, unit: 'bulan', unitPrice: X.posture_base_month + resources * X.posture_per_resource_month + X.config_month });
        add({ cat: K, svc: svc.sec_vuln, key: 'sec_vuln', desc: 'Pemindaian kerentanan ' + c.nApp + ' instans' + (inp.platform === 'k8s' ? ' + 20 image kontainer' : ''), qty: 1, unit: 'bulan', unitPrice: c.nApp * X.vuln_per_instance_month + (inp.platform === 'k8s' ? 20 * X.vuln_per_image : 0) });
      } else {
        add({ cat: K, svc: svc.sec_detect, key: 'sec_detect', desc: 'Deteksi ancaman & postur (PAYG project): ' + vcpuTotal + ' vCPU' + (c.db ? ' + 1 Cloud SQL' : ''), qty: 1, unit: 'bulan', unitPrice: (vcpuTotal * X.scc_per_vcpu_hr + (c.db ? X.scc_per_sql_hr * (multiAZ ? 2 : 1) : 0)) * HRS });
        if (inp.platform === 'k8s') add({ cat: K, svc: svc.sec_vuln, key: 'sec_vuln', desc: '±80 pemindaian image kontainer/bulan', qty: 80, unit: 'scan', unitPrice: X.vuln_per_image });
      }
      var auditGb = c.nodesAll * (X.flowlog_gb_per_node || X.audit_log_gb_per_node) + 10;
      add({ cat: K, svc: svc.sec_audit, key: 'sec_audit', desc: 'Log audit disimpan 12 bulan (±' + fmtN(auditGb * 12) + ' GB arsip)' + (prov === 'gcp' ? ' + Data Access logs' : ''), qty: 1, unit: 'bulan', unitPrice: auditGb * 12 * (X.log_archive_per_gb_month || X.log_retention_per_gb_month) + (prov === 'gcp' ? auditGb * D.other.log_ingest_gb : 0) });
      add({ cat: K, svc: svc.kms + ' (kunci CMK tambahan)', key: 'sec_keys', desc: 'Kunci terkelola pelanggan per lingkungan & data', qty: 1, unit: 'bulan', unitPrice: X.extra_keys_month, variable: false });
      if (inp.useWAF) {
        var mReq = Math.max(1, Math.round(inp.concurrent * 36000 / 1e6));
        add({ cat: K, svc: svc.waf + ' – bot & managed rules', key: 'sec_bot', desc: 'Proteksi bot & aturan terkelola, ±' + mReq + ' juta request', qty: 1, unit: 'bulan', unitPrice: X.bot_control_month + mReq * X.bot_per_million });
      }
    }
    if (lvl === 'strict') {
      var X2 = D.security, K2 = 'Keamanan Lanjutan';
      var lbGb = c.egress * 1.0;
      add({ cat: K2, svc: svc.sec_ddos, key: 'sec_ddos', desc: prov === 'aws' ? 'Proteksi DDoS L3–L7 + tim respons DDoS (komitmen 1 tahun)' : 'Enterprise Paygo: proteksi DDoS adaptif + biaya data ' + fmtN(Math.round(lbGb)) + ' GB', qty: 1, unit: 'bulan', unitPrice: X2.ddos_adv_month + (X2.ddos_per_gb ? lbGb * X2.ddos_per_gb : 0), variable: prov !== 'aws' });
      var fwGb = c.egress * 1.5 + c.nApp * 30;
      add({ cat: K2, svc: svc.sec_fw, key: 'sec_fw', desc: azs + ' endpoint inspeksi (IDS/IPS, filter domain) + ±' + fmtN(Math.round(fwGb)) + ' GB diinspeksi', qty: 1, unit: 'bulan', unitPrice: (azs * X2.fw_endpoint_hr * HRS) * M.other + fwGb * X2.fw_per_gb * (prov === 'gcp' ? 2 : 1) });
      add({ cat: K2, svc: svc.sec_hsm, key: 'sec_hsm', desc: prov === 'aws' ? X2.hsm_count + ' HSM (FIPS 140-3 L3, cluster HA)' : X2.hsm_keys + ' kunci HSM (FIPS 140-2 L3) terkelola', qty: 1, unit: 'bulan', unitPrice: prov === 'aws' ? X2.hsm_count * X2.hsm_hr * HRS * M.other : X2.hsm_keys * X2.hsm_key_month, variable: false });
      var scanGb = Math.max(10, inp.objectTB * 1024 * 0.1);
      add({ cat: K2, svc: svc.sec_dlp, key: 'sec_dlp', desc: 'Penemuan data pribadi/sensitif (UU PDP) ±' + fmtN(Math.round(scanGb)) + ' GB dipindai/bulan', qty: 1, unit: 'bulan', unitPrice: X2.dlp_base_month + scanGb * X2.dlp_per_gb });
      var siemGb = c.logs + c.nodesAll * 3 + 20;
      add({ cat: K2, svc: svc.sec_siem, key: 'sec_siem', desc: 'Sentralisasi log keamanan ±' + fmtN(siemGb) + ' GB/bulan untuk SIEM/SOC', qty: siemGb, unit: 'GB', unitPrice: X2.siem_per_gb });
      add({ cat: K2, svc: svc.sec_private, key: 'sec_private', desc: X2.privlink_endpoints + ' endpoint privat ke layanan terkelola' + (prov === 'aws' ? ' × ' + azs + ' AZ' : '') + ' (tanpa lewat internet)', qty: 1, unit: 'bulan', unitPrice: X2.privlink_endpoints * (prov === 'aws' ? azs : 1) * X2.privlink_endpoint_hr * HRS + 100 * X2.privlink_per_gb, variable: false });
    }
    // ===== Hybrid cloud
    if (inp.hybridOn) {
      var H = D.hybrid, HC = 'Hybrid & Multi-cloud', t = inp.hybridConn || 'vpn', links = inp.hybridRedundant ? 2 : 1, port = 0, pdesc = '';
      var fxNow = inp.fx * (1 + (+inp.fxBuffer || 0) / 100);
      if (t === 'vpn') { port = H.vpn_hr * (prov === 'gcp' ? 2 : 1) * links; pdesc = (prov === 'gcp' ? 'HA VPN 2 tunnel' : 'VPN 2 tunnel') + (links > 1 ? ' × 2 gateway' : ''); }
      else if (t === 'partner500') { port = H.partner_hr['500m'] * links; pdesc = 'Koneksi partner/hosted 500 Mbps via penyedia lokal × ' + links; }
      else if (t === 'partner1g') { port = H.partner_hr['1g'] * links; pdesc = 'Koneksi partner/hosted 1 Gbps × ' + links; }
      else if (t === 'dedicated1g') {
        if (prov === 'aws') { port = H.dedicated_hr['1g'] * links; pdesc = 'Port dedicated 1 Gbps × ' + links; }
        else { port = H.partner_hr['1g'] * links; pdesc = 'Partner Interconnect 1 Gbps × ' + links + ' (Dedicated Interconnect GCP mulai 10 Gbps)'; }
      } else { port = (H.dedicated_hr['10g'] + (H.vlan_hr || 0)) * links; pdesc = 'Port dedicated 10 Gbps' + (H.vlan_hr ? ' + VLAN attachment' : '') + ' × ' + links; }
      var hx = (t === 'vpn') ? svc.hybrid_vpn : svc.hybrid_dx;
      add({ cat: HC, svc: hx, key: 'hyb_link', desc: pdesc + ' ke DC on-premise', qty: HRS, unit: 'jam', unitPrice: port, variable: false });
      var dto = +inp.hybridGB || 0;
      if (dto > 0) add({ cat: HC, svc: 'Data transfer cloud → on-premise', key: 'hyb_dto', desc: dto.toLocaleString(KCL()) + ' GB/bulan' + (t === 'vpn' ? ' (tarif internet)' : ' (tarif interkoneksi)'), qty: dto, unit: 'GB', unitPrice: t === 'vpn' ? R.egress[0].price : H.dto_gb });
      if (t !== 'vpn') add({ cat: HC, svc: 'Local loop / cross-connect operator lokal', key: 'hyb_loop', desc: 'Sirkuit metro dari DC pelanggan ke titik interkoneksi × ' + links + ' (' + money(inp.op.local_loop_month_idr || 0) + '/bln/link)', qty: links, unit: 'link-bulan', unitPrice: (inp.op.local_loop_month_idr || 0) / fxNow, variable: false });
      add({ cat: HC, svc: svc.hybrid_dns, key: 'hyb_dns', desc: 'Resolusi DNS dua arah cloud ↔ on-premise', qty: HRS, unit: 'jam', unitPrice: H.hybrid_dns_hr, variable: false });
      var onpremSrv = +inp.hybridServers || 0;
      if (onpremSrv > 0 && H.hybrid_mgmt_per_server_hr > 0) add({ cat: HC, svc: svc.hybrid_mgmt, key: 'hyb_mgmt', desc: 'Patch, inventaris & sesi jarak jauh untuk ' + onpremSrv + ' server on-premise', qty: onpremSrv * HRS, unit: 'server-jam', unitPrice: H.hybrid_mgmt_per_server_hr, variable: false });
    }
    // ===== Video streaming
    if (inp.videoOn) {
      var V = D.video, VC = 'Video Streaming', mode = inp.videoMode || 'vod';
      if (mode !== 'live' && inp.vodHours > 0) add({ cat: VC, svc: svc.video_vod, key: 'vid_vod', desc: fmtN(inp.vodHours) + ' jam konten baru/bulan → tangga ABR 1080p/720p/480p', qty: inp.vodHours * 60, unit: 'menit konten', unitPrice: V.vod_per_content_min });
      if (mode !== 'vod' && inp.liveChannels > 0) add({ cat: VC, svc: svc.video_live, key: 'vid_live', desc: fmtN(inp.liveChannels) + ' channel × ' + fmtN(inp.liveHoursDay) + ' jam/hari, HD ABR', qty: inp.liveChannels * inp.liveHoursDay * 30, unit: 'channel-jam', unitPrice: V.live_channel_hr });
      var libGb = (mode !== 'live' ? inp.vodHours * 2.7 * 12 : 0) + (mode !== 'vod' ? inp.liveChannels * inp.liveHoursDay * 30 * 2.7 * 0.25 : 0);
      add({ cat: VC, svc: D.storage.names.object + ' (pustaka video)', key: 'vid_store', desc: 'Rendisi ABR ±' + Math.round(libGb).toLocaleString(KCL()) + ' GB (akumulasi 12 bulan + arsip rekaman live)', qty: libGb, unit: 'GB-bulan', unitPrice: rp(R, 'object_gb', D.storage.object_gb, 'storage') });
      var watchGb = (+inp.watchHours || 0) * (+inp.videoBitrate || 3) * 3600 / 8 / 1000;
      if (V.origin_per_gb) add({ cat: VC, svc: svc.video_origin, key: 'vid_origin', desc: 'Packaging HLS/DASH & origin (±15% miss rate)', qty: watchGb * 0.15, unit: 'GB', unitPrice: V.origin_per_gb });
      add({ cat: VC, svc: svc.video_cdn + ' (video)', key: 'vid_cdn', desc: (+inp.watchHours).toLocaleString(KCL()) + ' jam tonton × ' + fmtN(inp.videoBitrate) + ' Mbps ≈ ' + Math.round(watchGb / 1024).toLocaleString(KCL()) + ' TB/bulan (tarif bertingkat)', qty: 1, unit: 'bulan', unitPrice: tiered(watchGb, V.cdn_tiers) });
    }
    // ===== AI
    if (inp.aiOn) {
      var A = D.ai, AC = 'AI & ML', up = 1 + (A.regional_uplift || 0);
      if (inp.aiLLM && inp.aiRequests > 0) {
        var md = A.models[inp.aiTier || 'balanced'], mtokIn = inp.aiRequests * inp.aiInTok / 1e6, mtokOut = inp.aiRequests * inp.aiOutTok / 1e6;
        add({ cat: AC, svc: svc.ai_llm + ' – ' + md.name, key: 'ai_llm', desc: inp.aiRequests.toLocaleString(KCL()) + ' permintaan × (' + fmtN(inp.aiInTok) + ' token input + ' + fmtN(inp.aiOutTok) + ' token output), endpoint regional', qty: 1, unit: 'bulan', unitPrice: (mtokIn * md.in + mtokOut * md.out) * up });
        var tokM = mtokIn + mtokOut;
        add({ cat: AC, svc: svc.ai_guard, key: 'ai_guard', desc: 'Filter konten, PII & prompt injection pada input/output', qty: 1, unit: 'bulan',
          unitPrice: prov === 'aws' ? inp.aiRequests * Math.ceil((inp.aiInTok + inp.aiOutTok) * 4 / 1000) * A.guard_per_1k_units / 1000 : Math.max(0, tokM - A.guard_free_m_tokens) * A.guard_per_m_tokens });
      }
      if (inp.aiRAG && inp.ragGB > 0) add({ cat: AC, svc: svc.ai_rag, key: 'ai_rag', desc: 'Basis pengetahuan ' + fmtN(inp.ragGB) + ' GB dokumen + ' + inp.aiRequests.toLocaleString(KCL()) + ' kueri retrieval', qty: 1, unit: 'bulan', unitPrice: inp.ragGB * A.rag_index_gb_month + inp.aiRequests / 1000 * A.rag_per_1k_query });
      if (inp.aiOCR && inp.ocrPages > 0) add({ cat: AC, svc: svc.ai_ocr, key: 'ai_ocr', desc: inp.ocrPages.toLocaleString(KCL()) + ' halaman dokumen/bulan (OCR & ekstraksi)', qty: inp.ocrPages / 1000, unit: '1.000 hal', unitPrice: A.ocr_per_1k_pages });
      if (inp.aiSpeech && inp.speechMin > 0) add({ cat: AC, svc: svc.ai_speech, key: 'ai_speech', desc: inp.speechMin.toLocaleString(KCL()) + ' menit audio/bulan (transkripsi Bahasa Indonesia)', qty: inp.speechMin, unit: 'menit', unitPrice: A.speech_per_min });
      if (inp.aiVision && inp.visionImages > 0) add({ cat: AC, svc: svc.ai_vision, key: 'ai_vision', desc: inp.visionImages.toLocaleString(KCL()) + ' gambar/bulan (deteksi objek/label)', qty: inp.visionImages / 1000, unit: '1.000 gambar', unitPrice: A.vision_per_1k });
    }
  }

  /* --------------------------- MULTI-CLOUD --------------------------- */
  function buildMulti(inp, P, builds) {
    var pri = inp.mcPrimary === 'auto' || !inp.mcPrimary ? null : inp.mcPrimary;
    if (!pri) {
      var ya = summarize(builds.aws, inp).month1, yg = summarize(builds.gcp, inp).month1;
      pri = ya <= yg ? 'aws' : 'gcp';
    }
    var sec = pri === 'aws' ? 'gcp' : 'aws', A = builds[pri], B = builds[sec], pat = inp.mcPattern || 'activepassive';
    var TAG = { aws: '[AWS] ', gcp: '[GCP] ' }, items = [];
    function copy(it, p, f, note) {
      var o = {}; for (var k in it) o[k] = it[k];
      o.svc = TAG[p] + it.svc; o.qty = it.qty * f; o.base = o.qty * o.unitPrice; o.desc = (note ? note + ' · ' : '') + it.desc; o.cloud = p; items.push(o);
    }
    var aiKeys = /^(ai_|dw$|gpu$)/;
    if (pat === 'activepassive') {
      A.items.forEach(function (it) { if (!/^dr_/.test(it.key)) copy(it, pri, 1); });
      B.items.forEach(function (it) {
        var k = it.key;
        if (k === 'app') copy(it, sec, Math.max(1, Math.ceil(B.app.n / 2)) / B.app.n, 'standby 50%');
        else if (k === 'db' || k === 'dbstor' || k === 'dblic') copy(it, sec, inp.availability !== 'standard' ? 0.5 : 1, 'replika lintas cloud');
        else if (/^(obj|bak|lb|nat|dns|kms|block)$/.test(k)) copy(it, sec, k === 'block' ? 0.5 : 1, 'standby');
        else if (k === 'mon') copy(it, sec, 0.5, 'standby');
      });
    } else if (pat === 'activeactive') {
      A.items.forEach(function (it) { if (/^dr_/.test(it.key)) return; copy(it, pri, it.key === 'app' || it.key === 'egress' || it.key === 'cdn' || it.key === 'vid_cdn' ? 0.6 : 1, it.key === 'app' ? '60% kapasitas' : ''); });
      B.items.forEach(function (it) { if (/^dr_/.test(it.key) || aiKeys.test(it.key) || /^vid_(vod|live|store)$/.test(it.key)) return; copy(it, sec, it.key === 'app' || it.key === 'egress' || it.key === 'cdn' || it.key === 'vid_cdn' ? 0.6 : 1, it.key === 'app' ? '60% kapasitas' : ''); });
    } else {
      A.items.forEach(function (it) { if (/^dr_/.test(it.key) || aiKeys.test(it.key)) return; copy(it, pri, 1); });
      B.items.forEach(function (it) { if (aiKeys.test(it.key)) copy(it, sec, 1, 'beban data/AI'); });
      var dataTb = Math.max(0.2, inp.objectTB * 0.5);
      var so = B.items.filter(function (i) { return i.key === 'obj'; })[0];
      if (so) copy({ cat: 'Penyimpanan', svc: so.svc + ' (data lake)', key: 'obj', desc: 'Salinan data untuk analitik/AI', qty: dataTb * 1024, unit: 'GB-bulan', unitPrice: so.unitPrice, dC: 0, dOD: 0, variable: true }, sec, 1);
    }
    // interkoneksi antar cloud
    var Mp = P[pri].multicloud, link = inp.mcLink || 'vpn', HC = 'Hybrid & Multi-cloud', syncGb = +inp.mcSyncGB || 0;
    if (link === 'interconnect') {
      items.push(mk(HC, P[pri].services.mc_link, 'mc_link', 'Koneksi privat 1 Gbps antar cloud (tanpa biaya per-GB)', HRS, 'jam', Mp.interconnect_1g_hr, false));
    } else {
      items.push(mk(HC, P.aws.services.mc_vpn + ' + ' + P.gcp.services.mc_vpn, 'mc_link', 'HA VPN antar cloud (4 tunnel)', HRS, 'jam', 2 * P.aws.hybrid.vpn_hr + 2 * P.gcp.hybrid.vpn_hr, false));
      var eg = region(P, pri, inp.regionKey).egress[0].price;
      if (syncGb > 0) items.push(mk(HC, 'Replikasi data antar cloud', 'mc_sync', syncGb.toLocaleString(KCL()) + ' GB/bulan keluar dari ' + (pri === 'aws' ? 'AWS' : 'Google Cloud') + ' (tarif internet)', syncGb, 'GB', eg, true));
    }
    items.push(mk(HC, 'Manajemen multi-cloud (IaC, observability terpadu)', 'mc_mgmt', 'Terraform/IaC, dashboard & alert lintas cloud (estimasi lisensi/tooling)', 1, 'bulan', Mp.mgmt_month, false));
    if (pat === 'activeactive') items.push(mk(HC, 'Global traffic management (DNS health check)', 'mc_gtm', 'Routing berbasis kesehatan & latensi ke dua cloud', 1, 'bulan', Mp.gtm_month, false));
    // support per cloud dihitung atas porsi masing-masing
    ['aws', 'gcp'].forEach(function (p) {
      var sub = items.filter(function (i) { return i.cloud === p; }).reduce(function (a, i) { return a + i.base * (1 - (i.dC || 0)); }, 0);
      var plan = P[p].support[inp.support], sc = supportCost(plan, sub);
      if (sc > 0) items.push(mk('Support', TAG[p] + 'Support ' + ((P[p].support_names || {})[inp.support] || inp.support), 'mc_sup_' + p, 'Dihitung dari porsi biaya di ' + (p === 'aws' ? 'AWS' : 'Google Cloud'), 1, 'bulan', sc, true));
    });
    var M = {
      provider: 'multi', label: 'Multi-cloud', region: { name: (pri === 'aws' ? 'AWS ' : 'GCP ') + A.region.name + ' + ' + (sec === 'aws' ? 'AWS ' : 'GCP ') + B.region.name },
      drRegion: null, sizing: A.sizing, items: items, app: A.app, gpu: A.gpu, db: A.db, blockTotal: A.blockTotal + (pat === 'bestofbreed' ? 0 : B.blockTotal * 0.5), backupGb: A.backupGb,
      supportPlan: { min: 0, tiers: [] }, supportName: 'per cloud (lihat baris support)', multi: { primary: pri, secondary: sec, pattern: pat, link: link, A: A, B: B }
    };
    return M;
  }
  function mk(cat, svc, key, desc, qty, unit, unitPrice, variable) {
    return { cat: cat, svc: svc, key: key, desc: desc, qty: qty, unit: unit, unitPrice: unitPrice, base: qty * unitPrice, dC: 0, dOD: 0, variable: variable };
  }
  // Pembanding untuk kontrak 3/6 bulan: membeli komitmen 1 tahun (dibayar 12 bulan penuh) walau hanya dipakai N bulan
  function alt1y(p, inp, P, S) {
    var j = {}; for (var k in inp) j[k] = inp[k]; j.pricing = '1y';
    var A = build(p, j, P), n = S.period, g = (+inp.growth || 0) / 100, items = 0, base = 0;
    A.items.forEach(function (it) {
      for (var m = 1; m <= n; m++) base += itemMonth(it, m, g);
      if (it.dC > 0 && /^(app|db|gpu|dr_app|dr_db)$/.test(it.key)) items += it.base * (1 - it.dC) * (12 - n); // sisa komitmen yang tetap dibayar
    });
    var ratio = 1;
    var sub = 0; S.months.forEach(function (r) { sub += r.subtotal - r.byCat.Support; });
    if (sub > 0) ratio = S.periodTotal / sub;
    var total = (base + items) * ratio;
    return { total: total, totalIdr: total * S.fxEff, cheaper: total < S.periodTotal };
  }

  /* --------------------------- RUN ALL --------------------------- */
  function run(inp, P, OP) {
    var provs = inp.provider === 'both' ? ['aws', 'gcp'] : [inp.provider];
    var res = {}, builds = {};
    ['aws', 'gcp'].forEach(function (p) { if (provs.indexOf(p) >= 0 || inp.multiOn) builds[p] = build(p, inp, P); });
    if (inp.multiOn) { builds.multi = buildMulti(inp, P, builds); provs = provs.concat(['multi']); }
    provs.forEach(function (p) {
      var B = builds[p];
      B.summary = summarize(B, inp);
      if ((inp.pricing === '3m' || inp.pricing === '6m') && p !== 'multi') B.alt1y = alt1y(p, inp, P, B.summary);
      B.tco = tco(B, inp, P, OP);
      res[p] = B;
    });
    var best = null;
    provs.forEach(function (p) { if (!best || res[p].summary.year1 < res[best].summary.year1) best = p; });
    res.best = best; res.provs = provs; res.notes = notes(inp, res); res.input = inp;
    res.when = new Date().toISOString();
    return res;
  }

  var api = { PERIOD: PERIOD, periodLabel: periodLabel, fmtN: fmtN, run: run, SEC_LABEL: SEC_LABEL, HYB_LABEL: HYB_LABEL, MC_LABEL: MC_LABEL, AI_TIER: AI_TIER, VIDEO_LABEL: VIDEO_LABEL, build: build, project: project, tco: tco, sizing: sizing, tieredEgress: tieredEgress, supportCost: supportCost,
    WORKLOADS: WORKLOADS, REGION_MAP: REGION_MAP, RM: RM, taxInfo: taxInfo, AVAIL: AVAIL, DB_LABEL: DB_LABEL, PRICING_LABEL: PRICING_LABEL, CAT: CAT, HRS: HRS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Engine = api;
})(this);
