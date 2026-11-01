/* Cài đặt — gom các màn ít dùng (nhom:'caidat': Định mức, Danh mục, Công trình mẫu, Xuất báo cáo, Dữ liệu thử) + Hệ thống (vai trò, giao diện, bố cục, đặt lại). Có ở cả 2 tab. */
(function () {
  'use strict';
  const HT = { id: 'he-thong', ten: 'Hệ thống', icon: '🛠' };

  if (!document.getElementById('cd-css')) {
    const st = document.createElement('style'); st.id = 'cd-css';
    st.textContent = `
.cd-nav{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px}
.cd-nav button{display:flex;gap:6px;align-items:center;border:1px solid var(--line);background:var(--card);padding:7px 14px;border-radius:99px;color:var(--ink)}
.cd-nav button.on{background:var(--navy);color:#fff;border-color:var(--navy)}
.cd-ht{max-width:640px}
.cd-ht .row{display:flex;gap:12px;align-items:center;flex-wrap:wrap;padding:12px 0;border-bottom:1px solid var(--line)}
.cd-ht .row:last-child{border-bottom:0}
.cd-ht .row>b{width:150px;flex-shrink:0}
.cd-ht .row .m{flex-basis:100%;color:var(--mut);font-size:12px}
.mob .cd-nav{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}
.mob .cd-nav button{flex-direction:column;gap:2px;border-radius:12px;padding:8px 4px;font-size:12px;white-space:nowrap}
.mob .cd-nav button span:first-child{font-size:18px}
.mob .cd-ht .row>b{width:100%}`;
    document.head.appendChild(st);
  }

  function heThong(el) {
    const S = Store.state, G = App.giaoDien;
    el.innerHTML = `<div class="card cd-ht">
      <div class="row"><b>Tài khoản Google</b>${App.tkHtml ? App.tkHtml() : ''}
        <span class="m">Dùng chung tài khoản với phần mềm Định biên. Người mới đăng nhập sẽ chờ Quản trị Khối duyệt và gán dự án.</span></div>
      <div class="row"><b>Vai trò (thử phân quyền)</b><select class="sel" data-cd="nd">${S.nguoiDung.map((u) => `<option value="${u.id}"${u.id === S.dangNhap ? ' selected' : ''}>${App.ui.esc(u.ten)}</option>`).join('')}</select>
        <span class="m">Bản chạy thử trên máy: chọn vai trò để xem mỗi người thấy và sửa được gì. Khi đưa lên mạng sẽ thay bằng đăng nhập thật.</span></div>
      <div class="row"><b>Bố cục</b><span data-cd="bc"></span>
        <span class="m">Tự động: cửa sổ rộng ≥ 760px hiện bản Máy tính (AWD, có cây dự án và menu bên trái), hẹp hơn hiện bản Điện thoại (AWM, thanh tab dưới đáy).</span></div>
      <div class="row"><b>Màu nền</b><span data-cd="th"></span></div>
      <div class="row"><b>Dữ liệu</b><button class="btn2" data-cd="reset">Đặt lại dữ liệu mẫu</button>
        <span class="m">Xóa mọi thay đổi trên máy này, nạp lại dữ liệu Đan Phượng ban đầu.</span></div>
    </div>`;
    el.querySelector('[data-cd=bc]').appendChild(App.ui.seg([['auto', 'Tự động'], ['desk', 'Máy tính (AWD)'], ['mob', 'Điện thoại (AWM)']], G.boCuc(), (v) => G.boCuc(v)));
    el.querySelector('[data-cd=th]').appendChild(App.ui.seg([['auto', 'Theo máy'], ['light', 'Sáng'], ['dark', 'Tối']], G.theme(), (v) => G.theme(v)));
    el.querySelector('[data-cd=nd]').onchange = (e) => Store.dangNhap(e.target.value);
    el.querySelector('[data-cd=reset]').onclick = () => { if (confirm('Đặt lại toàn bộ dữ liệu về dữ liệu mẫu? Mọi thay đổi sẽ mất.')) { Store.reset(); App.thongBao('Đã đặt lại dữ liệu mẫu'); } };
  }

  function ve(el, ctx) {
    const t = App.trangThai, ds = App.dsCaiDat().filter((x) => !x.chiQuanTri || Store.laQuanTri()).concat([HT]);
    const m = ds.find((x) => x.id === t.caiDat) || ds[0];
    el.innerHTML = '<div class="cd-nav"></div><div class="cd-body"></div>';
    const nav = el.firstChild;
    ds.forEach((x) => {
      const b = document.createElement('button'); b.innerHTML = `<span>${x.icon || '•'}</span><span>${App.ui.esc(x.ten)}</span>`;
      if (x === m) b.className = 'on';
      b.onclick = () => App.chon({ caiDat: x.id });
      nav.appendChild(b);
    });
    const body = el.lastChild;
    if (m === HT) heThong(body); else m.ve(body, ctx);
  }

  App.dangKy({ id: 'caidat', tab: 'kh', ten: 'Cài đặt', icon: '⚙', thuTu: 50, ve });
  App.dangKy({ id: 'tt-caidat', tab: 'tt', ten: 'Cài đặt', icon: '⚙', thuTu: 50, ve });
})();
