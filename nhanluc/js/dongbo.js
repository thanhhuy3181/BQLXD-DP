/* Đồng bộ dữ liệu BĐNL lên Firebase (bqlxd-vh) để mọi người dùng chung + đếm lượt đọc/ghi so với hạn mức gói miễn phí (Spark).
 * Chỉ chạy khi đã đăng nhập Google và được duyệt; chưa đăng nhập thì dữ liệu chỉ trên máy (localStorage) như cũ.
 *
 * Tài liệu Firestore (tiết kiệm lượt đọc/ghi):
 *   bdnl_chung/org        {v: JSON {vung, duAn}}            — danh sách dự án (Quản trị Khối ghi)
 *   bdnl_chung/danhMuc    {v: JSON danhMuc}                 — loại CN, nhóm, nhà thầu, định mức
 *   bdnl_chung/thongke    {ngay: {yyyy-mm-dd: {doc, ghi, bDoc, bGhi}}, kich: {tàiLiệu: byte}} — thống kê dùng
 *   bdnl_duan/{id}        {v, n, t, by}                     — dự án (trừ thực tế); > 800 KB thì tách {id}__p1, __p2…
 *   bdnl_tt/{id}__{yyyy-mm} {duAnId, thang, e: {mãBảnGhi: JSON}} — thực tế theo tháng, ghi gộp (merge) từng bản ghi
 * Chỉ nghe tài liệu của dự án đang mở; thay đổi được gom CHO ms rồi mới ghi.
 */
