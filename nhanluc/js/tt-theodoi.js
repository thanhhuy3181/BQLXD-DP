/* Màn "Kế hoạch vs Thực tế" (tab THỰC TẾ) và màn "Tạo dữ liệu thử".
 * Nhóm = nhóm trên biên bản (Store.nhomBB / tenTrenBB / veNhomBB / bieuDoBB). Phụ thuộc: Store, App, BDNL, Chart (global, tùy chọn).
 * Chỉ đọc Store; ghi duy nhất qua Store.suaDuAn.
 */
(function () {
  'use strict';
  const KHAC = 'Nhà thầu khác', TC = '*', DEMO = 'Dữ liệu thử';
  const NGUONG = { xanh: 90, vang: 70 }; // % tỷ lệ đáp ứng
  const CB_NGAY = 3;                     // cảnh báo khi thiếu liên tiếp từng ấy ngày
  const NGAY_MAX_BD = 62;                // ≤ 62 ngày: biểu đồ theo ngày; dài hơn: trung bình theo tuần
  const p2 = (n) => String(n).padStart(2, '0');
  const isoHom = () => { const d = new Date(); return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); };
  const gioNow = () => { const d = new Date(); return p2(d.getHours()) + ':' + p2(d.getMinutes()); };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const gio = (iso) => { if (!iso) return ''; const d = new Date(iso); return p2(d.getHours()) + ':' + p2(d.getMinutes()); };
  const nn = (dnum) => { const s = window.BDNL.ds(dnum); return s.slice(8, 10) + '/' + s.slice(5, 7); };
  // Chỉ số tuần chứa ngày d (tuan sắp theo bd, kt = đầu tuần sau); -1 nếu ngoài lưới
  const wkIdx = (tuan, d) => {
    let lo = 0, hi = tuan.length - 1, r = -1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (tuan[m].bd <= d) { r = m; lo = m + 1; } else hi = m - 1; }
    return r >= 0 && d < tuan[r].kt ? r : -1;
  };
  const cls = (tl) => (tl >= NGUONG.xanh ? 'td-xanh' : tl >= NGUONG.vang ? 'td-vang' : 'td-do');
  const CSS = `
.td-td{max-width:1100px;margin:0 auto;padding-bottom:28px}
.td-td h2{font-size:20px;margin:6px 0 10px}
.td-td h3{font-size:15px;margin:22px 0 8px}
.td-loc{display:flex;flex-wrap:wrap;gap:8px}
.td-loc label{font-size:13px;color:var(--mut);display:flex;flex-direction:column;gap:3px;flex:1 1 150px}
.td-loc select,.td-loc input,.td-han input{min-height:40px;padding:6px 8px;font:inherit;font-size:14px;border:1px solid var(--line);border-radius:8px;background:var(--inp);color:var(--ink)}
.td-cv{position:relative;height:300px;width:100%}
.td-wrap{overflow-x:auto}
.td-bang{width:100%;border-collapse:collapse;font-size:14px}
.td-bang th,.td-bang td{padding:7px 8px;border-bottom:1px solid var(--line);text-align:right;white-space:nowrap}
.td-bang th{cursor:pointer;user-select:none;color:var(--mut)}
.td-bang th:nth-child(-n+2),.td-bang td:nth-child(-n+2){text-align:left}
.td-pill{font-weight:600;border-radius:6px;padding:2px 7px}
.td-xanh{background:var(--tealbg);color:var(--ok)}
.td-vang{background:var(--ambbg);color:var(--amb)}
.td-do{background:var(--warnbg);color:var(--warn)}
.td-cbl{list-style:none;padding:0;margin:0}
.td-cbl li{border-left:4px solid #dc2626;background:var(--warnbg);color:var(--warn);padding:8px 10px;margin:6px 0;border-radius:6px;font-size:14px}
.td-nop{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:8px 0;border-bottom:1px solid var(--line);font-size:14px}
.td-nop .td-ten{flex:1;min-width:160px}
.td-han{font-size:14px;margin-bottom:6px;display:flex;align-items:center;gap:8px}
.td-nut{min-height:44px;padding:0 16px;border-radius:10px;border:0;background:var(--teal);color:#fff;font:inherit;font-size:15px;cursor:pointer}
.td-nut:disabled{opacity:.5;cursor:not-allowed}
.td-nho{color:var(--mut);font-size:13px;margin:6px 0}`;
  let F = null, SX = { k: 'kh', dir: -1 }, EL = null, CTX = null, CH = null;

  function css() {
    if (typeof document === 'undefined' || document.getElementById('td-css')) return;
    const s = document.createElement('style'); s.id = 'td-css'; s.textContent = CSS; document.head.appendChild(s);
  }
  const redraw = () => { if (EL) ve(EL, CTX); };

  // Ngữ cảnh chung của màn: dự án, quyền, nhóm biên bản, nhà thầu / công trình
  function info(ctx) {
    const S = ctx.Store, id = ctx.duAnId, da = S.da(id), me = S.nguoi() || {}, dm = S.state.danhMuc;
    const restrict = me.vaiTro === 'nhaThau' ? me.nhaThau || '' : null;
    const rieng = dm.nhaThau.filter((n) => n.theoDoiRieng).map((n) => n.ten);
    return {
      S, id, da, me, dm, coSua: !!ctx.coSua, restrict, rieng,
      nts: restrict !== null ? [restrict] : rieng.concat(KHAC),
      keyOf: (nt) => (restrict !== null || rieng.includes(nt) ? nt : KHAC), // nhóm nhà thầu theo dõi
      cts: da.rows.filter((r) => r.cap === 3).map((r) => r.ten),
      nhoms: S.nhomBB(id).slice(),
      ten: (g) => S.tenTrenBB(id, g),
      thuc: da.thucTe || [],
    };
  }
  // Đưa số liệu (kể cả bản ghi cũ theo nhóm theo dõi) về nhóm biên bản
  const chuan = (I, obj) => { const o = {}; for (const k in obj || {}) { const g = I.S.veNhomBB(I.id, k); o[g] = (o[g] || 0) + (Number(obj[k]) || 0); } return o; };
  // Bộ lọc: mặc định 30 ngày gần nhất
  function initF(I) {
    if (!F || F.duAn !== I.id) { const h = isoHom(); F = { duAn: I.id, nt: TC, ct: TC, nhom: TC, den: h, tu: window.BDNL.ds(window.BDNL.dn(h) - 29) }; }
    if (I.restrict !== null) F.nt = I.restrict;
    if (F.tu > F.den) { const t = F.tu; F.tu = F.den; F.den = t; }
  }

  // Kế hoạch (người/ngày theo tuần, theo nhóm biên bản) cho nhà thầu nt (TC: tất cả; KHAC: phần còn lại) và công trình ct
  function planCo(I, nt, ct) {
    const loc = ct && ct !== TC ? { ct } : {};
    if (nt !== TC && nt !== KHAC) return I.S.bieuDoBB(I.id, { ...loc, nt });
    const all = I.S.bieuDoBB(I.id, loc);
    if (nt === TC) return all;
    const out = { tuan: all.tuan, tong: Float64Array.from(all.tong), nhom: {} };
    for (const k in all.nhom) out.nhom[k] = Float64Array.from(all.nhom[k]);
    const tru = (a, b) => { for (let i = 0; i < a.length; i++) a[i] -= b[i]; };
    for (const x of I.rieng) {
      const p = I.S.bieuDoBB(I.id, { ...loc, nt: x });
      tru(out.tong, p.tong);
      for (const k in p.nhom) { if (!out.nhom[k]) out.nhom[k] = new Float64Array(out.tong.length); tru(out.nhom[k], p.nhom[k]); }
    }
    return out;
  }

  // Mô hình dữ liệu cho bộ lọc hiện tại: kế hoạch theo nhà thầu, thực tế và yêu cầu theo ngày
  function mo(I) {
    const B = window.BDNL, ngay = [], ct = F.ct, cache = {}, byDay = {};
    for (let d = B.dn(F.tu); d <= B.dn(F.den); d++) ngay.push(d);
    for (const e of I.thuc) {
      if (!e.ngay || (ct !== TC && e.ct !== ct)) continue;
      if (I.restrict !== null && e.nt !== I.restrict) continue;
      const d = B.dn(e.ngay);
      (byDay[d] = byDay[d] || []).push({ k: I.keyOf(e.nt), so: chuan(I, e.so), yc: e.yc ? chuan(I, e.yc) : null });
    }
    const tongSo = (so) => I.nhoms.reduce((s, n) => s + (so[n] || 0), 0);
    const ok = (x, nt) => nt === TC || x.k === nt;
    return {
      B, ngay,
      plan: (nt) => cache[nt] || (cache[nt] = planCo(I, nt, ct)),
      act: (d, nt, nhom) => (byDay[d] || []).reduce((s, x) => (ok(x, nt) ? s + (nhom === TC ? tongSo(x.so) : (x.so[nhom] || 0)) : s), 0),
      coNhap: (d, nt) => (byDay[d] || []).some((x) => ok(x, nt)),
      ycAct: (d, nt, nhom) => (byDay[d] || []).reduce((s, x) => (x.yc && ok(x, nt) ? s + (nhom === TC ? tongSo(x.yc) : (x.yc[nhom] || 0)) : s), 0),
      coYc: (d, nt) => (byDay[d] || []).some((x) => x.yc && ok(x, nt)),
      pDay: (P, nhom, d) => { const i = wkIdx(P.tuan, d); if (i < 0) return 0; const a = nhom === TC ? P.tong : P.nhom[nhom]; return a ? a[i] : 0; },
    };
  }
  const locNhom = (I) => I.nhoms.filter((n) => F.nhom === TC || n === F.nhom);
  const locNt = (I) => I.nts.filter((n) => F.nt === TC || n === F.nt);

  // ---- b) biểu đồ: cột TT, đường KH (liền, bậc), đường Yêu cầu (nét đứt) ----
  function veBieuDo(el, I, M) {
    const box = el.querySelector('.td-cv');
    const Pt = M.plan(F.nt);
    let labels = [], act = [], plan = [], yc = [];
    if (M.ngay.length <= NGAY_MAX_BD) {
      labels = M.ngay.map(nn);
      act = M.ngay.map((d) => M.act(d, F.nt, F.nhom));
      plan = M.ngay.map((d) => M.pDay(Pt, F.nhom, d));
      yc = M.ngay.map((d) => (M.coYc(d, F.nt) ? M.ycAct(d, F.nt, F.nhom) : null));
    } else {
      for (let i = 0; i < M.ngay.length; i += 7) {
        const g = M.ngay.slice(i, i + 7), co = g.filter((d) => M.coNhap(d, F.nt)), cy = g.filter((d) => M.coYc(d, F.nt));
        labels.push(nn(g[0]) + '–' + nn(g[g.length - 1]));
        act.push(co.length ? co.reduce((s, d) => s + M.act(d, F.nt, F.nhom), 0) / co.length : null);
        plan.push(g.reduce((s, d) => s + M.pDay(Pt, F.nhom, d), 0) / g.length);
        yc.push(cy.length ? cy.reduce((s, d) => s + M.ycAct(d, F.nt, F.nhom), 0) / cy.length : null);
      }
    }
    if (CH) { try { CH.destroy(); } catch (e) { /* bỏ qua */ } CH = null; }
    if (typeof Chart === 'undefined') { box.innerHTML = '<p class="td-nho">Chưa tải được Chart.js.</p>'; return; }
    const cv = el.querySelector('#td-canvas');
    CH = new Chart(cv, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { type: 'bar', label: 'Thực tế (người/ngày)', data: act, backgroundColor: 'rgba(15,118,110,.75)', order: 3 },
          { type: 'line', label: 'Kế hoạch (người/ngày)', data: plan, borderColor: '#b45309', backgroundColor: '#b45309', pointRadius: 0, borderWidth: 2, stepped: true, spanGaps: true, order: 1 },
          { type: 'line', label: 'Yêu cầu BQLXD (người/ngày)', data: yc, borderColor: '#1d4ed8', backgroundColor: '#1d4ed8', borderDash: [6, 4], pointRadius: 0, borderWidth: 2, spanGaps: true, order: 2 },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
        scales: { y: { beginAtZero: true, title: { display: true, text: 'Người' } } },
        plugins: { legend: { position: 'bottom' } },
      },
    });
  }

  // ---- c) bảng đáp ứng: KH TB/ngày (cả kỳ), TT TB/ngày (ngày có nhập), Yêu cầu TB (ngày có yêu cầu), TT/KH, TT/YC ----
  function bangRows(I, M) {
    const rows = [], N = M.ngay.length, nhoms = locNhom(I);
    for (const nt of locNt(I)) {
      const P = M.plan(nt);
      for (const nhom of nhoms) {
        let kh = 0, tt = 0, n = 0, yc = 0, ny = 0;
        for (const d of M.ngay) {
          kh += M.pDay(P, nhom, d);
          if (M.coNhap(d, nt)) { n++; tt += M.act(d, nt, nhom); }
          if (M.coYc(d, nt)) { ny++; yc += M.ycAct(d, nt, nhom); }
        }
        const kTb = N ? kh / N : 0, tTb = n ? tt / n : null, yTb = ny ? yc / ny : null;
        if (!kTb && !tt && !yc) continue;
        rows.push({
          nt, nhom, kh: kTb, tt: tTb, yc: yTb,
          tl: kTb > 0 && tTb != null ? (tTb / kTb) * 100 : null,
          tly: yTb > 0 && tTb != null ? (tTb / yTb) * 100 : null,
        });
      }
    }
    const k = SX.k;
    rows.sort((a, b) => {
      const x = a[k], y = b[k];
      if (x == null) return 1;
      if (y == null) return -1;
      return (typeof x === 'string' ? x.localeCompare(y, 'vi') : x - y) * SX.dir;
    });
    return rows;
  }
  function veBang(I, M) {
    const rows = bangRows(I, M);
    if (!rows.length) return '<p class="td-nho">Không có dữ liệu trong kỳ đã chọn.</p>';
    const th = (k, t) => `<th data-k="${k}">${t}${SX.k === k ? (SX.dir > 0 ? ' ▲' : ' ▼') : ''}</th>`;
    const pill = (v) => (v == null ? '—' : `<span class="td-pill ${cls(v)}">${Math.round(v)}%</span>`);
    return `<div class="td-wrap"><table class="td-bang"><thead><tr>${th('nt', 'Nhà thầu')}${th('nhom', 'Nhóm CN')}${th('kh', 'KH (TB)')}${th('tt', 'TT (TB)')}${th('yc', 'Yêu cầu BQLXD (TB)')}${th('tl', 'TT/KH')}${th('tly', 'TT/Yêu cầu')}</tr></thead><tbody>${rows.map((r) => `<tr><td>${esc(r.nt)}</td><td>${esc(I.ten(r.nhom))}</td><td>${App.so(r.kh, 1)}</td><td>${r.tt == null ? '—' : App.so(r.tt, 1)}</td><td>${r.yc == null ? '—' : App.so(r.yc, 1)}</td><td>${pill(r.tl)}</td><td>${pill(r.tly)}</td></tr>`).join('')}</tbody></table></div>
      <p class="td-nho">KH (TB): trung bình mọi ngày trong kỳ theo kế hoạch. TT (TB): trung bình các ngày có nhập. Yêu cầu BQLXD (TB): trung bình các ngày có ghi yêu cầu. TT/KH = TT / KH; TT/Yêu cầu = TT / Yêu cầu. Bấm tiêu đề cột để sắp xếp.</p>`;
  }

  // ---- d) cảnh báo: thiếu < 70% KH liên tiếp, trong 7 ngày tính đến ngày kết thúc bộ lọc ----
  function canhBao(I, M) {
    const out = [], end = M.B.dn(F.den), nhoms = locNhom(I);
    for (const nt of locNt(I)) {
      const P = M.plan(nt);
      for (const nhom of nhoms) {
        let streak = 0, last = null;
        for (let d = end; d > end - 7; d--) {
          if (!M.coNhap(d, nt)) continue;           // chưa nhập: mục "chưa nộp" lo, không tính thiếu
          const kh = M.pDay(P, nhom, d);
          if (kh <= 0) continue;
          const tt = M.act(d, nt, nhom), tl = (tt / kh) * 100;
          if (!last) last = { kh, tt, tl };
          if (tl >= NGUONG.vang) break;
          streak++;
        }
        if (streak >= CB_NGAY) out.push({ nt, nhom, streak, gap: last.kh - last.tt, tl: last.tl });
      }
    }
    return out.sort((a, b) => b.streak - a.streak || b.gap - a.gap);
  }
  function veCb(I, M) {
    const cb = canhBao(I, M);
    if (!cb.length) return `<p class="td-nho">Không có nhà thầu / nhóm nào thiếu liên tiếp ${CB_NGAY} ngày trở lên.</p>`;
    return `<ul class="td-cbl">${cb.map((c) => `<li>${esc(c.nt)} – ${esc(I.ten(c.nhom))} thiếu ${App.so(c.gap, 0)} người (${Math.round(c.tl)}%) – ${c.streak} ngày liên tiếp</li>`).join('')}</ul>`;
  }

  // ---- e) dự báo huy động: KH 4 tuần tới − TT trung bình 7 ngày gần nhất ----
  function duBao(I, M) {
    const B = M.B, t0 = B.dn(isoHom()), rows = [];
    const tuanNgay = [0, 1, 2, 3].map((w) => { const a = []; for (let k = 1; k <= 7; k++) a.push(t0 + 7 * w + k); return a; });
    const ngay7 = []; for (let d = t0 - 6; d <= t0; d++) ngay7.push(d);
    for (const nt of locNt(I)) {
      const P = M.plan(nt);
      for (const nhom of locNhom(I)) {
        const tb = tuanNgay.map((ds) => ds.reduce((s, d) => s + M.pDay(P, nhom, d), 0) / 7);
        const dinh = Math.max(...tb);
        if (dinh <= 0) continue;
        const co = ngay7.filter((d) => M.coNhap(d, nt));
        const tt7 = co.length ? co.reduce((s, d) => s + M.act(d, nt, nhom), 0) / co.length : null;
        rows.push({ nt, nhom, tb, tt7, can: dinh - (tt7 || 0) });
      }
    }
    return { rows: rows.sort((a, b) => b.can - a.can), t0 };
  }
  function veDuBao(I, M) {
    const { rows, t0 } = duBao(I, M);
    if (!rows.length) return '<p class="td-nho">Không có kế hoạch trong 4 tuần tới cho lựa chọn này.</p>';
    const wk = [0, 1, 2, 3].map((w) => nn(t0 + 7 * w + 1) + '–' + nn(t0 + 7 * w + 7));
    return `<div class="td-wrap"><table class="td-bang"><thead><tr><th>Nhà thầu</th><th>Nhóm CN</th>${wk.map((w) => `<th>KH ${w}</th>`).join('')}<th>TT 7 ngày</th><th>Cần thêm</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${esc(r.nt)}</td><td>${esc(I.ten(r.nhom))}</td>${r.tb.map((v) => `<td>${App.so(v, 1)}</td>`).join('')}<td>${r.tt7 == null ? '—' : App.so(r.tt7, 1)}</td><td>${r.can >= 0.5 ? `<span class="td-pill td-do">+${App.so(r.can, 0)}</span>` : '<span class="td-pill td-xanh">đủ</span>'}</td></tr>`).join('')}</tbody></table></div>
      <p class="td-nho">KH tuần: trung bình người/ngày của tuần. Cần thêm = KH tuần cao nhất − TT trung bình 7 ngày gần nhất (có nhập).</p>`;
  }

  // ---- f) tình trạng nộp báo cáo hôm nay ----
  function veNop(I) {
    const today = isoHom(), gio0 = gioNow(), hanNop = (I.da.caiDat && I.da.caiDat.hanNop) || '11:00';
    const hom = I.thuc.filter((e) => e.ngay === today);
    const users = I.S.state.nguoiDung.filter((u) => (u.vaiTro === 'giamSat' || u.vaiTro === 'nhaThau') && (u.duAnIds || []).includes(I.id)
      && (I.restrict === null || (u.vaiTro === 'nhaThau' && u.nhaThau === I.restrict)));
    const dong = users.map((u) => {
      const mine = hom.filter((e) => e.nguoiNhap === u.ten);
      let tt;
      if (mine.length) {
        const cuoi = mine.map((e) => e.luc).filter(Boolean).sort().pop() || '';
        const tre = mine.some((e) => gio(e.luc) > hanNop);
        tt = tre ? `<span class="td-pill td-do">⚠ nộp muộn ${gio(cuoi)}</span>` : `<span class="td-pill td-xanh">✅ đã nộp ${gio(cuoi)}</span>`;
      } else {
        tt = `<span class="td-pill td-vang">⏳ chưa nộp${gio0 > hanNop ? ' (quá hạn)' : ''}</span>`;
      }
      return `<div class="td-nop"><span class="td-ten"><b>${esc(u.ten)}</b> <span class="td-nho">${u.vaiTro === 'nhaThau' ? 'Nhà thầu' : 'Giám sát'}${u.nhaThau ? ' · ' + esc(u.nhaThau) : ''}</span></span>${tt}${mine.length ? '' : `<button type="button" class="td-nut td-nhac" data-ten="${esc(u.ten)}">Nhắc</button>`}</div>`;
    }).join('');
    return `<label class="td-han">Hạn nộp báo cáo <input id="td-han" type="time" value="${esc(hanNop)}"${I.coSua ? '' : ' disabled'}></label>`
      + (dong || '<p class="td-nho">Chưa có giám sát / nhà thầu nào được phân công cho dự án này.</p>');
  }

  function ve(el, ctx) {
    EL = el; CTX = ctx; css();
    const I = info(ctx);
    initF(I);
    const M = mo(I);
    const sel = (id, ops, cur, dis) => `<select id="${id}"${dis ? ' disabled' : ''}>${ops.map(([v, t]) => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
    el.innerHTML = `<div class="td-td">
      <h2>Kế hoạch vs Thực tế</h2>
      <div class="td-loc">
        <label>Nhà thầu${sel('td-f-nt', [[TC, 'Tất cả nhà thầu']].concat(I.nts.map((n) => [n, n])), F.nt, I.restrict !== null)}</label>
        <label>Công trình${sel('td-f-ct', [[TC, 'Tất cả công trình']].concat(I.cts.map((n) => [n, n])), F.ct, false)}</label>
        <label>Nhóm CN${sel('td-f-nhom', [[TC, 'Tất cả nhóm']].concat(I.nhoms.map((n) => [n, I.ten(n)])), F.nhom, false)}</label>
        <label>Từ ngày<input id="td-f-tu" type="date" value="${F.tu}"></label>
        <label>Đến ngày<input id="td-f-den" type="date" value="${F.den}"></label>
      </div>
      <h3>Biểu đồ ${M.ngay.length <= NGAY_MAX_BD ? 'theo ngày' : 'trung bình theo tuần (7 ngày)'}</h3>
      <div class="td-cv"><canvas id="td-canvas"></canvas></div>
      <h3>Tỷ lệ đáp ứng</h3>
      <div>${veBang(I, M)}</div>
      <h3>Cảnh báo (7 ngày tính đến ${nn(M.B.dn(F.den))})</h3>
      <div>${veCb(I, M)}</div>
      <h3>Dự báo huy động (4 tuần tới)</h3>
      <div>${veDuBao(I, M)}</div>
      <h3>Tình trạng nộp báo cáo hôm nay</h3>
      <div>${veNop(I)}</div>
    </div>`;

    const q = (s) => el.querySelector(s), qa = (s) => el.querySelectorAll(s);
    veBieuDo(el, I, M);
    const onCh = (s, fn) => { const x = q(s); if (x) x.addEventListener('change', () => { fn(x.value); redraw(); }); };
    onCh('#td-f-nt', (v) => (F.nt = v));
    onCh('#td-f-ct', (v) => (F.ct = v));
    onCh('#td-f-nhom', (v) => (F.nhom = v));
    onCh('#td-f-tu', (v) => { if (v) F.tu = v; });
    onCh('#td-f-den', (v) => { if (v) F.den = v; });
    qa('th[data-k]').forEach((th) => th.addEventListener('click', () => {
      const k = th.dataset.k;
      SX = { k, dir: SX.k === k ? -SX.dir : (k === 'nt' || k === 'nhom' ? 1 : -1) };
      redraw();
    }));
    const han = q('#td-han');
    if (han) han.addEventListener('change', () => {
      if (!han.value) return;
      I.S.suaDuAn(I.id, (d) => { d.caiDat = d.caiDat || {}; d.caiDat.hanNop = han.value; });
      redraw();
    });
    qa('.td-nhac').forEach((b) => b.addEventListener('click', () => App.thongBao('Nhắc ' + b.dataset.ten + ': chức năng gửi thông báo sẽ có ở giai đoạn sau.')));
  }

  // ---- màn "Tạo dữ liệu thử": thực tế = kế hoạch × ngẫu nhiên 0,6–1,1; Yêu cầu = kế hoạch × 0,9–1,1 ----
  function taoMau(ctx) {
    const I = info(ctx), B = window.BDNL, t0 = B.dn(isoHom());
    if (!I.coSua) return;
    // Cửa sổ 30 ngày quanh tuần đỉnh nhân lực (≤ hôm nay) — nhiều nhà thầu, nhiều nhóm CN để xem thử
    const P0 = I.S.bieuDoBB(I.id, {});
    let w = -1;
    for (let i = 0; i < P0.tuan.length; i++) if (P0.tuan[i].bd <= t0 && P0.tong[i] > 0 && (w < 0 || P0.tong[i] > P0.tong[w])) w = i;
    if (w < 0) return App.thongBao('Kế hoạch chưa có ngày thi công nên không tạo được dữ liệu thử.');
    const cuoi = Math.min(t0, P0.tuan[w].kt - 1 + 14), dau = cuoi - 29;
    if (typeof confirm === 'function' && !confirm('Tạo dữ liệu thử từ ' + B.ds(dau) + ' đến ' + B.ds(cuoi) + '? Dữ liệu thử cũ sẽ bị thay; dữ liệu thật không bị ghi đè.')) return;
    const moi = [];
    for (const ct of I.cts) for (const nt of I.rieng) {
      const P = I.S.bieuDoBB(I.id, { ct, nt });
      if (!P.tong.some((x) => x > 0)) continue;
      for (let d = dau; d <= cuoi; d++) {
        const i = wkIdx(P.tuan, d);
        if (i < 0) continue;
        const so = {}, yc = {}; let tong = 0;
        I.nhoms.forEach((n) => {
          const a = P.nhom[n], kh = a ? a[i] : 0;
          so[n] = Math.round(kh * (0.6 + Math.random() * 0.5));
          yc[n] = Math.round(kh * (0.9 + Math.random() * 0.2));
          tong += so[n];
        });
        if (tong > 0) moi.push({ ngay: B.ds(d), ct, nt, so, yc });
      }
    }
    I.S.suaDuAn(I.id, (d) => {
      d.thucTe = (d.thucTe || []).filter((e) => e.nguoiNhap !== DEMO);
      const khoa = new Set(d.thucTe.map((e) => e.ngay + '|' + e.ct + '|' + e.nt));
      for (const m of moi) {
        const k = m.ngay + '|' + m.ct + '|' + m.nt;
        if (khoa.has(k)) continue; // không chèn đè báo cáo thật
        khoa.add(k);
        d.thucTe.push({ id: 'tt' + Math.random().toString(36).slice(2, 9), ngay: m.ngay, ct: m.ct, nt: m.nt, so: m.so, yc: m.yc, hangMuc: '', nguoiNhap: DEMO, luc: new Date(m.ngay + 'T08:00:00').toISOString(), ghiChu: '' });
      }
    });
    App.thongBao('Đã tạo ' + moi.length + ' dòng dữ liệu thử từ ' + B.ds(dau) + ' đến ' + B.ds(cuoi) + '. Chọn đúng khoảng ngày này ở màn Kế hoạch vs Thực tế để xem.');
  }
  function veMau(el, ctx) {
    css();
    const I = info(ctx);
    el.innerHTML = `<div class="td-td"><h2>Tạo dữ liệu thử</h2>${I.coSua
      ? `<p>Sinh số người thực tế (kế hoạch × 0,6–1,1) và yêu cầu (kế hoạch × 0,9–1,1) cho 30 ngày có kế hoạch gần nhất, theo các nhà thầu theo dõi riêng. Chỉ để xem thử màn hình. Chạy lại sẽ thay dữ liệu thử cũ.</p><button type="button" id="td-sinh" class="td-nut">Tạo dữ liệu thử</button>`
      : '<p class="td-nho">Chỉ Quản trị Khối hoặc Cán bộ dự án mới tạo được dữ liệu thử.</p>'}</div>`;
    const b = el.querySelector('#td-sinh');
    if (b) b.addEventListener('click', () => taoMau(ctx));
  }

  App.dangKy({ id: 'tt-theodoi', tab: 'tt', ten: 'Kế hoạch vs Thực tế', tenNgan: 'KH vs TT', icon: '📉', thuTu: 2, ve });
  App.dangKy({ id: 'tt-mau', tab: 'tt', nhom: 'caidat', ten: 'Dữ liệu thử', icon: '🧪', thuTu: 9, ve: veMau });
})();
