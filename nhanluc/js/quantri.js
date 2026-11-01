/* Cài đặt › Quản trị (chỉ Quản trị Khối): dự án (thêm / sửa / xóa, lấy từ Định biên) và tài khoản (duyệt, vai trò, gán dự án).
 * Kèm phiên đăng nhập Google dùng chung với Định biên (js/dangnhap.js → window.BDNL_CLOUD). */
(function () {
  'use strict';
  const VAI_TRO = [['quanTriKhoi', 'Quản trị Khối'], ['qlVung', 'QL Vùng'], ['canBo', 'Cán bộ dự án'], ['giamSat', 'Giám sát'], ['nhaThau', 'Nhà thầu'], ['xem', 'Chỉ xem']];
  const DB_VAI_TRO = { admin: 'quanTriKhoi', khoi: 'quanTriKhoi', vung: 'qlVung' }; // vai trò bên Định biên → BĐNL
  const Q = { tab: 'da', q: '' };
  const esc = (s) => App.ui.esc(s);

  // ---------------- phiên đăng nhập Google ----------------
  const TK = (App.tk = { email: null, ten: null, cho: false, loi: null, dangTai: false });
  const cloud = () => window.BDNL_CLOUD || null;

  /** Hồ sơ users/{email} → tài khoản BĐNL */
  function tuHoSo(email, rec) {
    const b = rec.bdnl || {};
    const vaiTro = b.vaiTro || DB_VAI_TRO[rec.role] || 'canBo';
    const vungId = b.vungId != null ? b.vungId : rec.vungId || '';
    let duAnIds = b.duAnIds;
    if (!duAnIds) duAnIds = rec.bqlId ? Store.state.org.duAn.filter((d) => d.dbId === rec.vungId + '/' + rec.bqlId).map((d) => d.id) : [];
    const trangThai = b.trangThai || (rec.status === 'approved' ? 'duyet' : 'cho');
    return { id: email, email, ten: rec.name || email, vaiTro, vungId, duAnIds, duAnXem: b.duAnXem || [], nhaThau: b.nhaThau || '', trangThai, google: true };
  }
  function ganVaoStore(u) {
    const co = Store.state.nguoiDung.find((x) => x.id === u.id);
    if (co) Object.assign(co, u); else Store.state.nguoiDung.push(u);
  }
  async function layDuAnDinhBien(baoTin) {
    const C = cloud(); if (!C) return App.thongBao('Cần đăng nhập Google để lấy danh sách dự án từ Định biên.', 'loi');
    try { const ds = await C.dsDuAn(); const n = Store.gopDuAnDinhBien(ds); if (baoTin) App.thongBao(`Định biên có ${ds.length} dự án/BQLXD — thêm mới ${n}.`); }
    catch (e) { if (baoTin) App.thongBao('Không đọc được danh sách dự án Định biên: ' + e.message, 'loi'); }
  }
  async function khiDangNhap(user) {
    const C = cloud();
    if (!user) {
      // đăng xuất: về chế độ thử trên máy (dữ liệu chỉ trên máy này, không ghi Firebase)
      if (TK.email && Store.state.dangNhap === TK.email) { const thu = Store.state.nguoiDung.find((u) => !u.google); if (thu) Store.state.dangNhap = thu.id; Store.save(); }
      TK.email = null; TK.cho = false; App.ve(); return;
    }
    const email = (user.email || '').toLowerCase();
    TK.email = email; TK.ten = user.displayName || email; TK.dangTai = true; App.ve();
    try {
      await layDuAnDinhBien(false); // để gán dự án theo BQLXD bên Định biên
      const u = tuHoSo(email, await C.hoSo(email, TK.ten));
      ganVaoStore(u); TK.cho = u.trangThai !== 'duyet';
      Store.state.dangNhap = email; // đã đăng nhập Google: khóa vào đúng tài khoản (chờ duyệt thì chưa thấy dự án nào)
      Store.save(); Store.emit('doi');
      App.thongBao(TK.cho ? `Tài khoản ${email} đang chờ Quản trị Khối duyệt.` : `Đã đăng nhập: ${u.ten}`, TK.cho ? 'loi' : undefined);
    } catch (e) { TK.loi = e.message; App.thongBao('Lỗi đọc tài khoản: ' + e.message, 'loi'); }
    TK.dangTai = false; App.ve();
  }
  App.dangNhapGoogle = () => {
    const C = cloud();
    if (!C) return App.thongBao(window.BDNL_CLOUD_LOI || 'Chưa kết nối được Google (cần mạng).', 'loi');
    C.dangNhap().catch((e) => App.thongBao('Đăng nhập lỗi: ' + e.message, 'loi'));
  };
  App.dangXuatGoogle = () => { const C = cloud(); if (C) C.dangXuat(); };
  /** Ô tài khoản (thanh trên / Hệ thống) */
  App.tkHtml = () => TK.email
    ? `<span class="tk-chip" title="${esc(TK.email)}">${TK.cho ? '⏳ ' : '● '}${esc(TK.ten || TK.email)}</span><button class="btn2 tk-btn" data-tk="ra">Đăng xuất</button>`
    : `<button class="btn2 tk-btn" data-tk="vao">G Đăng nhập Google</button>`;
  document.addEventListener('click', (e) => { const b = e.target.closest('[data-tk]'); if (!b) return; if (b.dataset.tk === 'vao') App.dangNhapGoogle(); else App.dangXuatGoogle(); });
  const ganNghe = () => { const C = cloud(); if (C) C.khiDoi(khiDangNhap); };
  if (window.BDNL_CLOUD !== undefined) ganNghe(); else window.addEventListener('bdnl-cloud', ganNghe, { once: true });

  /** Lưu phần BĐNL của tài khoản Google lên Firebase (khi Quản trị đang đăng nhập Google) */
  function dayLen(u) {
    const C = cloud(), toi = Store.nguoi();
    // chỉ ghi khi người đang đăng nhập Google chính là Quản trị Khối đã duyệt
    if (!C || !u || !u.google || !TK.email || !toi || toi.id !== TK.email || toi.vaiTro !== 'quanTriKhoi' || toi.trangThai === 'cho') return;
    C.luuBdnl(u.id, { trangThai: u.trangThai, vaiTro: u.vaiTro, vungId: u.vungId || '', duAnIds: u.duAnIds || [], duAnXem: u.duAnXem || [], nhaThau: u.nhaThau || '' })
      .catch((e) => App.thongBao('Không lưu được lên Firebase: ' + e.message, 'loi'));
  }
  async function taiDsTaiKhoan() {
    const C = cloud(); if (!C || !TK.email) return App.thongBao('Đăng nhập Google để tải tài khoản dùng chung với Định biên.', 'loi');
    try { const ds = await C.dsHoSo(); let n = 0; for (const em in ds) { ganVaoStore(tuHoSo(em.toLowerCase(), ds[em])); n++; } Store.save(); Store.emit('doi'); App.thongBao(`Đã tải ${n} tài khoản Google.`); }
    catch (e) { App.thongBao('Không tải được danh sách tài khoản: ' + e.message, 'loi'); }
  }

  // ---------------- giao diện ----------------
  if (!document.getElementById('qt-css')) {
    const st = document.createElement('style'); st.id = 'qt-css';
    st.textContent = `
.qt .bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:8px 0}
.qt .bar .sp{flex:1}
.qt input,.qt select{background:var(--inp);border:1px solid var(--line);border-radius:8px;padding:6px 8px;color:var(--ink);font:inherit;min-height:34px}
.qt td input:not([type=checkbox]){width:100%;min-width:140px}
.qt table.t td{text-align:left;vertical-align:middle}
.qt .them{display:grid;grid-template-columns:2fr 1fr 1.4fr auto;gap:8px;align-items:end}
.qt .them label{display:flex;flex-direction:column;gap:3px;font-size:12px;color:var(--mut)}
.qt details{position:relative}
.qt summary{cursor:pointer;list-style:none;border:1px solid var(--line);border-radius:8px;padding:6px 8px;background:var(--inp);white-space:nowrap}
.qt summary::-webkit-details-marker{display:none}
.qt details[open] .dd{margin-top:4px;min-width:260px;max-height:260px;overflow:auto;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:6px 10px}
.qt table.t th{text-align:left}
.qt .dd b{display:block;font-size:11px;color:var(--mut);margin:6px 0 2px;text-transform:uppercase}
.qt .dd label{display:flex;gap:6px;align-items:center;padding:3px 0;white-space:nowrap}
.qt .m{color:var(--mut);font-size:12px}

.qt .bang{overflow:auto;border:1px solid var(--line);border-radius:10px}
.tk-chip{font-size:12px;opacity:.9;white-space:nowrap;max-width:200px;overflow:hidden;text-overflow:ellipsis}
.top .tk-btn{background:rgba(255,255,255,.1);color:#fff;border-color:rgba(255,255,255,.25)}
.mob .qt .them{grid-template-columns:1fr}`;
    document.head.appendChild(st);
  }

  function veDuAn(el) {
    const S = Store.state, q = Q.q.trim().toLowerCase();
    const ds = S.org.duAn.filter((d) => !q || (d.ten + ' ' + (d.bql || '')).toLowerCase().includes(q));
    const soNguoi = (id) => S.nguoiDung.filter((u) => (u.duAnIds || []).includes(id)).length;
    const soViec = (id) => ((S.duAn[id] && S.duAn[id].rows) || []).filter((r) => r.tinh).length;
    const goiY = (window.DS_DU_AN || []).map((t) => `<option value="${esc(t)}">`).join('');
    return `<div class="card"><h3>Thêm dự án</h3>
      <div class="them">
        <label>Tên dự án<input id="qt-ten" list="qt-dsda" placeholder="Gõ để chọn từ danh sách dự án Định biên…"></label>
        <label>Vùng<select id="qt-vung">${S.org.vung.map((v) => `<option value="${v.id}">${esc(v.ten)}</option>`).join('')}</select></label>
        <label>BQLXD<input id="qt-bql" placeholder="VD: BQLXD Đan Phượng"></label>
        <button class="btn2 p" data-q="themDa">+ Thêm</button>
      </div><datalist id="qt-dsda">${goiY}</datalist>
      <div class="m" style="margin-top:6px">Dự án mới bắt đầu rỗng: nhập tiến độ ở tab TĐ & KL (dán từ Excel) hoặc sinh nhanh từ Cài đặt › Công trình mẫu.</div></div>
    <div class="card"><div class="bar"><input data-q="tim" placeholder="Tìm dự án…" value="${esc(Q.q)}" style="flex:1 1 200px;max-width:320px"><span class="m">${ds.length}/${S.org.duAn.length} dự án</span><span class="sp"></span>
      <button class="btn2" data-q="layDb" title="Cần đăng nhập Google">⟳ Lấy danh sách từ Định biên</button></div>
      <div class="bang"><table class="t"><thead><tr><th>Tên dự án</th><th>BQLXD</th><th>Vùng</th><th>Nguồn</th><th>Việc</th><th>Người gán</th><th></th></tr></thead><tbody>
      ${ds.map((d) => `<tr><td><input data-da="${d.id}" data-f="ten" value="${esc(d.ten)}"></td><td><input data-da="${d.id}" data-f="bql" value="${esc(d.bql || '')}"></td>
        <td><select data-da="${d.id}" data-f="vungId">${S.org.vung.map((v) => `<option value="${v.id}"${v.id === d.vungId ? ' selected' : ''}>${esc(v.ten)}</option>`).join('')}</select></td>
        <td>${d.nguon === 'dinhbien' ? '<span class="chip">Định biên</span>' : '<span class="chip w">Tự tạo</span>'}</td>
        <td>${App.so(soViec(d.id), 0)}</td><td>${soNguoi(d.id)}</td>
        <td style="white-space:nowrap"><button class="btn2" data-q="moDa" data-id="${d.id}">Mở</button> <button class="btn2" data-q="xoaDa" data-id="${d.id}" style="color:var(--warn)">Xóa</button></td></tr>`).join('') || '<tr><td colspan="7" class="trong">Không có dự án.</td></tr>'}
      </tbody></table></div></div>`;
  }

  function chonDuAn(u, truong, nhan) {
    const S = Store.state, cur = new Set(u[truong] || []);
    const tom = cur.size ? `${cur.size} dự án` : nhan;
    return `<details><summary>${tom} ▾</summary><div class="dd">${S.org.vung.map((v) => {
      const ds = S.org.duAn.filter((d) => d.vungId === v.id); if (!ds.length) return '';
      return `<b>${esc(v.ten)}</b>` + ds.map((d) => `<label><input type="checkbox" data-gan="${esc(u.id)}" data-truong="${truong}" value="${d.id}"${cur.has(d.id) ? ' checked' : ''}> ${esc(d.ten)}</label>`).join('');
    }).join('')}</div></details>`;
  }

  function veTaiKhoan(el) {
    const S = Store.state, q = Q.q.trim().toLowerCase(), toi = S.dangNhap;
    const ds = S.nguoiDung.filter((u) => !q || ((u.ten || '') + ' ' + (u.email || '')).toLowerCase().includes(q))
      .sort((a, b) => (a.trangThai === 'cho' ? 0 : 1) - (b.trangThai === 'cho' ? 0 : 1));
    const nt = S.danhMuc.nhaThau.map((x) => x.ten).sort((a, b) => a.localeCompare(b, 'vi'));
    const cho = S.nguoiDung.filter((u) => u.trangThai === 'cho').length;
    const C = cloud();
    return `<div class="card"><h3>Đăng nhập Google <small>dùng chung tài khoản với Định biên</small></h3>
      <div class="bar">${App.tkHtml()}${TK.email ? '<button class="btn2" data-q="taiTk">⟳ Tải tài khoản Google</button>' : ''}</div>
      <div class="m">${C ? 'Người mới bấm "Đăng nhập Google" → tài khoản hiện ở đây trạng thái <b>Chờ duyệt</b> → Quản trị duyệt, chọn vai trò và gán dự án. Tài khoản đã có bên Định biên tự nhận vai trò theo Định biên (Admin/Khối → Quản trị Khối, Vùng → QL Vùng, BQLXD → Cán bộ dự án của BQLXD đó).' : esc(window.BDNL_CLOUD_LOI || 'Chưa kết nối được Google (cần mạng) — vẫn thêm tài khoản thử trên máy được.')}</div></div>
    <div class="card"><h3>Thêm tài khoản</h3>
      <div class="them" style="grid-template-columns:1.4fr 1.2fr 1fr auto">
        <label>Email Google<input id="qt-email" type="email" placeholder="ten@vinhomes.vn"></label>
        <label>Họ tên<input id="qt-hoten"></label>
        <label>Vai trò<select id="qt-vt">${VAI_TRO.map(([k, n]) => `<option value="${k}"${k === 'canBo' ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
        <button class="btn2 p" data-q="themTk">+ Thêm</button></div>
      <div class="m" style="margin-top:6px">Thêm trước email để người đó đăng nhập Google là vào được ngay, không phải chờ duyệt.</div></div>
    <div class="card"><div class="bar"><input data-q="tim" placeholder="Tìm tên, email…" value="${esc(Q.q)}" style="flex:1 1 200px;max-width:320px"><span class="m">${ds.length} tài khoản${cho ? ` · <b style="color:var(--warn)">${cho} chờ duyệt</b>` : ''}</span></div>
      <div class="bang"><table class="t"><thead><tr><th>Tài khoản</th><th>Trạng thái</th><th>Vai trò</th><th>Vùng</th><th>Dự án phụ trách</th><th>Xem thêm</th><th>Nhà thầu</th><th></th></tr></thead><tbody>
      ${ds.map((u) => { const k = esc(u.id); return `<tr><td><input data-tk-id="${k}" data-f="ten" value="${esc(u.ten)}"><div class="m">${u.email ? esc(u.email) : 'Tài khoản thử trên máy'}${u.google ? ' · Google' : ''}${u.id === toi ? ' · <b>đang dùng</b>' : ''}</div></td>
        <td><select data-tk-id="${k}" data-f="trangThai"><option value="duyet"${u.trangThai !== 'cho' ? ' selected' : ''}>✔ Đã duyệt</option><option value="cho"${u.trangThai === 'cho' ? ' selected' : ''}>⏳ Chờ duyệt</option></select></td>
        <td><select data-tk-id="${k}" data-f="vaiTro">${VAI_TRO.map(([v, n]) => `<option value="${v}"${v === u.vaiTro ? ' selected' : ''}>${n}</option>`).join('')}</select></td>
        <td>${u.vaiTro === 'qlVung' ? `<select data-tk-id="${k}" data-f="vungId"><option value="">—</option>${S.org.vung.map((v) => `<option value="${v.id}"${v.id === u.vungId ? ' selected' : ''}>${esc(v.ten)}</option>`).join('')}</select>` : '<span class="m">—</span>'}</td>
        <td>${u.vaiTro === 'quanTriKhoi' ? '<span class="m">Tất cả dự án</span>' : u.vaiTro === 'qlVung' ? '<span class="m">Cả vùng</span>' : chonDuAn(u, 'duAnIds', 'Chưa gán')}</td>
        <td>${u.vaiTro === 'quanTriKhoi' ? '' : chonDuAn(u, 'duAnXem', 'Không')}</td>
        <td>${u.vaiTro === 'nhaThau' ? `<select data-tk-id="${k}" data-f="nhaThau"><option value="">—</option>${nt.map((t) => `<option${t === u.nhaThau ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>` : '<span class="m">—</span>'}</td>
        <td>${u.id === toi ? '' : `<button class="btn2" data-q="xoaTk" data-id="${k}" style="color:var(--warn)">Xóa</button>`}</td></tr>`; }).join('')}
      </tbody></table></div>
      <div class="m" style="margin-top:6px">Quản trị Khối: mọi dự án · QL Vùng: mọi dự án trong vùng · Cán bộ: sửa dự án được gán · Giám sát / Nhà thầu: nhập thực tế · "Xem thêm": cho xem dự án khác ngoài phần phụ trách.</div></div>`;
  }

  function ve(el) {
    if (!Store.laQuanTri()) { el.innerHTML = '<p class="trong">Chỉ Quản trị Khối dùng được mục này.</p>'; return; }
    el.innerHTML = `<div class="qt"><div class="pills"><button data-q="tab" data-id="da"${Q.tab === 'da' ? ' class="on"' : ''}>🏢 Dự án</button><button data-q="tab" data-id="tk"${Q.tab === 'tk' ? ' class="on"' : ''}>👥 Tài khoản</button></div>${Q.tab === 'da' ? veDuAn(el) : veTaiKhoan(el)}</div>`;

    el.onclick = (e) => {
      const b = e.target.closest('[data-q]'); if (!b || b.tagName === 'INPUT') return;
      const a = b.dataset.q, id = b.dataset.id, S = Store.state;
      if (a === 'tab') { Q.tab = id; Q.q = ''; ve(el); }
      else if (a === 'themDa') {
        const ten = el.querySelector('#qt-ten').value.trim(); if (!ten) return App.thongBao('Nhập tên dự án.', 'loi');
        if (S.org.duAn.some((d) => d.ten === ten)) return App.thongBao('Dự án đã có.', 'loi');
        Store.themDuAn({ ten, vungId: el.querySelector('#qt-vung').value, bql: el.querySelector('#qt-bql').value.trim() });
        App.thongBao('Đã thêm dự án ' + ten);
      } else if (a === 'xoaDa') {
        const d = S.org.duAn.find((x) => x.id === id);
        if (confirm(`Xóa dự án "${d.ten}"?\n\nToàn bộ tiến độ, hệ số, số liệu thực tế của dự án trên máy này sẽ bị xóa. Không thể hoàn tác.`)) Store.xoaDuAn(id);
      } else if (a === 'moDa') App.chon({ duAnId: id, manHinh: 'tongquan' });
      else if (a === 'layDb') layDuAnDinhBien(true);
      else if (a === 'taiTk') taiDsTaiKhoan();
      else if (a === 'themTk') {
        const email = el.querySelector('#qt-email').value.trim().toLowerCase();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return App.thongBao('Email không hợp lệ.', 'loi');
        const ten = el.querySelector('#qt-hoten').value.trim() || email, vaiTro = el.querySelector('#qt-vt').value;
        if (!Store.themNguoi({ email, ten, vaiTro, google: true })) return App.thongBao('Email đã có.', 'loi');
        dayLen(Store.state.nguoiDung.find((u) => u.id === email));
        Q.q = ''; App.thongBao('Đã thêm ' + email + ' — chọn dự án phụ trách trong bảng.');
      } else if (a === 'xoaTk') {
        const u = S.nguoiDung.find((x) => x.id === id);
        if (confirm(`Xóa tài khoản "${u.ten}"?` + (u.google ? '\n(Chỉ xóa quyền trên phần mềm này; tài khoản Định biên giữ nguyên.)' : ''))) {
          if (u.google) { u.trangThai = 'cho'; u.duAnIds = []; u.duAnXem = []; dayLen(u); }
          Store.xoaNguoi(id);
        }
      }
    };
    el.oninput = (e) => {
      const t = e.target; if (t.dataset.q !== 'tim') return;
      Q.q = t.value; const p = t.selectionStart; ve(el); const n = el.querySelector('[data-q=tim]'); n.focus(); n.setSelectionRange(p, p);
    };
    el.onchange = (e) => {
      const t = e.target;
      if (t.dataset.da) {
        const v = t.value.trim(); if (t.dataset.f === 'ten' && !v) return ve(el);
        Store.suaThongTinDuAn(t.dataset.da, { [t.dataset.f]: v });
      } else if (t.dataset.tkId) {
        const u = Store.suaNguoi(t.dataset.tkId, { [t.dataset.f]: t.value }); dayLen(u);
      } else if (t.dataset.gan) {
        const u = Store.state.nguoiDung.find((x) => x.id === t.dataset.gan), k = t.dataset.truong;
        const s = new Set(u[k] || []); t.checked ? s.add(t.value) : s.delete(t.value);
        Q.mo = [...el.querySelectorAll('details')].indexOf(t.closest('details')); // giữ ô chọn đang mở sau khi vẽ lại
        Store.suaNguoi(u.id, { [k]: [...s] }); dayLen(u);
      }
    };
    if (Q.mo != null) { const d = el.querySelectorAll('details')[Q.mo]; if (d) d.open = true; Q.mo = null; }
  }

  App.dangKy({ id: 'quan-tri', tab: 'kh', nhom: 'caidat', chiQuanTri: true, ten: 'Quản trị', icon: '👥', thuTu: 1, ve });
})();