(function () {
  'use strict';
  const HAN = { doc: 50000, ghi: 20000, xoa: 20000, luuTru: 1024 ** 3, taiXuong: 10 * 1024 ** 3 }; // hạn mức Spark
  const CHO = 4000, PHAN = 800000, DEMO = 'Dữ liệu thử';
  const C = () => window.BDNL_CLOUD;
  const ngayNay = () => new Date().toLocaleDateString('sv'); // yyyy-mm-dd giờ máy
  const kb = (s) => (s ? new Blob([s]).size : 0);

  const D = (App.dongBo = { HAN, chay: false, trangThai: 'tat', loi: null, luc: null, phien: { doc: 0, ghi: 0, bDoc: 0, bGhi: 0 } });
  let ban = {}, banTT = {}, daTai = {}, daTaiTT = {};
  let huy = [], huyDa = [], dangNghe = null, hen = null, apDung = false;
  let choGui = { doc: 0, ghi: 0, bDoc: 0, bGhi: 0 }, kichDoi = {}, henTk = null;

  // ---------------- đếm lượt dùng ----------------
  function dem(loai, n, byte) {
    D.phien[loai] += n; choGui[loai] += n;
    const b = loai === 'doc' ? 'bDoc' : 'bGhi'; D.phien[b] += byte || 0; choGui[b] += byte || 0;
    try { // cộng dồn theo ngày trên máy này
      const k = 'bdnl.dem', m = JSON.parse(localStorage.getItem(k) || '{}'), d = ngayNay(), x = m[d] || (m[d] = { doc: 0, ghi: 0, bDoc: 0, bGhi: 0 });
      x[loai] += n; x[b] += byte || 0;
      Object.keys(m).sort().slice(0, -14).forEach((o) => delete m[o]);
      localStorage.setItem(k, JSON.stringify(m));
    } catch (e) { /* bỏ qua */ }
    if (!henTk) henTk = setTimeout(guiThongKe, 10 * 60 * 1000);
  }
  /** Gửi thống kê dồn (≤ 1 lượt ghi / 10 phút / máy) */
  function guiThongKe() {
    clearTimeout(henTk); henTk = null;
    const c = C(); if (!D.chay || !c) return;
    const g = choGui; if (!g.doc && !g.ghi && !Object.keys(kichDoi).length) return;
    choGui = { doc: 0, ghi: 0, bDoc: 0, bGhi: 0 };
    const ngay = { [ngayNay()]: { doc: c.tang(g.doc), ghi: c.tang(g.ghi + 1), bDoc: c.tang(g.bDoc), bGhi: c.tang(g.bGhi) } };
    const kich = {}; for (const k in kichDoi) kich[k] = kichDoi[k] == null ? c.xoaTruong() : kichDoi[k];
    kichDoi = {};
    c.ghi('bdnl_chung', 'thongke', { ngay, kich }, true).catch(() => { /* thống kê không quan trọng */ });
    D.phien.ghi++;
  }
  D.layThongKe = async () => { const c = C(); if (!c) return null; const x = await c.lay('bdnl_chung', 'thongke'); dem('doc', 1, x ? kb(JSON.stringify(x)) : 0); return x; };
  D.demMay = () => { try { return JSON.parse(localStorage.getItem('bdnl.dem') || '{}'); } catch (e) { return {}; } };
  addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') { if (hen) day(); guiThongKe(); } });

  // ---------------- trạng thái ----------------
  function datTT(tt, loi) {
    D.trangThai = tt; D.loi = loi || null; if (tt === 'xong') D.luc = new Date();
    const el = document.getElementById('db-chip'); if (el) { el.textContent = chip().txt; el.title = chip().tip; el.className = 'db-chip ' + tt; }
  }
  function chip() {
    const g = D.luc ? D.luc.toTimeString().slice(0, 5) : '';
    return ({
      xong: { txt: '☁ Đã lưu ' + g, tip: 'Dữ liệu đã đồng bộ lên Firebase' },
      luu: { txt: '☁ Đang lưu…', tip: 'Đang ghi thay đổi lên Firebase' },
      tai: { txt: '☁ Đang tải…', tip: 'Đang tải dữ liệu từ Firebase' },
      loi: { txt: '⚠ Lỗi đồng bộ', tip: D.loi || '' },
    })[D.trangThai] || { txt: '', tip: '' };
  }
  App.dbHtml = () => (D.chay ? `<span id="db-chip" class="db-chip ${D.trangThai}" title="${App.ui.esc(chip().tip)}">${chip().txt}</span>` : '');
  const baoLoi = (e) => { console.warn('[Đồng bộ]', e); datTT('loi', e.code === 'permission-denied' ? 'Firebase chưa cho phép ghi/đọc mục bdnl_* — cần thêm luật bảo mật (xem Cài đặt › Dung lượng).' : e.message); };

  // ---------------- chuyển đổi dữ liệu ----------------
  const bo = (o) => { const r = {}; for (const k in o) if (o[k] != null) r[k] = o[k]; return r; }; // bỏ trường null cho gọn
  function chuoiDa(d) { const { thucTe, ...x } = d; return JSON.stringify(Object.assign({}, x, { rows: (x.rows || []).map(bo) })); }
  const chuoiOrg = () => JSON.stringify({ vung: Store.state.org.vung, duAn: Store.state.org.duAn });
  const chuoiDm = () => JSON.stringify(Store.state.danhMuc);
  const ttCuaMay = (d) => { const m = {}; (d.thucTe || []).forEach((e) => { if (e.nguoiNhap !== DEMO && e.id && e.ngay) m[e.id] = JSON.stringify(e); }); return m; };

  /** Áp thay đổi từ Firebase vào máy (không đẩy ngược lên) */
  function ap(fn, id) {
    apDung = true;
    try { fn(); if (id) delete Store._cache[id]; else Store._cache = {}; Store.save(); } finally { apDung = false; }
    Store.emit('doi', id);
  }

  // ---------------- quyền ghi ----------------
  const toiGoogle = () => { const u = Store.nguoi(); return u && App.tk && u.id === App.tk.email && u.trangThai !== 'cho'; };
  const ghiOrg = () => toiGoogle() && Store.laQuanTri();
  const ghiDm = () => toiGoogle() && Store.state.org.duAn.some((d) => Store.quyen(d.id) === 'sua');
  const ghiDa = (id) => toiGoogle() && daTai[id] && Store.quyen(id) === 'sua';
  const ghiTT = (id) => toiGoogle() && daTaiTT[id] && ['sua', 'nhap'].includes(Store.quyen(id));

  // ---------------- nghe Firebase ----------------
  function apOrg(x) {
    if (!x) { daTai.org = true; return; }
    dem('doc', 1, kb(x.v)); daTai.org = true;
    if (x.v === ban.org) return; ban.org = x.v;
    const r = JSON.parse(x.v);
    ap(() => {
      const S = Store.state, coRemote = new Set(r.duAn.map((d) => d.id));
      // giữ dự án lấy từ Định biên mà Quản trị chưa đưa lên danh sách chung
      const giu = S.org.duAn.filter((d) => d.nguon === 'dinhbien' && !coRemote.has(d.id));
      S.org.vung = r.vung; S.org.duAn = r.duAn.concat(giu);
      S.org.duAn.forEach((d) => { if (!S.duAn[d.id]) S.duAn[d.id] = Store.duAnTrong(); });
    });
  }
  function apDm(x) {
    daTai.dm = true; if (!x) return;
    dem('doc', 1, kb(x.v));
    if (x.v === ban.dm) return;
    if (hen && ban.dm !== undefined && chuoiDm() !== ban.dm) return; // máy đang có thay đổi chưa gửi → bản máy thắng
    ban.dm = x.v;
    ap(() => { Store.state.danhMuc = JSON.parse(x.v); });
  }
  async function apDa(id, x) {
    if (!x) { daTai[id] = true; henDay(); return; } // Firebase chưa có → máy có quyền sẽ đưa lên
    let v = x.v; dem('doc', 1, kb(v));
    for (let k = 1; k < (x.n || 1); k++) { const p = await C().lay('bdnl_duan', id + '__p' + k); dem('doc', 1, kb(p && p.v)); v += (p && p.v) || ''; }
    daTai[id] = true;
    const kk = 'da:' + id;
    if (v === ban[kk]) return;
    if (hen && ban[kk] !== undefined && Store.state.duAn[id] && chuoiDa(Store.state.duAn[id]) !== ban[kk]) return; // thay đổi chưa gửi trên máy thắng
    ban['da:' + id] = v;
    let r; try { r = JSON.parse(v); } catch (e) { return baoLoi(new Error('Dữ liệu dự án trên Firebase bị thiếu phần, thử tải lại.')); }
    ap(() => { const cu = Store.state.duAn[id] || {}; Store.state.duAn[id] = Object.assign(r, { thucTe: cu.thucTe || [] }); }, id);
  }
  function apTT(id, docs, soDoi) {
    const tong = docs.reduce((s, d) => s + kb(JSON.stringify(d.data.e || {})), 0);
    dem('doc', Math.max(1, soDoi), Math.round(tong * soDoi / Math.max(1, docs.length)));
    const cloud = {}; docs.forEach((d) => Object.assign(cloud, d.data.e || {}));
    const truoc = banTT[id] || {}; banTT[id] = cloud; daTaiTT[id] = true;
    const d = Store.state.duAn[id]; if (!d) return;
    const cu = d.thucTe || [];
    // giữ: bản ghi thử + bản ghi mới trên máy chưa gửi; còn lại theo Firebase
    const giu = cu.filter((e) => e.nguoiNhap === DEMO || (!(e.id in cloud) && !(e.id in truoc)));
    const moi = Object.values(cloud).map((s) => JSON.parse(s)).concat(giu);
    const doi = moi.length !== cu.length || moi.some((e) => { const o = cu.find((x) => x.id === e.id); return !o || JSON.stringify(o) !== JSON.stringify(e); });
    if (doi) ap(() => { Store.state.duAn[id].thucTe = moi; }, id);
    if (giu.some((e) => e.nguoiNhap !== DEMO)) henDay();
  }

  function moDuAn(id) {
    huyDa.forEach((f) => f()); huyDa = []; dangNghe = id;
    if (!id || !D.chay) return;
    const c = C(); datTT('tai');
    huyDa.push(c.nghe('bdnl_duan', id, (x, tuMay) => { if (!tuMay) apDa(id, x).then(() => datTT('xong')); }, baoLoi));
    huyDa.push(c.ngheLoc('bdnl_tt', 'duAnId', id, (docs, n, tuMay) => { if (!tuMay) apTT(id, docs, n); }, baoLoi));
  }

  // ---------------- ghi lên Firebase ----------------
  function henDay() { if (!D.chay) return; clearTimeout(hen); hen = setTimeout(day, CHO); }
  async function ghiDoc(col, id, data, merge, khoaKich, byte) {
    await C().ghi(col, id, data, merge); dem('ghi', 1, byte);
    if (khoaKich) kichDoi[khoaKich] = byte;
  }
  async function day() {
    clearTimeout(hen); hen = null;
    if (!D.chay) return;
    const S = Store.state, c = C(), viec = [], by = App.tk.email, t = Date.now();
    try {
      if (daTai.org && ghiOrg()) { const v = chuoiOrg(); if (v !== ban.org) viec.push(ghiDoc('bdnl_chung', 'org', { v, t, by }, false, 'org', kb(v)).then(() => { ban.org = v; })); }
      if (daTai.dm && ghiDm()) { const v = chuoiDm(); if (v !== ban.dm) viec.push(ghiDoc('bdnl_chung', 'danhMuc', { v, t, by }, false, 'danhMuc', kb(v)).then(() => { ban.dm = v; })); }
      const id = dangNghe, d = id && S.duAn[id];
      if (d && ghiDa(id)) {
        const v = chuoiDa(d), k = 'da:' + id;
        if (v !== ban[k]) {
          const n = Math.ceil(v.length / PHAN) || 1, p = [];
          for (let i = 1; i < n; i++) p.push(ghiDoc('bdnl_duan', id + '__p' + i, { v: v.slice(i * PHAN, (i + 1) * PHAN) }, false, 'duan/' + id + '__p' + i, kb(v.slice(i * PHAN, (i + 1) * PHAN))));
          viec.push(Promise.all(p).then(() => ghiDoc('bdnl_duan', id, { v: v.slice(0, PHAN), n, t, by }, false, 'duan/' + id, kb(v.slice(0, PHAN)))).then(() => { ban[k] = v; }));
        }
      }
      if (d && ghiTT(id)) {
        const may = ttCuaMay(d), cu = banTT[id] || {}, gom = {};
        const vao = (thang, ma, gt) => { const k = id + '__' + thang; (gom[k] = gom[k] || { duAnId: id, thang, e: {} }).e[ma] = gt; };
        for (const ma in may) if (may[ma] !== cu[ma]) {
          const e = JSON.parse(may[ma]); vao(e.ngay.slice(0, 7), ma, may[ma]);
          if (cu[ma]) { const o = JSON.parse(cu[ma]); if (o.ngay.slice(0, 7) !== e.ngay.slice(0, 7)) vao(o.ngay.slice(0, 7), ma, c.xoaTruong()); }
        }
        for (const ma in cu) if (!(ma in may)) vao(JSON.parse(cu[ma]).ngay.slice(0, 7), ma, c.xoaTruong());
        for (const k in gom) {
          const byte = kb(JSON.stringify(gom[k]));
          viec.push(ghiDoc('bdnl_tt', k, gom[k], true, null, byte).then(() => {
            const b = banTT[id] || (banTT[id] = {});
            for (const ma in gom[k].e) { if (typeof gom[k].e[ma] === 'string') b[ma] = gom[k].e[ma]; else if (b[ma] && JSON.parse(b[ma]).ngay.slice(0, 7) === gom[k].thang) delete b[ma]; }
          }));
        }
      }
      if (!viec.length) return datTT('xong');
      datTT('luu');
      await Promise.all(viec);
      datTT('xong');
    } catch (e) { baoLoi(e); }
  }
  D.dayNgay = day;

  // ---------------- bật / tắt ----------------
  /** Gọi sau khi tài khoản Google đã duyệt: tải danh sách chung, rồi nghe dự án đang mở */
  D.batDau = () => new Promise((xong) => {
    const c = C(); if (!c || D.chay) return xong();
    D.chay = true; datTT('tai'); ban = {}; banTT = {}; daTai = {}; daTaiTT = {};
    let cho = 2; const xongMot = {}, mot = (k) => { if (xongMot[k]) return; xongMot[k] = 1; if (--cho === 0) { xong(); henDay(); } };
    huy.push(c.nghe('bdnl_chung', 'org', (x, tuMay) => { if (!tuMay) apOrg(x); mot('org'); }, (e) => { baoLoi(e); mot('org'); }));
    huy.push(c.nghe('bdnl_chung', 'danhMuc', (x, tuMay) => { if (!tuMay) apDm(x); mot('dm'); }, (e) => { baoLoi(e); mot('dm'); }));
    setTimeout(() => { if (cho > 0) { cho = 0; xong(); } }, 8000); // mạng chậm: không chặn giao diện
  }).then(() => { moDuAn(App.trangThai.duAnId); });
  D.dung = () => { if (hen) day(); guiThongKe(); huy.concat(huyDa).forEach((f) => f()); huy = []; huyDa = []; dangNghe = null; D.chay = false; datTT('tat'); };
  D.taiLai = () => { delete daTai[dangNghe]; delete daTaiTT[dangNghe]; delete ban['da:' + dangNghe]; delete banTT[dangNghe]; moDuAn(App.trangThai.duAnId); };

  // ---------------- móc vào Store / App ----------------
  const save0 = Store.save.bind(Store);
  Store.save = function () { save0(); if (D.chay && !apDung) henDay(); };
  const reset0 = Store.reset.bind(Store);
  Store.reset = function () { if (!D.chay) return reset0(); apDung = true; try { reset0(); } finally { apDung = false; } D.taiLai(); };
  const ve0 = App.ve.bind(App);
  App.ve = function () { if (D.chay && App.trangThai.duAnId !== dangNghe) { if (hen) day(); moDuAn(App.trangThai.duAnId); } return ve0(); };
})();
