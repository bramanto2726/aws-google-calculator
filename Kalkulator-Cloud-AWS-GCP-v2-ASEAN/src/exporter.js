/* =====================================================================
 * Ekspor laporan: DOCX (docx.js), PDF (jsPDF + autotable), XLSX (SheetJS)
 * ===================================================================== */
(function () {
  'use strict';
  var FOOT = 'Disusun oleh @letsgobram - @motivaseein';
  var U = function () { return window.KCUtil; };
  function PN(p) { return window.KCUtil.PN(p); }
  function dateId(d) { return (d || new Date()).toLocaleDateString(KCL(), { day: 'numeric', month: 'long', year: 'numeric' }); }
  function status(t) { var el = document.getElementById('exportStatus'); if (el) el.textContent = t; }
  var I = window.KCI18n, TR = function (s) { return I.tr(s); }, NT = function (s) { return I.NT(s); };
  function CS() { return KCCur.sym(); }
  /* Pustaka ekspor dimuat saat dibutuhkan (lebih ringan saat aplikasi dibuka) */
  var LIBS = { docx: ['/lib/docx.umd.js'], pdf: ['/lib/jspdf.umd.min.js', '/lib/jspdf.plugin.autotable.min.js'], xlsx: ['/lib/xlsx.full.min.js'] };
  var loaded = {};
  function loadScript(src) {
    if (loaded[src]) return loaded[src];
    return (loaded[src] = new Promise(function (res, rej) { var sc = document.createElement('script'); sc.src = src; sc.onload = res; sc.onerror = function () { delete loaded[src]; rej(new Error('Gagal memuat ' + src)); }; document.head.appendChild(sc); }));
  }
  async function ensureLibs(kind) { for (var i = 0; i < LIBS[kind].length; i++) await loadScript(LIBS[kind][i]); }

  /* ---------- SVG → PNG ---------- */
  function svgToPng(svg, scale) {
    scale = scale || 2;
    return new Promise(function (res, rej) {
      var m = svg.match(/viewBox="0 0 (\d+) (\d+)"/), w = +m[1], h = +m[2];
      var img = new Image();
      img.onload = function () {
        var c = document.createElement('canvas'); c.width = w * scale; c.height = h * scale;
        var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
        var url = c.toDataURL('image/png'), jpg = c.toDataURL('image/jpeg', 0.88);
        var bin = atob(url.split(',')[1]), arr = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        res({ dataUrl: url, jpg: jpg, bytes: arr, w: w, h: h });
      };
      img.onerror = function () { rej(new Error('Gagal merender gambar')); };
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    });
  }

  /* ---------- Model laporan bersama ---------- */
  function model(R) {
    var inp = R.input, u = U(), W = Engine.WORKLOADS[inp.workload];
    var NM = R[R.provs[0]].summary.months.length, PLC = R[R.provs[0]].summary.periodLabel, PL = PLC.toLowerCase();
    var m = { title: 'Kalkulator Cloud AWS / Google Cloud', sub: 'Usulan Solusi, Topologi, Biaya & TCO', cust: NT(inp.custName), proj: NT(inp.projName), date: dateId(), sections: [], PL: PL, PLC: PLC };
    var need = [
      ['Pelanggan', NT(inp.custName)], ['Proyek', NT(inp.projName)], ['Industri', inp.industry], ['PIC', NT(inp.picName || '-')],
      ['Cloud dievaluasi', R.provs.map(PN).join(' & ')], ['Lokasi pelanggan', Engine.RM(inp.regionKey).label], ['Region usulan', KC.hostingList(R).map(function (h) { return PN(h.p) + ': ' + h.name + (h.local ? ' (di dalam negeri)' : ' (region terdekat)'); }).join('; ')],
      ['Jenis aplikasi', W.label], ['Pengguna terdaftar / bersamaan', inp.users.toLocaleString(KCL()) + ' / ' + inp.concurrent.toLocaleString(KCL())],
      ['Ketersediaan', Engine.AVAIL[inp.availability]], ['Arsitektur', inp.platform === 'k8s' ? 'Kontainer (Kubernetes terkelola)' : 'Virtual machine'],
      ['Sistem operasi', inp.os === 'windows' ? 'Windows Server' : 'Linux'], ['Database', Engine.DB_LABEL[inp.dbEngine] + (inp.dbEngine !== 'none' ? ', ' + Engine.fmtN(inp.dbSize) + ' GB, backup ' + Engine.fmtN(inp.backupDays) + ' hari' : '')],
      ['Penyimpanan', 'Disk ' + Engine.fmtN(inp.blockPer) + ' GB/server, object ' + Engine.fmtN(inp.objectTB) + ' TB, arsip ' + Engine.fmtN(inp.archiveTB) + ' TB'],
      ['Trafik keluar', inp.egressGB.toLocaleString(KCL()) + ' GB/bulan' + (inp.useCDN ? ' (dengan CDN)' : '')],
      ['Keamanan & konektivitas', [inp.useWAF ? 'WAF' : null, inp.useVPN ? 'VPN site-to-site' : null].filter(Boolean).join(', ') || '-'],
      ['Model harga', Engine.PRICING_LABEL[inp.pricing]], ['Support', inp.support], ['Pertumbuhan', Engine.fmtN(inp.growth) + '% per bulan'],
      ['Kurs', '1 USD = ' + KCCur.money(inp.fx) + ' + buffer ' + Engine.fmtN(inp.fxBuffer) + '%'], ['Mata uang laporan', KCCur.out() + ' – ' + KCCur.INFO[KCCur.out()].name], ['Pajak', inp.includeTax ? KC.taxLabel(inp) : 'Belum termasuk'],
      ['Tingkat keamanan', Engine.SEC_LABEL[inp.security || 'standard']],
      ['Hybrid cloud', inp.hybridOn ? Engine.HYB_LABEL[inp.hybridConn] + (inp.hybridRedundant ? ' ×2 redundan' : '') + ', ' + (+inp.hybridGB).toLocaleString(KCL()) + ' GB/bln ke on-prem, ' + Engine.fmtN(inp.hybridServers) + ' server tetap on-prem' : 'Tidak'],
      ['Video streaming', inp.videoOn ? Engine.VIDEO_LABEL[inp.videoMode] + ': VOD ' + Engine.fmtN(inp.vodHours) + ' jam/bln, live ' + Engine.fmtN(inp.liveChannels) + ' channel × ' + Engine.fmtN(inp.liveHoursDay) + ' jam/hari, ' + (+inp.watchHours).toLocaleString(KCL()) + ' jam tonton @ ' + Engine.fmtN(inp.videoBitrate) + ' Mbps' : 'Tidak'],
      ['Fitur AI', inp.aiOn ? [inp.aiLLM ? 'AI generatif (' + Engine.AI_TIER[inp.aiTier] + ', ' + (+inp.aiRequests).toLocaleString(KCL()) + ' permintaan/bln)' : null, inp.aiRAG ? 'RAG ' + Engine.fmtN(inp.ragGB) + ' GB' : null, inp.aiOCR ? 'OCR ' + (+inp.ocrPages).toLocaleString(KCL()) + ' hal' : null, inp.aiSpeech ? 'speech ' + (+inp.speechMin).toLocaleString(KCL()) + ' mnt' : null, inp.aiVision ? 'vision ' + (+inp.visionImages).toLocaleString(KCL()) + ' gbr' : null].filter(Boolean).join(', ') : 'Tidak'],
      ['Multi-cloud', inp.multiOn ? Engine.MC_LABEL[inp.mcPattern] + ', koneksi ' + (inp.mcLink === 'interconnect' ? 'interkoneksi privat' : 'HA VPN') : 'Tidak']
    ];
    m.need = need;
    var exec = [];
    R.provs.forEach(function (p) {
      var S = R[p].summary, T = R[p].tco;
      exec.push([PN(p), u.rp(S.month1Idr), u.rp(S.periodTotalIdr), u.rp(T.cloud.total), (T.saving >= 0 ? '-' : '+') + u.pct(Math.abs(T.savingPct * 100)) + '%']);
    });
    exec.push(['On-premise', '-', '-', u.rp(R[R.provs[0]].tco.onprem.total), 'acuan']);
    m.exec = exec;
    var execText = 'Dokumen ini merangkum usulan arsitektur cloud untuk ' + NT(inp.custName) + ' (' + NT(inp.projName) + '). ';
    if (R.provs.length >= 2) {
      var srt = R.provs.slice().sort(function (x, y) { return R[x].summary.periodTotal - R[y].summary.periodTotal; }), b = srt[0], o = srt[1];
      execText += 'Dengan model harga ' + Engine.PRICING_LABEL[inp.pricing].toLowerCase() + ', ' + PN(b) + ' memberikan biaya ' + PL + ' terendah (' + u.rpj(R[b].summary.periodTotalIdr) + ' vs ' + PN(o) + ' ' + u.rpj(R[o].summary.periodTotalIdr) + '). ';
    } else execText += 'Estimasi biaya ' + PL + ' dengan model harga ' + Engine.PRICING_LABEL[inp.pricing].toLowerCase() + ': ' + u.rpj(R[R.provs[0]].summary.periodTotalIdr) + '. ';
    var T0 = R[R.best].tco;
    execText += 'Dalam ' + T0.years + ' tahun, TCO cloud ' + (T0.saving >= 0 ? 'lebih hemat ' + u.rpj(T0.saving) + ' (' + u.pct(T0.savingPct * 100) + '%)' : 'lebih mahal ' + u.rpj(-T0.saving)) + ' dibandingkan membangun infrastruktur on-premise setara.';
    m.execText = execText;
    // solusi
    var roles = KC.rolesFor(R), sol = [];
    roles.forEach(function (r) {
      var row = [r[0]];
      R.provs.forEach(function (p) { var sp = KC.specFor(R[p], r[1], inp); row.push(KC.serviceName(R, p, r[1]) + (sp ? ' — ' + sp : '')); });
      sol.push(row);
    });
    m.sol = sol; m.solHead = ['Komponen'].concat(R.provs.map(PN));
    // BOM
    m.bom = {};
    R.provs.forEach(function (p) {
      var B = R[p], fx = B.summary.fxEff, rows = [], mm = B.summary.months[0], sub = 0;
      B.items.forEach(function (it) { sub += it.m1; rows.push([it.cat, it.svc, it.desc, KC.fmtQty(it.qty) + ' ' + it.unit, KC.unitP(it.unitPrice), it.dC ? Math.round(it.dC * 100) + '%' : '-', u.usd(it.m1), u.rp(it.m1Idr)]); });
      var foot = [['Subtotal layanan', u.usd(sub), u.rp(sub * fx)], ['Support: ' + B.supportName, u.usd(mm.byCat.Support), u.rp(mm.byCat.Support * fx)]];
      if (inp.includeTax) foot.push([KC.taxLabel(inp), u.usd(mm.tax), u.rp(mm.tax * fx)]);
      foot.push(['TOTAL BULAN PERTAMA', u.usd(mm.total), u.rp(mm.totalIdr)]);
      m.bom[p] = { region: B.region.name, rows: rows, foot: foot };
    });
    // 12 bulan
    var mrows = [];
    for (var i = 0; i < NM; i++) { var r = ['Bulan ' + (i + 1)]; R.provs.forEach(function (p) { var x = R[p].summary.months[i]; r.push(u.usd(x.total), u.rp(x.totalIdr)); }); mrows.push(r); }
    var tot = ['Total ' + PL]; R.provs.forEach(function (p) { tot.push(u.usd(R[p].summary.periodTotal), u.rp(R[p].summary.periodTotalIdr)); }); mrows.push(tot);
    m.months = mrows; m.monthsHead = ['Bulan'].concat([].concat.apply([], R.provs.map(function (p) { return [PN(p) + ' (USD)', PN(p) + ' (' + CS() + ')']; })));
    // TCO
    var Y = R[R.provs[0]].tco.years, trows = [];
    for (var y = 0; y < Y; y++) { var t = ['Tahun ' + (y + 1)]; R.provs.forEach(function (p) { t.push(u.rp(R[p].tco.cloud.years[y])); }); t.push(u.rp(R[R.provs[0]].tco.onprem.years[y])); trows.push(t); }
    var tt = ['Total ' + Y + ' tahun']; R.provs.forEach(function (p) { tt.push(u.rp(R[p].tco.cloud.total)); }); tt.push(u.rp(R[R.provs[0]].tco.onprem.total)); trows.push(tt);
    m.tco = trows; m.tcoHead = ['Periode'].concat(R.provs.map(PN), ['On-premise']);
    var OPr = R[R.provs[0]].tco.onprem, O = R.OP;
    m.opAssump = [
      ['Server fisik', OPr.servers + ' unit × ' + u.rp(O.server_price_idr)], ['Storage usable', OPr.storageTB + ' TB × ' + u.rp(O.storage_per_tb_idr)],
      ['Jaringan & keamanan', u.rp(O.network_security_idr)], ['Capex tahun 0', u.rp(OPr.capex)], ['Hypervisor / tahun', u.rp(OPr.opexY.hypervisor)],
      ['Colocation & listrik / tahun', u.rp(OPr.opexY.colo)], ['Bandwidth / tahun', u.rp(OPr.opexY.bandwidth) + ' (' + OPr.mbps + ' Mbps)'],
      ['SDM on-prem / tahun', u.rp(OPr.opexY.staff) + ' (' + Engine.fmtN(O.fte_onprem) + ' FTE)'], ['SDM cloud / tahun', u.rp(O.fte_cloud * O.admin_salary_month_idr * 12) + ' (' + Engine.fmtN(O.fte_cloud) + ' FTE)'],
      ['Migrasi + pelatihan (sekali)', u.rp(O.migration_one_time_idr + O.training_one_time_idr)]
    ];
    m.notes = R.notes;
    m.assump = [
      'Harga list publik on-demand per ' + R.prices.meta.updated + ' (versi data ' + R.prices.meta.version + '); 1 bulan = 730 jam.',
      'Sizing otomatis berdasarkan rasio pengguna bersamaan per vCPU untuk jenis aplikasi; validasi dengan uji beban.',
      'Diskon komitmen hanya diterapkan pada beban dasar; pertumbuhan dihitung dengan tarif on-demand.',
      'Kapasitas on-premise dibeli di depan untuk beban akhir periode (maks. 36 bulan) + headroom, termasuk N+1 untuk ketersediaan tinggi.',
      'Estimasi ini bukan penawaran resmi. Validasi dengan AWS Pricing Calculator (calculator.aws) dan Google Cloud Pricing Calculator.'
    ];
    m.sources = (R.prices.meta.sources || []).slice();
    return I.trDeep(m, true); // penanda data pengguna dipertahankan; dihapus saat ditulis ke file
  }

  /* =================== DOCX =================== */
  async function toDocx(R) {
    var d = window.docx, m = model(R);
    var BLUE = '0F6E8C';
    function P(text, o) { o = o || {}; return new d.Paragraph({ spacing: { after: o.after == null ? 120 : o.after }, alignment: o.align, children: [new d.TextRun({ text: TR(text), bold: o.bold, size: o.size || 21, color: o.color, italics: o.italics })] }); }
    function H(text, lvl) { return new d.Paragraph({ heading: lvl === 2 ? d.HeadingLevel.HEADING_2 : d.HeadingLevel.HEADING_1, spacing: { before: 280, after: 120 }, children: [new d.TextRun({ text: TR(text), color: BLUE, bold: true, size: lvl === 2 ? 24 : 30 })] }); }
    function cell(t, o) {
      o = o || {};
      return new d.TableCell({ width: o.w ? { size: o.w, type: d.WidthType.DXA } : undefined, shading: o.head ? { fill: 'E8F3F7', type: d.ShadingType.CLEAR, color: 'auto' } : (o.total ? { fill: 'F1F4F7', type: d.ShadingType.CLEAR, color: 'auto' } : undefined),
        margins: { top: 50, bottom: 50, left: 80, right: 80 }, columnSpan: o.span,
        children: [new d.Paragraph({ alignment: o.right ? d.AlignmentType.RIGHT : d.AlignmentType.LEFT, children: [new d.TextRun({ text: TR(String(t)), bold: o.head || o.total, size: o.size || 17 })] })] });
    }
    function table(head, rows, opt) {
      opt = opt || {};
      var trs = [new d.TableRow({ tableHeader: true, children: head.map(function (h, i) { return cell(h, { head: true, right: opt.rightFrom != null && i >= opt.rightFrom, w: opt.widths && opt.widths[i] }); }) })];
      rows.forEach(function (r, ri) {
        var isTot = opt.totalLast && ri === rows.length - 1;
        trs.push(new d.TableRow({ children: r.map(function (c, i) { return cell(c, { right: opt.rightFrom != null && i >= opt.rightFrom, total: isTot, w: opt.widths && opt.widths[i] }); }) }));
      });
      if (opt.widths) return new d.Table({ width: { size: 9906, type: d.WidthType.DXA }, columnWidths: opt.widths, layout: d.TableLayoutType.FIXED, rows: trs });
      return new d.Table({ width: { size: 100, type: d.WidthType.PERCENTAGE }, rows: trs });
    }
    function bullet(t, prefix) { return new d.Paragraph({ bullet: { level: 0 }, spacing: { after: 60 }, children: (prefix ? [new d.TextRun({ text: TR(prefix) + ' ', bold: true, size: 19 })] : []).concat([new d.TextRun({ text: TR(t), size: 20 })]) }); }
    async function img(svg, width) { var p = await svgToPng(I.trMarkup(svg), 2); return new d.Paragraph({ alignment: d.AlignmentType.CENTER, children: [new d.ImageRun({ data: p.bytes, transformation: { width: width, height: Math.round(width * p.h / p.w) } })] }); }

    var ch = [];
    ch.push(new d.Paragraph({ spacing: { before: 1800, after: 200 }, children: [new d.TextRun({ text: TR(m.title), bold: true, size: 48, color: BLUE })] }));
    ch.push(P(m.sub, { size: 30 }));
    ch.push(P(' ', {}));
    ch.push(P('Pelanggan: ' + m.cust, { size: 26, bold: true })); ch.push(P('Proyek: ' + m.proj, { size: 24 })); ch.push(P('Tanggal: ' + m.date, { size: 24 }));
    ch.push(P(' ', {})); ch.push(P(FOOT, { size: 22, italics: true, color: '5B6B7C' }));
    ch.push(new d.Paragraph({ children: [new d.PageBreak()] }));

    ch.push(H('1. Ringkasan Eksekutif')); ch.push(P(m.execText));
    ch.push(table(['Opsi', 'Biaya bulan 1', 'Biaya ' + m.PL, 'TCO ' + R[R.provs[0]].tco.years + ' tahun', 'vs On-prem'], m.exec, { rightFrom: 1 }));
    ch.push(H('2. Kebutuhan Pelanggan')); ch.push(table(['Parameter', 'Nilai'], m.need));
    ch.push(H('3. Pemilihan Solusi')); ch.push(table(m.solHead, m.sol));
    ch.push(H('4. Topologi'));
    for (var i = 0; i < R.provs.length; i++) { var p = R.provs[i]; ch.push(H('4.' + (i + 1) + ' ' + PN(p) + ' – ' + R[p].region.name, 2)); ch.push(await img(KC.topoSVG(p), 620)); }
    ch.push(H('5. Rincian Biaya Bulanan'));
    R.provs.forEach(function (p, k) {
      var b = m.bom[p]; ch.push(H('5.' + (k + 1) + ' ' + PN(p) + ' – ' + b.region, 2));
      var rows = b.rows.map(function (r) { return [r[0], r[1] + ' — ' + r[2], r[3], r[4], r[5], r[6], r[7]]; });
      b.foot.forEach(function (f) { rows.push([f[0], '', '', '', '', f[1], f[2]]); });
      ch.push(table(['Kategori', 'Layanan & rincian', 'Qty', 'Harga satuan', 'Diskon', 'USD/bln', CS() + '/bln'], rows, { rightFrom: 2, totalLast: true, widths: [1250, 3700, 1050, 950, 600, 1150, 1206] }));
    });
    ch.push(H('6. Proyeksi Biaya Sewa ' + m.PLC + ' (' + Engine.PRICING_LABEL[R.input.pricing] + ')'));
    ch.push(await img(KC.barChart12(), 620));
    ch.push(table(m.monthsHead, m.months, { rightFrom: 1, totalLast: true }));
    ch.push(H('7. TCO dan Perbandingan dengan On-Premise'));
    ch.push(await img(KC.tcoChart(), 620));
    ch.push(table(m.tcoHead, m.tco, { rightFrom: 1, totalLast: true }));
    ch.push(H('Asumsi on-premise', 2)); ch.push(table(['Komponen', 'Nilai'], m.opAssump, { rightFrom: 1 }));
    ch.push(H('8. Catatan Penting'));
    var LV = { info: '[INFO]', warn: '[PERHATIAN]', risk: '[RISIKO]' };
    m.notes.forEach(function (n) { ch.push(bullet(n.text, LV[n.lvl])); });
    ch.push(H('9. Asumsi & Sumber Harga'));
    m.assump.forEach(function (a) { ch.push(bullet(a)); });
    m.sources.forEach(function (s) { ch.push(bullet(s)); });

    var doc = new d.Document({
      creator: '@letsgobram - @motivaseein', title: TR(m.title) + ' – ' + TR(m.cust), description: TR(m.sub),
      styles: { default: { document: { run: { font: 'Calibri' } } } },
      sections: [{
        properties: { page: { margin: { top: 1000, bottom: 1000, left: 1000, right: 1000 } } },
        headers: { default: new d.Header({ children: [new d.Paragraph({ alignment: d.AlignmentType.RIGHT, children: [new d.TextRun({ text: TR(m.title) + ' · ' + TR(m.cust), size: 16, color: '9AA7B4' })] })] }) },
        footers: { default: new d.Footer({ children: [new d.Paragraph({ alignment: d.AlignmentType.CENTER, children: [new d.TextRun({ text: TR(FOOT) + '   |   ' + TR('Halaman') + ' ', size: 16, color: '5B6B7C' }), new d.TextRun({ children: [d.PageNumber.CURRENT], size: 16, color: '5B6B7C' })] })] }) },
        children: ch
      }]
    });
    return d.Packer.toBlob(doc);
  }

  /* =================== PDF =================== */
  function pdfSafe(s) { return TR(String(s)).replace(/€/g, 'EUR').replace(/₫/g, 'VND').replace(/₱/g, 'PHP').replace(/฿/g, 'THB').replace(/[–—]/g, '-').replace(/→/g, '->').replace(/…/g, '...').replace(/[≥]/g, '>=').replace(/[≤]/g, '<=').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[^\x00-\xFF]/g, ''); }
  async function toPdf(R) {
    var J = window.jspdf.jsPDF, doc = new J({ unit: 'mm', format: 'a4' }), m = model(R), W = 210, M = 14, y = 0;
    var BLUE = [15, 110, 140];
    function S(arr) { return arr.map(function (r) { return r.map(pdfSafe); }); }
    function h1(t) { if (y > 250) { doc.addPage(); y = 18; } doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor.apply(doc, BLUE); doc.text(pdfSafe(t), M, y); y += 7; doc.setTextColor(20, 32, 46); }
    function h2(t) { if (y > 260) { doc.addPage(); y = 18; } doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(20, 32, 46); doc.text(pdfSafe(t), M, y); y += 5.5; }
    function para(t, size) { doc.setFont('helvetica', 'normal'); doc.setFontSize(size || 9.5); var lines = doc.splitTextToSize(pdfSafe(t), W - 2 * M); lines.forEach(function (l) { if (y > 280) { doc.addPage(); y = 18; } doc.text(l, M, y); y += 4.6; }); y += 1.5; }
    function tbl(head, body, opt) {
      opt = opt || {};
      doc.autoTable({ head: [S([head])[0]], body: S(body), startY: y, margin: { left: M, right: M, bottom: 16 }, theme: 'grid',
        styles: { fontSize: opt.fs || 8, cellPadding: 1.6, lineColor: [221, 227, 234], lineWidth: 0.1, textColor: [20, 32, 46], overflow: 'linebreak' },
        headStyles: { fillColor: [232, 243, 247], textColor: [20, 32, 46], fontStyle: 'bold' },
        columnStyles: opt.cols || {},
        didParseCell: function (data) {
          if (opt.rightFrom != null && data.column.index >= opt.rightFrom) data.cell.styles.halign = 'right';
          if (opt.totalLast && data.section === 'body' && data.row.index === body.length - 1) { data.cell.styles.fontStyle = 'bold'; data.cell.styles.fillColor = [241, 244, 247]; }
        } });
      y = doc.lastAutoTable.finalY + 6;
    }
    async function image(svg) {
      var p = await svgToPng(I.trMarkup(svg), 2), w = W - 2 * M, h = w * p.h / p.w;
      if (y + h > 282) { doc.addPage(); y = 18; }
      doc.addImage(p.jpg, 'JPEG', M, y, w, h, undefined, 'FAST'); y += h + 5;
    }
    // Cover
    doc.setFillColor.apply(doc, BLUE); doc.rect(0, 0, W, 70, 'F');
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(22); doc.text(pdfSafe(m.title), M, 34);
    doc.setFontSize(13); doc.setFont('helvetica', 'normal'); doc.text(pdfSafe(m.sub), M, 46);
    doc.setTextColor(20, 32, 46); doc.setFontSize(12); y = 90;
    [['Pelanggan', m.cust], ['Proyek', m.proj], ['Tanggal', m.date]].forEach(function (r) { doc.setFont('helvetica', 'bold'); doc.text(pdfSafe(r[0]), M, y); doc.setFont('helvetica', 'normal'); doc.text(pdfSafe(r[1]), M + 32, y); y += 8; });
    y += 6; h1('Ringkasan Eksekutif'); para(m.execText, 10.5);
    tbl(['Opsi', 'Biaya bulan 1', 'Biaya ' + m.PL, 'TCO ' + R[R.provs[0]].tco.years + ' thn', 'vs On-prem'], m.exec, { rightFrom: 1, fs: 9 });
    doc.addPage(); y = 18;
    h1('1. Kebutuhan Pelanggan'); tbl(['Parameter', 'Nilai'], m.need, { cols: { 0: { cellWidth: 55 } } });
    h1('2. Pemilihan Solusi'); tbl(m.solHead, m.sol, { cols: { 0: { cellWidth: 36 } } });
    doc.addPage(); y = 18; h1('3. Topologi');
    for (var i = 0; i < R.provs.length; i++) { var p = R.provs[i]; h2(PN(p) + ' - ' + R[p].region.name); await image(KC.topoSVG(p)); }
    doc.addPage(); y = 18; h1('4. Rincian Biaya Bulanan');
    R.provs.forEach(function (p) {
      var b = m.bom[p]; h2(PN(p) + ' - ' + b.region);
      var rows = b.rows.map(function (r) { return [r[0], r[1] + ' - ' + r[2], r[3], r[4], r[5], r[6], r[7]]; });
      b.foot.forEach(function (f) { rows.push([f[0], '', '', '', '', f[1], f[2]]); });
      tbl(['Kategori', 'Layanan & rincian', 'Qty', 'Harga satuan', 'Disk.', 'USD/bln', CS() + '/bln'], rows, { rightFrom: 2, totalLast: true, fs: 7.2, cols: { 0: { cellWidth: 22 }, 1: { cellWidth: 62 } } });
    });
    h1('5. Proyeksi Biaya Sewa ' + m.PLC); await image(KC.barChart12());
    tbl(m.monthsHead, m.months, { rightFrom: 1, totalLast: true });
    h1('6. TCO vs On-Premise'); await image(KC.tcoChart());
    tbl(m.tcoHead, m.tco, { rightFrom: 1, totalLast: true });
    h2('Asumsi on-premise'); tbl(['Komponen', 'Nilai'], m.opAssump, { rightFrom: 1 });
    h1('7. Catatan Penting');
    var LV = { info: '[INFO] ', warn: '[PERHATIAN] ', risk: '[RISIKO] ' };
    m.notes.forEach(function (n) { para('- ' + LV[n.lvl] + n.text); });
    h1('8. Asumsi & Sumber Harga');
    m.assump.concat(m.sources).forEach(function (a) { para('- ' + a, 8.5); });
    var pages = doc.getNumberOfPages();
    for (var k = 1; k <= pages; k++) {
      doc.setPage(k); doc.setFontSize(8); doc.setTextColor(91, 107, 124); doc.setFont('helvetica', 'normal');
      doc.setDrawColor(221, 227, 234); doc.line(M, 286, W - M, 286);
      doc.text(pdfSafe(FOOT), M, 291); doc.text(pdfSafe('Halaman') + ' ' + k + ' / ' + pages, W - M, 291, { align: 'right' });
    }
    return doc.output('blob');
  }

  /* =================== XLSX =================== */
  function toXlsx(R) {
    var X = window.XLSX, wb = X.utils.book_new(), inp = R.input, m = model(R);
    function colName(n) { var s = ''; n++; while (n > 0) { var r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; }
    function setF(ws, addr, f, z) { ws[addr] = { t: 'n', f: f }; if (z) ws[addr].z = z; }
    function finish(ws, cols, lastRow, lastCol) { ws['!cols'] = cols.map(function (w) { return { wch: w }; }); ws['!ref'] = 'A1:' + colName(lastCol) + lastRow; }
    var USD = '#,##0.00', IDR = KCCur.xlsxFmt(), PCT = '0%', CUR = KCCur.out();
    var EN = I.lang() === 'en', SN = EN ? { sum: 'Summary', proj: 'Cost_Projection', tco: 'TCO', need: 'Requirements_Solution', price: 'Price_Data' } : { sum: 'Ringkasan', proj: 'Proyeksi_Biaya', tco: 'TCO', need: 'Kebutuhan_Solusi', price: 'Data_Harga' };
    var aoa2sheet = function (a) { return X.utils.aoa_to_sheet(I.trDeep(a)); };

    // --- BOM per provider
    var bomTotals = {};
    R.provs.forEach(function (p) {
      var B = R[p], fx = B.summary.fxEff, mm = B.summary.months[0];
      var aoa = [['Rincian Biaya Bulanan – ' + PN(p) + ' – ' + B.region.name], ['Kurs USD → ' + CUR + ' (termasuk buffer)', +fx.toFixed(4)], ['Tarif pajak', Engine.taxInfo(inp).rate], [],
        ['Kategori', 'Layanan', 'Rincian', 'Qty', 'Satuan', 'Harga satuan (USD)', 'Diskon', 'Bulanan (USD)', 'Bulanan (' + CS() + ')']];
      B.items.forEach(function (it) { aoa.push([it.cat, it.svc, it.desc, +it.qty.toFixed(4), it.unit, +it.unitPrice.toFixed(6), it.dC, null, null]); });
      var first = 6, last = 5 + B.items.length;
      aoa.push(['Subtotal layanan', '', '', '', '', '', '', null, null]);
      aoa.push(['Support: ' + B.supportName, '(dihitung dari tier support provider)', '', '', '', '', '', +mm.byCat.Support.toFixed(2), null]);
      aoa.push([KC.taxLabel(inp), '', '', '', '', '', '', null, null]);
      aoa.push(['TOTAL BULAN PERTAMA', '', '', '', '', '', '', null, null]);
      aoa.push([]); aoa.push([FOOT]);
      var ws = aoa2sheet(aoa);
      ws.B2.z = '#,##0.00'; ws.B3.z = PCT;
      for (var r = first; r <= last; r++) {
        ws['F' + r].z = '0.000000'; ws['G' + r].z = PCT;
        setF(ws, 'H' + r, 'D' + r + '*F' + r + '*(1-G' + r + ')', USD); setF(ws, 'I' + r, 'H' + r + '*$B$2', IDR);
      }
      var rs = last + 1, rsup = last + 2, rtax = last + 3, rtot = last + 4;
      setF(ws, 'H' + rs, 'SUM(H' + first + ':H' + last + ')', USD); setF(ws, 'I' + rs, 'H' + rs + '*$B$2', IDR);
      ws['H' + rsup].z = USD; setF(ws, 'I' + rsup, 'H' + rsup + '*$B$2', IDR);
      setF(ws, 'H' + rtax, '(H' + rs + '+H' + rsup + ')*$B$3', USD); setF(ws, 'I' + rtax, 'H' + rtax + '*$B$2', IDR);
      setF(ws, 'H' + rtot, 'H' + rs + '+H' + rsup + '+H' + rtax, USD); setF(ws, 'I' + rtot, 'H' + rtot + '*$B$2', IDR);
      finish(ws, [24, 34, 60, 12, 12, 16, 9, 15, 18], rtot + 2, 8);
      var name = 'BOM_' + ({ aws: 'AWS', gcp: 'GCP', multi: 'MULTI' })[p];
      bomTotals[p] = { sheet: name, row: rtot };
      X.utils.book_append_sheet(wb, ws, name);
    });

    // --- Proyeksi 12 bulan
    var cats = Engine.CAT, head = ['Bulan'], aoa = [['Proyeksi Biaya Sewa ' + m.PLC + ' – ' + Engine.PRICING_LABEL[inp.pricing] + ' (USD per kategori)'], ['Pertumbuhan beban per bulan', inp.growth / 100], []];
    R.provs.forEach(function (p) { cats.forEach(function (c) { head.push(PN(p) + ' – ' + c); }); head.push(PN(p) + ' – ' + T('Pajak'), PN(p) + ' – Total USD', PN(p) + ' – Total ' + CS()); });
    aoa.push(head);
    var NMX = R[R.provs[0]].summary.months.length;
    for (var i = 0; i < NMX; i++) {
      var row = ['Bulan ' + (i + 1)];
      R.provs.forEach(function (p) { var mm = R[p].summary.months[i]; cats.forEach(function (c) { row.push(+(mm.byCat[c] || 0).toFixed(2)); }); row.push(+mm.tax.toFixed(2), null, null); });
      aoa.push(row);
    }
    aoa.push(['Total ' + m.PL]); aoa.push([]); aoa.push([FOOT]);
    var wsM = aoa2sheet(aoa), per = cats.length + 3;
    wsM.B2.z = '0.0%';
    R.provs.forEach(function (p, k) {
      var c0 = 1 + k * per, cTax = c0 + cats.length, cUsd = cTax + 1, cIdr = cTax + 2;
      var fxRef = "'" + bomTotals[p].sheet + "'!$B$2";
      for (var r = 5; r <= 4 + NMX; r++) {
        for (var c = c0; c <= cTax; c++) wsM[colName(c) + r].z = USD;
        setF(wsM, colName(cUsd) + r, 'SUM(' + colName(c0) + r + ':' + colName(cTax) + r + ')', USD);
        setF(wsM, colName(cIdr) + r, colName(cUsd) + r + '*' + fxRef, IDR);
      }
      for (var c2 = c0; c2 <= cIdr; c2++) setF(wsM, colName(c2) + (5 + NMX), 'SUM(' + colName(c2) + '5:' + colName(c2) + (4 + NMX) + ')', c2 === cIdr ? IDR : USD);
    });
    finish(wsM, [16].concat(new Array(per * R.provs.length).fill(17)), 7 + NMX, per * R.provs.length);
    X.utils.book_append_sheet(wb, wsM, SN.proj);

    // --- TCO
    var Y = R[R.provs[0]].tco.years, th = ['Tahun'], OPr = R[R.provs[0]].tco.onprem;
    R.provs.forEach(function (p) { th.push(PN(p) + ' (' + CS() + ')'); }); th.push('On-premise (' + CS() + ')');
    R.provs.forEach(function (p) { th.push('Kumulatif ' + PN(p)); }); th.push('Kumulatif On-prem');
    R.provs.forEach(function (p) { th.push('Selisih ' + PN(p) + ' vs On-prem'); });
    var ta = [['TCO ' + Y + ' Tahun – Cloud vs On-premise (' + CS() + ')'], [], th];
    for (var y = 0; y < Y; y++) { var tr = ['Tahun ' + (y + 1)]; R.provs.forEach(function (p) { tr.push(Math.round(R[p].tco.cloud.years[y])); }); tr.push(Math.round(OPr.years[y])); ta.push(tr); }
    ta.push(['Total']);
    var wsT = aoa2sheet(ta), nC = R.provs.length + 1;
    for (y = 0; y < Y; y++) {
      var rr = 4 + y;
      for (var c = 1; c <= nC; c++) {
        wsT[colName(c) + rr].z = IDR;
        setF(wsT, colName(c + nC) + rr, (y === 0 ? '' : colName(c + nC) + (rr - 1) + '+') + colName(c) + rr, IDR);
      }
      R.provs.forEach(function (p, k) { setF(wsT, colName(1 + 2 * nC + k) + rr, colName(nC) + rr + '-' + colName(1 + k) + rr, IDR); });
    }
    var rT = 4 + Y;
    for (c = 1; c <= nC; c++) setF(wsT, colName(c) + rT, 'SUM(' + colName(c) + '4:' + colName(c) + (rT - 1) + ')', IDR);
    R.provs.forEach(function (p, k) { setF(wsT, colName(1 + 2 * nC + k) + rT, 'SUM(' + colName(1 + 2 * nC + k) + '4:' + colName(1 + 2 * nC + k) + (rT - 1) + ')', IDR); });
    var rA = rT + 2;
    X.utils.sheet_add_aoa(wsT, I.trDeep([['Rincian on-premise']].concat(m.opAssump).concat([[], [FOOT]])), { origin: 'A' + rA });
    finish(wsT, [30].concat(new Array(nC * 2 + R.provs.length).fill(20)), rA + m.opAssump.length + 3, nC * 2 + R.provs.length);
    X.utils.book_append_sheet(wb, wsT, SN.tco);

    // --- Ringkasan (paling depan)
    var ra = [[m.title], [m.sub], ['Pelanggan', m.cust], ['Proyek', m.proj], ['Tanggal', m.date], [], ['Opsi', 'Total bulan 1 (' + CS() + ')', 'Total ' + m.PL + ' (' + CS() + ')', 'TCO ' + Y + ' tahun (' + CS() + ')']];
    R.provs.forEach(function (p) { ra.push([PN(p), null, null, null]); });
    ra.push(['On-premise', '', '', null]); ra.push([]); ra.push(['Rekomendasi biaya', PN(R.best)]); ra.push([]); ra.push([FOOT]);
    var wsR = aoa2sheet(ra);
    R.provs.forEach(function (p, k) {
      var r = 8 + k, bt = bomTotals[p];
      var colIdr = colName(1 + k * per + cats.length + 2);
      setF(wsR, 'B' + r, "'" + bt.sheet + "'!I" + bt.row, IDR);
      setF(wsR, 'C' + r, "'" + SN.proj + "'!" + colIdr + (5 + NMX), IDR);
      setF(wsR, 'D' + r, "'" + SN.tco + "'!" + colName(1 + k) + rT, IDR);
    });
    setF(wsR, 'D' + (8 + R.provs.length), "'" + SN.tco + "'!" + colName(nC) + rT, IDR);
    finish(wsR, [26, 22, 22, 22], ra.length, 3);
    X.utils.book_append_sheet(wb, wsR, SN.sum);
    wb.SheetNames.unshift(wb.SheetNames.pop());

    // --- Input & Solusi
    var wsI = aoa2sheet([['Kebutuhan Pelanggan'], []].concat(m.need).concat([[], ['Pemilihan Solusi'], m.solHead]).concat(m.sol).concat([[], ['Catatan']]).concat(m.notes.map(function (n) { return [n.lvl.toUpperCase(), n.text]; })).concat([[], [FOOT]]));
    wsI['!cols'] = [{ wch: 30 }, { wch: 80 }, { wch: 80 }];
    X.utils.book_append_sheet(wb, wsI, SN.need);

    // --- Data harga
    var dp = [['Data harga yang dipakai (USD, basis region US)', R.prices.meta.updated], [], ['Provider', 'Jenis', 'Tipe', 'Keluarga', 'vCPU', 'RAM GB', 'USD/jam', 'USD/bulan (730 jam)']];
    ['aws', 'gcp'].forEach(function (p) {
      R.prices[p].compute.forEach(function (c) { dp.push([PN(p), 'Compute', c.type, c.family, c.vcpu, c.ram, c.hourly, null]); });
      (R.prices[p].db || []).forEach(function (c) { dp.push([PN(p), 'Database', c.type, c.family, c.vcpu, c.ram, c.hourly, null]); });
    });
    dp.push([]); dp.push(['Region', 'Provider', 'ID', 'Nama', 'Pengali compute', 'Pengali DB', 'Pengali storage', 'Egress tier-1 USD/GB']);
    ['aws', 'gcp'].forEach(function (p) { R.prices.regions[p].forEach(function (r) { dp.push(['', PN(p), r.id, r.name, r.mult.compute, r.mult.db, r.mult.storage, r.egress[0].price]); }); });
    var wsD = aoa2sheet(dp), nRows = 0;
    ['aws', 'gcp'].forEach(function (p) { nRows += R.prices[p].compute.length + (R.prices[p].db || []).length; });
    for (var q = 4; q < 4 + nRows; q++) setF(wsD, 'H' + q, 'G' + q + '*730', USD);
    wsD['!cols'] = [{ wch: 14 }, { wch: 14 }, { wch: 22 }, { wch: 22 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 20 }];
    X.utils.book_append_sheet(wb, wsD, SN.price);

    var out = X.write(wb, { bookType: 'xlsx', type: 'array' });
    return new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  async function run(kind) {
    var R = KC.last || KC.calculate(true);
    var base = 'Kalkulator-Cloud_' + U().slug(R.input.custName) + '_' + new Date().toISOString().slice(0, 10);
    status(TR('Menyiapkan') + ' ' + kind.toUpperCase() + '…');
    try {
      await ensureLibs(kind);
      var blob = kind === 'docx' ? await toDocx(R) : kind === 'pdf' ? await toPdf(R) : toXlsx(R);
      U().download(blob, base + '.' + kind);
      status(kind.toUpperCase() + ' ' + TR('selesai diunduh') + ': ' + base + '.' + kind);
      if (KC.act) KC.act('app.export', kind.toUpperCase() + ' – ' + R.input.custName);
    } catch (e) { console.error(e); status(TR('Gagal membuat') + ' ' + kind.toUpperCase() + ': ' + e.message); }
  }
  window.Exporter = { run: run, toDocx: toDocx, toPdf: toPdf, toXlsx: toXlsx, model: model };
})();
