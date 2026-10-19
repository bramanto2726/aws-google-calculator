/* =====================================================================
 * UI: form, render hasil, topologi, grafik, editor harga, update online
 * ===================================================================== */
(function () {
  'use strict';
  var UID = (window.KC_USER && window.KC_USER.id) || 'anon';
  var LS_PRICES = 'kc_prices_v1_' + UID, LS_INPUT = 'kc_input_v1_' + UID;
  var $ = function (id) { return document.getElementById(id); };
  var P = loadPrices();
  var LAST = null;
  window.KC = { get last() { return LAST; }, get prices() { return P; } };

  var COLORS = { aws: '#d9822b', gcp: '#2f6fd6', multi: '#7a4fbf', op: '#6b7a8a' };
  function PN(p) { return p === 'aws' ? 'AWS' : p === 'gcp' ? 'Google Cloud' : p === 'multi' ? 'Multi-cloud' : p; }
  var CAT_COLORS = { 'Compute': '#0f6e8c', 'Database': '#7a4fbf', 'Penyimpanan': '#2a9d8f', 'Jaringan': '#e9a03b', 'Keamanan & Operasional': '#c0504d', 'Keamanan Lanjutan': '#8b1e3f', 'Hybrid & Multi-cloud': '#3d5a80', 'Video Streaming': '#d65db1', 'AI & ML': '#6a994e', 'Disaster Recovery': '#6b7a8a', 'Support': '#9aa7b4' };

  /* ---------------- util ---------------- */
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function loadPrices() {
    try { var s = localStorage.getItem(LS_PRICES); if (s) { var p = JSON.parse(s); if (p && p.aws && p.gcp) return withRegions(p); } } catch (e) {}
    return clone(window.DEFAULT_PRICES);
  }
  /* Data harga lama (tersimpan / backup / impor) dilengkapi region baru dari data bawaan */
  function withRegions(p) {
    ['aws', 'gcp'].forEach(function (k) {
      var have = {}; (p.regions[k] || (p.regions[k] = [])).forEach(function (r) { have[r.id] = 1; });
      window.DEFAULT_PRICES.regions[k].forEach(function (r) { if (!have[r.id]) p.regions[k].push(clone(r)); });
    });
    return p;
  }
  function savePrices() { try { localStorage.setItem(LS_PRICES, JSON.stringify(P)); } catch (e) {} updateBadge(); }
  // Nilai uang di hasil perhitungan SUDAH dalam mata uang output (lihat calculate)
  function rp(v) { return KCCur.money(v); }
  function rpj(v) { return KCCur.compact(v); } // ringkas: jt / M (ID) atau M / B (EN)
  function CS() { return KCCur.sym(); }
  function usd(v) { return 'US$ ' + (+v).toLocaleString(KCL(), { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function fmtN(v, d) { return Engine.fmtN(v, d); }
  function pct(v, d) { return (+v).toLocaleString(KCL(), { minimumFractionDigits: d == null ? 1 : d, maximumFractionDigits: d == null ? 1 : d }); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function toast(msg) { var t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(function () { t.hidden = true; }, 2600); }
  function download(blob, name) {
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }
  window.KCUtil = { pct: pct, fmtN: fmtN, PN: PN, rp: rp, rpj: rpj, usd: usd, CS: CS, esc: esc, toast: toast, download: download, COLORS: COLORS, CAT_COLORS: CAT_COLORS };

  /* ---------------- input ---------------- */
  var FIELDS = ['custName', 'projName', 'industry', 'picName', 'regionKey', 'pricing', 'support', 'workload', 'users', 'concurrent', 'availability', 'platform', 'os',
    'manualOn', 'mNodes', 'mVcpu', 'mRam', 'mGpu', 'dbEngine', 'dbSize', 'backupDays', 'blockPer', 'objectTB', 'archiveTB', 'dwTB', 'egressGB', 'useCDN', 'useWAF', 'useVPN',
    'growth', 'tcoYears', 'fx', 'fxBuffer', 'includeTax', 'taxRate',
    'security', 'hybridOn', 'hybridConn', 'hybridRedundant', 'hybridGB', 'hybridServers',
    'videoOn', 'videoMode', 'vodHours', 'liveChannels', 'liveHoursDay', 'watchHours', 'videoBitrate', 'peakViewers',
    'multiOn', 'mcPattern', 'mcPrimary', 'mcLink', 'mcSyncGB',
    'aiOn', 'aiLLM', 'aiRAG', 'aiOCR', 'aiSpeech', 'aiVision', 'aiTier', 'aiRequests', 'aiInTok', 'aiOutTok', 'ragGB', 'ocrPages', 'speechMin', 'visionImages'];
  var OP_KEYS = ['server_price_idr', 'server_vcpu', 'server_ram_gb', 'storage_per_tb_idr', 'network_security_idr', 'colo_per_server_month_idr', 'hypervisor_per_core_year_idr',
    'bandwidth_per_mbps_month_idr', 'admin_salary_month_idr', 'fte_onprem', 'fte_cloud', 'migration_one_time_idr', 'training_one_time_idr', 'local_loop_month_idr'];
  var DEFAULT_INPUT = null;

  function readInput() {
    var o = {};
    FIELDS.forEach(function (f) {
      var el = $(f); if (!el) return;
      if (el.type === 'checkbox') o[f] = el.checked;
      else if (el.dataset.num) o[f] = parseNum(el.value) || 0;
      else o[f] = el.value;
    });
    var r = document.querySelector('input[name=provider]:checked'); o.provider = r ? r.value : 'both';
    o.op = {};
    OP_KEYS.forEach(function (k) { o.op[k] = parseNum($('op_' + k).value) || 0; });
    return o;
  }
  function writeInput(o) {
    FIELDS.forEach(function (f) { var el = $(f); if (!el || o[f] === undefined) return; if (el.type === 'checkbox') el.checked = !!o[f]; else el.value = el.dataset.num ? edNum(o[f]) : o[f]; });
    if (o.provider) { var r = document.querySelector('input[name=provider][value=' + o.provider + ']'); if (r) r.checked = true; }
    var op = o.op || {};
    OP_KEYS.forEach(function (k) { $('op_' + k).value = edNum(op[k] !== undefined ? op[k] : P.onprem_defaults[k]); });
  }
  /* Mata uang: mesin hitung bekerja langsung dalam mata uang OUTPUT.
   * - kurs USD→output = KCCur.rate(out) (rates.IDR disinkronkan dengan kolom "Kurs USD → IDR")
   * - nilai uang asumsi on-premise (kunci *_idr) dikonversi dari mata uang INPUT ke output */
  function engineInput(inp) {
    var c = KCCur.get(), r = clone(inp);
    if (+inp.fx > 0) KCCur.syncIdr(+inp.fx);
    r.fx = KCCur.rate(c.out);
    r.op = {};
    Object.keys(inp.op || {}).forEach(function (k) { r.op[k] = /_idr$/.test(k) ? KCCur.conv(inp.op[k], c.in, c.out) : inp.op[k]; });
    r.currency = c.out; r.currencyIn = c.in;
    return r;
  }
  function opAssumptions(inp) {
    var OP = clone(P.onprem_defaults), out = KCCur.out();
    Object.keys(OP).forEach(function (k) { if (/_idr$/.test(k)) OP[k] = KCCur.conv(OP[k], 'IDR', out); });
    Object.keys(inp.op || {}).forEach(function (k) { OP[k] = inp.op[k]; });
    return OP;
  }

  /* ---------------- calculate ---------------- */
  function calculate(silent) {
    var inp = readInput();
    if (inp.concurrent > inp.users) inp.users = inp.concurrent;
    try { localStorage.setItem(LS_INPUT, JSON.stringify(inp)); } catch (e) {}
    inp = engineInput(inp);
    var OP = opAssumptions(inp);
    LAST = Engine.run(inp, P, OP);
    LAST.OP = OP; LAST.prices = P;
    renderSolusi(LAST); renderBiaya(LAST); renderTco(LAST); renderCatatan(LAST);
    if (!silent) { switchTab('solusi'); toast('Perhitungan selesai'); }
    return LAST;
  }
  window.KC.calculate = calculate;

  /* ---------------- tabs ---------------- */
  function switchTab(name) {
    document.querySelectorAll('.tab').forEach(function (t) { t.classList.toggle('active', t.dataset.tab === name); });
    document.querySelectorAll('.panel').forEach(function (p) { p.classList.toggle('active', p.id === 'tab-' + name); });
    window.scrollTo(0, 0);
    try { window.dispatchEvent(new CustomEvent('kc:tab', { detail: name })); } catch (e) {}
  }

  /* ---------------- render: solusi ---------------- */
  var ROLE_ROWS = [
    ['Jaringan privat', 'vpc'], ['Compute aplikasi', 'compute'], ['Kontainer', 'k8s'], ['Load balancer', 'lb'], ['Database', 'db'], ['Object storage', 'object'],
    ['CDN', 'cdn'], ['WAF / DDoS', 'waf'], ['DNS', 'dns'], ['Akses internet keluar', 'nat'], ['Koneksi ke kantor', 'vpn'], ['Monitoring & log', 'monitor'],
    ['Backup', 'backup'], ['Identitas & akses', 'iam'], ['Enkripsi & rahasia', 'kms'], ['Analitik / data warehouse', 'dw'], ['GPU / AI', 'gpu'],
    ['Deteksi ancaman', 'sec_detect'], ['Postur & kepatuhan', 'sec_posture'], ['Pemindaian kerentanan', 'sec_vuln'], ['Log audit', 'sec_audit'],
    ['DDoS lanjutan', 'sec_ddos'], ['Firewall jaringan (NGFW/IPS)', 'sec_fw'], ['HSM / kunci', 'sec_hsm'], ['Perlindungan data pribadi', 'sec_dlp'], ['Log keamanan / SIEM', 'sec_siem'], ['Akses privat ke layanan', 'sec_private'],
    ['Koneksi hybrid ke DC', 'hybrid_dx'], ['DNS hybrid', 'hybrid_dns'], ['Manajemen server on-prem', 'hybrid_mgmt'],
    ['Transcoding VOD', 'video_vod'], ['Live encoding', 'video_live'], ['Origin & packaging video', 'video_origin'], ['CDN video', 'video_cdn'],
    ['Model AI generatif', 'ai_llm'], ['RAG / basis pengetahuan', 'ai_rag'], ['Guardrail AI', 'ai_guard'], ['OCR dokumen', 'ai_ocr'], ['Speech-to-text', 'ai_speech'], ['Computer vision', 'ai_vision'],
    ['Koneksi antar cloud', 'mc_link'], ['Alat migrasi', 'migrate']
  ];
  function rolesFor(R) {
    var inp = R.input, lvl = inp.security || 'standard';
    return ROLE_ROWS.filter(function (r) {
      var k = r[1];
      if (k === 'k8s') return inp.platform === 'k8s';
      if (k === 'db') return inp.dbEngine !== 'none';
      if (k === 'cdn') return inp.useCDN; if (k === 'waf') return inp.useWAF; if (k === 'vpn') return inp.useVPN && !inp.hybridOn;
      if (k === 'dw') return inp.workload === 'analytics' || inp.dwTB > 0; if (k === 'gpu') return inp.workload === 'ai';
      if (/^sec_(detect|posture|vuln|audit)$/.test(k)) return lvl !== 'standard';
      if (/^sec_/.test(k)) return lvl === 'strict';
      if (k === 'hybrid_mgmt') return inp.hybridOn && inp.hybridServers > 0;
      if (/^hybrid_/.test(k)) return !!inp.hybridOn;
      if (k === 'video_vod') return inp.videoOn && inp.videoMode !== 'live';
      if (k === 'video_live') return inp.videoOn && inp.videoMode !== 'vod';
      if (/^video_/.test(k)) return !!inp.videoOn;
      if (k === 'ai_llm' || k === 'ai_guard') return inp.aiOn && inp.aiLLM;
      if (k === 'ai_rag') return inp.aiOn && inp.aiRAG; if (k === 'ai_ocr') return inp.aiOn && inp.aiOCR;
      if (k === 'ai_speech') return inp.aiOn && inp.aiSpeech; if (k === 'ai_vision') return inp.aiOn && inp.aiVision;
      if (k === 'mc_link') return !!inp.multiOn;
      return true;
    });
  }
  window.KC.rolesFor = rolesFor;
  function svcKey(inp, key) {
    if (key === 'hybrid_dx' && inp.hybridConn === 'vpn') return 'hybrid_vpn';
    if (key === 'mc_link' && inp.mcLink !== 'interconnect') return 'mc_vpn';
    return key;
  }
  function serviceName(R, p, key) {
    var inp = R.input;
    if (p === 'multi') {
      var m = R.multi.multi, pr = m.primary, sc = m.secondary, k = svcKey(inp, key);
      if (key === 'mc_link') return inp.mcLink === 'interconnect' ? P[pr].services.mc_link : P.aws.services.mc_vpn + ' ↔ ' + P.gcp.services.mc_vpn;
      if (m.pattern === 'bestofbreed' && /^(ai_|dw|gpu)/.test(key)) return PN(sc) + ': ' + (P[sc].services[k] || '');
      return PN(pr) + ': ' + (P[pr].services[k] || '') + (m.pattern === 'bestofbreed' ? '' : ' / ' + PN(sc) + ': ' + (P[sc].services[k] || ''));
    }
    return P[p].services[svcKey(inp, key)] || '';
  }
  window.KC.serviceName = serviceName;
  function specFor(B, key, inp) {
    if (B.provider === 'multi') {
      var m = B.multi;
      if (key === 'compute') return Engine.MC_LABEL[m.pattern] + ' · utama ' + PN(m.primary) + ', kedua ' + PN(m.secondary);
      if (key === 'mc_link') return inp.mcLink === 'interconnect' ? 'Koneksi privat 1 Gbps' : 'HA VPN 4 tunnel + replikasi ' + (+inp.mcSyncGB).toLocaleString(KCL()) + ' GB/bln';
      return specFor(m.A, key, inp);
    }
    if (key === 'compute') return B.app.n + ' × ' + B.app.inst.type + ' (' + B.app.inst.vcpu + ' vCPU / ' + B.app.inst.ram + ' GB), ' + (inp.os === 'windows' ? 'Windows' : 'Linux');
    if (key === 'db') return B.db ? B.db.name : '-';
    if (key === 'gpu') return B.gpu ? B.gpu.n + ' × ' + B.gpu.inst.type + ' (' + B.gpu.inst.gpu + ')' : '-';
    if (key === 'object') return fmtN(inp.objectTB) + ' TB + arsip ' + fmtN(inp.archiveTB) + ' TB';
    if (key === 'hybrid_dx') return Engine.HYB_LABEL[inp.hybridConn] + (inp.hybridRedundant ? ', 2 link redundan' : ', 1 link');
    if (key === 'video_cdn') return Math.round((+inp.watchHours || 0) * (+inp.videoBitrate || 3) * 3600 / 8 / 1e6) + ' TB/bulan';
    if (key === 'video_live') return fmtN(inp.liveChannels) + ' channel × ' + fmtN(inp.liveHoursDay) + ' jam/hari';
    if (key === 'video_vod') return fmtN(inp.vodHours) + ' jam konten/bulan';
    if (key === 'ai_llm') { var md = P[B.provider].ai.models[inp.aiTier]; return md.name + ' · ' + (+inp.aiRequests).toLocaleString(KCL()) + ' permintaan/bln'; }
    if (key === 'ai_rag') return fmtN(inp.ragGB) + ' GB dokumen';
    if (key === 'sec_detect') return Engine.SEC_LABEL[inp.security];
    return '';
  }
  window.KC.specFor = specFor;

  function solutionNarrative(R) {
    var inp = R.input, W = Engine.WORKLOADS[inp.workload], RM = Engine.RM(inp.regionKey);
    var s = 'Beban kerja <b>' + esc(W.label) + '</b> untuk ±' + inp.concurrent.toLocaleString(KCL()) + ' pengguna bersamaan (' + inp.users.toLocaleString(KCL()) + ' pengguna terdaftar) untuk pelanggan di <b>' + RM.label + '</b>, dengan tingkat ketersediaan <b>' + Engine.AVAIL[inp.availability] + '</b>. ';
    s += 'Usulan lokasi hosting: ' + hostingText(R) + '. ';
    s += inp.platform === 'k8s' ? 'Aplikasi dijalankan sebagai kontainer di Kubernetes terkelola, dengan autoscaling node. ' : 'Aplikasi dijalankan di virtual machine dalam auto scaling group / managed instance group di belakang load balancer. ';
    if (inp.dbEngine !== 'none') s += 'Database ' + Engine.DB_LABEL[inp.dbEngine] + ' memakai layanan terkelola' + (inp.dbEngine === 'oracle' ? ' (atau self-managed bila tidak tersedia)' : '') + (inp.availability !== 'standard' ? ' dengan replika standby di zona berbeda' : '') + '. ';
    if (inp.availability === 'critical') s += 'Region kedua disiapkan sebagai situs pemulihan bencana (warm standby). ';
    if ((inp.security || 'standard') !== 'standard') s += 'Tingkat keamanan <b>' + Engine.SEC_LABEL[inp.security] + '</b> menambahkan lapisan deteksi, audit, dan perlindungan data. ';
    if (inp.hybridOn) s += 'Lingkungan cloud terhubung ke data center on-premise pelanggan melalui <b>' + Engine.HYB_LABEL[inp.hybridConn] + '</b>' + (inp.hybridRedundant ? ' secara redundan' : '') + ' (hybrid cloud). ';
    if (inp.videoOn) s += 'Layanan video <b>' + Engine.VIDEO_LABEL[inp.videoMode] + '</b> memakai transcoding terkelola dan CDN untuk ±' + (+inp.watchHours).toLocaleString(KCL()) + ' jam tonton per bulan. ';
    if (inp.aiOn) s += '<b>Fitur AI</b> memakai layanan terkelola (model generatif tier ' + Engine.AI_TIER[inp.aiTier] + (inp.aiRAG ? ', RAG atas dokumen internal' : '') + '). ';
    if (inp.multiOn) s += 'Opsi <b>multi-cloud</b> dihitung dengan pola ' + Engine.MC_LABEL[inp.mcPattern] + '. ';
    return s;
  }

  /* Region usulan per provider: di dalam negeri atau region terdekat */
  function hostingList(R) {
    var inp = R.input, RM = Engine.RM(inp.regionKey);
    return ['aws', 'gcp'].filter(function (p) { return R[p]; }).map(function (p) {
      return { p: p, name: R[p].region.name, local: RM.local[p] };
    });
  }
  function hostingText(R) {
    var RM = Engine.RM(R.input.regionKey);
    return hostingList(R).map(function (h) {
      return '<b>' + PN(h.p) + ' – ' + esc(h.name) + '</b> (' + (h.local ? 'di dalam negeri' : 'region terdekat — ' + PN(h.p) + ' belum memiliki region di ' + RM.label) + ')';
    }).join('; ');
  }
  window.KC.hostingList = hostingList;
  function renderSolusi(R) {
    var inp = R.input, h = '';
    if (R.provs.length >= 2) {
      var sorted = R.provs.slice().sort(function (x, y) { return R[x].summary.periodTotal - R[y].summary.periodTotal; });
      var best = sorted[0], other = sorted[1];
      var diff = R[other].summary.periodTotalIdr - R[best].summary.periodTotalIdr, plab = R[best].summary.periodLabel.toLowerCase();
      h += '<div class="reco"><b>Rekomendasi biaya:</b> <span class="tag ' + best + '">' + PN(best) + '</span> paling hemat untuk periode ' + plab + ', ' + rpj(diff) + ' lebih rendah dari ' + PN(other) + ' (' + pct((diff / R[other].summary.periodTotalIdr) * 100) + '%). ' +
        'Pertimbangkan juga faktor non-biaya di tab Catatan: keahlian tim, ekosistem layanan, ketahanan, dan kontrak yang sudah ada.</div>';
    }
    h += '<div class="kpis">';
    R.provs.forEach(function (p) {
      var S = R[p].summary;
      h += '<div class="kpi ' + p + '"><div class="k">' + PN(p) + ' · per bulan (bln 1)</div><div class="v">' + rpj(S.month1Idr) + '</div><div class="s">' + usd(S.month1) + ' · ' + S.periodLabel.toLowerCase() + ': ' + rpj(S.periodTotalIdr) + '</div></div>';
    });
    var s0 = R[R.provs[0]].sizing;
    h += '<div class="kpi"><div class="k">Sizing aplikasi</div><div class="v">' + s0.totalVcpu + ' vCPU</div><div class="s">' + (s0.manual ? 'spesifikasi manual' : 'otomatis dari beban pengguna') + (s0.gpuNodes ? ' · ' + s0.gpuNodes + ' GPU' : '') + '</div></div>';
    h += '</div>';
    h += '<div class="card"><h2>Pemilihan Solusi</h2><p>' + solutionNarrative(R) + '</p><div class="table-wrap"><table><thead><tr><th>Komponen</th>';
    R.provs.forEach(function (p) { h += '<th><span class="tag ' + p + '">' + PN(p) + '</span></th>'; });
    h += '</tr></thead><tbody>';
    rolesFor(R).forEach(function (r) {
      h += '<tr><td>' + r[0] + '</td>';
      R.provs.forEach(function (p) { var sp = specFor(R[p], r[1], inp); h += '<td><b>' + esc(serviceName(R, p, r[1])) + '</b>' + (sp ? '<br><span class="muted">' + esc(sp) + '</span>' : '') + '</td>'; });
      h += '</tr>';
    });
    h += '</tbody></table></div></div>';
    R.provs.forEach(function (p) {
      h += '<div class="card"><h2>Topologi – ' + PN(p) + ' <span class="muted" style="font-weight:400;font-size:13px">' + esc(R[p].region.name) + '</span></h2><div class="topo" id="topo-' + p + '">' + topoSVG(R[p], inp) + '</div></div>';
    });
    $('solusiOut').className = ''; $('solusiOut').innerHTML = h;
  }

  /* ---------------- topologi SVG ---------------- */
  function topoItems(B, inp, prov) {
    var svc = P[prov].services, items = [], lvl = inp.security || 'standard';
    var SEC = '#8b1e3f', VID = '#d65db1', AIC = '#6a994e', DEF = '#2a9d8f';
    items.push([svc.object, fmtN(inp.objectTB) + ' TB data aplikasi', DEF]);
    items.push([svc.backup, 'Retensi ' + fmtN(inp.backupDays) + ' hari', DEF]);
    items.push([svc.monitor, 'Metrik, log, alarm', DEF]);
    items.push([svc.iam, 'SSO, MFA, least privilege', DEF]);
    items.push([svc.kms, 'Enkripsi at-rest' + (lvl !== 'standard' ? ' (CMK)' : ''), DEF]);
    if (inp.platform === 'k8s') items.push([svc.k8s, 'Control plane terkelola', DEF]);
    if (inp.workload === 'analytics' || inp.dwTB > 0) items.push([svc.dw, 'Kueri analitik', DEF]);
    if (inp.archiveTB > 0) items.push([P[prov].storage.names.archive, fmtN(inp.archiveTB) + ' TB arsip', DEF]);
    if (lvl !== 'standard') {
      items.push([svc.sec_detect, 'Deteksi ancaman', SEC]);
      if (prov === 'aws') items.push([svc.sec_posture, 'Postur & kepatuhan', SEC]);
      items.push([svc.sec_audit, 'Log audit 12 bulan', SEC]);
    }
    if (lvl === 'strict') {
      items.push([svc.sec_hsm, 'Kunci di HSM', SEC]);
      items.push([svc.sec_dlp, 'Penemuan data pribadi', SEC]);
      items.push([svc.sec_siem, 'Log ke SIEM/SOC', SEC]);
    }
    if (inp.videoOn) {
      if (inp.videoMode !== 'live') items.push([svc.video_vod, fmtN(inp.vodHours) + ' jam konten/bln', VID]);
      if (inp.videoMode !== 'vod') items.push([svc.video_live, 'Input SRT/RTMP dari encoder', VID]);
      items.push([svc.video_origin, 'Origin HLS/DASH', VID]);
    }
    if (inp.aiOn) {
      if (inp.aiLLM) items.push([svc.ai_llm, P[prov].ai.models[inp.aiTier].name, AIC]);
      if (inp.aiRAG) items.push([svc.ai_rag, fmtN(inp.ragGB) + ' GB dokumen', AIC]);
      if (inp.aiLLM) items.push([svc.ai_guard, 'Filter konten & PII', AIC]);
      var aa = [];
      if (inp.aiOCR) aa.push(svc.ai_ocr); if (inp.aiSpeech) aa.push(svc.ai_speech); if (inp.aiVision) aa.push(svc.ai_vision);
      if (aa.length) items.push(['Layanan AI siap pakai', aa.join(', '), AIC]);
    }
    return items;
  }
  function svgKit(prov, out, C) {
    var k = {};
    k.box = function (x, y, w, h, o) {
      o = o || {};
      out.push('<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="' + (o.r || 8) + '" fill="' + (o.fill || '#fff') + '" stroke="' + (o.stroke || '#9aa7b4') + '" stroke-width="' + (o.sw || 1.2) + '"' + (o.dash ? ' stroke-dasharray="6 4"' : '') + '/>');
      if (o.title) out.push('<text x="' + (x + 10) + '" y="' + (y + 17) + '" font-size="12" font-weight="700" fill="' + (o.tc || '#14202e') + '">' + esc(o.title) + '</text>');
    };
    k.node = function (x, y, w, t1, t2, col) {
      var maxc = Math.floor((w - 16) / 6.4);
      if (t1.length > maxc) t1 = t1.slice(0, maxc - 1) + '…';
      if (t2 && t2.length > Math.floor((w - 16) / 5.6)) t2 = t2.slice(0, Math.floor((w - 16) / 5.6) - 1) + '…';
      k.box(x, y, w, 44, { fill: '#fff', stroke: col || C, sw: 1.6, r: 6 });
      out.push('<rect x="' + x + '" y="' + y + '" width="5" height="44" rx="2" fill="' + (col || C) + '"/>');
      out.push('<text x="' + (x + 12) + '" y="' + (y + 18) + '" font-size="11.5" font-weight="700" fill="#14202e">' + esc(t1) + '</text>');
      if (t2) out.push('<text x="' + (x + 12) + '" y="' + (y + 34) + '" font-size="10.5" fill="#5b6b7c">' + esc(t2) + '</text>');
    };
    k.line = function (x1, y1, x2, y2, dash, col, wdt) {
      out.push('<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" stroke="' + (col || '#5b6b7c') + '" stroke-width="' + (wdt || 1.5) + '"' + (dash ? ' stroke-dasharray="5 4"' : '') + ' marker-end="url(#arr' + prov + ')"/>');
    };
    k.text = function (x, y, t, o) { o = o || {}; out.push('<text x="' + x + '" y="' + y + '" font-size="' + (o.fs || 10.5) + '" text-anchor="' + (o.anchor || 'start') + '" fill="' + (o.col || '#5b6b7c') + '"' + (o.bold ? ' font-weight="700"' : '') + '>' + esc(t) + '</text>'); };
    k.head = function (W, H) {
      out.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" font-family="Arial, Helvetica, sans-serif">');
      out.push('<defs><marker id="arr' + prov + '" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#5b6b7c"/></marker></defs>');
      out.push('<rect width="' + W + '" height="' + H + '" fill="#ffffff"/>');
    };
    return k;
  }

  function topoSVG(B, inp) {
    if (B.provider === 'multi') return topoMulti(B, inp);
    var prov = B.provider, C = prov === 'aws' ? '#d9822b' : '#2f6fd6', CL = prov === 'aws' ? '#fdf3e8' : '#ecf2fc', svc = P[prov].services;
    var multi = inp.availability !== 'standard', W = 1000, out = [], lvl = inp.security || 'standard';
    var dr = inp.availability === 'critical';
    var all = topoItems(B, inp, prov);
    var items = all.filter(function (it) { return it[2] === '#2a9d8f'; }), extra = all.filter(function (it) { return it[2] !== '#2a9d8f'; });
    var bandRows = Math.ceil(extra.length / 4), bandH = extra.length ? bandRows * 52 + 34 : 0;
    var ry = 90, coreH = Math.max(470, items.length * 52 + 80), rh = coreH + bandH;
    var H = ry + rh + (dr ? 160 : 30);
    var K = svgKit(prov, out, C), box = K.box, node = K.node, line = K.line;
    K.head(W, H);
    // Edge
    node(40, 20, 170, inp.videoOn ? 'Pengguna & penonton' : 'Pengguna / Internet', inp.concurrent.toLocaleString(KCL()) + ' pengguna bersamaan', '#14202e');
    var ex = 250, showCdn = inp.useCDN || inp.videoOn;
    node(ex, 20, 150, svc.dns, 'DNS publik');
    if (showCdn) { node(ex + 170, 20, 150, svc.cdn, inp.videoOn ? 'Cache statis + video' : 'Cache konten statis'); }
    if (inp.useWAF) { node(ex + (showCdn ? 340 : 170), 20, 160, svc.waf, lvl === 'strict' ? 'L7 + DDoS lanjutan' : 'Filter L7 & DDoS'); }
    line(210, 42, 248, 42);
    if (showCdn) line(400, 42, 418, 42);
    if (inp.useWAF) line(showCdn ? 570 : 400, 42, showCdn ? 588 : 418, 42);
    var onprem = inp.hybridOn || inp.useVPN;
    if (onprem) node(790, 20, 180, inp.hybridOn ? 'DC On-premise pelanggan' : 'Kantor / DC pelanggan', inp.hybridOn ? Engine.HYB_LABEL[inp.hybridConn] : 'via ' + svc.vpn, '#14202e');
    // Region
    box(20, ry, 960, rh, { fill: CL, stroke: C, sw: 1.8, r: 12, title: (prov === 'aws' ? 'AWS Region: ' : 'Google Cloud Region: ') + B.region.name, tc: C });
    box(40, ry + 30, 680, coreH - 50, { fill: '#ffffff', stroke: '#5b6b7c', sw: 1.2, dash: true, title: svc.vpc + ' (privat)' });
    node(240, ry + 58, 280, svc.lb, multi ? 'Lintas zona, health check, TLS' : 'Health check, TLS');
    if (lvl === 'strict') node(540, ry + 58, 170, svc.sec_fw, 'Inspeksi IDS/IPS', '#8b1e3f');
    if (onprem) {
      var hx = inp.hybridOn && inp.hybridConn !== 'vpn' ? (inp.hybridConn.indexOf('dedicated') === 0 ? svc.hybrid_dx : svc.hybrid_dx) : svc.vpn;
      line(880, 64, 700, ry + 40, inp.hybridOn ? false : true, '#3d5a80', inp.hybridOn && inp.hybridConn !== 'vpn' ? 3 : 1.5);
      K.text(985, ry - 8, hx + (inp.hybridOn && inp.hybridRedundant ? ' ×2' : ''), { col: '#3d5a80', bold: true, anchor: 'end' });
    }
    var azs = multi ? 2 : 1, aw = multi ? 320 : 660, ax0 = 50;
    var perAz = [];
    for (var z = 0; z < azs; z++) perAz.push(Math.floor(B.app.n / azs) + (z < B.app.n % azs ? 1 : 0));
    for (z = 0; z < azs; z++) {
      var ax = ax0 + z * (aw + 20), ay = ry + 118, ah = coreH - 150;
      box(ax, ay, aw, ah, { fill: '#f7f9fb', stroke: '#9aa7b4', title: (prov === 'aws' ? 'Availability Zone ' : 'Zona ') + String.fromCharCode(97 + z) });
      box(ax + 10, ay + 28, aw - 20, B.gpu ? 150 : 120, { fill: '#fff', stroke: '#c9d2dc', title: 'Subnet privat – aplikasi' + (inp.platform === 'k8s' ? ' (node pool)' : '') });
      var cnt = perAz[z], shown = Math.min(cnt, 3), nw = (aw - 40 - (shown - 1) * 8) / Math.max(shown, 1);
      for (var i = 0; i < shown; i++) {
        var lbl = (i === 2 && cnt > 3) ? '+' + (cnt - 2) + ' node lagi' : B.app.inst.type;
        node(ax + 20 + i * (nw + 8), ay + 60, nw, lbl, B.app.inst.vcpu + ' vCPU / ' + B.app.inst.ram + ' GB');
      }
      if (B.gpu && z === 0) node(ax + 20, ay + 112, Math.min(aw - 40, 260), B.gpu.n + ' × ' + B.gpu.inst.type, B.gpu.inst.gpu, '#7a4fbf');
      if (B.db) {
        box(ax + 10, ay + (B.gpu ? 188 : 160), aw - 20, 80, { fill: '#fff', stroke: '#c9d2dc', title: 'Subnet privat – data' });
        node(ax + 20, ay + (B.gpu ? 218 : 190), aw - 40, (z === 0 ? 'DB Primary' : 'DB Standby (sinkron)'), B.db.name, '#7a4fbf');
      }
      if (prov === 'aws' || z === 0) node(ax + 10, ay + ah - 50, Math.min(200, aw - 20), svc.nat, 'Egress update & API keluar', '#5b6b7c');
      line(380, ry + 102, ax + aw / 2, ay + 26);
    }
    if (B.db && multi) K.text(50 + aw + 10, ry + 118 + (B.gpu ? 258 : 230), 'replikasi', { anchor: 'middle', col: '#7a4fbf', fs: 10 });
    line(500, 64, 400, ry + 56);
    // Managed services column
    var mx = 740, my = ry + 34, mw = 225;
    box(mx - 10, my - 4, mw + 20, items.length * 52 + 30, { fill: '#ffffff', stroke: '#9aa7b4', title: 'Layanan terkelola regional' });
    items.forEach(function (it, k) { node(mx, my + 26 + k * 52, mw, it[0], it[1], it[2]); });
    if (extra.length) {
      var by = ry + coreH - 10;
      box(40, by, 925, bandH, { fill: '#ffffff', stroke: '#9aa7b4', title: 'Layanan keamanan, video & AI' });
      extra.forEach(function (it, k) { node(50 + (k % 4) * 229, by + 26 + Math.floor(k / 4) * 52, 219, it[0], it[1], it[2]); });
    }
    // legenda warna
    var lg = [['#2a9d8f', 'Umum'], ['#8b1e3f', 'Keamanan'], ['#d65db1', 'Video'], ['#6a994e', 'AI']], lx = 40;
    lg.forEach(function (g) { out.push('<rect x="' + lx + '" y="' + (H - 18) + '" width="10" height="10" fill="' + g[0] + '"/>'); K.text(lx + 14, H - 9, g[1], { fs: 10 }); lx += 80; });
    if (dr && B.drRegion) {
      var dy = ry + rh + 20;
      box(20, dy, 960, 110, { fill: '#f2f4f7', stroke: '#6b7a8a', sw: 1.4, dash: true, r: 12, title: 'Region DR: ' + B.drRegion.name + ' (warm standby)', tc: '#465260' });
      node(50, dy + 40, 250, 'App standby', Math.max(1, Math.ceil(B.app.n / 2)) + ' × ' + B.app.inst.type, '#6b7a8a');
      if (B.db) node(330, dy + 40, 280, 'DB replika lintas region', 'Promosi saat failover', '#6b7a8a');
      node(640, dy + 40, 300, 'Salinan object storage & backup', 'Replikasi asinkron', '#6b7a8a');
      line(500, ry + rh, 500, dy + 38, true, '#6b7a8a');
    }
    K.text(980, H - 8, 'Kalkulator Cloud · disusun oleh @letsgobram - @motivaseein', { anchor: 'end', col: '#9aa7b4', fs: 10 });
    out.push('</svg>');
    return out.join('');
  }

  function topoMulti(B, inp) {
    var m = B.multi, out = [], W = 1000, K = svgKit('multi', out, '#7a4fbf');
    var COL = { aws: '#d9822b', gcp: '#2f6fd6' }, BG = { aws: '#fdf3e8', gcp: '#ecf2fc' };
    function plan(role) {
      var p = m[role], Bx = role === 'primary' ? m.A : m.B, svc = P[p].services, col = COL[p], rows = [];
      var showApp = !(role === 'secondary' && m.pattern === 'bestofbreed');
      if (showApp) {
        rows.push([[svc.lb, 'TLS, health check', col]]);
        var n = Bx.app.n; if (role === 'secondary' && m.pattern === 'activepassive') n = Math.max(1, Math.ceil(n / 2));
        rows.push([[n + ' × ' + Bx.app.inst.type + (m.pattern === 'activeactive' ? ' (60% kapasitas)' : role === 'secondary' ? ' (standby 50%)' : ''), Bx.app.inst.vcpu + ' vCPU / ' + Bx.app.inst.ram + ' GB per node', col]]);
        if (Bx.db) rows.push([[role === 'primary' ? 'DB Primary' : 'DB Replika lintas cloud', Bx.db.name, '#7a4fbf']]);
        rows.push([[svc.object, fmtN(inp.objectTB) + ' TB', '#2a9d8f'], [svc.monitor, 'Metrik & log', '#2a9d8f']]);
      } else rows.push([[svc.object + ' (data lake)', 'Salinan data untuk analitik/AI', '#2a9d8f']]);
      var aiHere = m.pattern === 'bestofbreed' ? role === 'secondary' : role === 'primary';
      if (inp.aiOn && aiHere) {
        if (inp.aiLLM) rows.push([[svc.ai_llm, P[p].ai.models[inp.aiTier].name, '#6a994e']]);
        if (inp.aiRAG) rows.push([[svc.ai_rag, fmtN(inp.ragGB) + ' GB dokumen', '#6a994e']]);
      }
      if ((inp.workload === 'analytics' || inp.dwTB > 0) && aiHere) rows.push([[svc.dw, 'Analitik', '#6a994e']]);
      if (inp.videoOn && role === 'primary') rows.push([[svc.video_cdn, 'Pengiriman video', '#d65db1']]);
      if ((inp.security || 'standard') !== 'standard') rows.push([[svc.sec_detect, Engine.SEC_LABEL[inp.security], '#8b1e3f']]);
      return rows;
    }
    var pr = plan('primary'), sc = plan('secondary'), bh = Math.max(pr.length, sc.length) * 56 + 50;
    var by = 100, H = by + bh + 80;
    K.head(W, H);
    K.node(40, 20, 200, inp.videoOn ? 'Pengguna & penonton' : 'Pengguna / Internet', inp.concurrent.toLocaleString(KCL()) + ' pengguna bersamaan', '#14202e');
    var dnsT = m.pattern === 'activeactive' ? ['DNS global + health check', 'Bagi trafik ke dua cloud'] : m.pattern === 'activepassive' ? ['DNS (failover routing)', 'Utama → kedua bila gagal'] : ['DNS publik', 'Ke aplikasi di cloud utama'];
    K.node(380, 20, 240, dnsT[0], dnsT[1], '#7a4fbf');
    K.line(240, 42, 378, 42);
    if (inp.hybridOn || inp.useVPN) { K.node(770, 20, 200, 'DC On-premise', inp.hybridOn ? Engine.HYB_LABEL[inp.hybridConn] : 'VPN', '#14202e'); K.line(860, 64, 420, by - 2, false, '#3d5a80', 2.5); }
    [['primary', 20, pr], ['secondary', 510, sc]].forEach(function (pp) {
      var role = pp[0], x = pp[1], rows = pp[2], p = m[role], Bx = role === 'primary' ? m.A : m.B;
      var title = PN(p) + ' – ' + Bx.region.name + (role === 'primary' ? ' (utama)' : m.pattern === 'activepassive' ? ' (standby / DR)' : m.pattern === 'activeactive' ? ' (aktif)' : ' (data & AI)');
      K.box(x, by, 470, bh, { fill: BG[p], stroke: COL[p], sw: 1.8, r: 12, title: title, tc: COL[p] });
      rows.forEach(function (r, i) {
        var y = by + 35 + i * 56, w = r.length === 1 ? 430 : 210;
        r.forEach(function (n, j) { K.node(x + 20 + j * 220, y, w, n[0], n[1], n[2]); });
      });
    });
    K.line(500, 64, 255, by - 2);
    if (m.pattern === 'activeactive') K.line(500, 64, 745, by - 2); else if (m.pattern === 'activepassive') K.line(500, 64, 745, by - 2, true);
    var lk = inp.mcLink === 'interconnect' ? 'Interkoneksi privat antar cloud 1 Gbps' : 'HA VPN antar cloud';
    out.push('<line x1="490" y1="' + (by + bh - 30) + '" x2="510" y2="' + (by + bh - 30) + '" stroke="#7a4fbf" stroke-width="4"/>');
    K.box(310, by + bh + 14, 380, 36, { fill: '#f4effb', stroke: '#7a4fbf', r: 8 });
    K.text(500, by + bh + 36, lk + ' · replikasi ' + (+inp.mcSyncGB || 0).toLocaleString(KCL()) + ' GB/bln', { anchor: 'middle', col: '#4b2a86', bold: true, fs: 11 });
    K.line(500, by + bh + 14, 500, by + bh - 26, false, '#7a4fbf');
    K.text(980, H - 4, 'Kalkulator Cloud · disusun oleh @letsgobram - @motivaseein', { anchor: 'end', col: '#9aa7b4', fs: 10 });
    out.push('</svg>');
    return out.join('');
  }
  window.KC.topoSVG = function (p) { return topoSVG(LAST[p], LAST.input); };

  /* ---------------- grafik ---------------- */
  function barChart12(R) {
    var W = 1000, H = 370, pl = 70, pr = 20, pt = 30, pb = 86, provs = R.provs;
    var max = 0;
    provs.forEach(function (p) { R[p].summary.months.forEach(function (m) { max = Math.max(max, m.totalIdr); }); });
    max = niceMax(max);
    var NM = R[provs[0]].summary.months.length, gw = (W - pl - pr) / NM, gap = NM > 12 ? 4 : 14, bw = (gw - gap) / provs.length;
    var o = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" font-family="Arial, Helvetica, sans-serif"><rect width="' + W + '" height="' + H + '" fill="#fff"/>'];
    for (var t = 0; t <= 5; t++) {
      var y = pt + (H - pt - pb) * (1 - t / 5);
      o.push('<line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + y + '" y2="' + y + '" stroke="#e3e8ee"/><text x="' + (pl - 8) + '" y="' + (y + 4) + '" font-size="11" text-anchor="end" fill="#5b6b7c">' + short(max * t / 5) + '</text>');
    }
    for (var m = 0; m < NM; m++) {
      provs.forEach(function (p, k) {
        var x = pl + m * gw + gap / 2 + k * bw, y0 = H - pb, row = R[p].summary.months[m], fx = R[p].summary.fxEff;
        Engine.CAT.forEach(function (c) {
          var v = (row.byCat[c] || 0) * (1 + Engine.taxInfo(R.input).rate) * fx; if (v <= 0) return;
          var hh = (H - pt - pb) * v / max; y0 -= hh;
          o.push('<rect x="' + x.toFixed(1) + '" y="' + y0.toFixed(1) + '" width="' + (bw - 2).toFixed(1) + '" height="' + hh.toFixed(1) + '" fill="' + CAT_COLORS[c] + '"/>');
        });
        o.push('<rect x="' + x.toFixed(1) + '" y="' + (H - pb + 2) + '" width="' + (bw - 2).toFixed(1) + '" height="4" fill="' + COLORS[p] + '"/>');
      });
      if (NM <= 12 || (m + 1) % 3 === 0 || m === 0) o.push('<text x="' + (pl + m * gw + gw / 2) + '" y="' + (H - pb + 20) + '" font-size="11" text-anchor="middle" fill="#5b6b7c">' + (NM > 12 ? (m + 1) : 'Bln ' + (m + 1)) + '</text>');
    }
    var lx = pl, ly = H - 46, used = {};
    provs.forEach(function (p) { var lm = R[p].summary.months[R[p].summary.months.length - 1]; Engine.CAT.forEach(function (c) { if (lm.byCat[c] > 0) used[c] = 1; }); });
    Engine.CAT.filter(function (c) { return used[c]; }).forEach(function (c) {
      var w = 14 + c.length * 6.2 + 18; if (lx + w > W - pr) { lx = pl; ly += 18; }
      o.push('<rect x="' + lx + '" y="' + ly + '" width="10" height="10" fill="' + CAT_COLORS[c] + '"/><text x="' + (lx + 14) + '" y="' + (ly + 9) + '" font-size="11" fill="#14202e">' + esc(c) + '</text>'); lx += w; });
    if (provs.length >= 2) o.push('<text x="' + (W - pr) + '" y="' + (pt - 10) + '" font-size="11" text-anchor="end" fill="#5b6b7c">Urutan batang: ' + provs.map(PN).join(' · ') + ' (garis bawah: oranye = AWS, biru = Google Cloud, ungu = Multi-cloud)</text>');
    o.push('</svg>');
    return o.join('');
  }
  function tcoChart(R) {
    var W = 1000, H = 320, pl = 80, pr = 140, pt = 24, pb = 46, Y = R[R.provs[0]].tco.years;
    var series = [];
    R.provs.forEach(function (p) { series.push({ name: PN(p), col: COLORS[p], ys: cum(R[p].tco.cloud.years) }); });
    series.push({ name: 'On-premise', col: COLORS.op, ys: cum(R[R.provs[0]].tco.onprem.years) });
    var max = 0; series.forEach(function (s) { s.ys.forEach(function (v) { max = Math.max(max, v); }); }); max = niceMax(max);
    var o = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" font-family="Arial, Helvetica, sans-serif"><rect width="' + W + '" height="' + H + '" fill="#fff"/>'];
    var X = function (i) { return pl + (W - pl - pr) * i / Y; }, Yp = function (v) { return pt + (H - pt - pb) * (1 - v / max); };
    for (var t = 0; t <= 5; t++) { var yy = Yp(max * t / 5); o.push('<line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + yy + '" y2="' + yy + '" stroke="#e3e8ee"/><text x="' + (pl - 8) + '" y="' + (yy + 4) + '" font-size="11" text-anchor="end" fill="#5b6b7c">' + short(max * t / 5) + '</text>'); }
    for (var i = 0; i <= Y; i++) o.push('<text x="' + X(i) + '" y="' + (H - pb + 18) + '" font-size="11" text-anchor="middle" fill="#5b6b7c">' + (i === 0 ? 'Awal' : 'Thn ' + i) + '</text>');
    series.forEach(function (s) {
      var pts = [[X(0), Yp(0)]]; s.ys.forEach(function (v, k) { pts.push([X(k + 1), Yp(v)]); });
      o.push('<polyline fill="none" stroke="' + s.col + '" stroke-width="3" points="' + pts.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ') + '"/>');
      pts.slice(1).forEach(function (p) { o.push('<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="4" fill="' + s.col + '"/>'); });
      s.lx = pts[pts.length - 1][0] + 10; s.ly = pts[pts.length - 1][1] + 4;
    });
    var lab = series.slice().sort(function (a, b) { return a.ly - b.ly; });
    for (var q = 1; q < lab.length; q++) if (lab[q].ly - lab[q - 1].ly < 16) lab[q].ly = lab[q - 1].ly + 16;
    lab.forEach(function (s) { o.push('<text x="' + s.lx + '" y="' + s.ly + '" font-size="12" font-weight="700" fill="' + s.col + '">' + s.name + '</text>'); });
    o.push('<text x="' + pl + '" y="' + (H - 8) + '" font-size="11" fill="#5b6b7c">Biaya kumulatif (' + CS() + ') — termasuk investasi awal, operasional, dan SDM</text></svg>');
    return o.join('');
  }
  function cum(a) { var s = 0; return a.map(function (v) { s += v; return s; }); }
  function niceMax(v) { if (v <= 0) return 1; var e = Math.pow(10, Math.floor(Math.log10(v))), n = v / e; var m = n <= 1 ? 1 : n <= 1.5 ? 1.5 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 3 ? 3 : n <= 4 ? 4 : n <= 5 ? 5 : n <= 6 ? 6 : n <= 8 ? 8 : 10; return m * e; }
  function short(v) { return KCCur.compactNum(v, v >= 1e9 ? 1 : 0, 1e6); }
  window.KC.barChart12 = function () { return barChart12(LAST); };
  window.KC.tcoChart = function () { return tcoChart(LAST); };

  /* ---------------- render: biaya ---------------- */
  function bomTable(B, R) {
    var fx = B.summary.fxEff, h = '<div class="table-wrap"><table><thead><tr><th>Kategori</th><th>Layanan</th><th>Rincian</th><th class="num">Qty</th><th>Satuan</th><th class="num">Harga satuan</th><th class="num">Diskon</th><th class="num">Bulanan (USD)</th><th class="num">Bulanan (' + CS() + ')</th></tr></thead><tbody>';
    var lastCat = '', sub = 0;
    B.items.forEach(function (it) {
      h += '<tr><td>' + (it.cat !== lastCat ? '<b>' + it.cat + '</b>' : '') + '</td><td>' + esc(it.svc) + '</td><td class="muted">' + esc(it.desc) + '</td><td class="num">' + fmtQty(it.qty) + '</td><td>' + it.unit + '</td><td class="num">' + unitP(it.unitPrice) + '</td><td class="num">' + (it.dC ? Math.round(it.dC * 100) + '%' : '–') + '</td><td class="num">' + usd(it.m1) + '</td><td class="num">' + rp(it.m1Idr) + '</td></tr>';
      lastCat = it.cat; sub += it.m1;
    });
    var m = B.summary.months[0];
    h += '<tr class="sub"><td colspan="7">Subtotal layanan</td><td class="num">' + usd(sub) + '</td><td class="num">' + rp(sub * fx) + '</td></tr>';
    h += '<tr><td colspan="7">Support: ' + esc(B.supportName) + '</td><td class="num">' + usd(m.byCat.Support) + '</td><td class="num">' + rp(m.byCat.Support * fx) + '</td></tr>';
    if (R.input.includeTax) h += '<tr><td colspan="7">' + taxLabel(R.input) + '</td><td class="num">' + usd(m.tax) + '</td><td class="num">' + rp(m.tax * fx) + '</td></tr>';
    h += '<tr class="total"><td colspan="7">Total bulan pertama</td><td class="num">' + usd(m.total) + '</td><td class="num">' + rp(m.totalIdr) + '</td></tr></tbody></table></div>';
    return h;
  }
  function taxLabel(inp) { var t = Engine.taxInfo(inp); return (t.name === 'Pajak' ? 'Pajak' : t.name) + ' (' + pct(t.pct, t.pct % 1 ? 1 : 0) + '%)'; }
  window.KC.taxLabel = taxLabel;
  function fmtQty(q) { return q >= 100 ? Math.round(q).toLocaleString(KCL()) : (+q.toFixed(2)).toLocaleString(KCL()); }
  function unitP(p) { return p < 0.01 ? '$' + pct(p, 5) : p < 1 ? '$' + pct(p, 4) : usd(p); }
  window.KC.fmtQty = fmtQty; window.KC.unitP = unitP;

  function renderBiaya(R) {
    var h = '<div class="kpis">';
    R.provs.forEach(function (p) {
      var S = R[p].summary;
      h += '<div class="kpi ' + p + '"><div class="k">' + PN(p) + ' · total ' + S.periodLabel.toLowerCase() + '</div><div class="v">' + rpj(S.periodTotalIdr) + '</div><div class="s">' + usd(S.periodTotal) + ' · rata-rata ' + rpj(S.periodTotalIdr / S.period) + '/bln</div></div>';
      h += '<div class="kpi ' + p + '"><div class="k">' + PN(p) + ' · hemat vs on-demand</div><div class="v">' + rpj((S.ondemandBase - (S.month1 - S.support1 - S.months[0].tax)) * S.fxEff) + '</div><div class="s">per bulan vs harga on-demand penuh</div></div>';
      if (R[p].alt1y) h += '<div class="kpi ' + p + '"><div class="k">' + PN(p) + ' · bila beli komitmen 1 thn</div><div class="v">' + rpj(R[p].alt1y.totalIdr) + '</div><div class="s">' + (R[p].alt1y.cheaper ? 'lebih murah – pertimbangkan komitmen' : 'lebih mahal ' + rpj(R[p].alt1y.totalIdr - S.periodTotalIdr) + ' (komitmen dibayar 12 bln)') + '</div></div>';
    });
    h += '</div>';
    h += '<div class="card"><h2>Proyeksi biaya sewa bulanan – ' + R[R.provs[0]].summary.periodLabel.toLowerCase() + ' (' + Engine.PRICING_LABEL[R.input.pricing] + ')</h2><p class="muted">Termasuk pertumbuhan beban ' + fmtN(R.input.growth) + '%/bulan, support, ' + (R.input.includeTax ? taxLabel(R.input) + ', ' : '') + 'kurs ' + KCCur.money(R[R.provs[0]].summary.fxEff) + '/USD (sudah termasuk buffer).</p><div class="chart">' + barChart12(R) + '</div>';
    h += '<div class="table-wrap" style="margin-top:12px"><table><thead><tr><th>Bulan</th>';
    R.provs.forEach(function (p) { h += '<th class="num">' + PN(p) + ' (USD)</th><th class="num">' + PN(p) + ' (' + CS() + ')</th>'; });
    h += '</tr></thead><tbody>';
    for (var m = 0; m < R[R.provs[0]].summary.months.length; m++) {
      h += '<tr><td>Bulan ' + (m + 1) + '</td>';
      R.provs.forEach(function (p) { var r = R[p].summary.months[m]; h += '<td class="num">' + usd(r.total) + '</td><td class="num">' + rp(r.totalIdr) + '</td>'; });
      h += '</tr>';
    }
    h += '<tr class="total"><td>Total ' + R[R.provs[0]].summary.periodLabel.toLowerCase() + '</td>';
    R.provs.forEach(function (p) { var S = R[p].summary; h += '<td class="num">' + usd(S.periodTotal) + '</td><td class="num">' + rp(S.periodTotalIdr) + '</td>'; });
    h += '</tr></tbody></table></div></div>';
    R.provs.forEach(function (p) {
      h += '<div class="card"><h2>Rincian biaya (Bill of Materials) – ' + PN(p) + ' · ' + esc(R[p].region.name) + '</h2>' + bomTable(R[p], R) + '</div>';
    });
    $('biayaOut').className = ''; $('biayaOut').innerHTML = h;
  }

  /* ---------------- render: TCO ---------------- */
  function renderTco(R) {
    var p0 = R.provs[0], T0 = R[p0].tco, Y = T0.years, OPr = T0.onprem, h = '<div class="kpis">';
    R.provs.forEach(function (p) {
      var T = R[p].tco;
      h += '<div class="kpi ' + p + '"><div class="k">TCO ' + Y + ' thn – ' + PN(p) + '</div><div class="v">' + rpj(T.cloud.total) + '</div><div class="s">' + (T.saving >= 0 ? 'Lebih hemat ' + rpj(T.saving) + ' (' + pct(T.savingPct * 100) + '%) vs on-prem' : 'Lebih mahal ' + rpj(-T.saving) + ' vs on-prem') + '</div></div>';
    });
    h += '<div class="kpi op"><div class="k">TCO ' + Y + ' thn – On-premise</div><div class="v">' + rpj(OPr.total) + '</div><div class="s">Capex awal ' + rpj(OPr.capex) + '</div></div></div>';
    h += '<div class="card"><h2>Perbandingan TCO ' + Y + ' tahun</h2><div class="chart">' + tcoChart(R) + '</div>';
    h += '<div class="table-wrap" style="margin-top:12px"><table><thead><tr><th>Tahun</th>';
    R.provs.forEach(function (p) { h += '<th class="num">' + PN(p) + '</th>'; });
    h += '<th class="num">On-premise</th></tr></thead><tbody>';
    for (var y = 0; y < Y; y++) {
      h += '<tr><td>Tahun ' + (y + 1) + '</td>';
      R.provs.forEach(function (p) { h += '<td class="num">' + rp(R[p].tco.cloud.years[y]) + '</td>'; });
      h += '<td class="num">' + rp(OPr.years[y]) + '</td></tr>';
    }
    h += '<tr class="total"><td>Total</td>';
    R.provs.forEach(function (p) { h += '<td class="num">' + rp(R[p].tco.cloud.total) + '</td>'; });
    h += '<td class="num">' + rp(OPr.total) + '</td></tr></tbody></table></div></div>';
    // komponen
    var O = R.OP, oy = OPr.opexY;
    h += '<div class="two"><div class="card"><h2>Asumsi on-premise</h2><table><tbody>' +
      tr('Server fisik (termasuk N+1 & pertumbuhan)', OPr.servers + ' unit × ' + rp(O.server_price_idr)) +
      tr('Storage usable', OPr.storageTB + ' TB × ' + rp(O.storage_per_tb_idr)) +
      (OPr.gpuCards ? tr('Kartu GPU', OPr.gpuCards + ' unit') : '') +
      (OPr.sqlLic ? tr('Lisensi SQL Server (perpetual)', rp(OPr.sqlLic)) : '') +
      tr('Jaringan & keamanan', rp(O.network_security_idr)) +
      (OPr.dr ? tr('Situs DR', '+' + Math.round(O.dr_site_factor * 100) + '% capex & opex infrastruktur') : '') +
      tr('Total capex tahun 0', '<b>' + rp(OPr.capex) + '</b>') +
      tr('Hypervisor / tahun', rp(oy.hypervisor) + ' (' + OPr.cores + ' core)') +
      (oy.os ? tr('Lisensi Windows / tahun', rp(oy.os)) : '') +
      tr('Colocation & listrik / tahun', rp(oy.colo)) +
      tr('Bandwidth internet / tahun', rp(oy.bandwidth) + ' (' + OPr.mbps + ' Mbps)') +
      tr('SDM / tahun', rp(oy.staff) + ' (' + fmtN(O.fte_onprem) + ' FTE)') +
      tr('Maintenance HW (mulai tahun 4)', Math.round(O.hw_maintenance_pct_year * 100) + '% capex / tahun') +
      '</tbody></table></div>';
    h += '<div class="card"><h2>Asumsi cloud</h2><table><tbody>' +
      tr('Biaya infrastruktur', 'Proyeksi bulanan × ' + (Y * 12) + ' bulan (pertumbuhan ' + fmtN(R.input.growth) + '%/bln)') +
      tr('SDM cloud / tahun', rp(R[p0].tco.cloud.staff) + ' (' + fmtN(O.fte_cloud) + ' FTE)') +
      tr('Migrasi (sekali)', rp(O.migration_one_time_idr)) +
      tr('Pelatihan (sekali)', rp(O.training_one_time_idr)) +
      tr('Kapasitas on-prem dibeli di depan', 'untuk beban s.d. bulan ke-' + Math.min(36, Y * 12) + ' + headroom ' + Math.round(O.headroom_pct * 100) + '%') +
      '</tbody></table><p class="muted" style="margin-top:10px">Semua asumsi on-premise dapat diubah di tab Kebutuhan. Cloud unggul saat beban tumbuh/berfluktuasi dan menghindari belanja modal di depan; on-premise bisa lebih murah untuk beban stabil, besar, dan 24/7 (mis. GPU penuh).</p></div></div>';
    $('tcoOut').className = ''; $('tcoOut').innerHTML = h;
  }
  function tr(a, b) { return '<tr><td>' + a + '</td><td class="num">' + b + '</td></tr>'; }

  /* ---------------- render: catatan ---------------- */
  function renderCatatan(R) {
    var L = { info: 'INFO', warn: 'PERHATIAN', risk: 'RISIKO' };
    var h = '<div class="card"><h2>Hal yang perlu menjadi catatan</h2><ul class="notes">';
    R.notes.forEach(function (n) { h += '<li><span class="lvl ' + n.lvl + '">' + L[n.lvl] + '</span>' + esc(n.text) + '</li>'; });
    h += '</ul></div><div class="card"><h2>Langkah berikutnya yang disarankan</h2><ol>' +
      '<li>Validasi angka beban (pengguna bersamaan, ukuran data, trafik) dengan data monitoring aktual 30 hari.</li>' +
      '<li>Proof of concept 2–4 minggu di region terpilih; ukur latensi dan biaya nyata dengan budget alert aktif.</li>' +
      '<li>Susun landing zone: struktur akun/proyek, jaringan, IAM, logging terpusat, guardrail keamanan.</li>' +
      '<li>Rencanakan migrasi bertahap (rehost → replatform), uji cutover dan rollback.</li>' +
      '<li>Ambil komitmen (Savings Plans / CUD) setelah pemakaian stabil, tinjau ulang tiap kuartal (FinOps).</li></ol></div>';
    $('catatanOut').className = ''; $('catatanOut').innerHTML = h;
  }

  /* ---------------- editor harga ---------------- */
  function renderPriceEditor() {
    var h = '';
    ['aws', 'gcp'].forEach(function (p) {
      var D = P[p];
      h += '<div class="card pe-section"><h3><span class="tag ' + p + '">' + D.label + '</span> Region &amp; pengali harga</h3>' + tableEditor(P.regions[p], ['id', 'name'], [['mult.compute', 'Compute'], ['mult.db', 'DB'], ['mult.storage', 'Storage'], ['mult.lb', 'LB'], ['mult.other', 'Lain'], ['egress.0.price', 'Egress tier-1 $/GB'], ['cdn_gb', 'CDN $/GB']], 'regions.' + p) + '</div>';
      h += '<div class="card pe-section"><h3><span class="tag ' + p + '">' + D.label + '</span> Tipe mesin (USD/jam, basis US)</h3><p class="muted">Setelah update online, harga aktual per region dipakai otomatis. Mengubah harga di sini akan menggantinya dengan harga basis × pengali region.</p>' + tableEditor(D.compute, [], [['type', 'Tipe', 'text'], ['family', 'Keluarga', 'text'], ['vcpu', 'vCPU'], ['ram', 'RAM GB'], ['hourly', 'USD/jam']], p + '.compute', true) + '</div>';
      if (D.db) h += '<div class="card pe-section"><h3><span class="tag ' + p + '">' + D.label + '</span> Kelas database (USD/jam, Single-AZ)</h3>' + tableEditor(D.db, [], [['type', 'Tipe', 'text'], ['family', 'Keluarga', 'text'], ['vcpu', 'vCPU'], ['ram', 'RAM GB'], ['hourly', 'USD/jam']], p + '.db', true) + '</div>';
      h += '<div class="card pe-section"><h3><span class="tag ' + p + '">' + D.label + '</span> Parameter lain (storage, jaringan, diskon)</h3><details><summary>Tampilkan / sembunyikan</summary>' + kvEditor(D, p, ['windows_per_vcpu_hr', 'db_custom', 'db_license_per_vcpu_hr', 'storage', 'network', 'other', 'discounts']) + '</details></div>';
    });
    h += '<div class="card pe-section"><h3>Asumsi on-premise bawaan</h3><details><summary>Tampilkan / sembunyikan</summary>' + kvEditor(P, '', ['onprem_defaults']) + '</details></div>';
    $('priceEditor').innerHTML = h;
    $('priceEditor').querySelectorAll('input[data-path]').forEach(function (el) { el.addEventListener('change', onPriceEdit); });
    $('priceEditor').querySelectorAll('button[data-add]').forEach(function (b) { b.addEventListener('click', function () { var arr = getPath(P, b.dataset.add); var last = clone(arr[arr.length - 1]); last.type = last.type + '-baru'; arr.push(last); savePrices(); renderPriceEditor(); }); });
    $('priceEditor').querySelectorAll('button[data-del]').forEach(function (b) { b.addEventListener('click', function () { var parts = b.dataset.del.split('#'); getPath(P, parts[0]).splice(+parts[1], 1); savePrices(); renderPriceEditor(); }); });
    $('priceMeta').textContent = 'Versi ' + P.meta.version + ' · diperbarui ' + P.meta.updated + ' · ' + P.meta.note;
  }
  function edNum(v) { return (+v).toLocaleString(KCL(), { maximumFractionDigits: 8 }); }
  function parseNum(s) { s = String(s).trim().replace(/\s/g, ''); if (KCL() === 'en-US') return parseFloat(s.replace(/,/g, '')); if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.'); else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ''); return parseFloat(s); }
  function getPath(o, path) { return path.split('.').reduce(function (a, k) { return a == null ? a : a[k]; }, o); }
  function setPath(o, path, v) { var ks = path.split('.'), last = ks.pop(); var t = ks.reduce(function (a, k) { return a[k]; }, o); t[last] = v; }
  function tableEditor(arr, ro, cols, base, canEdit) {
    var h = '<div class="table-wrap"><table class="pe"><thead><tr>';
    ro.forEach(function (c) { h += '<th>' + c + '</th>'; }); cols.forEach(function (c) { h += '<th>' + c[1] + '</th>'; }); if (canEdit) h += '<th></th>';
    h += '</tr></thead><tbody>';
    arr.forEach(function (row, i) {
      h += '<tr>'; ro.forEach(function (c) { h += '<td>' + esc(row[c]) + '</td>'; });
      cols.forEach(function (c) { var v = getPath(row, c[0]); h += '<td><input data-path="' + base + '.' + i + '.' + c[0] + '" data-kind="' + (c[2] || 'num') + '" value="' + esc(v == null ? '' : (c[2] === 'text' ? v : edNum(v))) + '"></td>'; });
      if (canEdit) h += '<td><button class="btn ghost small" data-del="' + base + '#' + i + '">Hapus</button></td>';
      h += '</tr>';
    });
    h += '</tbody></table></div>' + (canEdit ? '<button class="btn ghost small" data-add="' + base + '">+ Tambah tipe baru</button>' : '');
    return h;
  }
  function kvEditor(D, prefix, keys) {
    var h = '<div class="table-wrap"><table class="pe"><tbody>';
    function walk(o, path) {
      if (typeof o === 'number') { h += '<tr><td>' + path.replace(/^\w+\./, '') + '</td><td><input data-path="' + path + '" data-kind="num" value="' + edNum(o) + '"></td></tr>'; return; }
      if (o && typeof o === 'object' && !Array.isArray(o)) Object.keys(o).forEach(function (k) { if (k !== 'names') walk(o[k], path + '.' + k); });
    }
    keys.forEach(function (k) { walk(D[k], (prefix ? prefix + '.' : '') + k); });
    return h + '</tbody></table></div>';
  }
  function onPriceEdit(e) {
    var el = e.target, v = el.dataset.kind === 'text' ? el.value : parseNum(el.value);
    if (el.dataset.kind !== 'text' && isNaN(v)) { toast('Nilai harus angka'); return; }
    setPath(P, el.dataset.path, v);
    if (/\.hourly$/.test(el.dataset.path)) { var it = getPath(P, el.dataset.path.replace(/\.hourly$/, '')); if (it) delete it.byRegion; }
    P.meta.updated = new Date().toISOString().slice(0, 10) + ' (edit manual)'; savePrices();
    if (LAST) calculate(true);
  }
  function updateBadge() { $('priceBadge').textContent = 'Data harga: ' + P.meta.updated; staleCheck(); $('footMeta').textContent = 'Data harga ' + P.meta.version + ' · estimasi, bukan penawaran resmi'; }

  /* ---------------- update online ---------------- */
  function log(msg) { var l = $('updateLog'); l.hidden = false; l.textContent += msg + '\n'; l.scrollTop = 1e6; }
  async function fetchFx() {
    $('fxStatus').textContent = 'mengambil…';
    try {
      var r = await fetch('https://open.er-api.com/v6/latest/USD'); var j = await r.json();
      if (!j.rates || !j.rates.IDR) throw new Error('format tidak dikenal');
      $('fx').value = edNum(Math.round(j.rates.IDR)); P.meta.fx_usd_idr = Math.round(j.rates.IDR); savePrices();
      $('fxStatus').textContent = 'Kurs ' + Math.round(j.rates.IDR).toLocaleString(KCL()) + ' (' + (j.time_last_update_utc || '').slice(5, 16) + ')';
    } catch (e) { $('fxStatus').textContent = 'Gagal mengambil kurs (offline?). Isi manual.'; }
  }
  // ===== Update online (AWS Price List API + GCP pricing.yml + kurs) =====
  var onlineCtl = null;
  async function onlineUpdate() {
    if (onlineCtl) return;
    var opt = { aws: $('uAws').checked, gcp: $('uGcp').checked, fx: $('uFx').checked, ec2: $('uEc2').checked, catalog: $('uCat').checked };
    if (!opt.aws && !opt.gcp && !opt.fx) { toast('Pilih minimal satu sumber'); return; }
    onlineCtl = new AbortController();
    $('updateLog').textContent = ''; $('onlineChanges').innerHTML = '';
    $('btnOnline').disabled = true; $('btnOnlineCancel').hidden = false; $('onlineProg').hidden = false;
    $('onlineStatus').textContent = 'Menghubungi sumber harga…';
    var t0 = Date.now();
    try {
      var res = await OnlineUpdate.run(P, opt, {
        signal: onlineCtl.signal, log: log,
        progress: function (f, t) {
          var pg = $('onlineProg'); pg.classList.toggle('indet', f == null);
          if (f != null) $('onlineBar').style.width = Math.round(f * 100) + '%';
          $('onlineStatus').textContent = t;
        }
      });
      P = res.prices;
      if (opt.fx && P.meta.fx_usd_idr) { $('fx').value = edNum(P.meta.fx_usd_idr); KCCur.setRates({ IDR: P.meta.fx_usd_idr }, { updated: new Date().toISOString().slice(0, 10), source: 'open.er-api.com' }); }
      savePrices(); renderPriceEditor(); if (LAST) calculate(true);
      var secs = Math.round((Date.now() - t0) / 1000);
      log('Selesai dalam ' + secs + ' detik. ' + res.changes.length + ' perubahan diterapkan' + (res.errors.length ? ', ' + res.errors.length + ' sumber gagal.' : '.'));
      renderChanges(res.changes);
      $('onlineStatus').textContent = res.errors.length ? 'Selesai sebagian – lihat log' : 'Selesai ✓';
      toast('Harga & katalog diperbarui (' + res.changes.length + ' perubahan)'); act('app.price_update', res.changes.length + ' perubahan');
    } catch (e) {
      if (e.name === 'AbortError') { log('Dibatalkan. Data harga tidak diubah.'); $('onlineStatus').textContent = 'Dibatalkan'; }
      else { log('GAGAL: ' + e.message); $('onlineStatus').textContent = 'Gagal – periksa koneksi internet'; }
    } finally {
      onlineCtl = null; $('btnOnline').disabled = false; $('btnOnlineCancel').hidden = true;
      setTimeout(function () { $('onlineProg').hidden = true; }, 1500);
    }
  }
  function renderChanges(ch) {
    if (!ch.length) { $('onlineChanges').innerHTML = '<p class="muted">Tidak ada perubahan – data sudah terbaru.</p>'; return; }
    var cat = ch.filter(function (c) { return c.catalog; }), num = ch.filter(function (c) { return !c.catalog; });
    var h = '<h3>Ringkasan perubahan</h3>';
    if (cat.length) h += '<ul>' + cat.map(function (c) { return '<li><b>' + esc(c.prov) + '</b> – ' + esc(c.item) + '</li>'; }).join('') + '</ul>';
    num.forEach(function (c) { c.p = c.old ? (c.val - c.old) / c.old * 100 : null; });
    var big = num.filter(function (c) { return c.p == null || Math.abs(c.p) >= 0.5; }).sort(function (a, b) { return Math.abs(b.p == null ? 0 : b.p) - Math.abs(a.p == null ? 0 : a.p); });
    var small = num.length - big.length;
    h += '<p class="muted">' + big.length + ' perubahan signifikan (≥0,5%)' + (small ? ', ' + small + ' penyesuaian kecil lainnya juga diterapkan' : '') + '. Merah = naik, hijau = turun.</p>';
    h += '<div class="table-wrap" style="max-height:360px;overflow:auto"><table><thead><tr><th>Sumber</th><th>Item</th><th class="num">Lama</th><th class="num">Baru</th><th class="num">Perubahan</th></tr></thead><tbody>';
    big.forEach(function (c) {
      var pctv = c.old ? (c.val - c.old) / c.old * 100 : null;
      h += '<tr><td>' + esc(c.prov) + '</td><td>' + esc(c.item) + '</td><td class="num">' + (c.old == null ? '–' : fmtN(c.old, 6)) + '</td><td class="num">' + fmtN(c.val, 6) + '</td><td class="num ' + (pctv > 0.05 ? 'chg-up' : pctv < -0.05 ? 'chg-down' : '') + '">' + (pctv == null ? 'baru' : (pctv > 0 ? '+' : '') + pct(pctv) + '%') + '</td></tr>';
    });
    h += '</tbody></table></div>';
    $('onlineChanges').innerHTML = h;
  }
  function staleCheck() {
    var lo = P.meta.last_online && P.meta.last_online.date, days = lo ? (Date.now() - new Date(lo).getTime()) / 864e5 : Infinity;
    var b = $('priceBadge'); b.classList.toggle('stale', days > 30);
    b.title = lo ? 'Update online terakhir: ' + new Date(lo).toLocaleString(KCL()) : 'Belum pernah update online – klik "Update Harga"';
  }

  /* ---------------- project save/load ---------------- */
  function saveProject() {
    var inp = readInput(); var blob = new Blob([JSON.stringify({ app: 'kalkulator-cloud', version: 1, input: inp }, null, 2)], { type: 'application/json' });
    download(blob, 'proyek-' + slug(inp.custName) + '.json'); act('app.project_save', inp.custName);
  }
  function slug(s) { return String(s || 'pelanggan').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'pelanggan'; }
  window.KCUtil.slug = slug;
  function readFile(input, cb) { var f = input.files[0]; if (!f) return; var fr = new FileReader(); fr.onload = function () { try { cb(JSON.parse(fr.result)); } catch (e) { toast('File JSON tidak valid'); } input.value = ''; }; fr.readAsText(f); }

  /* ---------------- init ---------------- */
  function initNumInputs() {
    document.querySelectorAll('#tab-input input[type=number]').forEach(function (el) {
      var v = el.value; el.type = 'text'; el.inputMode = 'decimal'; el.dataset.num = '1'; el.autocomplete = 'off';
      el.value = v === '' ? '' : edNum(+v);
      el.addEventListener('blur', function () { var n = parseNum(el.value); el.value = isNaN(n) ? '' : edNum(n); });
    });
  }
  function init() {
    initNumInputs();
    DEFAULT_INPUT = readInput();
    OP_KEYS.forEach(function (k) { $('op_' + k).value = edNum(P.onprem_defaults[k]); });
    DEFAULT_INPUT = readInput();
    try { var s = localStorage.getItem(LS_INPUT); if (s) writeInput(JSON.parse(s)); } catch (e) {}
    if (!localStorage.getItem(LS_INPUT)) $('fx').value = edNum(P.meta.fx_usd_idr);
    document.querySelectorAll('.tab').forEach(function (t) { t.addEventListener('click', function () { if (RESULT_TABS.indexOf(t.dataset.tab) >= 0 && !LAST) calculate(true); switchTab(t.dataset.tab); }); });
    $('btnCalc').addEventListener('click', function () { calculate(false); });
    $('btnResetInput').addEventListener('click', function () { writeInput(DEFAULT_INPUT); syncDeps(); toast('Input dikembalikan ke contoh'); });
    $('btnSaveProject').addEventListener('click', saveProject);
    $('fileProject').addEventListener('change', function () { readFile(this, function (j) { writeInput(j.input || j); syncDeps(); calculate(false); act('app.project_load', (j.input || j).custName || ''); }); });
    $('btnFx').addEventListener('click', function () { if (window.KCShell) KCShell.updateRatesOnline(); });
    $('filePrices').addEventListener('change', function () { readFile(this, function (j) { if (!j.aws || !j.gcp || !j.regions) { toast('Bukan file prices.json yang valid'); return; } P = withRegions(j); savePrices(); renderPriceEditor(); if (LAST) calculate(true); toast('Data harga diimpor: ' + (j.meta && j.meta.updated)); act('app.price_import', j.meta && j.meta.version); }); });
    $('btnExportPrices').addEventListener('click', function () { download(new Blob([JSON.stringify(P, null, 2)], { type: 'application/json' }), 'prices.json'); });
    $('btnResetPrices').addEventListener('click', function () { if (!confirm(T('Kembalikan semua harga ke data bawaan aplikasi?'))) return; P = clone(window.DEFAULT_PRICES); savePrices(); renderPriceEditor(); if (LAST) calculate(true); toast('Harga bawaan dipulihkan'); act('app.price_reset', ''); });
    $('btnOnline').addEventListener('click', onlineUpdate);
    $('btnOnlineCancel').addEventListener('click', function () { if (onlineCtl) onlineCtl.abort(); });
    $('btnTopUpdate').addEventListener('click', function () { switchTab('harga'); onlineUpdate(); });
    $('btnDocx').addEventListener('click', function () { Exporter.run('docx'); });
    $('btnPdf').addEventListener('click', function () { Exporter.run('pdf'); });
    $('btnXlsx').addEventListener('click', function () { Exporter.run('xlsx'); });
    ['hybridOn', 'videoOn', 'aiOn', 'multiOn', 'security'].forEach(function (id) { $(id).addEventListener('change', syncDeps); });
    $('regionKey').addEventListener('change', function () { $('taxRate').value = edNum(Engine.RM(this.value).tax); regionInfo(); try { window.dispatchEvent(new CustomEvent('kc:country', { detail: this.value })); } catch (e) {} });
    syncDeps();
    updateBadge(); renderPriceEditor();
  }
  function regionInfo() {
    var key = $('regionKey').value, RMx = Engine.RM(key), parts = [];
    ['aws', 'gcp'].forEach(function (p) {
      var id = RMx[p], reg = (P.regions[p] || []).filter(function (r) { return r.id === id; })[0];
      parts.push(PN(p) + ': ' + (reg ? reg.name : id) + ' – ' + (RMx.local[p] ? 'di dalam negeri' : 'region terdekat'));
    });
    $('regionDesc').textContent = parts.join(' · ');
    $('taxHint').textContent = RMx.tax ? 'Tarif bawaan ' + RMx.label + ': ' + RMx.taxName + ' ' + RMx.tax + '%' : RMx.label + ': tidak ada pajak bawaan';
  }
  window.KC.regionInfo = regionInfo;
  var SEC_DESC = {
    standard: 'IAM & MFA, enkripsi at-rest/in-transit, WAF dasar, backup, monitoring. Cukup untuk aplikasi umum non-regulasi.',
    enhanced: 'Menambah deteksi ancaman (GuardDuty / Security Command Center), postur & kepatuhan CIS, pemindaian kerentanan, log audit 12 bulan, kunci milik pelanggan (CMK), proteksi bot.',
    strict: 'Menambah DDoS lanjutan (Shield Advanced / Cloud Armor Enterprise), NGFW dengan IDS/IPS, HSM, penemuan data pribadi (UU PDP), sentralisasi log untuk SIEM/SOC, dan endpoint privat. Untuk perbankan, pemerintah, kesehatan.'
  };
  function syncDeps() {
    document.querySelectorAll('.dep').forEach(function (d) { d.classList.toggle('off', !$(d.dataset.dep).checked); });
    $('secDesc').textContent = SEC_DESC[$('security').value] || '';
    regionInfo();
  }
  var RESULT_TABS = ['solusi', 'biaya', 'tco', 'catatan', 'ekspor'];
  var EMPTY = { solusiOut: 'Isi kebutuhan lalu klik <b>Hitung</b>.', biayaOut: 'Belum ada perhitungan.', tcoOut: 'Belum ada perhitungan.', catatanOut: 'Belum ada perhitungan.' };
  function clearResults() { LAST = null; Object.keys(EMPTY).forEach(function (id) { $(id).className = 'empty'; $(id).innerHTML = EMPTY[id]; }); }
  function act(action, detail) { if (window.KCShell) KCShell.activity(action, detail); }
  window.KC.readInput = readInput;
  window.KC.writeInput = function (o) { writeInput(o); syncDeps(); };
  window.KC.defaultInput = function () { return clone(DEFAULT_INPUT); };
  window.KC.clearResults = clearResults;
  window.KC.resetData = function () { try { localStorage.removeItem(LS_INPUT); } catch (e) {} writeInput(DEFAULT_INPUT); syncDeps(); clearResults(); };
  window.KC.setPrices = function (np) { if (!np || !np.aws || !np.gcp || !np.regions) return false; P = withRegions(np); savePrices(); renderPriceEditor(); return true; };
  window.KC.resetPrices = function () { P = clone(window.DEFAULT_PRICES); savePrices(); renderPriceEditor(); };
  window.KC.renderPriceEditor = function () { renderPriceEditor(); updateBadge(); };
  window.KC.switchTab = switchTab; window.KC.syncDeps = syncDeps; window.KC.edNum = edNum; window.KC.parseNum = parseNum;
  window.KC.recompute = function () { return calculate(true); };
  window.KC.act = act;
  document.addEventListener('DOMContentLoaded', init);
})();
