/* Bộ tính Biểu đồ nhân lực — dùng chung cho AWD, AWM và kiểm thử (node).
 * Công thức theo docs/CONG-THUC.md và docs/HE-SO.md.
 */
(function (root) {
  'use strict';
  const DAY = 86400000;
  const dn = (s) => (s ? Math.round(Date.parse(s + 'T00:00:00Z') / DAY) : null); // 'yyyy-mm-dd' -> số ngày
  const ds = (n) => new Date(n * DAY).toISOString().slice(0, 10);
  const isNum = (v) => typeof v === 'number' && isFinite(v);

  // Bước 4 — số ngày thi công trừ ngày nghỉ (cột E file gốc)
  function soNgay(bd, kt, nghi) {
    if (bd == null || kt == null) return null;
    let n = kt - bd;
    for (const h of nghi) n -= Math.max(0, Math.min(kt, h.kt) - Math.max(bd, h.bd));
    return n;
  }

  // Bước 3 — khối lượng tổng (cột L). KL nhập tay (r.kl) được ưu tiên; nếu trống thì tính theo căn.
  function klTheoCan(r) {
    const a = isNum(r.can_lk) && isNum(r.kl_lk) ? r.can_lk * r.kl_lk : 0;
    const b = isNum(r.can_dl) && isNum(r.kl_dl) ? r.can_dl * r.kl_dl : 0;
    return a + b;
  }
  function khoiLuong(r) {
    return isNum(r.kl) ? r.kl : klTheoCan(r);
  }

  // Bước 5 — NC/ngày từng loại CN của 1 đầu việc
  function ncViec(r, ngay, loaiDm) {
    const out = {};
    if (!r.tinh) return out;
    const kl = khoiLuong(r);
    const e = ngay ? ngay : 1;
    for (const id in r.dm) {
      const dm = r.dm[id];
      if (!isNum(dm) || dm === 0) continue;
      const loai = loaiDm[id];
      const v = loai === 'đv / công' ? kl / e / dm : loai === 'công / đv' ? (kl / e) * dm : null;
      if (v) out[id] = v;
    }
    return out;
  }

  // Lưới thời gian: mỗi tháng 4 tuần W1=ngày 1, W2=+7, W3=+14, W4=+21 → hết tháng
  function luoiTuan(tu, den) {
    const d0 = new Date(tu * DAY), d1 = new Date(den * DAY);
    let y = d0.getUTCFullYear(), m = d0.getUTCMonth();
    const tuan = [];
    while (y < d1.getUTCFullYear() || (y === d1.getUTCFullYear() && m <= d1.getUTCMonth())) {
      const s = Date.UTC(y, m, 1) / DAY;
      for (let w = 0; w < 4; w++) tuan.push({ bd: s + 7 * w, nam: y, thang: m + 1, w: w + 1 });
      m++; if (m === 12) { m = 0; y++; }
    }
    return hoanTatTuan(tuan);
  }
  function hoanTatTuan(tuan) {
    for (let i = 0; i < tuan.length; i++) {
      tuan[i].kt = i + 1 < tuan.length ? tuan[i + 1].bd : Date.UTC(tuan[i].nam, tuan[i].thang, 1) / DAY; // kt = đầu tuần sau (không tính)
      tuan[i].nhan = `T${tuan[i].thang}/${String(tuan[i].nam).slice(2)} W${tuan[i].w}`;
    }
    return tuan;
  }
  // Lưới tuần theo danh sách ngày bắt đầu tự chọn (VD file gốc dời tuần tháng 2/2026 theo Tết: 1, 10, 17, 23)
  function luoiTuanTuNgay(ds) {
    let prev = null, w = 0;
    const tuan = ds.map((s) => {
      const d = new Date(dn(s) * DAY), key = d.getUTCFullYear() * 12 + d.getUTCMonth();
      w = key === prev ? w + 1 : 1; prev = key;
      return { bd: dn(s), nam: d.getUTCFullYear(), thang: d.getUTCMonth() + 1, w };
    });
    return hoanTatTuan(tuan);
  }

  // ---- Lịch ngày nghỉ Việt Nam (BLLĐ 2019 Đ.112) — ngày âm lịch quy đổi sẵn, Quản trị sửa khi có thông báo chính thức ----
  const MUNG1_TET = { 2025: '2025-01-29', 2026: '2026-02-17', 2027: '2027-02-06', 2028: '2028-01-26', 2029: '2029-02-13', 2030: '2030-02-03' };
  const GIO_TO = { 2025: '2025-04-07', 2026: '2026-04-26', 2027: '2027-04-16', 2028: '2028-04-04', 2029: '2029-04-23', 2030: '2030-04-12' };
  /**
   * Sinh lịch nghỉ: [{ten, bd, kt (bao gồm), kieu:'nghi'|'giam', tyLe, phamVi:'tuan'|'ngay'}]
   * opt: {truocTet:7, tyLeTruoc:0.6, sauTet:10, tyLeSau:0.5}
   */
  function lichNghiVN(tuNam, denNam, opt) {
    const o = Object.assign({ truocTet: 7, tyLeTruoc: 0.6, sauTet: 10, tyLeSau: 0.5 }, opt);
    const L = [], add = (ten, bd, kt, kieu, tyLe) => L.push({ ten, bd: ds(bd), kt: ds(kt), kieu, tyLe: kieu === 'nghi' ? 0 : tyLe, phamVi: 'tuan' });
    for (let y = tuNam; y <= denNam; y++) {
      const d = (m, dd) => Date.UTC(y, m - 1, dd) / DAY;
      add('Tết Dương lịch', d(1, 1), d(1, 1), 'nghi');
      if (MUNG1_TET[y]) {
        const m1 = dn(MUNG1_TET[y]), bd = m1 - 1, kt = m1 + 3; // 5 ngày: 30 Tết → mùng 4
        add('Tết Nguyên đán', bd, kt, 'nghi');
        if (o.truocTet) add('Nghỉ sớm trước Tết', bd - o.truocTet, bd - 1, 'giam', o.tyLeTruoc);
        if (o.sauTet) add('Lên muộn sau Tết', kt + 1, kt + o.sauTet, 'giam', o.tyLeSau);
      }
      if (GIO_TO[y]) add('Giỗ Tổ Hùng Vương', dn(GIO_TO[y]), dn(GIO_TO[y]), 'nghi');
      add('30/4 – 1/5', d(4, 30), d(5, 1), 'nghi');
      add('Quốc khánh', d(9, 1), d(9, 2), 'nghi');
    }
    return L;
  }
  // Hệ số tuần từ lịch: tuần chạm ngày nghỉ (phạm vi 'tuan') = 0; tuần chạm kỳ giảm = × tỷ lệ
  function heSoLich(tuan, lich) {
    const L = (lich || []).map((h) => ({ ...h, bd: dn(h.bd), kt: dn(h.kt) + 1 })); // kt+1: đổi sang mốc không tính
    return tuan.map((t) => {
      let k = 1;
      for (const h of L) {
        const giao = Math.min(t.kt, h.kt) - Math.max(t.bd, h.bd);
        if (giao <= 0) continue;
        const tl = h.kieu === 'nghi' ? 0 : h.tyLe;
        k *= h.phamVi === 'ngay' ? 1 - (1 - tl) * giao / (t.kt - t.bd) : tl;
      }
      return k;
    });
  }

  /** Chuẩn bị dữ liệu dự án: gán công trình cho từng dòng, tính ngày, KL, NC gốc. */
  function chuanBi(p) {
    const loaiDm = {};
    for (const t of p.loai_cn) loaiDm[t.id] = t.loai_dm;
    // Số ngày thi công trừ các ngày nghỉ hẳn. p.lich (mới, kt bao gồm) hoặc p.nghi (file gốc: G − F − giao)
    const nghi = p.lich
      ? p.lich.filter((h) => h.kieu === 'nghi').map((h) => ({ bd: dn(h.bd), kt: dn(h.kt) + 1 }))
      : (p.nghi || []).map((h) => ({ bd: dn(h.bd), kt: dn(h.kt) }));
    let ct = null;
    const viec = [];
    for (const r of p.rows) {
      if (r.cap === 3) ct = r.ten;
      if (!r.tinh) continue;
      const bd = dn(r.bd), kt = dn(r.kt);
      const ngay = soNgay(bd, kt, nghi);
      viec.push({ src: r, ct, nt: r.nt || '(chưa có nhà thầu)', bd, kt, ngay, kl: khoiLuong(r), nc: ncViec(r, ngay, loaiDm) });
    }
    return { viec, loaiDm };
  }

  const K1 = () => 1;
  /** Hệ số: hs = {da:{w:k}, ct:{ten:{w:k}}, cn:{id:{w:k}}, nt:{ten:{w:k}}} — w là chỉ số tuần; thiếu = 1 */
  function heSo(hs) {
    if (!hs) return { da: K1, ct: K1, cn: K1, nt: K1 };
    const g1 = (m) => (w) => (m && isNum(m[w]) ? m[w] : 1);
    const g2 = (m) => (k, w) => (m && m[k] && isNum(m[k][w]) ? m[k][w] : 1);
    return { da: g1(hs.da), ct: g2(hs.ct), cn: g2(hs.cn), nt: g2(hs.nt) };
  }

  /**
   * Tính biểu đồ theo tuần.
   * opt: { tuan, nghiBieuDo:[{bd,kt}], nhom:'nt'|'ct'|'cn'|'nt_cn', loc:{nt,ct,cn}, hs }
   * Trả về { tuan, nhom: {khoá: Float64Array}, tong: Float64Array, goc: Float64Array }
   */
  function bieuDo(data, opt) {
    const tuan = opt.tuan, n = tuan.length;
    const nghi = (opt.nghiBieuDo || []).map((h) => ({ bd: dn(h.bd), kt: dn(h.kt) }));
    const tat = tuan.map((t) => nghi.some((h) => t.bd >= h.bd && t.kt <= h.kt)); // cách file gốc: tuần nằm trọn trong kỳ nghỉ = 0
    const kLich = opt.lich ? heSoLich(tuan, opt.lich) : null; // cách mới: theo lịch nghỉ, tính cả tuần
    const K = heSo(opt.hs), loc = opt.loc || {};
    const nhom = {}, tong = new Float64Array(n), goc = new Float64Array(n);
    for (const v of data.viec) {
      if (v.bd == null || v.kt == null) continue;
      if (loc.nt && v.nt !== loc.nt) continue;
      if (loc.ct && v.ct !== loc.ct) continue;
      for (const id in v.nc) {
        if (loc.cn && id !== loc.cn) continue;
        const x = v.nc[id];
        const key = opt.nhom === 'ct' ? v.ct : opt.nhom === 'cn' ? id : opt.nhom === 'nt_cn' ? v.nt + '\u0001' + id : v.nt;
        const arr = nhom[key] || (nhom[key] = new Float64Array(n));
        for (let i = 0; i < n; i++) {
          const t = tuan[i];
          if (tat[i] || !(v.bd < t.kt && v.kt >= t.bd)) continue; // F < tuần sau và G >= đầu tuần
          const kl = kLich ? kLich[i] : 1;
          const k = kl * K.da(i) * K.ct(v.ct, i) * K.cn(id, i) * K.nt(v.nt, i);
          arr[i] += x * k; tong[i] += x * k; goc[i] += x * kl;
        }
      }
    }
    return { tuan, nhom, tong, goc };
  }

  /** Gộp tuần → tháng / quý / năm: trung bình người/ngày + đỉnh + tổng công */
  function gop(tuan, arr, kieu) {
    if (kieu === 'tuan') return tuan.map((t, i) => ({ nhan: t.nhan, tb: arr[i], dinh: arr[i], cong: arr[i] * (t.kt - t.bd) }));
    const keyOf = (t) => (kieu === 'thang' ? `T${t.thang}/${t.nam}` : kieu === 'quy' ? `Q${Math.ceil(t.thang / 3)}/${t.nam}` : `${t.nam}`);
    const out = [], idx = {};
    tuan.forEach((t, i) => {
      const k = keyOf(t);
      let o = idx[k];
      if (!o) { o = idx[k] = { nhan: k, tong: 0, so: 0, dinh: 0, cong: 0 }; out.push(o); }
      o.tong += arr[i]; o.so++; o.dinh = Math.max(o.dinh, arr[i]); o.cong += arr[i] * (t.kt - t.bd);
    });
    return out.map((o) => ({ nhan: o.nhan, tb: o.tong / o.so, dinh: o.dinh, cong: o.cong }));
  }

  /** Cảnh báo dữ liệu (như cột Q–S file gốc + bổ sung) */
  function canhBao(data) {
    const out = [];
    for (const v of data.viec) {
      const r = v.src, ten = r.ten;
      if (v.bd == null || v.kt == null) out.push({ r: r.r, ten, loi: 'Cần nhập thời gian' });
      else if (v.kt < v.bd) out.push({ r: r.r, ten, loi: 'Kết thúc trước Bắt đầu' });
      else if (v.bd < dn('2000-01-01')) out.push({ r: r.r, ten, loi: 'Ngày bất thường: ' + ds(v.bd) });
      if (!v.kl) out.push({ r: r.r, ten, loi: 'Cần nhập khối lượng' });
      if (!Object.keys(v.nc).length && v.kl) out.push({ r: r.r, ten, loi: 'Cần tạo định mức' });
      if (!r.nt) out.push({ r: r.r, ten, loi: 'Chưa có nhà thầu' });
    }
    return out;
  }

  // ---- Công trình mẫu → dòng tiến độ (docs/MAU-CONG-TRINH.md) ----
  // Đổi số tầng: thêm/bớt khối "BTCT tầng k"; tầng mái dời theo, các việc khác co giãn theo tổng thời gian.
  function doiSoTang(mau, n) {
    const goc = mau.so_tang_goc, viec = mau.viec;
    if (!goc || !n || n === goc) return { viec, ngay: mau.ngay_goc };
    const bdT = (k) => Math.min(...viec.filter((v) => v.tang === k).map((v) => v.bd));
    const buoc = (bdT(goc - 1) - bdT(1)) / (goc - 2); // khoảng lệch giữa 2 tầng liền nhau
    const ngay = Math.round(mau.ngay_goc + (n - goc) * buoc);
    const co = ngay / mau.ngay_goc;
    const doiTen = (s, map) => s.replace(/tầng (\d)/g, (m, d) => 'tầng ' + (map[d] || d));
    const out = [];
    for (const v of viec) {
      if (!v.tang) { out.push({ ...v, bd: Math.round(v.bd * co), kt: Math.round(v.kt * co) }); continue; }
      if (v.tang === goc) { // tầng mái: dời theo số tầng
        const d = Math.round((n - goc) * buoc), map = { [goc]: n };
        out.push({ ...v, tang: n, bd: v.bd + d, kt: v.kt + d, nhom: doiTen(v.nhom, map), ten: doiTen(v.ten, map) });
      } else if (v.tang < Math.min(n, goc)) out.push(v);
    }
    // thêm tầng điển hình (sao từ tầng goc−1) cho các tầng goc..n−1
    const mauTang = viec.filter((v) => v.tang === goc - 1);
    for (let k = goc; k < n; k++) {
      const d = Math.round((k - (goc - 1)) * buoc), map = { [goc - 1]: k, [goc]: k + 1 };
      for (const v of mauTang) out.push({ ...v, tang: k, bd: v.bd + d, kt: v.kt + d, nhom: doiTen(v.nhom, map), ten: doiTen(v.ten, map) });
    }
    out.sort((a, b) => (a.tang || 0) - (b.tang || 0) || a.bd - b.bd);
    return { viec: out, ngay };
  }

  /** Ngày gợi ý (số ngày thi công) theo mẫu + số tầng */
  function ngayGoiY(mau, soTang) { return doiSoTang(mau, soTang).ngay; }

  /**
   * Sinh dòng tiến độ từ mẫu.
   * ts: {ten, bd, kt?, soTang?, nt?, can_lk, can_dl, dt_lk, m2_ham, m2_noi, m2, km, ct, boQua:[nhóm tùy chọn bỏ đi]}
   * dmChuan: {cnId: định mức/ngày}. Trả về mảng rows dùng được cho chuanBi().
   */
  function sinhTuMau(mau, ts, dmChuan) {
    const { viec, ngay } = doiSoTang(mau, ts.soTang);
    const bd = dn(ts.bd), kt = ts.kt ? dn(ts.kt) : bd + ngay, f = (kt - bd) / ngay;
    const hsDt = isNum(ts.dt_lk) ? ts.dt_lk / 240 : 1; // KL theo diện tích căn (trừ việc đếm cái/bộ)
    const rows = [{ cap: 3, ten: ts.ten || mau.ten }];
    let nhom = null;
    for (const v of viec) {
      if (v.tuy_chon && (ts.boQua || []).includes(v.tuy_chon)) continue;
      if (v.nhom !== nhom) { nhom = v.nhom; rows.push({ cap: 6, ten: nhom }); }
      let kl = 0;
      for (const k in v.kl) {
        const sl = k === 'can_lk' ? (ts.can_lk || 0) * (v.dem ? 1 : hsDt) : isNum(ts[k]) ? ts[k] : 0;
        kl += v.kl[k] * sl;
      }
      const dm = {};
      for (const id of v.cn) if (isNum(dmChuan[id])) dm[id] = dmChuan[id];
      rows.push({ cap: 7, tinh: true, ten: v.ten, nt: ts.nt || null, dv: v.dv, kl,
        bd: ds(bd + Math.round(v.bd * f)), kt: ds(bd + Math.round(v.kt * f)), dm, mau: mau.id });
    }
    return rows;
  }

  const api = { doiSoTang, ngayGoiY, sinhTuMau, lichNghiVN, heSoLich, dn, ds, soNgay, klTheoCan, khoiLuong, ncViec, luoiTuan, luoiTuanTuNgay, chuanBi, bieuDo, gop, canhBao, heSo };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BDNL = api;
})(typeof window !== 'undefined' ? window : globalThis);
