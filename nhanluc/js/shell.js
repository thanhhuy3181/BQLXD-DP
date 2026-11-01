/* Khung ứng dụng: thanh trên, cây tổ chức, menu, vùng chính; tiện ích giao diện dùng chung (App.ui). Nạp CUỐI CÙNG. */
(function () {
  'use strict';
  const E = window.BDNL;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const mq = window.matchMedia('(max-width:759px)');
  const KG = [['tuan', 'Tuần'], ['thang', 'Tháng'], ['quy', 'Quý'], ['nam', 'Năm']];

  // ---------------- tiện ích dùng chung ----------------
  const ui = (App.ui = {
    esc, charts: [],
    huyChart() { ui.charts.forEach((c) => { try { c.destroy(); } catch (e) { /* bỏ qua */ } }); ui.charts = []; },
    css(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); },
    /** Phần tử từ HTML */
    el(html) { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstChild; },
    /** Thanh chọn phân đoạn: opts [[giaTri, nhan]] */
    seg(opts, val, fn) {
      const d = document.createElement('div'); d.className = 'seg';
      opts.forEach(([v, n]) => { const b = document.createElement('button'); b.textContent = n; if (v === val) b.className = 'on'; b.onclick = () => fn(v); d.appendChild(b); });
      return d;
    },
    pills(opts, val, fn) {
      const d = document.createElement('div'); d.className = 'pills';
      opts.forEach(([v, n]) => { const b = document.createElement('button'); b.textContent = n; if (v === val) b.className = 'on'; b.onclick = () => fn(v); d.appendChild(b); });
      return d;
    },
    /** Vẽ Chart.js vào host (tạo canvas) */
    chart(host, cfg, cao) {
      host.innerHTML = '';
      if (!window.Chart) { host.innerHTML = '<p class="trong">Không tải được Chart.js (cần mạng).</p>'; return null; }
      const box = document.createElement('div'); box.className = 'chartbox' + (cao ? ' ' + cao : '');
      const cv = document.createElement('canvas'); box.appendChild(cv); host.appendChild(box);
      const tx = ui.css('--mut'), gr = ui.css('--grid') || 'rgba(100,116,139,.18)';
      Chart.defaults.color = tx; Chart.defaults.font.family = 'system-ui,"Segoe UI",sans-serif';
      cfg.options = Object.assign({ responsive: true, maintainAspectRatio: false, animation: false, interaction: { mode: 'index', intersect: false } }, cfg.options);
      const o = cfg.options; o.scales = o.scales || {};
      for (const k of ['x', 'y']) o.scales[k] = Object.assign({ grid: { color: k === 'y' ? gr : 'transparent' } }, o.scales[k]);
      const c = new Chart(cv, cfg); ui.charts.push(c); return c;
    },
    /** series: [{ten, arr(tuần)}] → gộp theo kỳ → {labels, ds:[{ten, v:[tb mỗi kỳ], dinh, cong}]}; sắp theo tổng công giảm dần (giữ cuối các khoá trong `cuoi`) */
    chuoi(tuan, series, kieu, cuoi) {
      let labels = [];
      const ds = series.map((s) => {
        const g = App.gop(tuan, s.arr, kieu); labels = g.map((x) => x.nhan);
        let dinh = 0; for (let i = 0; i < s.arr.length; i++) if (s.arr[i] > dinh) dinh = s.arr[i];
        return { ten: s.ten, v: g.map((x) => x.tb), dinh, cong: g.reduce((a, x) => a + x.cong, 0), bq: g.reduce((a, x) => a + x.tb, 0) / (g.length || 1) };
      });
      ds.sort((a, b) => ((cuoi || []).includes(a.ten) - (cuoi || []).includes(b.ten)) || b.cong - a.cong);
      return { labels, ds };
    },
    /** Cột chồng */
    stack(host, ch, cao, don) {
      const ds = ch.ds.map((s, i) => ({ label: s.ten, data: s.v.map((x) => +x.toFixed(2)), backgroundColor: s.ten === 'Nhà thầu khác' ? '#94a3b8' : App.mau(i), borderWidth: 0 }));
      return ui.chart(host, { type: 'bar', data: { labels: ch.labels, datasets: ds }, options: { scales: { x: { stacked: true }, y: { stacked: true, title: { display: true, text: don || 'người/ngày' } } }, plugins: { legend: { position: 'bottom', labels: { boxWidth: 10 } }, tooltip: { itemSort: (a, b) => b.raw - a.raw } } } }, cao);
    },
    /** Nhà thầu theo kiểu hiển thị: gộp theo ntHienThi. loc {cn|ct}, coHeSo; cnSet: Set loại CN (lọc nhóm td) */
    nhaThau(id, coHeSo, loc, cnSet) {
      let nhom;
      if (cnSet) {
        const kq = Store.bieuDo(id, 'nt_cn', loc && loc.ct ? { ct: loc.ct } : null, coHeSo); nhom = {};
        for (const k in kq.nhom) { const [nt, cn] = k.split('\u0001'); if (!cnSet.has(cn)) continue; const a = nhom[nt] || (nhom[nt] = new Float64Array(kq.tuan.length)); kq.nhom[k].forEach((x, i) => (a[i] += x)); }
        return ui.gomNt(kq.tuan, nhom);
      }
      const kq = Store.bieuDo(id, 'nt', loc, coHeSo);
      return ui.gomNt(kq.tuan, kq.nhom, kq);
    },
    gomNt(tuan, nhom, kq) {
      const g = {};
      for (const nt in nhom) { const k = Store.ntHienThi(nt), a = g[k] || (g[k] = new Float64Array(tuan.length)); nhom[nt].forEach((x, i) => (a[i] += x)); }
      return { tuan, series: Object.keys(g).map((ten) => ({ ten, arr: g[ten] })), tong: kq && kq.tong, goc: kq && kq.goc };
    },
    spark(arr, w, h) {
      w = w || 120; h = h || 32; let mx = 0; arr.forEach((x) => { if (x > mx) mx = x; });
      if (!mx) return `<svg viewBox="0 0 ${w} ${h}"></svg>`;
      const n = arr.length, p = Array.from(arr, (x, i) => `${(i / Math.max(1, n - 1) * w).toFixed(1)},${(h - 2 - (x / mx) * (h - 4)).toFixed(1)}`).join(' ');
      return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><polyline points="${p}" fill="none" stroke="${ui.css('--teal')}" stroke-width="1.6"/></svg>`;
    },
    /** Màu nhiệt cho ô ma trận (0..1) */
    nhiet(x, mx) { if (!x || !mx) return ''; const a = Math.min(1, x / mx); return `background:rgba(14,154,167,${(0.08 + a * 0.55).toFixed(2)})`; },
    /** Bảng ma trận: rows [{ten, v[], dinh, bq, cong}], labels */
    ma(labels, ds) {
      let mx = 0; ds.forEach((s) => s.v.forEach((x) => { if (x > mx) mx = x; }));
      let h = '<div class="scroll"><table class="t"><thead><tr><th>Hạng mục</th><th>Đỉnh</th><th>BQ</th><th>Tổng công</th>' + labels.map((l) => `<th>${esc(l)}</th>`).join('') + '</tr></thead><tbody>';
      ds.forEach((s) => { h += `<tr><td>${esc(s.ten)}</td><td>${App.so(s.dinh, 0)}</td><td>${App.so(s.bq, 0)}</td><td>${App.so(s.cong, 0)}</td>` + s.v.map((x) => `<td style="${ui.nhiet(x, mx)}">${x ? App.so(x, 0) : ''}</td>`).join('') + '</tr>'; });
      return h + '</tbody></table></div>';
    },
    /** Đỉnh, ngày đỉnh, tổng công của mảng tuần */
    tomTat(tuan, arr) {
      let dinh = 0, vi = 0, cong = 0;
      arr.forEach((x, i) => { if (x > dinh) { dinh = x; vi = i; } cong += x * (tuan[i].kt - tuan[i].bd); });
      return { dinh, ngay: tuan[vi] && E.ds(tuan[vi].bd), cong };
    },
    nhanLoai(id) { const m = Store.loaiCnMap()[id]; return m ? m.ten : id; },
    cong(a, b) { return a.map((x, i) => x + b[i]); },
  });

  // ---------------- khung ----------------
  // theme: null = theo máy; boCuc: 'auto' | 'desk' (AWD) | 'mob' (AWM)
  let theme = null, boCuc = 'auto';
  try { theme = localStorage.getItem('bdnl.theme'); boCuc = localStorage.getItem('bdnl.bocuc') || 'auto'; } catch (e) { /* bỏ qua */ }
  const datTheme = () => { if (theme) document.documentElement.dataset.theme = theme; else delete document.documentElement.dataset.theme; };
  datTheme();
  const luu = (k, v) => { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch (e) { /* bỏ qua */ } };
  App.giaoDien = {
    theme(v) { if (v === undefined) return theme || 'auto'; theme = v === 'auto' ? null : v; luu('bdnl.theme', theme); datTheme(); App.ve(); },
    boCuc(v) { if (v === undefined) return boCuc; boCuc = v; luu('bdnl.bocuc', v === 'auto' ? null : v); App.ve(); },
  };

  function veKhung() {
    const root = document.getElementById('app'), t = App.trangThai, S = Store.state;
    const cu = root.querySelector('.main'), cuon = cu ? cu.scrollTop : 0;
    ui.huyChart();
    const thay = Store.duAnThay();
    if (!thay.some((d) => d.id === t.duAnId)) t.duAnId = thay[0] ? thay[0].id : null;
    if (t.tab !== 'kh' && t.tab !== 'tt') t.tab = 'kh';
    // màn con của Cài đặt (VD trạng thái lưu từ bản cũ) → mở qua Cài đặt
    const con = App.dsCaiDat().find((m) => m.id === t.manHinh);
    if (con) { t.caiDat = con.id; t.manHinh = t.tab === 'tt' ? 'tt-caidat' : 'caidat'; }
    const ds = App.dsMenu(t.tab);
    if (!ds.some((m) => m.id === t.manHinh) && ds[0]) t.manHinh = ds[0].id;
    const mobile = boCuc === 'mob' || (boCuc === 'auto' && mq.matches);
    root.classList.toggle('mob', mobile);
    const quyen = Store.quyen(t.duAnId);
    const menu = ds.map((m) => `<a data-sh="mh" data-id="${m.id}" class="${m.id === t.manHinh ? 'on' : ''}"><span class="ic">${m.icon || '•'}</span><span>${esc(mobile ? m.tenNgan || m.ten : m.ten)}</span></a>`).join('') || '<div class="trong">Chưa có màn hình</div>';
    const tree = `<div class="tree"><div class="k">🏗 Khối Xây dựng</div>` + S.org.vung.map((v) => {
      const da = S.org.duAn.filter((d) => d.vungId === v.id);
      return `<div class="v">${esc(v.ten)}</div>` + da.map((d) => { const q = Store.quyen(d.id); return `<div class="da ${q ? '' : 'kho'} ${d.id === t.duAnId ? 'on' : ''}" ${q ? `data-sh="da" data-id="${d.id}"` : 'title="Không có quyền"'}>${q ? '' : '🔒 '}${esc(d.ten)}</div>`; }).join('');
    }).join('') + (Store.laQuanTri() ? '<div class="da them" data-sh="qtda">＋ Thêm / quản lý dự án</div>' : '') + '</div>';
    const picker = `<select data-sh="daSel">` + S.org.duAn.map((d) => `<option value="${d.id}" ${d.id === t.duAnId ? 'selected' : ''} ${Store.quyen(d.id) ? '' : 'disabled'}>${esc(d.ten)}</option>`).join('') + '</select>';
    const qNhan = { sua: 'Được sửa', nhap: 'Nhập thực tế', xem: 'Chỉ xem' }[quyen] || '';
    root.innerHTML = `<div class="top">
      <div class="ten">Biểu đồ nhân lực<small>Khối Xây dựng · ${qNhan}</small></div>
      <div class="tabs"><button data-sh="tab" data-id="kh" class="${t.tab === 'kh' ? 'on' : ''}">KẾ HOẠCH</button><button data-sh="tab" data-id="tt" class="${t.tab === 'tt' ? 'on' : ''}">THỰC TẾ</button></div>
      <div class="sp"></div>
      <div class="seg" id="sh-kg">${KG.map(([k, n]) => `<button data-sh="kg" data-id="${k}" class="${t.kieuTg === k ? 'on' : ''}">${n}</button>`).join('')}</div>
      ${mobile || !App.tkHtml ? '' : App.tkHtml()}
      ${mobile ? '' : `<select data-sh="nd" title="Vai trò (thử phân quyền)">${S.nguoiDung.map((u) => `<option value="${u.id}" ${u.id === S.dangNhap ? 'selected' : ''}>${esc(u.ten)}</option>`).join('')}</select>`}
    </div>
    ${mobile ? `<div class="mobtop">${picker}</div>` : ''}
    <div class="body">${mobile ? '' : `<aside class="side">${tree}<h4>${t.tab === 'kh' ? 'Kế hoạch' : 'Thực tế'}</h4><nav class="menu">${menu}</nav></aside>`}<main class="main"></main></div>
    ${mobile ? `<nav class="menu mob">${menu}</nav>` : ''}`;
    const main = root.querySelector('.main');
    App.veManHinh(main);
    main.scrollTop = cuon;
  }
  App.veKhung = veKhung;

  App.veThongBao = function (msg, loai) {
    const d = document.createElement('div'); d.className = 'toast' + (loai === 'loi' || loai === 'e' ? ' e' : ''); d.textContent = msg;
    document.body.appendChild(d); setTimeout(() => d.remove(), 3200);
  };

  function khoiDong() {
    const root = document.getElementById('app');
    root.addEventListener('click', (e) => {
      const n = e.target.closest('[data-sh]'); if (!n || n.tagName === 'SELECT') return;
      const a = n.dataset.sh, id = n.dataset.id;
      if (a === 'tab') App.chon({ tab: id, manHinh: null });
      else if (a === 'kg') App.chon({ kieuTg: id });
      else if (a === 'mh') App.chon({ manHinh: id });
      else if (a === 'da') App.chon({ duAnId: id });
      else if (a === 'qtda') App.chon({ tab: 'kh', manHinh: 'caidat', caiDat: 'quan-tri' });
    });
    root.addEventListener('change', (e) => {
      const n = e.target;
      if (n.dataset && n.dataset.sh === 'nd') Store.dangNhap(n.value);
      else if (n.dataset && n.dataset.sh === 'daSel') App.chon({ duAnId: n.value });
    });
    Store.on('doi', () => App.ve());
    mq.addEventListener ? mq.addEventListener('change', () => App.ve()) : mq.addListener(() => App.ve());
    Store.load();
    App.ve();
  }
  khoiDong();
})();
