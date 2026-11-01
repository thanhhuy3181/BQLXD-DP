/* Xuất Excel báo cáo — docs/XUAT-EXCEL.md. Công thức liên kết thật (SUMIFS / INDEX-MATCH / SUMPRODUCT / IF / MIN / MAX / SUM),
 * mỗi ô công thức kèm giá trị đã tính (cache) = kết quả của Store/engine để mở lên là thấy số, sheet "Kiểm tra" chứng minh.
 * API: window.xuatExcel(duAnId) → Promise<Blob>;  App.dangKy({id:'xuat', tab:'kh', ...}).
 * Phụ thuộc: ExcelJS (toàn cục), window.BDNL (engine), window.Store.
 */
(function () {
  'use strict';
  const E = window.BDNL, Store = window.Store;
  const isNum = (v) => typeof v === 'number' && isFinite(v);
  const r6 = (x) => (isNum(x) ? Math.round(x * 1e6) / 1e6 : x);
  const SER = 25569; // số ngày từ 1900 (Excel) → 1970; serial = dn + SER
  const WK0 = 10; // cột đầu tiên của tuần (J) ở mọi sheet theo tuần
  const FMT_NC = '#,##0.0', FMT_KL = '#,##0.00', FMT_D = 'dd/mm/yyyy', FMT_K = '0.00';
  const NAVY = 'FF1F3864', VANG = 'FFFFF2CC', XANH_NHAT = 'FFD9E1F2', XANH_NHAT2 = 'FFEDF2F9', XAM = 'FFEFEFEF';

  const SH = {
    hd: 'Hướng dẫn', dm: 'Danh mục', pd: 'ĐM đã PD', hm: 'ĐM hạng mục', td: 'Tiến độ chi tiết', nc: 'Tính NC', hs: 'Hệ số',
    g: 'NC tuần gốc', adj: 'NC sau hệ số', nt: 'NC theo Nhà thầu', ct: 'NC theo Công trình', cn: 'NC theo Loại CN',
    tdn: 'NC theo Nhóm theo dõi', bd: 'Biểu đồ', kt: 'Kiểm tra',
  };
  const MO_TA = {
    hd: 'Thông tin dự án, ngày xuất, cách kiểm tra từng bước',
    dm: 'Công trình, nhà thầu + nhóm, loại CN + nhóm theo dõi, lịch nghỉ (có tên vùng TET_BD, TET_KT, NGHI_BD, NGHI_KT…)',
    pd: 'Định mức công nhân ban hành: KL/công × HS tăng ca × HS quy đổi = ĐM/ngày',
    hm: 'Định mức từng đầu việc × loại CN (tra từ ĐM đã PD khi trùng, ngược lại là số nhập riêng)',
    td: 'Cây WBS (nhóm Outline ±), Ngày (trừ ngày nghỉ), KL tổng, NC/ngày, cảnh báo',
    nc: '1 dòng = 1 đầu việc × 1 loại CN: NC/ngày = KL / Ngày / ĐM',
    hs: 'K_lịch, K_DA, K_CT, K_CN, K_NT × tuần (ô vàng nhập được)',
    g: 'NC gốc theo công trình × nhà thầu × loại CN × tuần (SUMIFS từ Tính NC)',
    adj: 'NC sau hệ số = NC tuần gốc × K_lịch × K_DA × K_CT × K_CN × K_NT',
    nt: 'Loại CN → nhà thầu theo tuần (SUMIFS từ NC sau hệ số)',
    ct: 'Công trình → loại CN theo tuần',
    cn: 'Tổng toàn dự án từng loại CN theo tuần + Đỉnh + Tổng công',
    tdn: 'Nhóm CN theo dõi thực tế → loại CN theo tuần',
    bd: 'Tổng theo tuần + ảnh biểu đồ (nếu có)',
    kt: 'Đối chiếu số trên web với số trong file, đếm cảnh báo',
  };
  const ORDER = ['hd', 'dm', 'pd', 'hm', 'td', 'nc', 'hs', 'g', 'adj', 'nt', 'ct', 'cn', 'tdn', 'bd', 'kt'];

  const colL = (n) => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
  const addr = (r, c) => colL(c) + r;
  const sq = (k) => "'" + SH[k] + "'!";
  const rg = (k, c, r0, r1) => `${sq(k)}$${colL(c)}$${r0}:$${colL(c)}$${r1}`;

  function tenFile(duAnId) {
    const da = Store.state.org.duAn.find((d) => d.id === duAnId);
    const ten = ((da && da.ten) || duAnId).replace(/[\\/:*?"<>|]/g, '').trim().replace(/\s+/g, '_');
    const t = new Date(), p = (x) => String(x).padStart(2, '0');
    return `BDNL_${ten}_${t.getFullYear()}${p(t.getMonth() + 1)}${p(t.getDate())}.xlsx`;
  }

  // ---------------------------------------------------------------- chuẩn bị số liệu (nguồn: Store / engine)
  function chuanBiDuLieu(id) {
    const st = Store.state, dmuc = st.danhMuc, d = Store.da(id), kq = Store.tinh(id);
    const data = kq.data, tuan = kq.tuan, n = tuan.length, loaiMap = Store.loaiCnMap();
    const pairs = [];
    for (const v of data.viec) {
      const r = v.src;
      for (const cn in r.dm) {
        const dm = r.dm[cn];
        if (!isNum(dm) || dm === 0) continue;
        const loai = loaiMap[cn] && loaiMap[cn].loai_dm;
        if (loai !== 'đv / công' && loai !== 'công / đv') continue;
        pairs.push({ r: r.r, row: r, v, cn, dm, loai, ct: v.ct || '(không rõ)', nt: v.nt, nc: v.nc[cn] || 0 });
      }
    }
    const uniq = (arr) => Array.from(new Set(arr));
    const ctList = uniq(pairs.map((p) => p.ct));
    const ntList = uniq(pairs.map((p) => p.nt));
    const cnUsed = new Set(pairs.map((p) => p.cn));
    const cnList = dmuc.loaiCn.map((t) => t.id).filter((x) => cnUsed.has(x));
    // lịch / hệ số lịch
    const fileMode = !!d.dungLichFileGoc;
    let kLich;
    if (fileMode) {
      const nghi = (d.nghiBieuDoGoc || []).map((h) => ({ bd: E.dn(h.bd), kt: E.dn(h.kt) }));
      kLich = tuan.map((t) => (nghi.some((h) => t.bd >= h.bd && t.kt <= h.kt) ? 0 : 1));
    } else kLich = E.heSoLich(tuan, d.lich);
    const K = E.heSo(d.hs);
    // NC tuần gốc (SUMIFS thô) theo ct × nt × cn
    const gMap = new Map(), gRows = [];
    for (const p of pairs) {
      const v = p.v;
      if (v.bd == null || v.kt == null || !p.nc) continue;
      const key = p.ct + '\u0001' + p.nt + '\u0001' + p.cn;
      let g = gMap.get(key);
      if (!g) { g = { ct: p.ct, nt: p.nt, cn: p.cn, raw: new Float64Array(n) }; gMap.set(key, g); gRows.push(g); }
      for (let i = 0; i < n; i++) { const t = tuan[i]; if (v.bd < t.kt && v.kt >= t.bd) g.raw[i] += p.nc; }
    }
    gRows.sort((a, b) => ctList.indexOf(a.ct) - ctList.indexOf(b.ct) || ntList.indexOf(a.nt) - ntList.indexOf(b.nt) || cnList.indexOf(a.cn) - cnList.indexOf(b.cn));
    for (const g of gRows) {
      g.adj = new Float64Array(n);
      for (let i = 0; i < n; i++) g.adj[i] = g.raw[i] * kLich[i] * K.da(i) * K.ct(g.ct, i) * K.cn(g.cn, i) * K.nt(g.nt, i);
    }
    return { st, dmuc, d, data, tuan, n, loaiMap, pairs, ctList, ntList, cnList, fileMode, kLich, K, gRows };
  }

  // ---------------------------------------------------------------- tiện ích ExcelJS
  function newSheet(wb, key, opt) {
    opt = opt || {};
    const ws = wb.addWorksheet(SH[key], { properties: Object.assign({ tabColor: { argb: opt.tab || 'FF1F3864' } }, opt.outline ? { outlineProperties: { summaryBelow: false } } : {}) });
    // LƯU Ý: ExcelJS ghi <pageSetUpPr> trước <outlinePr> (sai thứ tự schema → Excel không mở được) nên sheet có Outline không dùng fitToPage
    ws.pageSetup = { paperSize: 8, orientation: 'landscape', fitToPage: !!opt.fit, fitToWidth: 1, fitToHeight: 0, scale: opt.fit ? undefined : 55, horizontalCentered: false };
    if (opt.titles) ws.pageSetup.printTitlesRow = opt.titles;
    return ws;
  }
  function hdrCells(ws, r, c0, c1) {
    for (let c = c0; c <= c1; c++) {
      const cell = ws.getCell(r, c);
      cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    }
  }
  function title(ws, text, sub) {
    ws.getCell(1, 1).value = text; ws.getCell(1, 1).font = { name: 'Arial', size: 14, bold: true, color: { argb: NAVY } };
    if (sub) { ws.getCell(2, 1).value = sub; ws.getCell(2, 1).font = { name: 'Arial', size: 9, italic: true, color: { argb: 'FF555555' } }; }
  }
  function widths(ws, arr) { arr.forEach((w, i) => { if (w) ws.getColumn(i + 1).width = w; }); }
  function fillRow(ws, r, c0, c1, argb, bold) {
    for (let c = c0; c <= c1; c++) { const cell = ws.getCell(r, c); cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } }; if (bold) cell.font = { name: 'Arial', size: 10, bold: true }; }
  }
  /** Gom nhóm hàng (Outline); ExcelJS mặc định gắn collapsed cho hàng cấp sâu nhất → tắt để nhóm mở sẵn */
  function nhom(ws, r, level) { const row = ws.getRow(r); row.outlineLevel = level; Object.defineProperty(row, 'collapsed', { value: false }); }
  function inp(cell) { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VANG } }; }
  function fv(formula, result) { return { formula, result: result == null ? '' : r6(result) }; }
  /** Khối công thức dùng chung (shared formula): fn(r,c) chỉ gọi cho ô đầu; res(r,c) cho giá trị cache từng ô */
  function block(ws, r0, r1, c0, c1, formulaFn, res, fmt) {
    // Công thức thường (không dùng shared formula: Excel từ chối file khi shared formula có tham chiếu sang sheet khác, đã thử với Excel thật)
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const cell = ws.getCell(r, c);
      cell.value = { formula: formulaFn(r, colL(c), c), result: r6(res(r, c)) };
      if (fmt) cell.numFmt = fmt;
    }
  }
  /** Tiêu đề tuần: hàng 4 từ ngày, 5 mốc sau, 6 số ngày, 7 nhãn — trừ sheet Hệ số (nguồn) liên kết về Hệ số */
  function tuanHeader(ws, D, nguon) {
    const { tuan, n } = D, c1 = WK0 + n - 1;
    ws.getCell(4, WK0 - 1).value = 'Từ ngày'; ws.getCell(5, WK0 - 1).value = 'Đến (mốc sau, không tính)'; ws.getCell(6, WK0 - 1).value = 'Số ngày';
    for (let r = 4; r <= 6; r++) { ws.getCell(r, WK0 - 1).font = { name: 'Arial', size: 9, italic: true }; ws.getCell(r, WK0 - 1).alignment = { horizontal: 'right' }; }
    const val = (r, i) => (r === 4 ? tuan[i].bd + SER : r === 5 ? tuan[i].kt + SER : r === 6 ? tuan[i].kt - tuan[i].bd : tuan[i].nhan);
    if (nguon) {
      for (let i = 0; i < n; i++) {
        const c = WK0 + i;
        ws.getCell(4, c).value = val(4, i); ws.getCell(5, c).value = val(5, i);
        ws.getCell(6, c).value = { formula: `${colL(c)}5-${colL(c)}4`, result: val(6, i) };
        ws.getCell(7, c).value = val(7, i);
      }
    } else {
      block(ws, 4, 7, WK0, c1, (r, L) => `${sq('hs')}${L}${r}`, (r, c) => val(r, c - WK0));
    }
    for (let c = WK0; c <= c1; c++) { ws.getCell(4, c).numFmt = FMT_D; ws.getCell(5, c).numFmt = FMT_D; ws.getCell(6, c).numFmt = '0'; }
    for (let c = WK0; c <= c1; c++) { ws.getColumn(c).width = 8.5; ws.getColumn(c).numFmt = FMT_NC; }
    for (let r = 4; r <= 6; r++) for (let c = WK0; c <= c1; c++) ws.getCell(r, c).font = { name: 'Arial', size: 8, color: { argb: 'FF555555' } };
    hdrCells(ws, 7, WK0, c1);
    ws.getRow(7).height = 30;
  }

  // ---------------------------------------------------------------- các sheet
  function sheetHuongDan(wb, D, id) {
    const ws = newSheet(wb, 'hd', { tab: 'FF2E75B6', fit: true });
    const da = D.st.org.duAn.find((x) => x.id === id) || {};
    const u = Store.nguoi ? Store.nguoi() : null;
    title(ws, 'BIỂU ĐỒ NHÂN LỰC — BÁO CÁO XUẤT TỪ PHẦN MỀM');
    const info = [
      ['Dự án', da.ten || id], ['BQL', da.bql || ''], ['Ngày xuất', new Date().toLocaleDateString('vi-VN')], ['Người lập', u ? u.ten : ''],
      ['Chế độ tính ngày nghỉ', D.fileMode ? 'Như file Excel gốc (Tết ở Danh mục: TET_BD, TET_KT; tuần nằm trọn trong kỳ nghỉ = 0)' : 'Theo lịch ngày nghỉ (bảng Lịch nghỉ ở Danh mục)'],
      ['Số đầu việc tính / dòng Tính NC / số tuần', `${D.data.viec.length} / ${D.pairs.length} / ${D.n}`],
    ];
    info.forEach((x, i) => {
      ws.getCell(3 + i, 1).value = x[0]; ws.getCell(3 + i, 1).font = { name: 'Arial', size: 10, bold: true };
      ws.getCell(3 + i, 2).value = x[1]; ws.getCell(3 + i, 2).font = { name: 'Arial', size: 10 };
    });
    let r = 10;
    ws.getCell(r, 1).value = 'CHUỖI LIÊN KẾT'; ws.getCell(r, 1).font = { name: 'Arial', size: 11, bold: true, color: { argb: NAVY } }; r++;
    const chuoi = [
      'Danh mục ─┐', 'ĐM đã PD ─┼─► ĐM hạng mục ─┐', 'Tiến độ chi tiết ─────► Tính NC (1 dòng = đầu việc × loại CN)',
      '        ▼ SUMIFS theo tuần  →  NC tuần gốc  ×  Hệ số  →  NC sau hệ số', '        ▼ SUMIFS  →  NC theo Nhà thầu / Công trình / Loại CN / Nhóm theo dõi  →  Biểu đồ + Kiểm tra',
    ];
    chuoi.forEach((s) => { ws.getCell(r, 1).value = s; ws.getCell(r, 1).font = { name: 'Consolas', size: 10 }; r++; });
    r++;
    ws.getCell(r, 1).value = 'CÁCH KIỂM TRA TỪNG BƯỚC'; ws.getCell(r, 1).font = { name: 'Arial', size: 11, bold: true, color: { argb: NAVY } }; r++;
    const buoc = [
      '1. ĐM đã PD: bấm ô "ĐM/ngày" thấy = KL/công × HS tăng ca × HS quy đổi (cốt thép: ÷1000 để đổi kg → Tấn).',
      '2. ĐM hạng mục: ô ĐM tra INDEX/MATCH sang ĐM đã PD theo tên loại CN; ô nền vàng là định mức nhập riêng của dự án.',
      '3. Tiến độ chi tiết: Ngày = KT − BĐ − số ngày nghỉ (trừ Tết); KL tổng = số căn × KL/căn (hoặc số nhập tay nền vàng); NC/ngày = tổng từ Tính NC.',
      '4. Tính NC: NC/ngày = IF(loại ĐM="đv / công", KL/Ngày/ĐM, KL/Ngày×ĐM) — mọi cột lấy từ Tiến độ chi tiết / ĐM hạng mục bằng INDEX/MATCH.',
      '5. NC tuần gốc: SUMIFS(NC/ngày, công trình, nhà thầu, loại CN, BĐ < mốc tuần sau, KT ≥ đầu tuần).',
      '6. Hệ số: sửa ô vàng (K_DA, K_CT, K_CN, K_NT, hoặc K_lịch ở chế độ nhập) → NC sau hệ số và mọi báo cáo tự tính lại. Ô = 1 là không điều chỉnh.',
      '7. Báo cáo theo Nhà thầu / Công trình / Loại CN / Nhóm theo dõi: SUMIFS từ "NC sau hệ số"; dùng nút +/− bên trái để thu gọn nhóm.',
      '8. Kiểm tra: so số trên web với số trong file theo từng tuần (chênh lệch phải ≈ 0) và đếm cảnh báo dữ liệu.',
      'Lưu ý: dòng của các bảng được tạo theo dữ liệu lúc xuất; thêm đầu việc / nhà thầu mới thì xuất lại từ phần mềm. Mở bằng Excel 2016+, WPS, Google Sheets (không dùng hàm mới).',
    ];
    buoc.forEach((s) => { ws.getCell(r, 1).value = s; ws.getCell(r, 1).font = { name: 'Arial', size: 10 }; r++; });
    r++;
    ws.getCell(r, 1).value = 'DANH SÁCH SHEET'; ws.getCell(r, 1).font = { name: 'Arial', size: 11, bold: true, color: { argb: NAVY } }; r++;
    ORDER.forEach((k, i) => {
      ws.getCell(r, 1).value = `${i + 1}. ${SH[k]}`; ws.getCell(r, 1).font = { name: 'Arial', size: 10, bold: true };
      ws.getCell(r, 2).value = MO_TA[k]; ws.getCell(r, 2).font = { name: 'Arial', size: 10 }; r++;
    });
    ws.getColumn(1).width = 42; ws.getColumn(2).width = 120;
  }

  /** Trả về các toạ độ Danh mục cần cho công thức khác */
  function sheetDanhMuc(wb, D) {
    const ws = newSheet(wb, 'dm', { tab: 'FF7F7F7F', fit: false });
    title(ws, 'DANH MỤC', 'Công trình · Nhà thầu · Loại CN & nhóm theo dõi · Lịch ngày nghỉ. Ô vàng sửa được.');
    const R0 = 5, P = { r0: R0 };
    // Công trình
    ws.getCell(4, 1).value = 'STT'; ws.getCell(4, 2).value = 'Công trình';
    const ctAll = D.d.rows.filter((r) => r.cap === 3).map((r) => r.ten);
    ctAll.forEach((t, i) => { ws.getCell(R0 + i, 1).value = i + 1; ws.getCell(R0 + i, 2).value = t; });
    P.ctEnd = R0 + Math.max(ctAll.length, 1) - 1;
    wb.definedNames.add(`'${SH.dm}'!$B$${R0}:$B$${P.ctEnd}`, 'DS_CONGTRINH');
    // Nhà thầu
    ['Nhà thầu', 'Nhóm nhà thầu', 'Theo dõi riêng'].forEach((t, i) => (ws.getCell(4, 4 + i).value = t));
    const nts = D.dmuc.nhaThau;
    nts.forEach((t, i) => { ws.getCell(R0 + i, 4).value = t.ten; ws.getCell(R0 + i, 5).value = t.nhom; ws.getCell(R0 + i, 6).value = t.theoDoiRieng ? 'Có' : 'Không'; });
    P.ntEnd = R0 + Math.max(nts.length, 1) - 1;
    wb.definedNames.add(`'${SH.dm}'!$D$${R0}:$D$${P.ntEnd}`, 'DS_NHATHAU');
    // Loại CN + nhóm theo dõi
    ['Mã CN', 'Loại CN', 'Nhóm', 'Nhóm theo dõi', 'Loại ĐM'].forEach((t, i) => (ws.getCell(4, 8 + i).value = t));
    const lc = D.dmuc.loaiCn;
    lc.forEach((t, i) => {
      ws.getCell(R0 + i, 8).value = t.id; ws.getCell(R0 + i, 9).value = t.ten; ws.getCell(R0 + i, 10).value = t.nhom || '';
      ws.getCell(R0 + i, 11).value = t.nhomTd || 'Khác'; inp(ws.getCell(R0 + i, 11)); ws.getCell(R0 + i, 12).value = t.loai_dm;
    });
    P.cnEnd = R0 + lc.length - 1;
    wb.definedNames.add(`'${SH.dm}'!$H$${R0}:$H$${P.cnEnd}`, 'DS_MA_CN');
    wb.definedNames.add(`'${SH.dm}'!$K$${R0}:$K$${P.cnEnd}`, 'DS_NHOM_TD');
    // Lịch nghỉ (N..V): Tên, Từ, Đến(bao gồm), Kiểu, Tỷ lệ, Phạm vi, [Nghỉ hẳn từ], [Nghỉ hẳn mốc KT], [Tỷ lệ dùng tính]
    ['Ngày nghỉ / kỳ giảm', 'Từ ngày', 'Đến ngày (bao gồm)', 'Kiểu (nghi/giam)', 'Tỷ lệ (kỳ giảm)', 'Phạm vi (tuan/ngay)', 'Nghỉ hẳn: từ', 'Nghỉ hẳn: mốc KT (+1)', 'Tỷ lệ dùng tính'].forEach((t, i) => (ws.getCell(4, 14 + i).value = t));
    const lich = D.d.lich || [];
    const nL = Math.max(lich.length, 1);
    for (let i = 0; i < nL; i++) {
      const r = R0 + i, h = lich[i];
      if (h) {
        ws.getCell(r, 14).value = h.ten; ws.getCell(r, 15).value = E.dn(h.bd) + SER; ws.getCell(r, 16).value = E.dn(h.kt) + SER;
        ws.getCell(r, 17).value = h.kieu; ws.getCell(r, 18).value = h.kieu === 'nghi' ? 0 : h.tyLe; ws.getCell(r, 19).value = h.phamVi;
        [14, 15, 16, 17, 18, 19].forEach((c) => inp(ws.getCell(r, c)));
      }
      const nghi = h && h.kieu === 'nghi';
      ws.getCell(r, 20).value = fv(`IF(Q${r}="nghi",O${r},0)`, nghi ? E.dn(h.bd) + SER : 0);
      ws.getCell(r, 21).value = fv(`IF(Q${r}="nghi",P${r}+1,0)`, nghi ? E.dn(h.kt) + SER + 1 : 0);
      ws.getCell(r, 22).value = fv(`IF(Q${r}="nghi",1,IF(R${r}>0,R${r},1))`, !h || nghi ? 1 : h.tyLe > 0 ? h.tyLe : 1);
      ws.getCell(r, 15).numFmt = FMT_D; ws.getCell(r, 16).numFmt = FMT_D; ws.getCell(r, 20).numFmt = FMT_D; ws.getCell(r, 21).numFmt = FMT_D;
    }
    P.lichEnd = R0 + nL - 1;
    const nm = (ten, col) => wb.definedNames.add(`'${SH.dm}'!$${col}$${R0}:$${col}$${P.lichEnd}`, ten);
    nm('LICH_BD', 'O'); nm('LICH_KT', 'P'); nm('LICH_KIEU', 'Q'); nm('LICH_TL', 'V'); nm('NGHI_BD', 'T'); nm('NGHI_KT', 'U');
    // Lịch file gốc (X..Z) và kỳ nghỉ biểu đồ (AB..AD)
    ['Nghỉ (file gốc)', 'Từ ngày', 'Đến (mốc)'].forEach((t, i) => (ws.getCell(4, 24 + i).value = t));
    const gocN = D.d.nghiGoc || [];
    gocN.forEach((h, i) => {
      const r = R0 + i; ws.getCell(r, 24).value = h.ten; ws.getCell(r, 25).value = E.dn(h.bd) + SER; ws.getCell(r, 26).value = E.dn(h.kt) + SER;
      ws.getCell(r, 25).numFmt = FMT_D; ws.getCell(r, 26).numFmt = FMT_D; inp(ws.getCell(r, 25)); inp(ws.getCell(r, 26));
    });
    wb.definedNames.add(`'${SH.dm}'!$Y$${R0}`, 'TET_BD'); wb.definedNames.add(`'${SH.dm}'!$Z$${R0}`, 'TET_KT');
    P.gocN = gocN.length;
    ['Kỳ nghỉ biểu đồ (file gốc)', 'Từ ngày', 'Đến (mốc)'].forEach((t, i) => (ws.getCell(4, 28 + i).value = t));
    const bdN = D.d.nghiBieuDoGoc || [];
    const nB = Math.max(bdN.length, 1);
    bdN.forEach((h, i) => {
      const r = R0 + i; ws.getCell(r, 28).value = h.ten; ws.getCell(r, 29).value = E.dn(h.bd) + SER; ws.getCell(r, 30).value = E.dn(h.kt) + SER;
      ws.getCell(r, 29).numFmt = FMT_D; ws.getCell(r, 30).numFmt = FMT_D; inp(ws.getCell(r, 29)); inp(ws.getCell(r, 30));
    });
    wb.definedNames.add(`'${SH.dm}'!$AC$${R0}:$AC$${R0 + nB - 1}`, 'BD_NGHI_BD'); wb.definedNames.add(`'${SH.dm}'!$AD$${R0}:$AD$${R0 + nB - 1}`, 'BD_NGHI_KT');
    ws.getCell(2, 24).value = 'Chế độ đang dùng: ' + (D.fileMode ? 'LỊCH FILE GỐC (cột X–Z, AB–AD)' : 'LỊCH NGHỈ (cột N–V)');
    ws.getCell(2, 24).font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFC00000' } };
    [[1, 2], [4, 6], [8, 12], [14, 22], [24, 26], [28, 30]].forEach(([a, b]) => hdrCells(ws, 4, a, b));
    widths(ws, [6, 48, 2, 26, 34, 12, 2, 8, 34, 24, 16, 10, 2, 22, 12, 14, 10, 10, 10, 12, 12, 10, 2, 16, 12, 12, 2, 24, 12, 12]);
    ws.getRow(4).height = 32;
    ws.views = [{ state: 'frozen', ySplit: 4 }];
    return P;
  }

  function sheetDmDaPD(wb, D) {
    const ws = newSheet(wb, 'pd', { tab: 'FF548235', fit: true, titles: '4:4' });
    title(ws, 'ĐỊNH MỨC CÔNG NHÂN ĐÃ PHÊ DUYỆT', 'ĐM/ngày = KL/công 8h × HS tăng ca × HS quy đổi đơn vị (VD cốt thép kg → Tấn: 0,001). Định mức ban hành, dùng chung toàn Khối.');
    ['Loại CN', 'Nhóm', 'Đơn vị', 'KL/công 8h', 'HS tăng ca', 'HS quy đổi', 'ĐM/ngày', 'Loại ĐM', 'Ghi chú'].forEach((t, i) => (ws.getCell(4, 1 + i).value = t));
    hdrCells(ws, 4, 1, 9);
    const R0 = 5, list = D.dmuc.dmCn, loaiByName = {};
    D.dmuc.loaiCn.forEach((t) => (loaiByName[t.ten] = t));
    const info = {};
    list.forEach((x, i) => {
      const r = R0 + i, lo = loaiByName[x.ten];
      ws.getCell(r, 1).value = x.ten; ws.getCell(r, 2).value = x.nhom || ''; ws.getCell(r, 3).value = x.dv || '';
      const co = isNum(x.kl_cong) && isNum(x.hs_tang_ca) && x.kl_cong * x.hs_tang_ca !== 0;
      if (co) {
        let q = x.dm_ngay / (x.kl_cong * x.hs_tang_ca);
        if (Math.abs(q - 1) < 1e-9) q = 1; else if (Math.abs(q - 0.001) < 1e-9) q = 0.001;
        ws.getCell(r, 4).value = x.kl_cong; ws.getCell(r, 5).value = x.hs_tang_ca; ws.getCell(r, 6).value = q;
        ws.getCell(r, 7).value = { formula: `D${r}*E${r}*F${r}`, result: r6(x.dm_ngay) };
        [4, 5, 6].forEach((c) => inp(ws.getCell(r, c)));
      } else { ws.getCell(r, 7).value = x.dm_ngay; inp(ws.getCell(r, 7)); }
      ws.getCell(r, 8).value = lo ? lo.loai_dm : ''; ws.getCell(r, 9).value = x.ghi_chu || '';
      ws.getCell(r, 4).numFmt = '#,##0.00'; ws.getCell(r, 6).numFmt = '0.000'; ws.getCell(r, 7).numFmt = '#,##0.0000';
      info[x.ten] = { row: r, dm: x.dm_ngay };
    });
    const last = R0 + Math.max(list.length, 1) - 1;
    widths(ws, [34, 14, 9, 12, 11, 11, 12, 11, 50]);
    ws.views = [{ state: 'frozen', xSplit: 1, ySplit: 4 }];
    return { r0: R0, last, info };
  }

  function sheetDmHangMuc(wb, D, PD) {
    const ws = newSheet(wb, 'hm', { tab: 'FF548235', fit: true, titles: '4:4' });
    title(ws, 'ĐỊNH MỨC HẠNG MỤC (đầu việc × loại CN)', 'ĐM tra INDEX/MATCH từ "ĐM đã PD" theo tên loại CN; nền vàng = định mức nhập riêng của dự án (khác hoặc không có trong ĐM đã PD).');
    ['Khóa', 'Mã HM', 'Tên hạng mục', 'Mã CN', 'Loại CN', 'ĐV', 'KL 1 căn LK/SH', 'KL 1 căn ĐL/SL', 'ĐM/ngày', 'Loại ĐM', 'Nguồn ĐM'].forEach((t, i) => (ws.getCell(4, 1 + i).value = t));
    hdrCells(ws, 4, 1, 11);
    const R0 = 5, P = D.pairs, last = R0 + Math.max(P.length, 1) - 1, T = D.TD;
    P.forEach((p, i) => {
      const r = R0 + i, ten = D.loaiMap[p.cn].ten, pd = PD.info[ten];
      p.hmRow = r;
      ws.getCell(r, 1).value = { formula: `B${r}&"|"&D${r}`, result: p.r + '|' + p.cn };
      ws.getCell(r, 2).value = p.r; ws.getCell(r, 3).value = p.row.ten; ws.getCell(r, 4).value = p.cn; ws.getCell(r, 5).value = ten; ws.getCell(r, 6).value = p.row.dv || '';
      const m = `MATCH($B${r},${rg('td', 1, T.r0, T.last)},0)`;
      ws.getCell(r, 7).value = fv(`IF(INDEX(${rg('td', 11, T.r0, T.last)},${m})="","",INDEX(${rg('td', 11, T.r0, T.last)},${m}))`, isNum(p.row.kl_lk) ? p.row.kl_lk : '');
      ws.getCell(r, 8).value = fv(`IF(INDEX(${rg('td', 13, T.r0, T.last)},${m})="","",INDEX(${rg('td', 13, T.r0, T.last)},${m}))`, isNum(p.row.kl_dl) ? p.row.kl_dl : '');
      if (pd && Math.abs(pd.dm - p.dm) < 1e-9) {
        ws.getCell(r, 9).value = fv(`INDEX(${rg('pd', 7, PD.r0, PD.last)},MATCH($E${r},${rg('pd', 1, PD.r0, PD.last)},0))`, p.dm);
        ws.getCell(r, 11).value = 'Theo ĐM đã PD';
      } else {
        ws.getCell(r, 9).value = p.dm; inp(ws.getCell(r, 9));
        ws.getCell(r, 11).value = pd ? 'Nhập riêng (khác ĐM đã PD)' : 'Nhập riêng (không có trong ĐM đã PD)';
      }
      ws.getCell(r, 10).value = p.loai;
      ws.getCell(r, 7).numFmt = FMT_KL; ws.getCell(r, 8).numFmt = FMT_KL; ws.getCell(r, 9).numFmt = '#,##0.0000';
    });
    widths(ws, [14, 8, 46, 7, 28, 7, 13, 13, 11, 10, 34]);
    ws.views = [{ state: 'frozen', xSplit: 3, ySplit: 4 }];
    return { r0: R0, last };
  }

  function sheetTienDo(wb, D, DMu) {
    const ws = newSheet(wb, 'td', { tab: 'FFC55A11', fit: false, outline: true, titles: '4:4' });
    title(ws, 'TIẾN ĐỘ CHI TIẾT (WBS)', 'Nền vàng = ô nhập (BĐ, KT, số căn, KL/căn, KL nhập tay). Ngày = KT − BĐ − ngày nghỉ. Dùng nút +/− bên trái để gom/mở nhóm theo cấp.');
    const H = ['Mã', 'Cấp', 'Hạng mục', 'Tính', 'Công trình', 'Nhà thầu', 'Bắt đầu', 'Kết thúc', 'Ngày', 'Số căn LK/SH', 'KL 1 căn LK/SH', 'Số căn ĐL/SL', 'KL 1 căn ĐL/SL', 'KL tổng', 'ĐV', 'NC/ngày', 'Cảnh báo'];
    H.forEach((t, i) => (ws.getCell(4, 1 + i).value = t));
    hdrCells(ws, 4, 1, H.length); ws.getRow(4).height = 30;
    const R0 = 5, rows = D.d.rows, last = R0 + rows.length - 1;
    const T = { r0: R0, last };
    const vOf = new Map(); D.data.viec.forEach((v) => vOf.set(v.src, v));
    // NC của Tính NC (cột N) & mã (cột A)
    const NC = D.NCs; // {r0,last}
    // công thức Ngày
    const ngayF = (r) => {
      const G = `G${r}`, Hh = `H${r}`;
      let s;
      if (D.fileMode) {
        s = `${Hh}-${G}-MAX(0,MIN(${Hh},TET_KT)-MAX(${G},TET_BD))`;
        const dm = DMu;
        for (let k = 1; k < (dm.gocN || 0); k++) s += `-MAX(0,MIN(${Hh},${sq('dm')}$Z$${dm.r0 + k})-MAX(${G},${sq('dm')}$Y$${dm.r0 + k}))`;
      } else {
        const X = `(${Hh}+NGHI_KT-ABS(${Hh}-NGHI_KT))/2-(${G}+NGHI_BD+ABS(${G}-NGHI_BD))/2`;
        s = `${Hh}-${G}-SUMPRODUCT((${X}+ABS(${X}))/2)`;
      }
      return `IF(OR(${G}="",${Hh}=""),"",${s})`;
    };
    let ct = null;
    const sumKey = {};
    D.pairs.forEach((p) => { sumKey[p.r] = (sumKey[p.r] || 0) + p.nc; });
    rows.forEach((x, i) => {
      const r = R0 + i, v = vOf.get(x);
      if (x.cap === 3) ct = x.ten;
      D.tdRowOf.set(x, r);
      ws.getCell(r, 1).value = x.r; ws.getCell(r, 2).value = x.cap;
      const c3 = ws.getCell(r, 3); c3.value = x.ten; c3.alignment = { indent: Math.max(0, x.cap - 2) };
      if (x.tinh) ws.getCell(r, 4).value = 'x';
      if (ct && x.cap >= 3) ws.getCell(r, 5).value = ct;
      if (x.nt) ws.getCell(r, 6).value = x.nt;
      if (x.bd) { ws.getCell(r, 7).value = E.dn(x.bd) + SER; inp(ws.getCell(r, 7)); }
      if (x.kt) { ws.getCell(r, 8).value = E.dn(x.kt) + SER; inp(ws.getCell(r, 8)); }
      ws.getCell(r, 7).numFmt = FMT_D; ws.getCell(r, 8).numFmt = FMT_D;
      if (isNum(x.can_lk)) ws.getCell(r, 10).value = x.can_lk;
      if (isNum(x.kl_lk)) ws.getCell(r, 11).value = x.kl_lk;
      if (isNum(x.can_dl)) ws.getCell(r, 12).value = x.can_dl;
      if (isNum(x.kl_dl)) ws.getCell(r, 13).value = x.kl_dl;
      if (x.tinh) {
        [10, 11, 12, 13].forEach((c) => inp(ws.getCell(r, c)));
        ws.getCell(r, 9).value = fv(ngayF(r), v && v.ngay != null && v.bd != null && v.kt != null ? v.ngay : '');
        const klCan = E.klTheoCan(x), manual = isNum(x.kl) && Math.abs(x.kl - klCan) > 1e-6 * Math.max(1, Math.abs(x.kl));
        if (manual) { ws.getCell(r, 14).value = x.kl; inp(ws.getCell(r, 14)); }
        else ws.getCell(r, 14).value = fv(`J${r}*K${r}+L${r}*M${r}`, E.khoiLuong(x));
        ws.getCell(r, 15).value = x.dv || '';
        ws.getCell(r, 16).value = fv(`SUMIFS(${rg('nc', 14, NC.r0, NC.last)},${rg('nc', 1, NC.r0, NC.last)},$A${r})`, sumKey[x.r] || 0);
        // cảnh báo (mỗi dòng 1 thông điệp đầu tiên theo thứ tự ưu tiên)
        let w = '';
        if (v.bd == null || v.kt == null) w = 'Cần nhập thời gian';
        else if (v.kt < v.bd) w = 'Kết thúc trước Bắt đầu';
        else if (v.bd < E.dn('2000-01-01')) w = 'Ngày bất thường';
        else if (!v.kl) w = 'Cần nhập khối lượng';
        else if (!Object.keys(v.nc).length) w = 'Cần tạo định mức';
        else if (!x.nt) w = 'Chưa có nhà thầu';
        D.cbOf.set(x, w);
        ws.getCell(r, 17).value = fv(`IF(D${r}<>"x","",IF(OR(G${r}="",H${r}=""),"Cần nhập thời gian",IF(H${r}<G${r},"Kết thúc trước Bắt đầu",IF(G${r}<36526,"Ngày bất thường",IF(N${r}=0,"Cần nhập khối lượng",IF(P${r}=0,"Cần tạo định mức",IF(F${r}="","Chưa có nhà thầu",""))))))) `.trim(), w);
        if (w) ws.getCell(r, 17).font = { name: 'Arial', size: 10, color: { argb: 'FFC00000' } };
      } else if (x.cap <= 6) {
        const f = x.cap <= 3 ? XANH_NHAT : XANH_NHAT2;
        fillRow(ws, r, 1, H.length, f, x.cap <= 4);
      }
      ws.getCell(r, 9).numFmt = '0'; ws.getCell(r, 14).numFmt = FMT_KL; ws.getCell(r, 16).numFmt = FMT_NC;
      ws.getCell(r, 10).numFmt = '#,##0'; ws.getCell(r, 12).numFmt = '#,##0'; ws.getCell(r, 11).numFmt = FMT_KL; ws.getCell(r, 13).numFmt = FMT_KL;
      nhom(ws, r, Math.max(0, x.cap - 2));
    });
    widths(ws, [7, 5, 52, 5, 34, 20, 11, 11, 7, 9, 11, 9, 11, 12, 6, 9, 22]);
    ws.views = [{ state: 'frozen', xSplit: 3, ySplit: 4 }];
    ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: H.length } };
    return T;
  }

  function sheetTinhNC(wb, D, DM) {
    const ws = newSheet(wb, 'nc', { tab: 'FFC55A11', fit: true, titles: '4:4' });
    title(ws, 'TÍNH NHÂN CÔNG / NGÀY (đầu việc × loại CN)', 'NC/ngày = IF(Loại ĐM="đv / công", KL/Ngày/ĐM, KL/Ngày×ĐM). Cột B, K là số dòng tra cứu (MATCH) trong Tiến độ chi tiết / ĐM hạng mục.');
    const H = ['Mã đầu việc', 'Dòng TĐ', 'Công trình', 'Nhà thầu', 'Mã CN', 'Loại CN', 'Bắt đầu', 'Kết thúc', 'Ngày', 'KL', 'Dòng ĐM', 'ĐM/ngày', 'Loại ĐM', 'NC/ngày'];
    H.forEach((t, i) => (ws.getCell(4, 1 + i).value = t));
    hdrCells(ws, 4, 1, H.length); ws.getRow(4).height = 30;
    const R0 = 5, P = D.pairs, last = R0 + Math.max(P.length, 1) - 1, T = D.TD;
    const tdr = (c) => rg('td', c, T.r0, T.last);
    P.forEach((p, i) => {
      const r = R0 + i, x = p.row, v = p.v;
      ws.getCell(r, 1).value = p.r;
      ws.getCell(r, 2).value = fv(`MATCH($A${r},${tdr(1)},0)`, D.tdRowOf.get(x) - T.r0 + 1);
      const ix = (c) => `INDEX(${tdr(c)},$B${r})`;
      ws.getCell(r, 3).value = fv(`IF(${ix(5)}="","(không rõ)",${ix(5)})`, p.ct);
      ws.getCell(r, 4).value = fv(`IF(${ix(6)}="","(chưa có nhà thầu)",${ix(6)})`, p.nt);
      ws.getCell(r, 5).value = p.cn; ws.getCell(r, 6).value = D.loaiMap[p.cn].ten;
      ws.getCell(r, 7).value = fv(`IF(${ix(7)}="","",${ix(7)})`, v.bd == null ? '' : v.bd + SER);
      ws.getCell(r, 8).value = fv(`IF(${ix(8)}="","",${ix(8)})`, v.kt == null ? '' : v.kt + SER);
      ws.getCell(r, 9).value = fv(ix(9), v.bd == null || v.kt == null ? '' : v.ngay);
      ws.getCell(r, 10).value = fv(ix(14), v.kl);
      ws.getCell(r, 11).value = fv(`MATCH($A${r}&"|"&$E${r},${rg('hm', 1, DM.r0, DM.last)},0)`, p.hmRow - DM.r0 + 1);
      ws.getCell(r, 12).value = fv(`INDEX(${rg('hm', 9, DM.r0, DM.last)},$K${r})`, p.dm);
      ws.getCell(r, 13).value = fv(`INDEX(${rg('hm', 10, DM.r0, DM.last)},$K${r})`, p.loai);
      const e = `IF(OR($I${r}="",$I${r}=0),1,$I${r})`;
      ws.getCell(r, 14).value = fv(`IF($L${r}=0,0,IF($M${r}="đv / công",$J${r}/${e}/$L${r},IF($M${r}="công / đv",$J${r}/${e}*$L${r},0)))`, p.nc);
      ws.getCell(r, 7).numFmt = FMT_D; ws.getCell(r, 8).numFmt = FMT_D; ws.getCell(r, 9).numFmt = '0';
      ws.getCell(r, 10).numFmt = FMT_KL; ws.getCell(r, 12).numFmt = '#,##0.0000'; ws.getCell(r, 14).numFmt = FMT_NC;
    });
    widths(ws, [9, 8, 34, 20, 7, 26, 11, 11, 7, 12, 8, 11, 10, 10]);
    ws.views = [{ state: 'frozen', xSplit: 1, ySplit: 4 }];
    ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: H.length } };
    return { r0: R0, last };
  }

  function sheetHeSo(wb, D, DMu) {
    const ws = newSheet(wb, 'hs', { tab: 'FFFFC000', fit: false, titles: '4:7' });
    const { tuan, n } = D, c1 = WK0 + n - 1, hs = D.d.hs || {};
    title(ws, 'HỆ SỐ ĐIỀU CHỈNH THEO TUẦN', 'Nền vàng = ô nhập, = 1 là không điều chỉnh (xanh: tăng, cam: giảm). NC sau hệ số = NC tuần gốc × K_lịch × K_DA × K_CT × K_CN × K_NT.');
    tuanHeader(ws, D, true);
    ['Khóa', 'Tên', 'Nhóm'].forEach((t, i) => (ws.getCell(7, 1 + i).value = t));
    hdrCells(ws, 7, 1, 3); for (let c = 4; c < WK0; c++) hdrCells(ws, 7, c, c);
    const H = { rLich: 8, rDA: 9 };
    // K_lịch
    ws.getCell(8, 1).value = 'K_LICH'; ws.getCell(8, 2).value = 'K_lịch — theo ngày nghỉ / Tết';
    ws.getCell(8, 3).value = D.fileMode ? 'file gốc: tuần nằm trọn kỳ nghỉ = 0' : 'lịch nghỉ: tuần chạm ngày nghỉ = 0, kỳ giảm × tỷ lệ';
    const lich = D.d.lich || [];
    const lichOK = !D.fileMode && lich.length > 0 && lich.every((h) => h.phamVi === 'tuan' && (h.kieu === 'nghi' || h.tyLe > 0));
    const fK = (c) => {
      const L = colL(c);
      if (D.fileMode) return `IF(SUMPRODUCT((${L}$4>=BD_NGHI_BD)*(${L}$5<=BD_NGHI_KT))>0,0,1)`;
      const cham = `(${L}$5>LICH_BD)*(${L}$4<=LICH_KT)`;
      return `IF(SUMPRODUCT((LICH_KIEU="nghi")*${cham})>0,0,EXP(SUMPRODUCT((LICH_KIEU<>"nghi")*${cham}*LN(LICH_TL))))`;
    };
    for (let i = 0; i < n; i++) {
      const c = WK0 + i, cell = ws.getCell(8, c);
      if (D.fileMode || lichOK) cell.value = { formula: fK(c), result: r6(D.kLich[i]) };
      else { cell.value = r6(D.kLich[i]); inp(cell); }
      cell.numFmt = FMT_K;
    }
    if (!D.fileMode && !lichOK) ws.getCell(8, 3).value += ' (giá trị từ phần mềm — có kỳ nghỉ tính theo ngày)';
    fillRow(ws, 8, 1, 3, XAM, true);
    // K_DA
    ws.getCell(9, 1).value = 'K_DA'; ws.getCell(9, 2).value = 'K_DA — chung dự án'; fillRow(ws, 9, 1, 3, XAM, true);
    const putK = (r, getter) => {
      for (let i = 0; i < n; i++) {
        const cell = ws.getCell(r, WK0 + i), k = getter(i);
        cell.value = k; cell.numFmt = FMT_K; inp(cell);
        if (k > 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC6EFCE' } };
        else if (k < 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFD966' } };
      }
    };
    putK(9, (i) => D.K.da(i));
    const section = (r, t) => { ws.getCell(r, 1).value = t; fillRow(ws, r, 1, c1, 'FF8EA9DB', true); };
    let r = 11;
    section(r, 'K_CT — theo công trình'); r++;
    H.ctS = r; D.ctList.forEach((ct) => { ws.getCell(r, 1).value = ct; ws.getCell(r, 2).value = ct; putK(r, (i) => D.K.ct(ct, i)); r++; }); H.ctE = r - 1; r++;
    section(r, 'K_CN — theo loại công nhân'); r++;
    H.cnS = r; D.cnList.forEach((id) => { const t = D.loaiMap[id]; ws.getCell(r, 1).value = id; ws.getCell(r, 2).value = t.ten; ws.getCell(r, 3).value = t.nhomTd || 'Khác'; putK(r, (i) => D.K.cn(id, i)); r++; }); H.cnE = r - 1; r++;
    section(r, 'K_NT — theo nhà thầu'); r++;
    H.ntS = r; D.ntList.forEach((nt) => { ws.getCell(r, 1).value = nt; ws.getCell(r, 2).value = nt; ws.getCell(r, 3).value = Store.nhomNtCua ? Store.nhomNtCua(nt) : ''; putK(r, (i) => D.K.nt(nt, i)); r++; }); H.ntE = r - 1;
    for (let k = 4; k < WK0; k++) ws.getColumn(k).width = 1.5;
    widths(ws, [24, 32, 26]);
    ws.views = [{ state: 'frozen', xSplit: 2, ySplit: 7 }];
    return H;
  }

  /** NC tuần gốc (SUMIFS thô) và NC sau hệ số */
  function sheetNcGoc(wb, D, NC) {
    const ws = newSheet(wb, 'g', { tab: 'FF2E75B6', fit: false, titles: '4:7' });
    const n = D.n, c1 = WK0 + n - 1, R0 = 9, G = D.gRows, last = R0 + Math.max(G.length, 1) - 1;
    title(ws, 'NC TUẦN GỐC (theo định mức, chưa nhân hệ số)', 'SUMIFS(NC/ngày; công trình; nhà thầu; loại CN; BĐ < mốc tuần sau; KT ≥ đầu tuần) từ sheet Tính NC.');
    tuanHeader(ws, D, false);
    ['Khóa', 'Công trình', 'Nhà thầu', 'Loại CN', 'Mã CN', 'Nhóm theo dõi'].forEach((t, i) => (ws.getCell(7, 1 + i).value = t));
    hdrCells(ws, 7, 1, WK0 - 1);
    G.forEach((g, i) => {
      const r = R0 + i;
      ws.getCell(r, 1).value = fv(`B${r}&"|"&C${r}&"|"&E${r}`, g.ct + '|' + g.nt + '|' + g.cn);
      ws.getCell(r, 2).value = g.ct; ws.getCell(r, 3).value = g.nt; ws.getCell(r, 4).value = D.loaiMap[g.cn].ten; ws.getCell(r, 5).value = g.cn;
      ws.getCell(r, 6).value = fv(`INDEX(DS_NHOM_TD,MATCH($E${r},DS_MA_CN,0))`, D.loaiMap[g.cn].nhomTd || 'Khác');
    });
    const m = (c) => rg('nc', c, NC.r0, NC.last);
    if (G.length) {
      block(ws, R0, last, WK0, c1,
        (r, L) => `SUMIFS(${m(14)},${m(3)},$B${r},${m(4)},$C${r},${m(5)},$E${r},${m(7)},"<"&${L}$5,${m(8)},">="&${L}$4)`,
        (r, c) => G[r - R0].raw[c - WK0], FMT_NC);
    }
    ws.getCell(8, 2).value = 'TỔNG (thô, chưa nhân K_lịch / hệ số)'; fillRow(ws, 8, 1, c1, XANH_NHAT, true);
    block(ws, 8, 8, WK0, c1, (r, L) => `SUM(${L}${R0}:${L}${last})`, (r, c) => G.reduce((s, g) => s + g.raw[c - WK0], 0), FMT_NC);
    widths(ws, [4, 34, 20, 26, 7, 14, 2, 2, 22]);
    ws.views = [{ state: 'frozen', xSplit: 5, ySplit: 7 }];
    return { r0: R0, last };
  }

  function sheetNcAdj(wb, D, HS, GG) {
    const ws = newSheet(wb, 'adj', { tab: 'FF2E75B6', fit: false, titles: '4:7' });
    const n = D.n, c1 = WK0 + n - 1, R0 = 9, G = D.gRows, last = R0 + Math.max(G.length, 1) - 1;
    title(ws, 'NC SAU HỆ SỐ', 'NC sau hệ số = NC tuần gốc × K_lịch × K_DA × K_CT × K_CN × K_NT (tra INDEX theo dòng ở cột G–I). Các báo cáo SUMIFS từ sheet này.');
    tuanHeader(ws, D, false);
    ['Khóa', 'Công trình', 'Nhà thầu', 'Loại CN', 'Mã CN', 'Nhóm theo dõi', 'Dòng K_CT', 'Dòng K_CN', 'Dòng K_NT'].forEach((t, i) => (ws.getCell(7, 1 + i).value = t));
    hdrCells(ws, 7, 1, WK0 - 1);
    const hsr = (c, a, b) => `${sq('hs')}${colL(c)}$${a}:${colL(c)}$${b}`;
    G.forEach((g, i) => {
      const r = R0 + i;
      ws.getCell(r, 1).value = fv(`${sq('g')}A${r}`, g.ct + '|' + g.nt + '|' + g.cn);
      ws.getCell(r, 2).value = fv(`${sq('g')}B${r}`, g.ct); ws.getCell(r, 3).value = fv(`${sq('g')}C${r}`, g.nt);
      ws.getCell(r, 4).value = fv(`${sq('g')}D${r}`, D.loaiMap[g.cn].ten); ws.getCell(r, 5).value = fv(`${sq('g')}E${r}`, g.cn);
      ws.getCell(r, 6).value = fv(`${sq('g')}F${r}`, D.loaiMap[g.cn].nhomTd || 'Khác');
      ws.getCell(r, 7).value = fv(`MATCH($B${r},${sq('hs')}$A$${HS.ctS}:$A$${HS.ctE},0)`, D.ctList.indexOf(g.ct) + 1);
      ws.getCell(r, 8).value = fv(`MATCH($E${r},${sq('hs')}$A$${HS.cnS}:$A$${HS.cnE},0)`, D.cnList.indexOf(g.cn) + 1);
      ws.getCell(r, 9).value = fv(`MATCH($C${r},${sq('hs')}$A$${HS.ntS}:$A$${HS.ntE},0)`, D.ntList.indexOf(g.nt) + 1);
    });
    const L = colL(WK0);
    if (G.length) {
      block(ws, R0, last, WK0, c1,
        (r, L, c) => `${sq('g')}${L}${r}*${sq('hs')}${L}$8*${sq('hs')}${L}$9*INDEX(${hsr(c, HS.ctS, HS.ctE)},$G${r})*INDEX(${hsr(c, HS.cnS, HS.cnE)},$H${r})*INDEX(${hsr(c, HS.ntS, HS.ntE)},$I${r})`,
        (r, c) => G[r - R0].adj[c - WK0], FMT_NC);
    }
    ws.getCell(8, 2).value = 'TỔNG sau hệ số'; fillRow(ws, 8, 1, c1, XANH_NHAT, true);
    block(ws, 8, 8, WK0, c1, (r, L) => `SUM(${L}${R0}:${L}${last})`, (r, c) => G.reduce((s, g) => s + g.adj[c - WK0], 0), FMT_NC);
    widths(ws, [4, 34, 20, 26, 7, 14, 6, 6, 6]);
    ws.views = [{ state: 'frozen', xSplit: 5, ySplit: 7 }];
    return { r0: R0, last };
  }

  /**
   * Báo cáo dạng nhóm: groups = [{lbl:{b,c,d,e,f}, rows:[{b,c,d,e,f, crit:[[cột-adj, tham-chiếu-ô-hiện-tại(col letter)],…], pick:(g)=>bool}] }]
   * Tổng hợp thực tế: giá trị cache tính từ D.gRows.
   */
  function sheetBaoCao(wb, D, key, AD, cfg) {
    const ws = newSheet(wb, key, { tab: 'FF7030A0', fit: false, outline: true, titles: '4:7' });
    const n = D.n, c1 = WK0 + n - 1, G = D.gRows, L0 = colL(WK0), L1 = colL(c1);
    title(ws, cfg.tieuDe, cfg.phu);
    tuanHeader(ws, D, false);
    cfg.cot.forEach((t, i) => (ws.getCell(7, 1 + i).value = t));
    ws.getCell(7, c1 + 1).value = 'Đỉnh'; ws.getCell(7, c1 + 2).value = 'Tổng công';
    hdrCells(ws, 7, 1, WK0 - 1); hdrCells(ws, 7, c1 + 1, c1 + 2);
    const adjR = (c) => `${sq('adj')}${colL(c)}$${AD.r0}:${colL(c)}$${AD.last}`;
    let r = 9;
    const sum = (pred) => { const a = new Float64Array(n); G.forEach((g) => { if (pred(g)) for (let i = 0; i < n; i++) a[i] += g.adj[i]; }); return a; };
    const groupRows = [], daysRow = `$${L0}$6:$${L1}$6`;
    const tail = (rr, arr, isGroup) => {
      ws.getCell(rr, c1 + 1).value = fv(`MAX(${L0}${rr}:${L1}${rr})`, Math.max(0, ...arr));
      ws.getCell(rr, c1 + 2).value = fv(`SUMPRODUCT(${L0}${rr}:${L1}${rr},${daysRow})`, arr.reduce((s, x, i) => s + x * (D.tuan[i].kt - D.tuan[i].bd), 0));
      ws.getCell(rr, c1 + 1).numFmt = FMT_NC; ws.getCell(rr, c1 + 2).numFmt = '#,##0';
    };
    cfg.groups.forEach((g) => {
      const gr = r++, d0 = r;
      const detail = g.rows;
      // dòng nhóm
      const ga = new Float64Array(n);
      detail.forEach((x) => { const a = sum(x.pick); for (let i = 0; i < n; i++) ga[i] += a[i]; });
      ws.getCell(gr, 1).value = 'G';
      Object.entries(g.lbl).forEach(([c, v]) => (ws.getCell(gr, +c).value = v));
      fillRow(ws, gr, 1, c1 + 2, XANH_NHAT, true);
      const d1 = d0 + detail.length - 1;
      block(ws, gr, gr, WK0, c1, (r, L) => `SUM(${L}${d0}:${L}${d1})`, (rr, c) => ga[c - WK0], FMT_NC);
      tail(gr, ga, true);
      detail.forEach((x, i) => {
        const rr = d0 + i;
        ws.getCell(rr, 1).value = 'D';
        Object.entries(x.lbl).forEach(([c, v]) => (ws.getCell(rr, +c).value = v));
        nhom(ws, rr, 1);
        const a = sum(x.pick);
        tail(rr, a, false);
        x.arr = a;
      });
      if (detail.length) {
        // SUMIFS dùng chung theo khối: tiêu chí đọc từ cột nhãn của chính dòng (mỗi dòng 1 chi tiết)
        block(ws, d0, d1, WK0, c1, (rr, L, c) => `SUMIFS(${adjR(c)},${cfg.crit(rr)})`, (rr, c) => detail[rr - d0].arr[c - WK0], FMT_NC);
      }
      groupRows.push(gr);
      r = d1 + 1;
    });
    const lastRow = r - 1;
    // dòng tổng (hàng 8)
    ws.getCell(8, 2).value = 'TỔNG NHÂN LỰC'; fillRow(ws, 8, 1, c1 + 2, 'FFBDD7EE', true);
    const tot = sum(() => true);
    block(ws, 8, 8, WK0, c1, (r, L) => `SUMIF($A$9:$A$${lastRow},"G",${L}$9:${L}$${lastRow})`, (rr, c) => tot[c - WK0], FMT_NC);
    tail(8, tot, true);
    for (let c = WK0; c <= c1 + 2; c++) { ws.getCell(8, c).font = { name: 'Arial', size: 10, bold: true }; }
    widths(ws, cfg.rong);
    ws.getColumn(c1 + 1).width = 9; ws.getColumn(c1 + 2).width = 11;
    ws.views = [{ state: 'frozen', xSplit: cfg.dong, ySplit: 7 }];
    return { totalRow: 8, lastRow };
  }

  function baoCaoCfg(D, loai) {
    const lm = D.loaiMap, G = D.gRows;
    const cnAll = D.cnList, ctAll = D.ctList;
    const ntOrder = D.ntList;
    const A = { A: 1, B: 2, C: 3, D: 4, E: 5, F: 6 };
    const cfgBase = { dong: 5, rong: [5, 34, 22, 28, 8, 16, 2, 2, 22] };
    // helper: tiêu chí tuyệt đối trên sheet adj dựa trên ô nhãn của dòng đầu khối (tương đối theo hàng)
    const rgA = (c, AD) => `${sq('adj')}$${colL(c)}$${AD.r0}:$${colL(c)}$${AD.last}`;
    return { lm, G, cnAll, ctAll, ntOrder, A, cfgBase, rgA };
  }

  function sheetBaoCaoTatCa(wb, D, AD) {
    const { lm, G, cnAll, ctAll, ntOrder, cfgBase, rgA } = baoCaoCfg(D);
    const out = {};
    // 1) Theo nhà thầu: nhóm = loại CN, chi tiết = nhà thầu
    {
      const groups = cnAll.map((cn) => {
        const nts = ntOrder.filter((nt) => G.some((g) => g.cn === cn && g.nt === nt));
        return { lbl: { 2: lm[cn].ten, 5: cn }, rows: nts.map((nt) => ({ lbl: { 2: lm[cn].ten, 3: nt, 4: Store.nhomNtCua ? Store.nhomNtCua(nt) : '', 5: cn }, pick: (g) => g.cn === cn && g.nt === nt })) };
      }).filter((g) => g.rows.length);
      out.nt = sheetBaoCao(wb, D, 'nt', AD, Object.assign({}, cfgBase, {
        tieuDe: 'NHÂN LỰC THEO NHÀ THẦU (loại CN → nhà thầu)', phu: 'Người/ngày trong tuần, đã nhân hệ số. Dòng G = tổng nhóm (SUM), dòng D = SUMIFS từ NC sau hệ số. Nút +/− để thu gọn.',
        cot: ['Cấp', 'Loại CN', 'Nhà thầu', 'Nhóm nhà thầu', 'Mã CN'], groups,
        crit: (d0) => `${rgA(5, AD)},$E${d0},${rgA(3, AD)},$C${d0}`,
      }));
    }
    // 2) Theo công trình: nhóm = công trình, chi tiết = loại CN
    {
      const groups = ctAll.map((ct) => {
        const cns = cnAll.filter((cn) => G.some((g) => g.cn === cn && g.ct === ct));
        return { lbl: { 2: ct }, rows: cns.map((cn) => ({ lbl: { 2: ct, 4: lm[cn].ten, 5: cn }, pick: (g) => g.cn === cn && g.ct === ct })) };
      }).filter((g) => g.rows.length);
      out.ct = sheetBaoCao(wb, D, 'ct', AD, Object.assign({}, cfgBase, {
        tieuDe: 'NHÂN LỰC THEO CÔNG TRÌNH (công trình → loại CN)', phu: 'Người/ngày trong tuần, đã nhân hệ số.',
        cot: ['Cấp', 'Công trình', '', 'Loại CN', 'Mã CN'], groups,
        crit: (d0) => `${rgA(2, AD)},$B${d0},${rgA(5, AD)},$E${d0}`,
      }));
    }
    // 3) Theo loại CN (phẳng)
    {
      const rows = cnAll.filter((cn) => G.some((g) => g.cn === cn)).map((cn) => ({ lbl: { 2: lm[cn].ten, 5: cn, 6: lm[cn].nhomTd || 'Khác' }, pick: (g) => g.cn === cn }));
      out.cn = sheetBaoCao(wb, D, 'cn', AD, Object.assign({}, cfgBase, {
        tieuDe: 'NHÂN LỰC THEO LOẠI CN (toàn dự án)', phu: 'Người/ngày trong tuần, đã nhân hệ số; cột Đỉnh = MAX theo tuần, Tổng công = Σ người × số ngày của tuần.',
        cot: ['Cấp', 'Loại CN', '', '', 'Mã CN', 'Nhóm theo dõi'],
        groups: [{ lbl: { 2: 'Tất cả loại CN' }, rows }].map((g) => g),
        crit: (d0) => `${rgA(5, AD)},$E${d0}`,
      }));
    }
    // 4) Theo nhóm theo dõi: nhóm = nhóm TD, chi tiết = loại CN
    {
      const nhomList = Array.from(new Set(D.dmuc.nhomTd.concat(cnAll.map((cn) => lm[cn].nhomTd || 'Khác'))));
      const groups = nhomList.map((nh) => {
        const cns = cnAll.filter((cn) => (lm[cn].nhomTd || 'Khác') === nh && G.some((g) => g.cn === cn));
        return { lbl: { 2: nh, 6: nh }, rows: cns.map((cn) => ({ lbl: { 2: nh, 4: lm[cn].ten, 5: cn, 6: nh }, pick: (g) => g.cn === cn })) };
      }).filter((g) => g.rows.length);
      out.tdn = sheetBaoCao(wb, D, 'tdn', AD, Object.assign({}, cfgBase, {
        tieuDe: 'NHÂN LỰC THEO NHÓM CN THEO DÕI (nhóm → loại CN)', phu: 'Nhóm theo dõi lấy từ Danh mục (cột K). Đã nhân hệ số.',
        cot: ['Cấp', 'Nhóm theo dõi', '', 'Loại CN', 'Mã CN', 'Nhóm'], groups,
        crit: (d0) => `${rgA(5, AD)},$E${d0},${rgA(6, AD)},$F${d0}`,
      }));
    }
    return out;
  }

  function sheetBieuDo(wb, D, BC, GG) {
    const ws = newSheet(wb, 'bd', { tab: 'FFC00000', fit: true, titles: '8:8' });
    const n = D.n, c1 = WK0 + n - 1, L0 = colL(WK0), L1 = colL(c1);
    title(ws, 'BIỂU ĐỒ NHÂN LỰC — TỔNG THEO TUẦN', 'Số liệu lấy từ NC theo Nhà thầu (tổng sau hệ số) và NC tuần gốc × K_lịch; ảnh biểu đồ chèn từ giao diện (nếu có).');
    const R0 = 9, last = R0 + n - 1;
    const tong = D.gRows.reduce((a, g) => { for (let i = 0; i < n; i++) a[i] += g.adj[i]; return a; }, new Float64Array(n));
    const goc = D.gRows.reduce((a, g) => { for (let i = 0; i < n; i++) a[i] += g.raw[i] * D.kLich[i]; return a; }, new Float64Array(n));
    ws.getCell(4, 1).value = 'Đỉnh nhân lực (sau hệ số)'; ws.getCell(4, 4).value = fv(`MAX(F${R0}:F${last})`, Math.max(0, ...tong));
    ws.getCell(5, 1).value = 'Tổng công (sau hệ số)'; ws.getCell(5, 4).value = fv(`SUMPRODUCT(F${R0}:F${last},D${R0}:D${last})`, tong.reduce((s, x, i) => s + x * (D.tuan[i].kt - D.tuan[i].bd), 0));
    ws.getCell(6, 1).value = 'Đỉnh nhân lực (gốc theo định mức)'; ws.getCell(6, 4).value = fv(`MAX(E${R0}:E${last})`, Math.max(0, ...goc));
    ws.getCell(7, 1).value = 'Tổng công (gốc theo định mức)'; ws.getCell(7, 4).value = fv(`SUMPRODUCT(E${R0}:E${last},D${R0}:D${last})`, goc.reduce((s, x, i) => s + x * (D.tuan[i].kt - D.tuan[i].bd), 0));
    for (let r = 4; r <= 7; r++) { ws.getCell(r, 1).font = { name: 'Arial', size: 10, bold: true }; ws.getCell(r, 4).numFmt = '#,##0.0'; ws.getCell(r, 4).font = { name: 'Arial', size: 10, bold: true }; }
    ['Tuần số', 'Tuần', 'Từ ngày', 'Số ngày', 'Gốc (theo ĐM, sau lịch)', 'Sau hệ số', 'Chênh lệch'].forEach((t, i) => (ws.getCell(8, 1 + i).value = t));
    hdrCells(ws, 8, 1, 7); ws.getRow(8).height = 30;
    const rowOf = (k, rr) => `${sq(k)}$${L0}$${rr}:$${L1}$${rr}`;
    for (let i = 0; i < n; i++) {
      const r = R0 + i, t = D.tuan[i];
      ws.getCell(r, 1).value = i + 1;
      ws.getCell(r, 2).value = fv(`INDEX(${rowOf('hs', 7)},1,$A${r})`, t.nhan);
      ws.getCell(r, 3).value = fv(`INDEX(${rowOf('hs', 4)},1,$A${r})`, t.bd + SER); ws.getCell(r, 3).numFmt = FMT_D;
      ws.getCell(r, 4).value = fv(`INDEX(${rowOf('hs', 6)},1,$A${r})`, t.kt - t.bd);
      ws.getCell(r, 5).value = fv(`INDEX(${rowOf('g', 8)},1,$A${r})*INDEX(${rowOf('hs', 8)},1,$A${r})`, goc[i]);
      ws.getCell(r, 6).value = fv(`INDEX(${rowOf('nt', 8)},1,$A${r})`, tong[i]);
      ws.getCell(r, 7).value = fv(`F${r}-E${r}`, tong[i] - goc[i]);
      [5, 6, 7].forEach((c) => (ws.getCell(r, c).numFmt = FMT_NC));
    }
    widths(ws, [8, 12, 12, 8, 16, 14, 12]);
    ws.views = [{ state: 'frozen', ySplit: 8 }];
    // Ảnh biểu đồ (nếu giao diện đang có canvas)
    let anh = false;
    try {
      if (typeof document !== 'undefined') {
        const cv = document.getElementById('bdnl-chart-main');
        if (cv && cv.toDataURL && cv.width > 0) {
          const id = wb.addImage({ base64: cv.toDataURL('image/png'), extension: 'png' });
          ws.addImage(id, { tl: { col: 8, row: 3 }, ext: { width: Math.min(1100, cv.width), height: Math.min(1100, cv.width) * cv.height / cv.width } });
          anh = true;
        }
      }
    } catch (e) { /* bỏ qua ảnh */ }
    if (!anh) { ws.getCell(4, 9).value = '(Không có ảnh biểu đồ — mở màn hình Biểu đồ rồi xuất lại để chèn ảnh)'; ws.getCell(4, 9).font = { name: 'Arial', size: 9, italic: true, color: { argb: 'FF7F7F7F' } }; }
    return { r0: R0, last, anh };
  }

  function sheetKiemTra(wb, D, id, BC, TD, BDs) {
    const ws = newSheet(wb, 'kt', { tab: 'FF00B050', fit: true, titles: '14:14' });
    const n = D.n, c1 = WK0 + n - 1, L0 = colL(WK0), L1 = colL(c1);
    title(ws, 'KIỂM TRA — SỐ TRÊN WEB vs SỐ TRONG FILE', 'Số web = Store.bieuDo lúc xuất (giá trị cố định); số file = công thức. Sửa hệ số/ tiến độ trong file thì chênh lệch xuất hiện là bình thường.');
    const web = Store.bieuDo(id, 'nt'), webGoc = web.goc, webTong = web.tong;
    const R0 = 15, last = R0 + n - 1;
    const cols = ['Tuần số', 'Tuần', 'Web: tổng sau hệ số', 'File: NC theo Nhà thầu', 'Chênh lệch (File − Web)', 'File: NC theo Công trình', 'File: NC theo Loại CN', 'File: NC theo Nhóm theo dõi', 'Lệch giữa 4 báo cáo', 'Web: gốc', 'File: gốc', 'Chênh lệch gốc'];
    cols.forEach((t, i) => (ws.getCell(14, 1 + i).value = t));
    hdrCells(ws, 14, 1, cols.length); ws.getRow(14).height = 42;
    const rowOf = (k, rr) => `${sq(k)}$${L0}$${rr}:$${L1}$${rr}`;
    const fileTong = D.gRows.reduce((a, g) => { for (let i = 0; i < n; i++) a[i] += g.adj[i]; return a; }, new Float64Array(n));
    const fileGoc = D.gRows.reduce((a, g) => { for (let i = 0; i < n; i++) a[i] += g.raw[i] * D.kLich[i]; return a; }, new Float64Array(n));
    for (let i = 0; i < n; i++) {
      const r = R0 + i;
      ws.getCell(r, 1).value = i + 1;
      ws.getCell(r, 2).value = fv(`INDEX(${rowOf('hs', 7)},1,$A${r})`, D.tuan[i].nhan);
      ws.getCell(r, 3).value = r6(webTong[i]);
      ws.getCell(r, 4).value = fv(`INDEX(${rowOf('nt', 8)},1,$A${r})`, fileTong[i]);
      ws.getCell(r, 5).value = fv(`D${r}-C${r}`, fileTong[i] - webTong[i]);
      ws.getCell(r, 6).value = fv(`INDEX(${rowOf('ct', 8)},1,$A${r})`, fileTong[i]);
      ws.getCell(r, 7).value = fv(`INDEX(${rowOf('cn', 8)},1,$A${r})`, fileTong[i]);
      ws.getCell(r, 8).value = fv(`INDEX(${rowOf('tdn', 8)},1,$A${r})`, fileTong[i]);
      ws.getCell(r, 9).value = fv(`MAX(D${r},F${r},G${r},H${r})-MIN(D${r},F${r},G${r},H${r})`, 0);
      ws.getCell(r, 10).value = r6(webGoc[i]);
      ws.getCell(r, 11).value = fv(`INDEX(${sq('bd')}$E$${BDs.r0}:$E$${BDs.last},$A${r})`, fileGoc[i]);
      ws.getCell(r, 12).value = fv(`K${r}-J${r}`, fileGoc[i] - webGoc[i]);
      for (let c = 3; c <= 12; c++) ws.getCell(r, c).numFmt = c === 5 || c === 9 || c === 12 ? '0.000000' : FMT_NC;
    }
    // Tổng hợp trên cùng
    const mx = (rng) => `MAX(MAX(${rng}),-MIN(${rng}))`;
    const maxAbs = (arr, web) => arr.reduce((m, x, i) => Math.max(m, Math.abs(x - web[i])), 0);
    const TD_r = (c) => rg('td', c, TD.r0, TD.last);
    const canhBao = E.canhBao(D.data);
    const soRowCb = new Set(canhBao.map((x) => x.r)).size, soThieuDm = canhBao.filter((x) => x.loi === 'Cần tạo định mức').length;
    const excelCb = D.d.rows.filter((x) => x.tinh && D.cbOf.get(x)).length, excelThieu = D.d.rows.filter((x) => x.tinh && D.cbOf.get(x) === 'Cần tạo định mức').length;
    const lines = [
      ['Chênh lệch lớn nhất, tổng sau hệ số (File − Web)', null, fv(mx(`E${R0}:E${last}`), maxAbs(fileTong, webTong)), 'ABS'],
      ['Chênh lệch lớn nhất, gốc (File − Web)', null, fv(mx(`L${R0}:L${last}`), maxAbs(fileGoc, webGoc)), 'ABS'],
      ['Lệch lớn nhất giữa 4 báo cáo (Nhà thầu/Công trình/Loại CN/Nhóm)', null, fv(`MAX(I${R0}:I${last})`, 0), 'ABS'],
      ['Số đầu việc tính (Web | File)', D.data.viec.length, fv(`COUNTIF(${TD_r(4)},"x")`, D.d.rows.filter((x) => x.tinh).length), 'EQ'],
      ['Số đầu việc có cảnh báo (Web | File)', soRowCb, fv(`SUMPRODUCT(--(LEN(${TD_r(17)})>0))`, excelCb), 'EQ'],
      ['Số đầu việc thiếu định mức (Web | File)', soThieuDm, fv(`COUNTIF(${TD_r(17)},"Cần tạo định mức")`, excelThieu), 'EQ'],
      ['Số dòng Tính NC (đầu việc × loại CN)', null, fv(`COUNTA(${rg('nc', 1, D.NCs.r0, D.NCs.last)})`, D.pairs.length), 'INFO'],
    ];
    hdrCells(ws, 3, 1, 5);
    ['Chỉ tiêu', '', 'Web', 'File', 'Kết quả'].forEach((t, i) => (ws.getCell(3, 1 + i).value = t));
    lines.forEach((ln, i) => {
      const r = 4 + i;
      ws.getCell(r, 1).value = ln[0];
      if (ln[1] != null) ws.getCell(r, 3).value = ln[1];
      ws.getCell(r, 4).value = ln[2];
      if (ln[3] === 'ABS') {
        ws.getCell(r, 5).value = fv(`IF(D${r}<0.001,"ĐẠT","LỆCH")`, ln[2].result < 0.001 ? 'ĐẠT' : 'LỆCH'); ws.getCell(r, 4).numFmt = '0.000000';
      } else if (ln[3] === 'EQ') ws.getCell(r, 5).value = fv(`IF(C${r}=D${r},"ĐẠT","LỆCH")`, ln[1] === ln[2].result ? 'ĐẠT' : 'LỆCH');
      else ws.getCell(r, 5).value = '';
      ws.getCell(r, 5).font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF00B050' } };
    });
    ws.getCell(12, 1).value = 'Đỉnh nhân lực (Web | File)';
    ws.getCell(12, 3).value = r6(Math.max(0, ...webTong)); ws.getCell(12, 4).value = fv(`MAX(D${R0}:D${last})`, Math.max(0, ...fileTong));
    ws.getCell(12, 5).value = fv(`IF(ABS(D12-C12)<0.001,"ĐẠT","LỆCH")`, Math.abs(Math.max(0, ...fileTong) - Math.max(0, ...webTong)) < 0.001 ? 'ĐẠT' : 'LỆCH');
    ws.getCell(12, 5).font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF00B050' } };
    ws.getCell(12, 3).numFmt = FMT_NC; ws.getCell(12, 4).numFmt = FMT_NC;
    widths(ws, [52, 12, 16, 16, 16, 16, 16, 16, 14, 14, 14, 14]);
    ws.views = [{ state: 'frozen', ySplit: 14 }];
    return { webTong, fileTong, soRowCb, excelCb };
  }

  // ---------------------------------------------------------------- hàm chính
  async function xuatExcel(duAnId) {
    const X = window.ExcelJS || globalThis.ExcelJS;
    if (!X) throw new Error('Chưa nạp thư viện ExcelJS');
    const D = chuanBiDuLieu(duAnId);
    const wb = new X.Workbook();
    wb.creator = 'Phần mềm Biểu đồ nhân lực'; wb.created = new Date();
    wb.calcProperties = { fullCalcOnLoad: true };
    // Trước khi dựng sheet, cần biết số dòng của Tính NC / Tiến độ để công thức tham chiếu đúng
    const nTd = D.d.rows.length;
    D.tdRowOf = new Map(); D.cbOf = new Map();
    D.TD = { r0: 5, last: 5 + nTd - 1 };
    D.NCs = { r0: 5, last: 5 + Math.max(D.pairs.length, 1) - 1 };
    // thứ tự sheet theo chuỗi liên kết; các sheet được tạo theo thứ tự dưới đây
    sheetHuongDan(wb, D, duAnId);
    const DMu = sheetDanhMuc(wb, D);
    const PD = sheetDmDaPD(wb, D);
    const HM = sheetDmHangMuc(wb, D, PD);
    sheetTienDo(wb, D, DMu);
    sheetTinhNC(wb, D, HM);
    const HS = sheetHeSo(wb, D, DMu);
    const GG = sheetNcGoc(wb, D, D.NCs);
    const AD = sheetNcAdj(wb, D, HS, GG);
    const BC = sheetBaoCaoTatCa(wb, D, AD);
    const BDs = sheetBieuDo(wb, D, BC, GG);
    const KT = sheetKiemTra(wb, D, duAnId, BC, D.TD, BDs);
    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    blob.thongKe = { soTuan: D.n, soDongTinhNC: D.pairs.length, soDongNcGoc: D.gRows.length, anhBieuDo: BDs.anh, sheets: ORDER.map((k) => SH[k]) };
    return blob;
  }
  xuatExcel.tenFile = tenFile;
  xuatExcel.danhSachSheet = () => ORDER.map((k) => ({ ten: SH[k], moTa: MO_TA[k] }));
  window.xuatExcel = xuatExcel;

  // ---------------------------------------------------------------- màn hình
  if (window.App && window.App.dangKy) {
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    window.App.dangKy({
      id: 'xuat', tab: 'kh', nhom: 'caidat', ten: 'Xuất báo cáo', icon: '📤', thuTu: 8,
      ve(el, ctx) {
        const ten = tenFile(ctx.duAnId);
        el.innerHTML = `<div class="xuat-excel" style="max-width:860px">
          <h2 style="margin:0 0 6px">Xuất báo cáo Excel</h2>
          <p style="margin:0 0 12px;color:var(--mut)">File có <b>công thức liên kết thật</b> (SUMIFS, INDEX/MATCH…): bấm vào ô để thấy cách tính, truy ngược tới Định mức – Khối lượng – Tiến độ; sửa hệ số hoặc tiến độ trong file thì báo cáo tự tính lại.
          Chỉ dùng hàm phổ thông nên mở được trên Excel 2016+, WPS, Google Sheets.</p>
          <p style="margin:0 0 12px"><button type="button" class="btn nut-xuat" style="padding:8px 18px;font-weight:600;cursor:pointer">⬇ Tải ${esc(ten)}</button>
          <span class="xuat-tt" style="margin-left:12px;color:var(--mut)"></span></p>
          <h3 style="margin:16px 0 6px">Các sheet trong file</h3>
          <ol style="margin:0;padding-left:22px;line-height:1.6">${ORDER.map((k) => `<li><b>${esc(SH[k])}</b> — ${esc(MO_TA[k])}</li>`).join('')}</ol>
        </div>`;
        const nut = el.querySelector('.nut-xuat'), tt = el.querySelector('.xuat-tt');
        nut.addEventListener('click', async () => {
          nut.disabled = true; tt.textContent = 'Đang tạo file…';
          try {
            await new Promise((r) => setTimeout(r, 30));
            const blob = await xuatExcel(ctx.duAnId);
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob); a.download = tenFile(ctx.duAnId);
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(() => URL.revokeObjectURL(a.href), 10000);
            tt.textContent = `Đã tạo ${(blob.size / 1048576).toFixed(1)} MB.` + (blob.thongKe && !blob.thongKe.anhBieuDo ? ' (Chưa có ảnh biểu đồ: mở màn hình Biểu đồ trước rồi xuất lại nếu cần ảnh.)' : '');
          } catch (e) {
            console.error(e); tt.textContent = '';
            window.App.thongBao('Không xuất được Excel: ' + e.message, 'loi');
          } finally { nut.disabled = false; }
        });
      },
    });
  }
})();
