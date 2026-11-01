/* Kế hoạch › Công trình mẫu — wizard 3 bước: chọn mẫu → tham số → xem trước & áp dụng vào dự án. */
(function () {
  'use strict';
  const E = window.BDNL;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const W = { step: 1, mauId: null, ts: {}, boQua: new Set(), ten: '', nt: '', bd: '', kt: '', soTang: null, chart: null };

  if (!document.getElementById('khm-css')) {
    const st = document.createElement('style'); st.id = 'khm-css';
    st.textContent = `
.khm .cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:10px}
.khm .card{border:1px solid var(--line);border-radius:10px;padding:10px;background:var(--card);cursor:pointer}
.khm .card:hover{border-color:var(--teal)}.khm .card.on{border-color:var(--teal);box-shadow:0 0 0 2px rgba(15,118,110,.2)}
.khm .card h4{margin:0 0 4px;font-size:14px}.khm .m{color:var(--mut);font-size:12px}.khm .w{color:#b45309;font-size:12px;margin-top:4px}
.khm .steps{display:flex;gap:8px;margin-bottom:10px}.khm .steps span{padding:3px 10px;border-radius:12px;background:var(--head);color:var(--mut);font-size:12px}
.khm .steps span.on{background:var(--teal);color:#fff}
.khm input,.khm select,.khm button{font:inherit;padding:4px 8px;border:1px solid var(--line);border-radius:6px;background:var(--card);color:var(--ink)}
.khm button{cursor:pointer}.khm button.p{background:var(--teal);color:#fff;border-color:transparent}.khm button:disabled{opacity:.5;cursor:default}
.khm .form{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px;margin-bottom:10px}.khm label{display:flex;flex-direction:column;gap:3px;font-size:12px;color:var(--mut)}
.khm .bar{display:flex;gap:8px;margin:10px 0;align-items:center;flex-wrap:wrap}
.khm .kpi{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px}.khm .kpi div{border:1px solid var(--line);border-radius:8px;padding:6px 14px;background:var(--card)}.khm .kpi b{display:block;font-size:18px}
.khm .g{display:grid;grid-template-columns:260px 1fr;gap:4px 8px;font-size:12px;align-items:center}.khm .gb{position:relative;height:12px;background:rgba(120,130,140,.12);border-radius:3px}.khm .gb i{position:absolute;top:2px;height:8px;border-radius:2px;background:var(--teal)}
.khm .box{max-height:360px;overflow:auto;border:1px solid var(--line);border-radius:8px;margin:10px 0}
.khm table{border-collapse:collapse;font-size:12.5px;width:100%;background:var(--card)}.khm th{position:sticky;top:0;background:var(--head);text-align:left;padding:4px 6px;color:var(--mut)}
.khm td{padding:2px 6px;border-bottom:1px solid var(--line)}.khm td.n{text-align:right}.khm h3{margin:14px 0 6px;font-size:14px}`;
    document.head.appendChild(st);
  }

  const mauHienTai = () => window.MAU_CT.mau.find((m) => m.id === W.mauId);
  const tsTu = (m) => {
    const ts = Object.assign({}, W.ts, { ten: W.ten || m.ten, bd: W.bd, kt: W.kt || undefined, soTang: m.so_tang_goc ? (W.soTang || m.so_tang_goc) : undefined, nt: W.nt || null, boQua: [...W.boQua] });
    return ts;
  };
  const datMau = (m) => {
    W.mauId = m.id; W.ts = {}; m.quy_mo.forEach((q) => (W.ts[q[0]] = q[3])); W.boQua = new Set(); W.ten = m.ten; W.soTang = m.so_tang_goc || null; W.kt = '';
  };

  function ve(el, ctx) {
    const { Store } = ctx, id = ctx.duAnId, sua = ctx.coSua, App = window.App;
    if (W.chart) { try { W.chart.destroy(); } catch (e) { /* bỏ qua */ } W.chart = null; }
    const MC = window.MAU_CT;
    if (!MC) { el.innerHTML = '<p class="trong">Chưa nạp dữ liệu công trình mẫu (MAU_CT).</p>'; return; }
    const m = mauHienTai();
    if (W.step > 1 && !m) W.step = 1;
    const head = `<div class="steps">${['1. Chọn mẫu', '2. Tham số', '3. Xem trước & áp dụng'].map((t, i) => `<span class="${W.step === i + 1 ? 'on' : ''}">${t}</span>`).join('')}</div>`;
    let h = '';

    if (W.step === 1) {
      h = `<div class="cards">${MC.mau.map((x) => `<div class="card${x.id === W.mauId ? ' on' : ''}" data-mau="${esc(x.id)}"><h4>${esc(x.ten)}</h4>
        <div class="m">${esc(x.loai || '')}${x.kieu ? ' · ' + esc(x.kieu) : ''}${x.bangiao ? ' · ' + esc(x.bangiao) : ''} · ${x.ngay_goc} ngày${x.so_tang_goc ? ' · ' + x.so_tang_goc + ' tầng gốc' : ''} · ${x.viec.length} việc</div>
        <div class="m">Nguồn: ${esc(x.nguon || '')}</div>
        ${(x.gia_dinh || []).map((g) => `<div class="w">⚠ ${esc(g)}</div>`).join('')}
        ${x.viec.length ? '' : `<div class="w">Mẫu khung — chưa có dữ liệu đầu việc:<ul style="margin:2px 0 0 16px;padding:0">${(x.khung || []).map((k) => `<li>${esc(k)}</li>`).join('')}</ul></div>`}</div>`).join('')}</div>`;
    } else if (W.step === 2) {
      const opts = [...new Set(m.viec.map((v) => v.tuy_chon).filter(Boolean))];
      const ntList = Store.state.danhMuc.nhaThau.map((n) => `<option value="${esc(n.ten)}">`).join('');
      h = `<h3>${esc(m.ten)}</h3><div class="form">
        <label>Tên công trình<input data-w="ten" value="${esc(W.ten)}"></label>
        <label>Nhà thầu<input data-w="nt" list="khm-nt" value="${esc(W.nt)}"><datalist id="khm-nt">${ntList}</datalist></label>
        ${m.quy_mo.map((q) => `<label>${esc(q[1])} (${esc(q[2])})<input type="number" step="any" data-q="${esc(q[0])}" value="${W.ts[q[0]] == null ? '' : W.ts[q[0]]}"></label>`).join('')}
        ${m.so_tang_goc ? `<label>Số tầng<select data-w="soTang">${[3, 4, 5].map((n) => `<option${n === (W.soTang || m.so_tang_goc) ? ' selected' : ''}>${n}</option>`).join('')}</select></label>` : ''}
        <label>Bắt đầu<input type="date" data-w="bd" value="${esc(W.bd)}"></label>
        <label>Kết thúc<span style="display:flex;gap:6px"><input type="date" data-w="kt" value="${esc(W.kt)}" style="flex:1"><button data-a="goiy" title="Bắt đầu + số ngày gợi ý của mẫu">Gợi ý</button></span></label></div>
        ${opts.length ? `<div><b style="font-size:12px">Hạng mục tùy chọn</b>${opts.map((o) => `<label style="flex-direction:row;align-items:center;gap:6px;color:var(--ink)"><input type="checkbox" data-o="${esc(o)}"${W.boQua.has(o) ? '' : ' checked'}> ${esc(o)}</label>`).join('')}</div>` : ''}
        ${m.viec.length ? '' : '<div class="w">Mẫu này chưa có đầu việc nên chưa thể sinh tiến độ.</div>'}
        <div class="bar"><button data-a="b1">‹ Quay lại</button><button class="p" data-a="b3"${m.viec.length ? '' : ' disabled'}>Xem trước ›</button></div>`;
    } else {
      const ts = tsTu(m); let rows;
      try { rows = E.sinhTuMau(m, ts, MC.dm_chuan); } catch (e) { rows = null; h = `<div class="w">Lỗi sinh tiến độ: ${esc(e.message)}</div>`; }
      if (rows) {
        const leaf = rows.filter((r) => r.tinh), d0 = Math.min(...leaf.map((r) => E.dn(r.bd))), d1 = Math.max(...leaf.map((r) => E.dn(r.kt))), span = Math.max(1, d1 - d0);
        // nhóm
        const gr = []; rows.forEach((r) => { if (r.cap === 6) gr.push({ ten: r.ten, a: Infinity, b: -Infinity }); else if (r.tinh && gr.length) { const g = gr[gr.length - 1]; g.a = Math.min(g.a, E.dn(r.bd)); g.b = Math.max(g.b, E.dn(r.kt)); } });
        // biểu đồ nhân lực
        let kpi = '', gopRows = [];
        try {
          const data = E.chuanBi({ loai_cn: Store.state.danhMuc.loaiCn, rows: leaf.map((r, i) => ({ ...r, r: 'x' + i })), lich: Store.da(id).lich });
          const tuan = E.luoiTuan(d0, d1), bd = E.bieuDo(data, { tuan, nhom: 'ct', lich: Store.da(id).lich });
          gopRows = App.gop(tuan, bd.tong, ctx.kieuTg);
          let cong = 0, dinh = 0; bd.tong.forEach((x, i) => { cong += x * (tuan[i].kt - tuan[i].bd); dinh = Math.max(dinh, x); });
          kpi = `<div class="kpi"><div>Đỉnh nhân lực<b>${App.so(dinh, 0)}</b>người/ngày</div><div>Tổng công<b>${App.so(cong, 0)}</b>công</div><div>Số ngày<b>${d1 - d0}</b>ngày (${App.ngay(E.ds(d0))} – ${App.ngay(E.ds(d1))})</div><div>Số đầu việc<b>${leaf.length}</b></div></div>`;
        } catch (e) { kpi = `<div class="w">Không tính được biểu đồ: ${esc(e.message)}</div>`; }
        h = `<h3>${esc(ts.ten)}</h3>${kpi}
          <div style="height:240px;max-width:900px"><canvas id="khm-cv"></canvas></div>
          <h3>Tiến độ theo nhóm</h3><div class="g">${gr.filter((g) => g.a < Infinity).map((g) => `<div>${esc(g.ten)}</div><div class="gb"><i style="left:${((g.a - d0) / span * 100).toFixed(2)}%;width:${Math.max(0.6, (g.b - g.a) / span * 100).toFixed(2)}%"></i></div>`).join('')}</div>
          <h3>Khối lượng (${leaf.length} việc)</h3><div class="box"><table><thead><tr><th>Việc</th><th>ĐV</th><th>KL</th><th>Bắt đầu</th><th>Kết thúc</th></tr></thead><tbody>${leaf.map((r) => `<tr><td>${esc(r.ten)}</td><td>${esc(r.dv)}</td><td class="n">${App.so(r.kl, 1)}</td><td>${App.ngay(r.bd)}</td><td>${App.ngay(r.kt)}</td></tr>`).join('')}</tbody></table></div>
          <div class="bar"><button data-a="b2">‹ Sửa tham số</button><button class="p" data-a="ap"${sua ? '' : ' disabled title="Bạn không có quyền sửa dự án"'}>Áp dụng vào dự án</button></div>`;
        el.__rows = rows; el.__gop = gopRows;
      }
    }
    el.innerHTML = `<div class="khm">${head}${h}</div>`;

    if (W.step === 3 && el.__gop && window.Chart) {
      const cv = el.querySelector('#khm-cv');
      if (cv) W.chart = new Chart(cv, { type: 'bar', data: { labels: el.__gop.map((x) => x.nhan), datasets: [{ label: 'Người/ngày (TB)', data: el.__gop.map((x) => +x.tb.toFixed(1)), backgroundColor: '#0f766e' }] }, options: { responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { display: false } } } });
    }

    // ---- sự kiện ----
    el.onclick = (e) => {
      const c = e.target.closest('[data-mau]');
      if (c) { const x = MC.mau.find((y) => y.id === c.dataset.mau); if (W.mauId !== x.id) datMau(x); W.step = 2; ve(el, ctx); return; }
      const b = e.target.closest('[data-a]'); if (!b) return;
      const a = b.dataset.a;
      if (a === 'b1') { W.step = 1; ve(el, ctx); }
      else if (a === 'b2') { W.step = 2; ve(el, ctx); }
      else if (a === 'goiy') {
        if (!W.bd) { App.thongBao('Nhập ngày bắt đầu trước.', 'loi'); return; }
        W.kt = E.ds(E.dn(W.bd) + E.ngayGoiY(m, m.so_tang_goc ? (W.soTang || m.so_tang_goc) : undefined)); ve(el, ctx);
      } else if (a === 'b3') {
        if (!W.bd) { App.thongBao('Nhập ngày bắt đầu.', 'loi'); return; }
        if (W.kt && W.kt <= W.bd) { App.thongBao('Ngày kết thúc phải sau ngày bắt đầu.', 'loi'); return; }
        W.step = 3; ve(el, ctx);
      } else if (a === 'ap') {
        if (!sua || !el.__rows) return;
        const rows = el.__rows, ts = tsTu(m), t0 = Date.now();
        const ds = rows.map((r, i) => Object.assign({ r: 'm' + t0 + i, cap: 7, ten: '', nt: null, tinh: false, bd: null, kt: null, can_lk: null, kl_lk: null, can_dl: null, kl_dl: null, kl: null, dv: null, dm: {} }, r));
        const leaf = ds.filter((r) => r.tinh), a0 = leaf.map((r) => r.bd).sort()[0], a1 = leaf.map((r) => r.kt).sort().pop();
        Object.assign(ds[0], { bd: a0, kt: a1, can_lk: ts.can_lk != null ? ts.can_lk : null, can_dl: ts.can_dl != null ? ts.can_dl : null });
        W.step = 1; Store.suaDuAn(id, (d) => { d.rows.push(...ds); });
        App.thongBao(`Đã thêm "${ds[0].ten}" (${leaf.length} đầu việc) vào dự án.`);
      }
    };
    el.oninput = (e) => {
      const t = e.target;
      if (t.dataset.q) W.ts[t.dataset.q] = t.value === '' ? null : parseFloat(t.value);
      else if (t.dataset.w) W[t.dataset.w] = t.dataset.w === 'soTang' ? +t.value : t.value;
    };
    el.onchange = (e) => {
      const t = e.target;
      if (t.dataset.o) { t.checked ? W.boQua.delete(t.dataset.o) : W.boQua.add(t.dataset.o); }
      else if (t.dataset.w) { W[t.dataset.w] = t.dataset.w === 'soTang' ? +t.value : t.value; }
    };
  }

  App.dangKy({ id: 'cong-trinh-mau', tab: 'kh', nhom: 'caidat', ten:'Công trình mẫu', icon: '🏗', thuTu: 5, ve });
})();
