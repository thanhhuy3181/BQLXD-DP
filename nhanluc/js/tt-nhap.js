/* Màn "Nhập nhân lực ngày" (tab THỰC TẾ): nhập theo đúng biên bản "Biên bản xác nhận nhân lực"
 * (1 ngày/biên bản; mỗi nhóm in 2 số: Thực tế và Yêu cầu). Phụ thuộc: Store, App.
 * Ghi dữ liệu chỉ qua Store.suaDuAn, và chỉ khi quyền 'sua' hoặc 'nhap'.
 */
(function () {
  'use strict';
  const KHAC = 'Nhà thầu khác';
  const p2 = (n) => String(n).padStart(2, '0');
  const isoHom = () => { const d = new Date(); return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const gio = (iso) => { if (!iso) return ''; const d = new Date(iso); return p2(d.getHours()) + ':' + p2(d.getMinutes()); };
  const opt = (ds, cur) => ds.map(([v, t]) => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(t)}</option>`).join('');
  // Chỉ số tuần chứa ngày d; -1 nếu ngoài lưới
  const wkIdx = (tuan, d) => {
    let lo = 0, hi = tuan.length - 1, r = -1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (tuan[m].bd <= d) { r = m; lo = m + 1; } else hi = m - 1; }
    return r >= 0 && d < tuan[r].kt ? r : -1;
  };
  // Đưa số liệu (kể cả bản ghi cũ theo nhóm theo dõi) về nhóm biên bản
  const chuan = (S, id, obj) => {
    const o = {};
    for (const k in obj || {}) { const g = S.veNhomBB(id, k); o[g] = (o[g] || 0) + (Number(obj[k]) || 0); }
    return o;
  };
  // Kế hoạch theo nhóm biên bản cho công trình ct, nhà thầu nt (KHAC: phần còn lại sau các nhà thầu theo dõi riêng)
  function planKh(S, id, nt, ct, rieng) {
    const loc = ct ? { ct } : {};
    if (nt !== KHAC) return S.bieuDoBB(id, { ...loc, nt });
    const all = S.bieuDoBB(id, loc), out = { tuan: all.tuan, nhom: {} };
    for (const k in all.nhom) out.nhom[k] = Float64Array.from(all.nhom[k]);
    for (const x of rieng) {
      const p = S.bieuDoBB(id, { ...loc, nt: x });
      for (const k in p.nhom) {
        if (!out.nhom[k]) out.nhom[k] = new Float64Array(all.tuan.length);
        for (let i = 0; i < out.nhom[k].length; i++) out.nhom[k][i] -= p.nhom[k][i];
      }
    }
    return out;
  }
  const CSS = `
.tn-n{max-width:560px;margin:0 auto;padding:4px 0 28px}
.tn-n h2{font-size:20px;margin:6px 0 10px}
.tn-n h3{font-size:15px;margin:20px 0 8px}
.tn-n label{display:block;font-size:14px;margin:10px 0 0;color:var(--mut)}
.tn-n input[type=date],.tn-n select,.tn-n textarea,.tn-n input[type=text]{display:block;width:100%;box-sizing:border-box;min-height:48px;margin-top:4px;padding:8px 10px;font:inherit;font-size:16px;border:1px solid var(--line);border-radius:10px;background:var(--inp);color:var(--ink)}
.tn-tr{margin:12px 0 4px;padding:10px 12px;border-radius:10px;background:var(--head);font-size:14px;color:var(--mut)}
.tn-tr.tn-sua{background:var(--ambbg);color:var(--amb)}
.tn-bb{border:1px solid var(--line);border-radius:10px;overflow:hidden;margin-top:10px;background:var(--card)}
.tn-r{display:grid;grid-template-columns:minmax(96px,1fr) minmax(0,1fr) minmax(0,1fr);gap:8px;align-items:center;padding:8px 10px;border-bottom:1px solid var(--line)}
.tn-r:last-child{border-bottom:0}
.tn-h{background:var(--head);font-size:13px;font-weight:600;color:var(--mut)}
.tn-tot{background:var(--head);font-weight:600}
.tn-ten{font-size:15px}
.tn-r input{width:100%;box-sizing:border-box;height:52px;text-align:center;font-size:20px;font-weight:600;border:1px solid var(--line);border-radius:10px;background:var(--inp);color:var(--ink)}
.tn-r .tn-yc{display:block}
.tn-r small{display:block;text-align:center;color:var(--mut);font-size:12px;margin-top:2px}
.tn-tt{text-align:center;font-size:18px}
.tn-nut{display:flex;gap:10px;margin-top:14px}
.tn-nut button{flex:1;min-height:52px;font-size:16px;border-radius:12px;border:0;cursor:pointer;padding:0 14px}
.tn-b1{background:var(--teal);color:#fff;font-weight:600}
.tn-b2{background:var(--line);color:var(--ink)}
.tn-nut button:disabled{opacity:.5;cursor:not-allowed}
.tn-cam{display:block;width:100%;margin-top:10px;min-height:48px;border:1px dashed #94a3b8;border-radius:12px;background:transparent;color:var(--mut);font:inherit;cursor:not-allowed}
.tn-ds{list-style:none;padding:0;margin:0;border-top:1px solid var(--line)}
.tn-dsi{padding:10px 4px;border-bottom:1px solid var(--line);font-size:14px;cursor:pointer}
.tn-trong{color:var(--mut);cursor:default}
.tn-canh{color:#b45309;font-size:14px}`;
  let F = null, EL = null, CTX = null;

  function css() {
    if (typeof document === 'undefined' || document.getElementById('tn-css')) return;
    const s = document.createElement('style'); s.id = 'tn-css'; s.textContent = CSS; document.head.appendChild(s);
  }
  // Nạp số liệu đã có (ngày, công trình, nhà thầu) vào form; chưa có thì Yêu cầu = KH của ngày đó
  function nap(S, id) {
    const e = (S.da(id).thucTe || []).find((x) => x.ngay === F.ngay && x.ct === F.ct && x.nt === F.nt);
    const nhoms = S.nhomBB(id), rieng = S.state.danhMuc.nhaThau.filter((n) => n.theoDoiRieng).map((n) => n.ten);
    F.eid = e ? e.id : null; F.luc = e ? e.luc : null; F.nguoi = e ? e.nguoiNhap : null;
    F.ghi = e ? e.ghiChu || '' : ''; F.hm = e ? e.hangMuc || '' : '';
    F.so = chuan(S, id, e && e.so); nhoms.forEach((n) => (F.so[n] = F.so[n] || 0));
    // KH của ngày (tham chiếu, hiện bên dưới ô Yêu cầu)
    F.kh = {};
    if (F.ct) {
      const P = planKh(S, id, F.nt, F.ct, rieng), i = wkIdx(P.tuan, window.BDNL.dn(F.ngay));
      nhoms.forEach((n) => { const a = P.nhom[n]; F.kh[n] = i < 0 || !a ? 0 : Math.max(0, Math.round(a[i])); });
    } else nhoms.forEach((n) => (F.kh[n] = 0));
    const yc = e && e.yc ? chuan(S, id, e.yc) : null;
    F.yc = {}; nhoms.forEach((n) => (F.yc[n] = yc ? yc[n] || 0 : F.kh[n]));
  }
  const redraw = () => { if (EL) ve(EL, CTX); };
  function reload() { nap(CTX.Store, CTX.duAnId); redraw(); }

  function ve(el, ctx) {
    EL = el; CTX = ctx; css();
    const S = ctx.Store, id = ctx.duAnId, da = S.da(id), me = S.nguoi() || {};
    const nhoms = S.nhomBB(id).slice();
    const ten = (n) => S.tenTrenBB(id, n);
    const cts = da.rows.filter((r) => r.cap === 3).map((r) => r.ten);
    const restrict = me.vaiTro === 'nhaThau' ? me.nhaThau || '' : null;
    const nts = restrict !== null ? [restrict] : S.state.danhMuc.nhaThau.filter((n) => n.theoDoiRieng).map((n) => n.ten).concat(KHAC);
    const ghi = ctx.quyen === 'sua' || ctx.quyen === 'nhap';
    const dis = ghi ? '' : ' disabled';
    if (!F || F.duAn !== id) F = { duAn: id, ngay: isoHom(), ct: '', nt: '', ghi: '', hm: '', so: null };
    let doi = !F.so;
    if (!cts.includes(F.ct)) { F.ct = cts[0] || ''; doi = true; }
    if (!nts.includes(F.nt)) { F.nt = nts[0] || ''; doi = true; }
    if (doi) nap(S, id);

    const tTT = nhoms.reduce((s, n) => s + (F.so[n] || 0), 0), tYC = nhoms.reduce((s, n) => s + (F.yc[n] || 0), 0);
    const cuaToi = (da.thucTe || []).filter((e) => e.ngay === F.ngay && (restrict !== null ? e.nt === restrict : e.nguoiNhap === me.ten))
      .sort((a, b) => (b.luc || '').localeCompare(a.luc || ''));
    const tongBan = (so) => nhoms.reduce((s, n) => s + ((chuan(S, id, so)[n]) || 0), 0);
    el.innerHTML = `<div class="tn-n">
      <h2>Nhập nhân lực ngày</h2>
      ${ghi ? '' : '<p class="tn-canh">Bạn chỉ có quyền xem màn này.</p>'}
      <label>Ngày<input id="tn-ng" type="date" value="${F.ngay}"${dis}></label>
      <label>Công trình<select id="tn-ct"${dis}>${opt(cts.map((c) => [c, c]), F.ct)}</select></label>
      <label>Nhà thầu<select id="tn-nt"${restrict !== null || !ghi ? ' disabled' : ''}>${opt(nts.map((c) => [c, c]), F.nt)}</select></label>
      <label>Hạng mục<input id="tn-hm" type="text" value="${esc(F.hm)}" placeholder="VD: Tầng 3 – khu E"${dis}></label>
      <div class="tn-tr${F.eid ? ' tn-sua' : ''}">${F.eid ? `Đã có báo cáo lúc ${gio(F.luc)} (${esc(F.nguoi)}) – đang sửa.` : 'Chưa có báo cáo cho công trình và nhà thầu này – nhập mới.'}</div>
      <div class="tn-bb">
        <div class="tn-r tn-h"><span>Nhóm</span><span class="tn-tt">Thực tế</span><span class="tn-tt">Yêu cầu</span></div>
        <div class="tn-r tn-tot"><span class="tn-ten">Tổng (ngày)</span><span class="tn-tt" id="tn-tt-tot">${tTT}</span><span class="tn-tt" id="tn-yc-tot">${tYC}</span></div>
        ${nhoms.map((n) => `<div class="tn-r"><span class="tn-ten">${esc(ten(n))}</span><input class="tn-so" type="number" inputmode="numeric" min="0" step="1" value="${F.so[n] || 0}"${dis} aria-label="Thực tế ${esc(ten(n))}"><span class="tn-yc"><input class="tn-yci" type="number" inputmode="numeric" min="0" step="1" value="${F.yc[n] || 0}"${dis} aria-label="Yêu cầu ${esc(ten(n))}"><small>KH: ${F.kh[n] || 0}</small></span></div>`).join('')}
      </div>
      <label>Ghi chú<textarea id="tn-gc" rows="2"${dis}>${esc(F.ghi)}</textarea></label>
      <div class="tn-nut"><button type="button" id="tn-hq" class="tn-b2"${dis}>Như hôm qua</button><button type="button" id="tn-luu" class="tn-b1"${dis}>Lưu</button></div>
      <button type="button" class="tn-cam" disabled title="Đọc ảnh bằng AI – giai đoạn sau">📷 Chụp biên bản (sắp có)</button>
      <h3>Đã nhập ngày ${App.ngay(F.ngay)}${restrict !== null ? '' : ' (của tôi)'}</h3>
      <ul class="tn-ds">${cuaToi.length ? cuaToi.map((e) => `<li class="tn-dsi" data-ngay="${esc(e.ngay)}" data-ct="${esc(e.ct)}" data-nt="${esc(e.nt)}"><b>${esc(e.ct)}</b> · ${esc(e.nt)}${e.hangMuc ? ' · ' + esc(e.hangMuc) : ''} · <b>${tongBan(e.so)}</b> người${e.yc ? ' / YC ' + tongBan(e.yc) : ''} · ${gio(e.luc)}${e.ghiChu ? ' · <i>' + esc(e.ghiChu) + '</i>' : ''}</li>`).join('') : '<li class="tn-trong">Chưa có báo cáo nào.</li>'}</ul>
    </div>`;

    const q = (s) => el.querySelector(s), qa = (s) => el.querySelectorAll(s);
    qa('.tn-dsi').forEach((li) => li.addEventListener('click', () => { F.ngay = li.dataset.ngay; F.ct = li.dataset.ct; F.nt = li.dataset.nt; reload(); }));
    if (!ghi) return;

    const ng = q('#tn-ng'), ct = q('#tn-ct'), nt = q('#tn-nt'), gc = q('#tn-gc'), hm = q('#tn-hm');
    const capNhatTong = () => {
      q('#tn-tt-tot').textContent = nhoms.reduce((s, n) => s + (F.so[n] || 0), 0);
      q('#tn-yc-tot').textContent = nhoms.reduce((s, n) => s + (F.yc[n] || 0), 0);
    };
    ng.addEventListener('change', () => { if (ng.value) { F.ngay = ng.value; reload(); } });
    ct.addEventListener('change', () => { F.ct = ct.value; reload(); });
    nt.addEventListener('change', () => { F.nt = nt.value; reload(); });
    gc.addEventListener('input', () => { F.ghi = gc.value; });
    hm.addEventListener('input', () => { F.hm = hm.value; });
    const soIn = qa('.tn-so'), ycIn = qa('.tn-yci');
    const bat = (inp, obj, n) => {
      inp.addEventListener('input', () => { obj[n] = Math.max(0, parseInt(inp.value, 10) || 0); capNhatTong(); });
      inp.addEventListener('change', () => { inp.value = obj[n] || 0; });
    };
    nhoms.forEach((n, i) => { bat(soIn[i], F.so, n); bat(ycIn[i], F.yc, n); });

    // Như hôm qua: chép Thực tế, Yêu cầu, hạng mục của lần nhập gần nhất trước ngày này
    q('#tn-hq').addEventListener('click', () => {
      const truoc = (S.da(id).thucTe || []).filter((x) => x.ct === F.ct && x.nt === F.nt && x.ngay < F.ngay)
        .sort((a, b) => b.ngay.localeCompare(a.ngay) || (b.luc || '').localeCompare(a.luc || ''))[0];
      if (!truoc) return App.thongBao('Chưa có báo cáo trước ngày này cho công trình và nhà thầu đã chọn.');
      const so = chuan(S, id, truoc.so), yc = truoc.yc ? chuan(S, id, truoc.yc) : null;
      nhoms.forEach((n) => { F.so[n] = so[n] || 0; F.yc[n] = yc ? yc[n] || 0 : F.kh[n] || 0; });
      F.hm = truoc.hangMuc || F.hm;
      redraw();
    });
    q('#tn-luu').addEventListener('click', () => {
      if (!F.ct || !F.nt) return App.thongBao('Chọn công trình và nhà thầu trước khi lưu.');
      const so = {}, yc = {}, ngay = F.ngay, c = F.ct, t = F.nt, g = F.ghi, h = F.hm;
      nhoms.forEach((n) => { so[n] = F.so[n] || 0; yc[n] = F.yc[n] || 0; });
      S.suaDuAn(id, (d) => {
        d.thucTe = d.thucTe || [];
        let e = d.thucTe.find((x) => x.ngay === ngay && x.ct === c && x.nt === t);
        if (!e) { e = { id: 'tt' + Math.random().toString(36).slice(2, 9), ngay, ct: c, nt: t }; d.thucTe.push(e); }
        Object.assign(e, { so, yc, hangMuc: h, ghiChu: g, nguoiNhap: S.nguoi().ten, luc: new Date().toISOString() });
      });
      nap(S, id);
      App.thongBao('Đã lưu: ' + App.ngay(ngay) + ' · ' + c + ' · ' + t);
      redraw();
    });
  }

  App.dangKy({ id: 'tt-nhap', tab: 'tt', ten: 'Nhập nhân lực ngày', tenNgan: 'Nhập ngày', icon: '✍', thuTu: 1, ve });
})();
