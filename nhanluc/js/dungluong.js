/* Cài đặt › Dung lượng — theo dõi lượt đọc/ghi và dung lượng Firebase của BĐNL so với hạn mức gói miễn phí (Spark). */
(function () {
  'use strict';
  const MB = 1024 * 1024;
  let tk = null, daTaiTk = false, dangTai = false, loi = null; // daTaiTk: đã đọc 1 lần (tài liệu có thể chưa tồn tại → tk = null)
  const so = (n) => App.so(n, 0);
  const dl = (b) => (b >= 1024 * MB ? App.so(b / 1024 / MB, 2) + ' GB' : b >= MB ? App.so(b / MB, 1) + ' MB' : App.so(b / 1024, 0) + ' KB');

  if (!document.getElementById('dl-css')) {
    const st = document.createElement('style'); st.id = 'dl-css';
    st.textContent = `
.dl .row{display:grid;grid-template-columns:190px 1fr 190px;gap:10px;align-items:center;padding:8px 0;border-bottom:1px solid var(--line)}
.dl .row:last-child{border-bottom:0}
.dl .thanh{height:12px;border-radius:6px;background:var(--head);overflow:hidden}
.dl .thanh i{display:block;height:100%;background:var(--teal);min-width:2px}
.dl .thanh i.w{background:var(--amb)}.dl .thanh i.e{background:var(--warn)}
.dl .m{color:var(--mut);font-size:12px}
.dl .so{text-align:right;font-variant-numeric:tabular-nums}
.dl pre{background:var(--head);padding:10px;border-radius:8px;overflow:auto;font-size:12px}
.mob .dl .row{grid-template-columns:1fr;gap:4px}.mob .dl .so{text-align:left}`;
    document.head.appendChild(st);
  }

  function thanh(ten, dung, han, fmt, ghiChu) {
    const pt = han ? (dung / han) * 100 : 0, c = pt >= 90 ? 'e' : pt >= 70 ? 'w' : '';
    return `<div class="row"><div><b>${ten}</b>${ghiChu ? `<div class="m">${ghiChu}</div>` : ''}</div>
      <div class="thanh"><i class="${c}" style="width:${Math.min(100, pt).toFixed(2)}%"></i></div>
      <div class="so">${fmt(dung)} / ${fmt(han)} <b>(${App.so(pt, pt < 1 ? 2 : 1)}%)</b></div></div>`;
  }

  async function tai(el, ctx) {
    const D = App.dongBo; if (!D || !D.chay) return;
    dangTai = true; loi = null; ve(el, ctx);
    try { tk = await D.layThongKe(); } catch (e) { loi = e.code === 'permission-denied' ? 'Firebase chưa cho đọc mục bdnl_chung.' : e.message; }
    dangTai = false; daTaiTk = true;
    if (el.isConnected) ve(el, ctx); // đã rời màn thì thôi vẽ
  }

  function ve(el, ctx) {
    const D = App.dongBo, H = D.HAN, hom = new Date().toLocaleDateString('sv');
    const may = D.demMay(), mayHom = may[hom] || { doc: 0, ghi: 0, bDoc: 0, bGhi: 0 };
    const ngay = (tk && tk.ngay) || {}, chung = ngay[hom] || { doc: 0, ghi: 0, bDoc: 0, bGhi: 0 };
    const kich = (tk && tk.kich) || {}, luuTru = Object.values(kich).reduce((s, x) => s + (+x || 0), 0);
    const thang = hom.slice(0, 7), taiThang = Object.keys(ngay).filter((d) => d.startsWith(thang)).reduce((s, d) => s + (ngay[d].bDoc || 0), 0);
    const ds7 = Object.keys(ngay).sort().slice(-7).reverse();
    const chay = D && D.chay;
    el.innerHTML = `<div class="dl">
      <div class="card"><h3>Hạn mức gói miễn phí Firebase (Spark) <small>dự án bqlxd-vh</small></h3>
        <div class="m">Gói miễn phí không tính tiền: vượt hạn mức trong ngày thì Firebase tạm chặn đọc/ghi tới khi hết ngày (khoảng 14–15h giờ VN), không phát sinh phí. Hạn mức dùng chung với Định biên và QLDA, nên cần để dư.</div>
        ${chay ? '' : '<p class="trong">Chưa đăng nhập Google nên phần mềm đang chạy trên máy, không dùng Firebase (0 lượt).</p>'}
      </div>
      ${chay ? `<div class="card"><h3>Hôm nay — toàn bộ người dùng BĐNL <small>${dangTai ? 'đang tải…' : tk ? 'cập nhật mỗi 10 phút/máy' : daTaiTk ? 'chưa có số liệu — máy gửi thống kê sau 10 phút hoặc khi đóng trang' : ''}</small></h3>
        ${loi ? `<p class="warn">${App.ui.esc(loi)}</p>` : ''}
        ${thanh('Lượt đọc', chung.doc, H.doc, so, '50.000 / ngày')}
        ${thanh('Lượt ghi', chung.ghi, H.ghi, so, '20.000 / ngày')}
        ${thanh('Dung lượng lưu trữ', luuTru, H.luuTru, dl, 'Ước tính dữ liệu BĐNL · 1 GB')}
        ${thanh('Tải xuống tháng này', taiThang, H.taiXuong, dl, 'Ước tính · 10 GB / tháng')}
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"><button class="btn2" data-dl="tai">⟳ Tải lại số liệu</button>
          <a class="btn2" href="https://console.firebase.google.com/project/bqlxd-vh/usage" target="_blank" rel="noopener">Xem số chính xác trên Firebase ↗</a></div>
      </div>
      <div class="card"><h3>Máy này</h3>
        ${thanh('Đọc hôm nay', mayHom.doc, H.doc, so)}${thanh('Ghi hôm nay', mayHom.ghi, H.ghi, so)}
        <div class="m">Phiên đang mở: ${so(D.phien.doc)} lượt đọc (${dl(D.phien.bDoc)}), ${so(D.phien.ghi)} lượt ghi (${dl(D.phien.bGhi)}).</div></div>
      ${ds7.length ? `<div class="card"><h3>7 ngày gần nhất</h3><table class="t"><thead><tr><th>Ngày</th><th>Đọc</th><th>Ghi</th><th>Tải xuống</th></tr></thead><tbody>
        ${ds7.map((d) => `<tr><td>${App.ngay(d)}</td><td>${so(ngay[d].doc)}</td><td>${so(ngay[d].ghi)}</td><td>${dl(ngay[d].bDoc || 0)}</td></tr>`).join('')}</tbody></table></div>` : ''}` : ''}
      <div class="card"><h3>Cách phần mềm tiết kiệm</h3><div class="m">
        • Chỉ tải dự án đang mở; đổi dự án mới tải dự án đó.<br>
        • Gom thay đổi 4 giây rồi ghi 1 lần; thực tế mỗi tháng là 1 tài liệu, nhập 1 nhà thầu chỉ ghi phần của nhà thầu đó.<br>
        • Dữ liệu thử (Cài đặt › Dữ liệu thử) không đưa lên Firebase.<br>
        • Ước tính 1 dự án ~0,3 MB; 50 dự án × 2 năm thực tế ≈ 50–100 MB, còn xa hạn mức 1 GB.</div></div>
    </div>`;
    el.onclick = (e) => { if (e.target.closest('[data-dl=tai]') && !dangTai) tai(el, ctx); };
    if (chay && !daTaiTk && !dangTai) tai(el, ctx); // tự đọc đúng 1 lần, sau đó chỉ đọc khi bấm Tải lại
  }

  App.dangKy({ id: 'dung-luong', tab: 'kh', nhom: 'caidat', ten: 'Dung lượng', icon: '📊', thuTu: 2, ve });
})();
