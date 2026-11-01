/* Lớp dữ liệu chung: tổ chức, người dùng & quyền, danh mục, dữ liệu dự án, lưu trình duyệt + JSON.
 * Mọi màn hình chỉ đọc/ghi qua Store để các phần (Kế hoạch, Thực tế, Xuất Excel) độc lập với nhau.
 * Phụ thuộc: js/engine.js (window.BDNL), data/seed-danphuong.js (SEED_DP), data/mau-cong-trinh.js (MAU_CT), data/nhom-cn.js (NHOM_CN).
 */
(function () {
  'use strict';
  const E = window.BDNL, KEY = 'bdnl.v1';
  const uid = (p) => p + Math.random().toString(36).slice(2, 9);
  const NHOM_MAC_DINH = ['Cốt thép', 'Cốp pha', 'Bê tông', 'Xây', 'Trát', 'Vệ sinh', 'Sơn bả', 'Thạch cao', 'Nhôm kính', 'Kết cấu thép', 'ME', 'Khác'];
  // Biên bản xác nhận nhân lực BQLXD (BB_kiem_den_Nhan_luc.doc): các dòng in sẵn, tên trên biên bản → nhóm theo dõi
  const BIEN_BAN_DP = { nhom: ['Cốt thép', 'Cốp pha', 'Xây', 'Trát', 'Vệ sinh', 'Sơn bả', 'Khác'], tenTrenBB: { 'Cốt thép': 'Thép' } };
  const NHOM_NT = ['Nhà thầu ngoài – Xây dựng', 'Nhà thầu ngoài – ME', 'Nhà thầu ngoài – Hạ tầng, Công viên', 'Nhà thầu ngoài – Cây xanh', 'Nhà thầu Vin', 'Nhà thầu khác'];
  // Phân loại nhà thầu theo sheet "Cong trinh" file gốc
  const NT_GOC = {
    'Nhà thầu ngoài – Xây dựng': ['Central TT', 'Đăng Sơn', 'Coteccons', 'An Nam', 'Thông Nam', '118 Thăng Long', 'Hoàng Long', 'Sinh Tài', 'Khang Thành', 'Central TTTM', 'SSC', 'Long Giang', 'ADCOM'],
    'Nhà thầu ngoài – ME': ['Central ME', 'Đăng Sơn ME', 'Coteccons Me', 'Thông Nam ME', 'Hoàng Long ME', 'An Nam ME', '118 Thăng Long ME', 'Sinh Tài ME', 'Khang Thành ME', 'Hoàng Minh TDC', 'SNT', 'VIE', 'Thịnh Tín', 'Hà Nội MEP', 'Thịnh Phát Đạt', 'Thái An', 'Nhà thầu nhỏ lẻ ME'],
    'Nhà thầu ngoài – Hạ tầng, Công viên': ['Thiên Sơn', 'Tân Hoàng Minh', 'Đăng Sơn Công viên', 'Vinakids', 'Vivado', 'Golfjohn', 'Giao thông 8', 'Cường Phát', 'Coteccons HTKT2', 'Nhà thầu nhỏ lẻ CV'],
    'Nhà thầu ngoài – Cây xanh': ['Thanh Tâm', 'TAD', 'One (Outfeidd)', 'Hoàng Lam', 'Mộc Lan'],
    'Nhà thầu Vin': ['Vincons XD', 'Vincons Windows', 'Vincons ME', 'SGC (TPC)'],
  };

  /** Dữ liệu rỗng của 1 dự án mới (lịch lễ VN, nhóm biên bản mặc định) */
  function duAnTrong() {
    const nam = new Date().getFullYear();
    return {
      rows: [], lich: E.lichNghiVN(nam - 1, nam + 4), dungLichFileGoc: false, nghiGoc: [], nghiBieuDoGoc: [],
      hs: { da: {}, ct: {}, cn: {}, nt: {} }, lichSuHs: [], thucTe: [],
      caiDat: { hanNop: '11:00', bienBan: JSON.parse(JSON.stringify(BIEN_BAN_DP)) },
    };
  }

  function khoiTao() {
    const S = window.SEED_DP, nhomCn = window.NHOM_CN;
    const mapNhom = {};
    if (nhomCn) nhomCn.loai.forEach((x) => (mapNhom[x.id] = x.nhom_td));
    const ntDung = new Set(S.rows.filter((r) => r.tinh && r.nt).map((r) => r.nt));
    const nhaThau = [];
    for (const g in NT_GOC) NT_GOC[g].forEach((ten) => nhaThau.push({ ten, nhom: g, theoDoiRieng: ntDung.has(ten) }));
    ntDung.forEach((ten) => { if (!nhaThau.some((n) => n.ten === ten)) nhaThau.push({ ten, nhom: 'Nhà thầu khác', theoDoiRieng: false }); });
    const dp = 'da_danphuong';
    return {
      version: 1,
      org: {
        vung: [{ id: 'vung_bac', ten: 'BQL DAMB (Miền Bắc)' }, { id: 'vung_trung', ten: 'BQL DAMT (Miền Trung)' }, { id: 'vung_nam', ten: 'BQL DAMN (Miền Nam)' }],
        duAn: [{ id: dp, vungId: 'vung_bac', bql: 'BQLXD Đan Phượng', ten: 'Vinhomes Wonder City Đan Phượng' }],
      },
      nguoiDung: [
        { id: 'u_admin', ten: 'Quản trị Khối', vaiTro: 'quanTriKhoi' },
        { id: 'u_vung', ten: 'QL Vùng Miền Bắc', vaiTro: 'qlVung', vungId: 'vung_bac' },
        { id: 'u_canbo', ten: 'Cán bộ dự án Đan Phượng', vaiTro: 'canBo', duAnIds: [dp] },
        { id: 'u_gs', ten: 'Giám sát Đan Phượng', vaiTro: 'giamSat', duAnIds: [dp] },
        { id: 'u_nt', ten: 'Nhà thầu Đăng Sơn', vaiTro: 'nhaThau', duAnIds: [dp], nhaThau: 'Đăng Sơn' },
        { id: 'u_xem', ten: 'Người xem', vaiTro: 'xem', duAnIds: [dp] },
      ],
      dangNhap: 'u_admin',
      danhMuc: {
        loaiCn: S.loai_cn.map((t) => ({ ...t, nhomTd: mapNhom[t.id] || 'Khác' })),
        nhomTd: NHOM_MAC_DINH.slice(), // nhóm CN theo dõi thực tế (sửa được, thứ tự = thứ tự hiển thị)
        nhomNt: NHOM_NT.slice(),
        nhaThau,
        dmCn: S.dm_cn, // định mức CN ban hành (chỉ Quản trị Khối sửa)
        dmChuan: (window.MAU_CT && window.MAU_CT.dm_chuan) || {}, // loại CN id → định mức/ngày
      },
      duAn: {
        [dp]: {
          rows: S.rows,
          lich: E.lichNghiVN(2025, 2030),
          dungLichFileGoc: true, // true: tính như file Excel gốc (Tết 11–23/02/2026, tuần nằm trọn mới = 0)
          nghiGoc: S.nghi, nghiBieuDoGoc: S.nghi_bieu_do,
          hs: { da: {}, ct: {}, cn: {}, nt: {} }, // hệ số theo chỉ số tuần
          lichSuHs: [],
          thucTe: [], // {id, ngay, ct, nt, so:{nhomTd: số người}, nguoiNhap, luc, anh?}
          caiDat: { hanNop: '11:00', bienBan: BIEN_BAN_DP },
        },
      },
    };
  }

  const nghe = {};
  const Store = {
    state: null,
    on(ev, fn) { (nghe[ev] = nghe[ev] || []).push(fn); },
    emit(ev, x) { (nghe[ev] || []).forEach((f) => f(x)); },
    load() {
      try { const s = localStorage.getItem(KEY); if (s) this.state = JSON.parse(s); } catch (e) { /* trình duyệt chặn lưu */ }
      if (!this.state) this.state = khoiTao();
      this._cache = {};
      return this.state;
    },
    save() { try { localStorage.setItem(KEY, JSON.stringify(this.state)); } catch (e) { console.warn('Không lưu được', e); } },
    reset() { this.state = khoiTao(); this._cache = {}; this.save(); this.emit('doi'); },
    exportJSON() { return JSON.stringify(this.state); },
    importJSON(txt) { this.state = JSON.parse(txt); this._cache = {}; this.save(); this.emit('doi'); },

    // ---- người dùng & quyền ----
    nguoi() { return this.state.nguoiDung.find((u) => u.id === this.state.dangNhap); },
    dangNhap(id) { this.state.dangNhap = id; this.save(); this.emit('doi'); },
    /** 'sua' | 'nhap' (chỉ nhập thực tế) | 'xem' | null */
    quyen(duAnId) {
      const u = this.nguoi(), da = this.state.org.duAn.find((d) => d.id === duAnId);
      if (!u || !da || u.trangThai === 'cho') return null;
      if (u.vaiTro === 'quanTriKhoi') return 'sua';
      if (u.vaiTro === 'qlVung') return u.vungId === da.vungId ? 'sua' : null;
      const co = (u.duAnIds || []).includes(duAnId);
      if (!co) return (u.duAnXem || []).includes(duAnId) ? 'xem' : null;
      return u.vaiTro === 'canBo' ? 'sua' : u.vaiTro === 'xem' ? 'xem' : 'nhap';
    },
    duAnThay() { return this.state.org.duAn.filter((d) => this.quyen(d.id)); },
    laQuanTri() { const u = this.nguoi(); return !!u && u.vaiTro === 'quanTriKhoi'; },

    // ---- quản trị: dự án ----
    /** {ten, vungId, bql, nguon?, dbId?} → id dự án mới */
    themDuAn(p) {
      const id = p.id || uid('da_');
      this.state.org.duAn.push({ id, vungId: p.vungId, bql: p.bql || '', ten: p.ten, nguon: p.nguon || 'tu_tao', dbId: p.dbId || null });
      this.state.duAn[id] = duAnTrong();
      this.save(); this.emit('doi'); return id;
    },
    suaThongTinDuAn(id, patch) { const d = this.state.org.duAn.find((x) => x.id === id); if (d) Object.assign(d, patch); this.save(); this.emit('doi'); },
    xoaDuAn(id) {
      const S = this.state;
      S.org.duAn = S.org.duAn.filter((x) => x.id !== id); delete S.duAn[id]; delete this._cache[id];
      S.nguoiDung.forEach((u) => { if (u.duAnIds) u.duAnIds = u.duAnIds.filter((x) => x !== id); if (u.duAnXem) u.duAnXem = u.duAnXem.filter((x) => x !== id); });
      this.save(); this.emit('doi');
    },
    /** Gộp danh sách BQLXD từ Định biên: [{vungId, id, ten}] → số dự án thêm mới */
    gopDuAnDinhBien(ds) {
      let them = 0;
      ds.forEach((b) => {
        const dbId = b.vungId + '/' + b.id, co = this.state.org.duAn.find((x) => x.dbId === dbId || (x.vungId === b.vungId && x.bql === b.ten));
        if (co) { co.dbId = dbId; return; }
        const id = 'da_' + b.vungId.replace('vung_', '') + '_' + b.id;
        this.state.org.duAn.push({ id, vungId: b.vungId, bql: b.ten, ten: b.ten, nguon: 'dinhbien', dbId });
        this.state.duAn[id] = duAnTrong(); them++;
      });
      this.save(); this.emit('doi'); return them;
    },

    // ---- quản trị: tài khoản ({id, email, ten, vaiTro, trangThai 'duyet'|'cho', vungId, duAnIds, duAnXem, nhaThau}) ----
    themNguoi(u) {
      const id = u.email ? u.email.toLowerCase() : uid('u_');
      if (this.state.nguoiDung.some((x) => x.id === id)) return null;
      this.state.nguoiDung.push(Object.assign({ id, trangThai: 'duyet', duAnIds: [], duAnXem: [] }, u, { id }));
      this.save(); this.emit('doi'); return id;
    },
    suaNguoi(id, patch) { const u = this.state.nguoiDung.find((x) => x.id === id); if (u) Object.assign(u, patch); this.save(); this.emit('doi'); return u; },
    xoaNguoi(id) {
      const S = this.state; S.nguoiDung = S.nguoiDung.filter((x) => x.id !== id);
      if (S.dangNhap === id) S.dangNhap = (S.nguoiDung.find((x) => x.vaiTro === 'quanTriKhoi') || S.nguoiDung[0] || {}).id;
      this.save(); this.emit('doi');
    },

    // ---- dữ liệu dự án ----
    da(id) { return this.state.duAn[id]; },
    suaDuAn(id, fn) { fn(this.state.duAn[id]); delete this._cache[id]; this.save(); this.emit('doi', id); },
    loaiCnMap() { const m = {}; this.state.danhMuc.loaiCn.forEach((t) => (m[t.id] = t)); return m; },
    nhomNtCua(ten) { const n = this.state.danhMuc.nhaThau.find((x) => x.ten === ten); return n ? n.nhom : 'Nhà thầu khác'; },
    ntHienThi(ten) { const n = this.state.danhMuc.nhaThau.find((x) => x.ten === ten); return n && n.theoDoiRieng ? ten : 'Nhà thầu khác'; },

    /** Kết quả tính (có cache): { data: chuanBi, tuan, lich } */
    tinh(id) {
      if (this._cache[id]) return this._cache[id];
      const d = this.da(id);
      const p = { loai_cn: this.state.danhMuc.loaiCn, rows: d.rows };
      if (d.dungLichFileGoc) p.nghi = d.nghiGoc; else p.lich = d.lich;
      const data = E.chuanBi(p);
      const ngay = data.viec.filter((v) => v.bd != null && v.bd > E.dn('2000-01-01'));
      // dự án mới chưa có tiến độ: lấy 6 tháng từ hôm nay để các màn vẫn vẽ được
      const homNay = E.dn(new Date().toISOString().slice(0, 10));
      const tu = ngay.length ? Math.min(...ngay.map((v) => v.bd)) : homNay, den = ngay.length ? Math.max(...ngay.map((v) => v.kt)) : homNay + 182;
      const tuan = d.tuanTuChon ? E.luoiTuanTuNgay(d.tuanTuChon) : E.luoiTuan(tu, den);
      return (this._cache[id] = { data, tuan });
    },
    /** Biểu đồ: nhom 'nt'|'ct'|'cn'|'nt_cn'|'td' (nhóm CN theo dõi); loc {nt,ct,cn}; coHeSo mặc định true */
    bieuDo(id, nhom, loc, coHeSo = true) {
      const { data, tuan } = this.tinh(id), d = this.da(id);
      const opt = { tuan, nhom: nhom === 'td' ? 'cn' : nhom, loc, hs: coHeSo ? d.hs : null };
      if (d.dungLichFileGoc) opt.nghiBieuDo = d.nghiBieuDoGoc; else opt.lich = d.lich;
      const kq = E.bieuDo(data, opt);
      if (nhom === 'td') { // cộng loại CN chi tiết lên nhóm theo dõi
        const m = this.loaiCnMap(), g = {};
        for (const id2 in kq.nhom) {
          const k = (m[id2] && m[id2].nhomTd) || 'Khác', a = g[k] || (g[k] = new Float64Array(tuan.length));
          kq.nhom[id2].forEach((x, i) => (a[i] += x));
        }
        kq.nhom = g;
      }
      return kq;
    },
    /** Nhóm CN trên biên bản kiểm đếm của dự án (thứ tự in) — các nhóm theo dõi khác dồn vào 'Khác' */
    nhomBB(id) { const b = (this.da(id).caiDat || {}).bienBan; return b ? b.nhom : this.state.danhMuc.nhomTd; },
    tenTrenBB(id, nhom) { const b = (this.da(id).caiDat || {}).bienBan; return (b && b.tenTrenBB && b.tenTrenBB[nhom]) || nhom; },
    /** Quy nhóm theo dõi bất kỳ về nhóm có trên biên bản của dự án */
    veNhomBB(id, nhom) { const ds = this.nhomBB(id); return ds.includes(nhom) ? nhom : 'Khác'; },
    /** Biểu đồ kế hoạch theo nhóm biên bản: {tuan, nhom:{nhómBB: Float64Array}} */
    bieuDoBB(id, loc, coHeSo = true) {
      const kq = this.bieuDo(id, 'td', loc, coHeSo), g = {};
      for (const k in kq.nhom) { const n = this.veNhomBB(id, k), a = g[n] || (g[n] = new Float64Array(kq.tuan.length)); kq.nhom[k].forEach((x, i) => (a[i] += x)); }
      kq.nhom = g;
      return kq;
    },
    /** Ghi hệ số: loai 'da'|'ct'|'cn'|'nt', khoa (bỏ trống với 'da'), các tuần, giá trị, lý do */
    datHeSo(id, loai, khoa, tuanIdx, gt, lyDo) {
      this.suaDuAn(id, (d) => {
        const bang = loai === 'da' ? d.hs.da : (d.hs[loai][khoa] = d.hs[loai][khoa] || {});
        tuanIdx.forEach((i) => { if (gt === 1 || gt == null) delete bang[i]; else bang[i] = gt; });
        d.lichSuHs.push({ luc: new Date().toISOString(), nguoi: this.nguoi().ten, loai, khoa, tuan: tuanIdx, gt, lyDo });
      });
    },
  };
  window.Store = Store;
})();
