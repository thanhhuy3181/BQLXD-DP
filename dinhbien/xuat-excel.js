// Xuất Excel theo file mẫu (dinhbien_template.xlsx): chỉ ghi dữ liệu đầu vào của dự án vào ô nhập,
// ẩn dòng hạng mục / cột tháng thừa, chỉnh biểu đồ theo số tháng. Mọi số liệu do công thức Excel tự tính khi mở file.
// Sửa thẳng XML trong file .xlsx (JSZip) để giữ nguyên biểu đồ, định dạng có điều kiện, danh sách chọn.
// Dùng được trong trình duyệt (window.XuatExcel) và Node (module.exports) để kiểm thử.
(function (root) {
  'use strict';

  const LAYOUT = /*LAYOUT*/{"N_ITEMS": 100, "N_MONTHS": 36, "axisPx": 44, "thMonthPx": 67, "ttMonthPx": 64, "sheets": {"tt": "Tính toán theo tiến độ", "dg": "Diễn giải", "hs": "Hệ số", "th": "Tổng hợp", "ctr": "Ctr.Hm của DA", "tk": "Tra KHO", "tl": "Tỷ lệ tháng"}, "tt": {"daStart": 5, "bpStart": 106, "monthCol": 19}, "dg": {"monthCol": 9, "lineStarts": [23, 124, 227, 328, 431, 532, 643, 744, 845, 946, 1047, 1154, 1256, 1358, 1460, 1561, 1662, 1763, 1866, 1968, 2069, 2170, 2272, 2373, 2474, 2575], "monthCell": "G5", "title": "B2"}, "th": {"monthCol": 5, "name": "C4"}, "hs": {"monthCol": 5, "xd": 5, "me": 106, "ht": 207, "kho": 308, "bptc": 409, "ns": {"GĐ BQLXD cấp 1": 510, "GĐ BQLXD cấp 2": 511, "GĐ BQLXD cấp 3": 512, "Trợ lý GĐ BQLXD": 513, "ĐTGS Xây dựng": 514, "CBGS Xây dựng": 515, "NVGS Xây dựng": 516, "ĐTGS ME": 517, "CBGS ME": 518, "NVGS ME": 519, "ĐTGS Hạ tầng": 520, "CBGS Hạ tầng": 521, "NVGS Hạ tầng": 522, "CBGS Trắc đạc": 523, "CBGS Cây xanh": 524, "CV QLTK": 525, "CV Nội nghiệp": 526, "CV ATLĐ & VSMT": 527, "CV Hành chính": 528, "Tổng quản lý kho (theo vùng)": 530, "Trưởng kho": 531, "Trưởng nhóm kho": 532, "Thủ kho (Nhập liệu & Hiện trường)": 533, "Thủ kho nhập liệu - XD": 534, "Thủ kho nhập liệu - ME": 535, "Thủ kho hiện trường - XD": 536, "Thủ kho hiện trường - ME": 537, "Thủ kho nhập liệu - Kho ép cọc": 538, "Thủ kho hiện trường - Kho ép cọc": 539, "Phó Giám đốc thi công": 541, "Trưởng Bộ phận Hỗ trợ thi công": 542, "Trưởng nhóm QC": 543, "Chuyên viên QC": 544, "Trưởng nhóm QS": 545, "Chuyên viên QS": 546, "Trưởng nhóm BPTC- Shopdrawing": 547, "Chuyên viên BPTC- Shopdrawing": 548, "Trưởng nhóm An toàn lao động": 549, "Chuyên viên An Toàn Lao động": 550, "Trưởng nhóm Trắc đạc": 551, "Chuyên viên trắc đạc": 552, "Nhân viên trắc đạc": 553, "Trưởng khối": 554, "Đội trưởng": 555, "Chuyên viên Kỹ thuật hiện trường": 556, "Trưởng nhóm QL Máy móc thiết bị": 557, "Chuyên viên Quản lý vật tư Thiết bị": 558, "Nhân viên cơ khí": 559, "Nhân viên điện nước tạm": 560, "Chuyên viên hành chính": 561, "Nhân viên hành chính": 562, "Nhân viên lấy mẫu thí nghiệm": 563, "Chuyên viên nội nghiệp": 564, "Chuyên viên Kế hoạch thi công": 565}}, "tk": {"monthCol": 9, "start": 5}, "tl": {"monthCol": 9, "starts": [5, 106]}, "ctr": {"first": 2, "last": 400}, "monthSheets": {"Tính toán theo tiến độ": 19, "Diễn giải": 9, "Tổng hợp": 5, "Hệ số": 5, "Tra KHO": 9, "Tỷ lệ tháng": 9, "Bảng tra": 5}, "itemFamilies": {"Tính toán theo tiến độ": [5, 106], "Hệ số": [5, 106, 207, 308, 409], "Tra KHO": [5], "Tỷ lệ tháng": [5, 106], "Diễn giải": [23, 124, 227, 328, 431, 532, 643, 744, 845, 946, 1047, 1154, 1256, 1358, 1460, 1561, 1662, 1763, 1866, 1968, 2069, 2170, 2272, 2373, 2474, 2575]}}/*END_LAYOUT*/;

  // ----------------------------------------------------------------- tiện ích ô / cột
  function colIdx(letters) {
    let n = 0;
    for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
    return n;
  }
  function colLetter(n) {
    let s = '';
    while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = (n - m - 1) / 26; }
    return s;
  }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  // Ngày 'YYYY-MM-DD' hoặc Date -> số ngày Excel
  function serial(d) {
    if (d === null || d === undefined || d === '') return null;
    let y, m, day;
    if (d instanceof Date) { y = d.getFullYear(); m = d.getMonth() + 1; day = d.getDate(); }
    else { const p = String(d).slice(0, 10).split('-').map(Number); [y, m, day] = p; if (!y || !m || !day) return null; }
    return Math.round((Date.UTC(y, m - 1, day) - Date.UTC(1899, 11, 30)) / 86400000);
  }

  // Một ô <c>: giữ kiểu định dạng s, thay nội dung theo giá trị mới
  function cellXml(ref, attrs, value) {
    const s = (attrs.match(/\ss="(\d+)"/) || [])[1];
    const sAttr = s ? ` s="${s}"` : '';
    if (value === null || value === undefined || value === '') return `<c r="${ref}"${sAttr}/>`;
    if (typeof value === 'object' && value.f) return `<c r="${ref}"${sAttr}><f>${esc(value.f)}</f></c>`;
    if (typeof value === 'number' && isFinite(value)) return `<c r="${ref}"${sAttr}><v>${value}</v></c>`;
    return `<c r="${ref}"${sAttr} t="inlineStr"><is><t xml:space="preserve">${esc(value)}</t></is></c>`;
  }

  // Sửa sheet XML: edits = Map(row -> Map(colLetter -> value)), hideRows = Set(row), hideCols = Set(colIdx)
  function patchSheet(xml, edits, hideRows, hideCols) {
    xml = xml.replace(/<row r="(\d+)"([^>]*?)(\/>|>([\s\S]*?)<\/row>)/g, (all, rStr, rAttrs, tail, inner) => {
      const r = Number(rStr);
      let attrs = rAttrs;
      if (hideRows && hideRows.has(r)) attrs = attrs.replace(/\shidden="[^"]*"/, '') + ' hidden="1"';
      const e = edits.get(r);
      if (!e) return `<row r="${rStr}"${attrs}${tail === '/>' ? '/>' : '>' + inner + '</row>'}`;
      const cells = new Map();
      if (inner) {
        inner.replace(/<c r="([A-Z]+)(\d+)"([^>]*?)(\/>|>([\s\S]*?)<\/c>)/g, (c, col, rr, cAttrs) => {
          cells.set(col, { xml: c, attrs: cAttrs });
          return c;
        });
      }
      for (const [col, val] of e) {
        const old = cells.get(col);
        cells.set(col, { xml: cellXml(col + rStr, old ? old.attrs : '', val), attrs: old ? old.attrs : '' });
      }
      const body = [...cells.entries()].sort((a, b) => colIdx(a[0]) - colIdx(b[0])).map(x => x[1].xml).join('');
      return `<row r="${rStr}"${attrs}>${body}</row>`;
    });
    if (hideCols && hideCols.size) {
      xml = xml.replace(/<cols>([\s\S]*?)<\/cols>/, (all, inner) => {
        const out = [];
        inner.replace(/<col ([^>]*?)\/>/g, (c, a) => {
          const mn = Number((a.match(/min="(\d+)"/) || [])[1]);
          const mx = Number((a.match(/max="(\d+)"/) || [])[1]);
          const base = a.replace(/\s?min="\d+"/, '').replace(/\s?max="\d+"/, '').replace(/\s?hidden="[^"]*"/, '').trim();
          // tách khoảng cột thành từng đoạn ẩn / hiện
          let start = mn;
          for (let i = mn; i <= mx + 1; i++) {
            const h = i <= mx && hideCols.has(i);
            const prevH = hideCols.has(start);
            if (i === mx + 1 || h !== prevH) {
              out.push(`<col min="${start}" max="${i - 1}" ${base}${prevH ? ' hidden="1"' : ''}/>`);
              start = i;
            }
          }
          return c;
        });
        return `<cols>${out.join('')}</cols>`;
      });
    }
    return xml;
  }

  // ----------------------------------------------------------------- điền dữ liệu
  // data = { ten, items:[{stt,ten,loai,kieu,tc,batDau,ketThuc,banGiao,kl,dv,dienTich,hsCt,
  //                      bpBatDau,bpKetThuc,bpBanGiao,bpKl, tiendo:{xd:[],me:[],ht:[],kho:[],bptc:[]}}],
  //          months:['YYYY-MM',...], adj:{tênChứcDanh:{'YYYY-MM':hệ số}}, dgMonth:'YYYY-MM' }
  async function fill(zip, data, layout) {
    const L = layout || LAYOUT;
    const N = L.N_ITEMS, NM = L.N_MONTHS;
    const items = data.items.slice(0, N);
    const months = data.months.slice(0, NM);
    const nI = items.length, nM = months.length;

    // tên sheet -> đường dẫn XML
    const wbXml = await zip.file('xl/workbook.xml').async('string');
    const rels = await zip.file('xl/_rels/workbook.xml.rels').async('string');
    const relTarget = {};
    rels.replace(/<Relationship [^>]*?Target="([^"]+)"[^>]*?Id="([^"]+)"|<Relationship [^>]*?Id="([^"]+)"[^>]*?Target="([^"]+)"/g,
      (m, t1, i1, i2, t2) => { relTarget[i1 || i2] = (t1 || t2).replace(/^\//, ''); return m; });
    const sheetPath = {};
    wbXml.replace(/<sheet [^>]*?name="([^"]+)"[^>]*?r:id="([^"]+)"/g, (m, name, rid) => {
      const t = relTarget[rid];
      sheetPath[name.replace(/&amp;/g, '&')] = t.startsWith('xl/') ? t : 'xl/' + t;
      return m;
    });

    const edits = {};        // sheet -> Map(row -> Map(col -> value))
    const hideRows = {}, hideCols = {};
    const set = (sheet, col, row, v) => {
      if (!edits[sheet]) edits[sheet] = new Map();
      if (!edits[sheet].has(row)) edits[sheet].set(row, new Map());
      edits[sheet].get(row).set(col, v);
    };
    const S = L.sheets;
    const DA0 = L.tt.daStart, BP0 = L.tt.bpStart;

    const klCol = it => {
      const loai = it.loai || '', kieu = it.kieu || '', tc = it.tc || '';
      if (loai === 'Thấp tầng') return kieu.includes('Biệt thự') ? 'N' : (tc.includes('Full') ? 'O' : 'M');
      if (loai === 'Cao tầng') return 'P';
      if (loai === 'Các công trình khác') return 'Q';
      return 'R';
    };

    let ctr = L.ctr.first;
    items.forEach((it, i) => {
      const r = DA0 + i, b = BP0 + i;
      const kl = Number(it.kl) || 0;
      set(S.tt, 'A', r, it.stt != null ? it.stt : i + 1);
      set(S.tt, 'B', r, it.ten || '');
      set(S.tt, 'D', r, 'Ban QLXD');
      set(S.tt, 'E', r, serial(it.batDau));
      set(S.tt, 'F', r, serial(it.ketThuc));
      set(S.tt, 'G', r, serial(it.banGiao));
      set(S.tt, 'H', r, kl);
      set(S.tt, 'I', r, kl);
      set(S.tt, 'J', r, it.dv || '');
      set(S.tt, 'K', r, Number(it.dienTich) > 0 ? Number(it.dienTich) : null);
      set(S.tt, 'L', r, it.hsCt != null && it.hsCt !== '' ? Number(it.hsCt) : 1);
      set(S.tt, klCol(it), r, kl);
      set(S.tt, 'E', b, serial(it.bpBatDau || it.batDau));
      set(S.tt, 'F', b, serial(it.bpKetThuc || it.ketThuc));
      set(S.tt, 'G', b, serial(it.bpBanGiao || it.banGiao));
      if (it.bpKl !== null && it.bpKl !== undefined && it.bpKl !== '') set(S.tt, 'H', b, Number(it.bpKl) || 0);
      // Ctr.Hm của DA: dòng gốc + 2 dòng giai đoạn
      [[it.ten, 'GĐ Xây thô & Hoàn thiện', true], [`${it.ten} (GĐ Xây thô)`, 'GĐ Xây thô'], [`${it.ten} (GĐ Hoàn thiện)`, 'GĐ Hoàn thiện']]
        .forEach(([name, gd, first]) => {
          if (ctr > L.ctr.last) return;
          if (first) set(S.ctr, 'A', ctr, it.stt != null ? it.stt : i + 1);
          set(S.ctr, 'B', ctr, name);
          set(S.ctr, 'C', ctr, it.loai || null);
          set(S.ctr, 'D', ctr, it.kieu || null);
          set(S.ctr, 'E', ctr, it.tc || null);
          set(S.ctr, 'F', ctr, gd);
          set(S.ctr, 'H', ctr, 'Ban QLXD');
          set(S.ctr, 'I', ctr, it.dv || null);
          ctr++;
        });
      // Hệ số tiến độ (hiển thị) theo từng nhóm
      const td = it.tiendo || {};
      ['xd', 'me', 'ht', 'kho', 'bptc'].forEach(g => {
        const arr = td[g];
        if (!arr) return;
        months.forEach((m, k) => {
          const v = arr[k];
          set(S.hs, colLetter(L.hs.monthCol + k), L.hs[g] + i, v > 0 ? v : null);
        });
      });
    });

    // Hệ số nhân sự theo chức danh
    Object.entries(L.hs.ns).forEach(([role, row]) => {
      const vals = (data.adj && data.adj[role]) || {};
      months.forEach((m, k) => {
        const v = vals[m];
        set(S.hs, colLetter(L.hs.monthCol + k), row, v != null ? Number(v) : 1);
      });
    });

    const ten = data.ten || '';
    set(S.tt, 'B', 1, 'DỰ ÁN ' + ten.toUpperCase());
    set(S.th, L.th.name.replace(/\d+/, ''), Number(L.th.name.replace(/\D+/, '')), ten);
    const dgm = data.dgMonth || months[0];
    set(S.dg, L.dg.title.replace(/\d+/, ''), Number(L.dg.title.replace(/\D+/, '')),
        `BIỂU ĐỒ ĐỊNH BIÊN NĂM ${String(dgm).slice(0, 4)} - ${ten.toUpperCase()}`);
    set(S.dg, L.dg.monthCell.replace(/\d+/, ''), Number(L.dg.monthCell.replace(/\D+/, '')), serial(dgm + '-01'));

    // Ẩn dòng hạng mục thừa, cột tháng thừa
    Object.entries(L.itemFamilies).forEach(([sheet, starts]) => {
      const h = hideRows[sheet] || (hideRows[sheet] = new Set());
      starts.forEach(s => { for (let i = nI; i < N; i++) h.add(s + i); });
    });
    Object.entries(L.monthSheets).forEach(([sheet, c0]) => {
      const h = hideCols[sheet] || (hideCols[sheet] = new Set());
      for (let k = nM; k < NM; k++) h.add(c0 + k);
    });

    const sheets = new Set([...Object.keys(edits), ...Object.keys(hideRows), ...Object.keys(hideCols)]);
    for (const sheet of sheets) {
      const p = sheetPath[sheet];
      if (!p) continue;
      const xml = await zip.file(p).async('string');
      zip.file(p, patchSheet(xml, edits[sheet] || new Map(), hideRows[sheet], hideCols[sheet]));
    }

    // Biểu đồ: dải tháng chỉ tới tháng cuối của dự án; vùng vẽ khít các cột tháng còn hiện
    const lastTh = colLetter(L.th.monthCol + nM - 1);
    const fullTh = colLetter(L.th.monthCol + NM - 1);
    for (const name of Object.keys(zip.files)) {
      if (!/^xl\/charts\/chart\d+\.xml$/.test(name)) continue;
      let x = await zip.file(name).async('string');
      x = x.split(`:$${fullTh}$`).join(`:$${lastTh}$`);
      const isTh = x.includes('3 bộ phận');
      const px = isTh ? L.thMonthPx : L.ttMonthPx;
      const w = (nM * px) / (nM * px + L.axisPx);
      x = x.replace(/(<c:plotArea>[\s\S]*?<c:w val=")[\d.]+(")/, `$1${w.toFixed(4)}$2`);
      zip.file(name, x);
    }
    zip.remove('xl/calcChain.xml');
    return { items: nI, months: nM, truncatedItems: data.items.length > N, truncatedMonths: data.months.length > NM };
  }

  const api = { fill, patchSheet, serial, colLetter, LAYOUT };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.XuatExcel = api;
})(typeof window !== 'undefined' ? window : globalThis);
