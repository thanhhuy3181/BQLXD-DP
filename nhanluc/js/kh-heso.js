/* Kế hoạch › Hệ số (dự án / công trình / tiến độ loại CN / nhà thầu) */
(function () {
  'use strict';
  const st = { tab: 'da', a: null, b: null, gt: 1.15, ly: '' };
  const TABS = [['da', 'Chung dự án'], ['ct', 'Công trình'], ['cn', 'Tiến độ – loại CN'], ['nt', 'Nhà thầu']];
  const LOAI_T = { da: 'dự án', ct: 'công trình', cn: 'loại CN', nt: 'nhà thầu' };

  function cacHang(ctx, data) {
    const { Store } = ctx, dm = Store.state.danhMuc, map = Store.loaiCnMap();
    if (st.tab === 'da') return [{ key: 'da', ten: 'Toàn dự án', mem: [''] }];
    if (st.tab === 'ct') return [...new Set(data.viec.map((v) => v.ct).filter(Boolean))].map((c) => ({ key: c, ten: c, mem: [c] }));
    if (st.tab === 'cn') {
      const dung = new Set(); data.viec.forEach((v) => Object.keys(v.nc).forEach((k) => dung.add(k)));
      const ids = [...dung].sort((x, y) => (parseInt(x.slice(2)) || 0) - (parseInt(y.slice(2)) || 0));
      const out = [];
      dm.nhomTd.forEach((g) => { const m = ids.filter((id) => ((map[id] || {}).nhomTd || 'Khác') === g); if (m.length) out.push({ key: 'g:' + g, ten: '▣ Nhóm: ' + g + ` (${m.length})`, mem: m, nhom: true }); });
      ids.forEach((id) => out.push({ key: id, ten: (map[id] ? map[id].ten : id), mem: [id] }));
      return out;
    }
    const dung = [...new Set(data.viec.map((v) => v.nt))].sort(), out = [];
    dm.nhomNt.forEach((g) => { const m = dung.filter((n) => Store.nhomNtCua(n) === g); if (m.length) out.push({ key: 'g:' + g, ten: '▣ Nhóm: ' + g + ` (${m.length})`, mem: m, nhom: true }); });
    dung.forEach((n) => out.push({ key: n, ten: n, mem: [n] }));
    return out;
  }

  App.dangKy({
    id: 'heso', tab: 'kh', ten: 'Hệ số', icon: '⚖', thuTu: 7,
    ve(el, ctx) {
      const { Store, E, duAnId } = ctx, U = App.ui, esc = U.esc, kt = ctx.kieuTg, sua = ctx.coSua;
      const { data, tuan } = Store.tinh(duAnId), d = Store.da(duAnId);
      const hang = cacHang(ctx, data);
      // cột
      let cot;
      if (kt === 'tuan') cot = tuan.map((t, i) => ({ nhan: t.nhan, idx: [i] }));
      else { const m = {}; cot = []; const key = (t) => (kt === 'thang' ? `T${t.thang}/${t.nam}` : kt === 'quy' ? `Q${Math.ceil(t.thang / 3)}/${t.nam}` : '' + t.nam); tuan.forEach((t, i) => { const k = key(t); if (!m[k]) { m[k] = { nhan: k, idx: [] }; cot.push(m[k]); } m[k].idx.push(i); }); }
      const ro = kt !== 'tuan' || !sua;
      const bang = (loai, k) => (loai === 'da' ? d.hs.da : (d.hs[loai] || {})[k] || {});
      const hs1 = (loai, k, i) => { const v = bang(loai, k)[i]; return typeof v === 'number' ? v : 1; };
      const giaTri = (h, c) => { // trung bình ô; null nếu các thành viên khác nhau
        let tot = 0, n = 0, lech = false, first = null;
        h.mem.forEach((k) => c.idx.forEach((i) => { const v = hs1(st.tab, k, i); tot += v; n++; if (first == null) first = v; else if (Math.abs(v - first) > 1e-9) lech = true; }));
        return { v: tot / n, lech };
      };

      el.innerHTML = `<div class="pghead"><h2>Hệ số</h2><div class="sp"></div></div>`;
      el.appendChild(U.pills(TABS, st.tab, (v) => { st.tab = v; st.a = st.b = null; App.ve(); }));
      const card = document.createElement('div'); card.className = 'card';
      card.innerHTML = `<h3>Bảng hệ số theo ${LOAI_T[st.tab]}<small>${kt === 'tuan' ? 'Click ô để chọn, Shift+click để chọn vùng' : 'Đang xem trung bình theo ' + { thang: 'tháng', quy: 'quý', nam: 'năm' }[kt] + ' (chỉ đọc) — chỉnh ở chế độ Tuần'}</small></h3>
      ${!sua ? '<p class="warn">Bạn không có quyền sửa hệ số (chỉ xem).</p>' : ''}
      <div class="scroll"><table class="t hsgrid"><thead><tr><th>${LOAI_T[st.tab]}</th>${cot.map((c) => `<th>${esc(c.nhan)}</th>`).join('')}</tr></thead><tbody>${hang.map((h, r) => `<tr><td title="${esc(h.ten)}">${esc(h.ten)}</td>${cot.map((c, ci) => { const g = giaTri(h, c), v = g.v; const cls = ['c']; if (ro) cls.push('ro'); if (Math.abs(v - 1) > 1e-9 || g.lech) cls.push('chg'); if (v < 0.7 - 1e-9 || v > 1.5 + 1e-9) cls.push('out'); return `<td class="${cls.join(' ')}" data-r="${r}" data-c="${ci}">${g.lech ? '≈' + App.so(v, 2) : Math.abs(v - 1) > 1e-9 ? App.so(v, 2) : ''}</td>`; }).join('')}</tr>`).join('')}</tbody></table></div>
      <div class="hsform"><b>Hệ số</b><input class="sel" type="number" step="0.05" min="0" id="hs-gt" value="${st.gt}" ${ro ? 'disabled' : ''}>
      <input class="sel ly" id="hs-ly" placeholder="Lý do (bắt buộc)" value="${esc(st.ly)}" ${ro ? 'disabled' : ''}>
      <button class="btn2 p" id="hs-ap" ${ro ? 'disabled' : ''}>Áp dụng cho ô chọn</button><button class="btn2" id="hs-xoa" ${ro ? 'disabled' : ''}>Xóa (=1)</button>
      <button class="btn2" id="hs-mua" ${ro ? 'disabled' : ''}>Mùa mưa T6–T9 ×1,15</button><button class="btn2" id="hs-tang" ${ro ? 'disabled' : ''}>Tăng tốc ×1,2</button></div>
      <div class="warn" id="hs-w"></div><div id="hs-sel" style="font-size:12px;color:var(--mut)"></div>`;
      el.appendChild(card);

      // chọn ô
      const tbl = card.querySelector('table'), selTxt = card.querySelector('#hs-sel'), cw = card.querySelector('#hs-w');
      const rect = () => { if (!st.a) return null; const b = st.b || st.a; return { r0: Math.min(st.a.r, b.r), r1: Math.max(st.a.r, b.r), c0: Math.min(st.a.c, b.c), c1: Math.max(st.a.c, b.c) }; };
      const toMau = () => {
        const R = rect(); tbl.querySelectorAll('td.c').forEach((td) => { const r = +td.dataset.r, c = +td.dataset.c; td.classList.toggle('sel', !!R && r >= R.r0 && r <= R.r1 && c >= R.c0 && c <= R.c1); });
        selTxt.textContent = R ? `Đã chọn ${R.r1 - R.r0 + 1} hàng × ${R.c1 - R.c0 + 1} cột (${cot[R.c0].nhan} → ${cot[R.c1].nhan})` : 'Chưa chọn ô nào.';
      };
      if (!ro) tbl.onclick = (e) => { const td = e.target.closest('td.c'); if (!td) return; const p = { r: +td.dataset.r, c: +td.dataset.c }; if (e.shiftKey && st.a) st.b = p; else { st.a = p; st.b = null; } toMau(); };
      toMau();
      const wr = () => { const v = parseFloat(card.querySelector('#hs-gt').value); cw.textContent = !isNaN(v) && (v < 0.7 || v > 1.5) ? '⚠ Hệ số ngoài khoảng thường dùng 0,7–1,5 (vẫn cho phép lưu).' : ''; };
      card.querySelector('#hs-gt').oninput = (e) => { st.gt = e.target.value; wr(); }; wr();
      card.querySelector('#hs-ly').oninput = (e) => { st.ly = e.target.value; };

      const ghi = (hangIdx, cotIdx, gt, ly) => {
        if (!ly || !ly.trim()) { App.thongBao('Cần nhập lý do', 'loi'); return false; }
        if (isNaN(gt) || gt < 0) { App.thongBao('Hệ số không hợp lệ', 'loi'); return false; }
        const idxs = [...new Set(cotIdx.flatMap((c) => cot[c].idx))], goc = App.ve;
        App.ve = function () {}; // gộp nhiều lần ghi thành 1 lần vẽ lại
        try { hangIdx.forEach((r) => hang[r].mem.forEach((k) => Store.datHeSo(duAnId, st.tab, st.tab === 'da' ? undefined : k, idxs, gt, ly.trim()))); } finally { App.ve = goc; }
        App.ve(); return true;
      };
      const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
      const lay = () => { const R = rect(); if (!R) { App.thongBao('Hãy chọn ô trước', 'loi'); return null; } return R; };
      card.querySelector('#hs-ap').onclick = () => { const R = lay(); if (R) ghi(range(R.r0, R.r1), range(R.c0, R.c1), parseFloat(st.gt), st.ly); };
      card.querySelector('#hs-xoa').onclick = () => { const R = lay(); if (R) ghi(range(R.r0, R.r1), range(R.c0, R.c1), 1, st.ly || 'Xóa hệ số'); };
      card.querySelector('#hs-tang').onclick = () => { const R = lay(); if (R) ghi(range(R.r0, R.r1), range(R.c0, R.c1), 1.2, st.ly || 'Tăng tốc'); };
      card.querySelector('#hs-mua').onclick = () => {
        const R = lay(); if (!R) return;
        const cs = cot.map((c, i) => i).filter((i) => cot[i].idx.some((w) => tuan[w].thang >= 6 && tuan[w].thang <= 9));
        ghi(range(R.r0, R.r1), cs, 1.15, st.ly || 'Mùa mưa T6–T9');
      };

      // trước / sau
      const a = Store.bieuDo(duAnId, 'nt', null, false).tong, b = Store.bieuDo(duAnId, 'nt', null, true).tong;
      const ta = U.tomTat(tuan, a), tb = U.tomTat(tuan, b);
      const c2 = document.createElement('div'); c2.className = 'card';
      c2.innerHTML = `<h3>Tổng nhân lực trước / sau hệ số</h3><div><span class="chip">Đỉnh ${App.so(ta.dinh, 0)} → ${App.so(tb.dinh, 0)}</span><span class="chip">Tổng công ${App.so(ta.cong, 0)} → ${App.so(tb.cong, 0)}</span></div><div id="hs-ch"></div>`;
      el.appendChild(c2);
      const ga = App.gop(tuan, a, kt), gb = App.gop(tuan, b, kt);
      U.chart(c2.querySelector('#hs-ch'), { type: 'line', data: { labels: ga.map((x) => x.nhan), datasets: [{ label: 'Gốc', data: ga.map((x) => +x.tb.toFixed(1)), borderColor: '#94a3b8', borderDash: [5, 4], pointRadius: 0, tension: .2 }, { label: 'Sau hệ số', data: gb.map((x) => +x.tb.toFixed(1)), borderColor: U.css('--teal'), pointRadius: 0, tension: .2, borderWidth: 2.5 }] }, options: { plugins: { legend: { position: 'bottom' } }, scales: { y: { title: { display: true, text: 'người/ngày' } } } } }, 'sm');

      // lịch sử
      const c3 = document.createElement('div'); c3.className = 'card';
      const ls = (d.lichSuHs || []).slice(-30).reverse();
      c3.innerHTML = '<h3>Lịch sử thay đổi hệ số</h3>' + (ls.length ? '<div class="scroll" style="max-height:260px"><table class="t"><thead><tr><th>Lúc</th><th>Người</th><th>Phạm vi</th><th>Tuần</th><th>Hệ số</th><th>Lý do</th></tr></thead><tbody>' +
        ls.map((h) => { const w = h.tuan || [], n1 = tuan[w[0]], n2 = tuan[w[w.length - 1]]; return `<tr><td>${esc((h.luc || '').replace('T', ' ').slice(0, 16))}</td><td>${esc(h.nguoi)}</td><td>${esc(LOAI_T[h.loai] || h.loai)}${h.khoa ? ': ' + esc(h.khoa) : ''}</td><td>${n1 ? esc(n1.nhan) : ''}${w.length > 1 && n2 ? ' → ' + esc(n2.nhan) : ''}</td><td>${h.gt == null ? 1 : App.so(h.gt, 2)}</td><td style="white-space:normal;text-align:left">${esc(h.lyDo)}</td></tr>`; }).join('') + '</tbody></table></div>' : '<p class="trong">Chưa có thay đổi.</p>');
      el.appendChild(c3);
    },
  });
})();
