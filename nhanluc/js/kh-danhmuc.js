/* Kế hoạch › Danh mục — công trình, nhà thầu, loại công nhân, nhóm theo dõi, ngày nghỉ. */
(function () {
  'use strict';
  const E = window.BDNL;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const S = { tab: 'ct', q: '', dung: false, nl: { truocTet: 7, tyLeTruoc: 0.6, sauTet: 10, tyLeSau: 0.5, tu: 2025, den: 2030 }, daId: null };
  const TABS = [['ct', 'Công trình'], ['nt', 'Nhà thầu'], ['cn', 'Loại công nhân'], ['td', 'Nhóm theo dõi'], ['lich', 'Ngày nghỉ']];

  if (!document.getElementById('khdc-css')) {
    const st = document.createElement('style'); st.id = 'khdc-css';
    st.textContent = `
.khdc .tabs{display:flex;gap:4px;margin-bottom:10px;border-bottom:1px solid var(--line)}
.khdc .tabs button{border:0;background:none;padding:6px 12px;cursor:pointer;color:var(--mut);font:inherit;border-bottom:2px solid transparent}
.khdc .tabs button.on{color:var(--teal);border-bottom-color:var(--teal);font-weight:600}
.khdc table{border-collapse:collapse;font-size:12.5px;width:100%;background:var(--card)}
.khdc th{background:var(--head);color:var(--mut);text-align:left;padding:5px 6px;border-bottom:1px solid var(--line);position:sticky;top:0}
.khdc td{padding:3px 6px;border-bottom:1px solid var(--line)}
.khdc input,.khdc select,.khdc button{font:inherit;padding:3px 6px;border:1px solid var(--line);border-radius:6px;background:var(--card);color:var(--ink)}
.khdc button{cursor:pointer}.khdc button.p{background:var(--teal);color:#fff;border-color:transparent}
.khdc .box{max-height:calc(100vh - 260px);overflow:auto;border:1px solid var(--line);border-radius:8px}
.khdc .bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:6px 0}.khdc .m{color:var(--mut);font-size:12px}
.khdc td input[type=text],.khdc td input:not([type]){width:100%;box-sizing:border-box;min-width:150px}
.khdc .tabs{overflow-x:auto}.khdc .tabs button{white-space:nowrap;flex-shrink:0}
.khdc th{z-index:2}.khdc input,.khdc select{min-height:30px}
.khdc .bar input[data-s],.khdc .bar #khdc-ntn{flex:1 1 200px;max-width:340px}
.khdc .bar .n{display:inline-flex;gap:5px;align-items:center;white-space:nowrap}
.khdc .nl{border:1px solid var(--line);border-radius:10px;padding:8px 10px;margin:6px 0 10px;display:flex;flex-direction:column;gap:6px}
.khdc .nl b{font-size:13px}`;
    document.head.appendChild(st);
  }

  function ve(el, ctx) {
    const { Store } = ctx, id = ctx.duAnId, sua = ctx.coSua, DM = Store.state.danhMuc, dis = sua ? '' : ' disabled';
    if (S.daId !== id) { S.daId = id; S.q = ''; S.dung = false; }
    const dmSua = (fn) => { fn(); Store._cache = {}; Store.save(); Store.emit('doi'); };
    const daSua = (fn) => Store.suaDuAn(id, fn);
    const d = Store.da(id), ip = (a, i, f, v, extra) => `<input data-a="${a}" data-i="${i}" data-f="${f}" value="${esc(v)}"${dis} ${extra || ''}>`;
    const sel = (a, i, f, opts, cur) => `<select data-a="${a}" data-i="${i}" data-f="${f}"${dis}>${opts.map((o) => `<option${o === cur ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
    const q = S.q.trim().toLowerCase();
    let h = '';

    if (S.tab === 'ct') {
      const cts = d.rows.filter((r) => r.cap === 3);
      h = `<div class="box"><table><thead><tr><th>#</th><th>Tên công trình (cấp 3)</th><th>Số việc</th></tr></thead><tbody>${cts.map((r, i) => {
        const j = d.rows.indexOf(r); let n = 0; for (let k = j + 1; k < d.rows.length && d.rows[k].cap > 3; k++) if (d.rows[k].tinh) n++;
        return `<tr><td>${i + 1}</td><td>${ip('ct', r.r, 'ten', r.ten)}</td><td>${n}</td></tr>`;
      }).join('')}</tbody></table></div><div class="m">Đổi tên sẽ cập nhật cả hệ số, số liệu thực tế đã gắn theo tên công trình.</div>`;
    } else if (S.tab === 'nt') {
      const ds = DM.nhaThau.map((x, i) => [x, i]).filter(([x]) => !q || x.ten.toLowerCase().includes(q));
      h = `<div class="bar"><input data-s placeholder="Tìm nhà thầu..." value="${esc(S.q)}"><span class="m">${ds.length}/${DM.nhaThau.length}</span></div>
        ${sua ? `<div class="bar"><input id="khdc-ntn" placeholder="Tên nhà thầu mới" size="26"><select id="khdc-ntg">${DM.nhomNt.map((g) => `<option>${esc(g)}</option>`).join('')}</select><button class="p" data-add="nt">+ Thêm</button></div>` : ''}
        <div class="box"><table><thead><tr><th>Tên</th><th>Nhóm</th><th>Theo dõi riêng</th></tr></thead><tbody>${ds.map(([x, i]) => `<tr><td>${ip('nt', i, 'ten', x.ten)}</td><td>${sel('nt', i, 'nhom', DM.nhomNt, x.nhom)}</td><td><input type="checkbox" data-a="nt" data-i="${i}" data-f="theoDoiRieng"${x.theoDoiRieng ? ' checked' : ''}${dis}></td></tr>`).join('')}</tbody></table></div>`;
    } else if (S.tab === 'cn') {
      const dung = new Set(); d.rows.forEach((r) => r.tinh && Object.keys(r.dm || {}).forEach((k) => dung.add(k)));
      const ds = DM.loaiCn.map((x, i) => [x, i]).filter(([x]) => (!S.dung || dung.has(x.id)) && (!q || x.ten.toLowerCase().includes(q)));
      h = `<div class="bar"><input data-s placeholder="Tìm loại CN..." value="${esc(S.q)}"><label><input type="checkbox" data-dung${S.dung ? ' checked' : ''}> Chỉ loại đang dùng trong dự án</label><span class="m">${ds.length}/${DM.loaiCn.length}</span></div>
        <div class="box"><table><thead><tr><th>Tên</th><th>Nhóm gốc</th><th>Loại ĐM</th><th>Nhóm theo dõi</th></tr></thead><tbody>${ds.map(([x, i]) => `<tr><td>${esc(x.ten)}${dung.has(x.id) ? '' : ' <span class="m">(chưa dùng)</span>'}</td><td>${esc(x.nhom || '')}</td><td>${esc(x.loai_dm || '')}</td><td>${sel('cn', i, 'nhomTd', DM.nhomTd.includes(x.nhomTd) ? DM.nhomTd : [x.nhomTd].concat(DM.nhomTd), x.nhomTd)}</td></tr>`).join('')}</tbody></table></div>`;
    } else if (S.tab === 'td') {
      h = `${sua ? '<div class="bar"><input id="khdc-tdn" placeholder="Tên nhóm mới"><button class="p" data-add="td">+ Thêm</button></div>' : ''}
        <div class="box"><table><thead><tr><th>#</th><th>Nhóm theo dõi</th><th>Số loại CN</th><th></th></tr></thead><tbody>${DM.nhomTd.map((g, i) => `<tr><td>${i + 1}</td><td>${ip('td', i, 'ten', g)}</td><td>${DM.loaiCn.filter((x) => x.nhomTd === g).length}</td>
          <td>${sua ? `<button data-mv="${i}|-1"${i ? '' : ' disabled'}>▲</button> <button data-mv="${i}|1"${i < DM.nhomTd.length - 1 ? '' : ' disabled'}>▼</button> <button data-del="td|${i}"${g === 'Khác' ? ' disabled' : ''}>Xóa</button>` : ''}</td></tr>`).join('')}</tbody></table></div>
        <div class="m">Xóa nhóm: các loại CN thuộc nhóm được chuyển sang "Khác".</div>
        <h4 style="margin:16px 0 4px">Biên bản xác nhận nhân lực của dự án</h4>
        <div class="m">Chọn nhóm in trên biên bản, thứ tự và tên hiển thị trên giấy. Nhóm không có trên biên bản được dồn vào 'Khác'.</div>
        <div class="box"><table><thead><tr><th>In</th><th>Nhóm theo dõi</th><th>Tên trên biên bản</th><th></th></tr></thead><tbody>${(() => { const inc = Store.nhomBB(id).slice(), all = inc.concat(DM.nhomTd.filter((g) => !inc.includes(g))); return all.map((g) => { const on = inc.includes(g), i = inc.indexOf(g); return `<tr><td><input type="checkbox" data-bbt="${esc(g)}"${on ? ' checked' : ''}${dis}></td><td>${esc(g)}</td><td><input data-bbl="${esc(g)}" value="${esc(Store.tenTrenBB(id, g))}" placeholder="${esc(g)}"${dis}></td><td>${sua && on ? `<button data-bbm="${i}|-1"${i ? '' : ' disabled'}>▲</button> <button data-bbm="${i}|1"${i < inc.length - 1 ? '' : ' disabled'}>▼</button>` : ''}</td></tr>`; }).join(''); })()}</tbody></table></div>`;
    } else {
      const L = d.lich || (d.lich = []), ds = L.map((x, i) => [x, i]).sort((a, b) => (a[0].bd || '').localeCompare(b[0].bd || ''));
      const n = S.nl, ni = (k, nhan, st) => `<label class="n">${nhan} <input data-nl="${k}" type="number" step="${st || 1}" value="${n[k]}" style="width:72px"${dis}></label>`;
      h = `<div class="bar"><label class="n"><input type="checkbox" data-goc${d.dungLichFileGoc ? ' checked' : ''}${dis}> Tính như file Excel gốc (Tết 11–23/02/2026)</label></div>
        <div class="nl"><b>Sinh lịch lễ Việt Nam</b>
          <div class="bar">${ni('tu', 'Từ năm')} ${ni('den', 'đến năm')}</div>
          <div class="bar">${ni('truocTet', 'Nghỉ sớm trước Tết (ngày)')} ${ni('tyLeTruoc', 'còn', 0.05)}</div>
          <div class="bar">${ni('sauTet', 'Lên muộn sau Tết (ngày)')} ${ni('tyLeSau', 'còn', 0.05)} <span class="m">tỷ lệ nhân lực còn lại, VD 0,6 = 60%</span></div>
          ${sua ? '<div class="bar"><button class="p" data-sinh>Sinh lịch lễ VN</button><button data-addl>+ Thêm dòng</button></div>' : ''}</div>
        <div class="box"><table><thead><tr><th>Tên</th><th>Từ</th><th>Đến (gồm)</th><th>Kiểu</th><th>Tỷ lệ</th><th>Phạm vi</th><th></th></tr></thead><tbody>${ds.map(([x, i]) => `<tr><td>${ip('lich', i, 'ten', x.ten)}</td><td><input type="date" data-a="lich" data-i="${i}" data-f="bd" value="${esc(x.bd)}"${dis}></td><td><input type="date" data-a="lich" data-i="${i}" data-f="kt" value="${esc(x.kt)}"${dis}></td>
          <td><select data-a="lich" data-i="${i}" data-f="kieu"${dis}><option value="nghi"${x.kieu === 'nghi' ? ' selected' : ''}>Nghỉ</option><option value="giam"${x.kieu === 'giam' ? ' selected' : ''}>Giảm</option></select></td>
          <td><input type="number" step="0.05" min="0" max="1" data-a="lich" data-i="${i}" data-f="tyLe" value="${x.kieu === 'nghi' ? 0 : x.tyLe}" style="width:70px"${x.kieu === 'nghi' ? ' disabled' : dis}></td>
          <td><select data-a="lich" data-i="${i}" data-f="phamVi"${dis}><option value="tuan"${x.phamVi === 'tuan' ? ' selected' : ''}>Cả tuần</option><option value="ngay"${x.phamVi === 'ngay' ? ' selected' : ''}>Theo ngày</option></select></td>
          <td>${sua ? `<button data-del="lich|${i}">✕</button>` : ''}</td></tr>`).join('')}</tbody></table></div>`;
    }
    el.innerHTML = `<div class="khdc"><div class="tabs">${TABS.map(([k, t]) => `<button data-tab="${k}"${S.tab === k ? ' class="on"' : ''}>${t}</button>`).join('')}</div>${sua ? '' : '<div class="m">Chế độ chỉ xem.</div>'}${h}</div>`;

    // ---- sự kiện (gán thuộc tính để không chồng listener khi vẽ lại) ----
    const doiTen = (loai, cu, moi) => { // đồng bộ tham chiếu theo tên ở mọi dự án
      const dd = Store.state.duAn;
      for (const k in dd) {
        const p = dd[k];
        if (loai === 'nt') { p.rows.forEach((r) => { if (r.nt === cu) r.nt = moi; }); if (p.hs && p.hs.nt && p.hs.nt[cu]) { p.hs.nt[moi] = p.hs.nt[cu]; delete p.hs.nt[cu]; } (p.thucTe || []).forEach((t) => { if (t.nt === cu) t.nt = moi; }); }
        if (loai === 'ct' && k === id) { if (p.hs && p.hs.ct && p.hs.ct[cu]) { p.hs.ct[moi] = p.hs.ct[cu]; delete p.hs.ct[cu]; } (p.thucTe || []).forEach((t) => { if (t.ct === cu) t.ct = moi; }); }
        if (loai === 'td') { const bb = p.caiDat && p.caiDat.bienBan; if (bb) { const xoa = moi === 'Khác', i = (bb.nhom || []).indexOf(cu); if (i >= 0) { if (xoa) bb.nhom.splice(i, 1); else if (bb.nhom.includes(moi)) bb.nhom.splice(i, 1); else bb.nhom[i] = moi; } if (bb.tenTrenBB && cu in bb.tenTrenBB) { if (!xoa && !(moi in bb.tenTrenBB)) bb.tenTrenBB[moi] = bb.tenTrenBB[cu]; delete bb.tenTrenBB[cu]; } if (bb.nhom && !bb.nhom.includes('Khác')) bb.nhom.push('Khác'); } }
        if (loai === 'td') (p.thucTe || []).forEach((t) => { if (t.so && cu in t.so) { t.so[moi] = (t.so[moi] || 0) + t.so[cu]; delete t.so[cu]; } });
      }
    };
    const bb = (p) => { const c = p.caiDat || (p.caiDat = {}); if (!c.bienBan) c.bienBan = { nhom: Store.nhomBB(id).slice(), tenTrenBB: {} }; if (!c.bienBan.tenTrenBB) c.bienBan.tenTrenBB = {}; return c.bienBan; };
    el.onclick = (e) => {
      const t = e.target.closest('button'); if (!t) return;
      if (t.dataset.bbm) { const [i, dl] = t.dataset.bbm.split('|').map(Number); daSua((p) => { const a = bb(p).nhom; [a[i], a[i + dl]] = [a[i + dl], a[i]]; }); return; }
      if (t.dataset.tab) { S.tab = t.dataset.tab; S.q = ''; ve(el, ctx); return; }
      if (!sua) return;
      if (t.dataset.add === 'nt') {
        const ten = el.querySelector('#khdc-ntn').value.trim(), nhom = el.querySelector('#khdc-ntg').value;
        if (!ten) return;
        if (DM.nhaThau.some((x) => x.ten === ten)) { App.thongBao('Nhà thầu đã có.', 'loi'); return; }
        dmSua(() => DM.nhaThau.push({ ten, nhom, theoDoiRieng: true }));
      } else if (t.dataset.add === 'td') {
        const ten = el.querySelector('#khdc-tdn').value.trim();
        if (!ten || DM.nhomTd.includes(ten)) return;
        dmSua(() => { const k = DM.nhomTd.indexOf('Khác'); k >= 0 ? DM.nhomTd.splice(k, 0, ten) : DM.nhomTd.push(ten); });
      } else if (t.dataset.mv) {
        const [i, dl] = t.dataset.mv.split('|').map(Number), j = i + dl;
        dmSua(() => { const a = DM.nhomTd; [a[i], a[j]] = [a[j], a[i]]; });
      } else if (t.dataset.del) {
        const [k, ii] = t.dataset.del.split('|'), i = +ii;
        if (k === 'td') {
          const g = DM.nhomTd[i]; if (!confirm(`Xóa nhóm "${g}"? Các loại CN trong nhóm chuyển sang "Khác".`)) return;
          dmSua(() => { if (!DM.nhomTd.includes('Khác')) DM.nhomTd.push('Khác'); DM.loaiCn.forEach((x) => { if (x.nhomTd === g) x.nhomTd = 'Khác'; }); DM.nhomTd.splice(DM.nhomTd.indexOf(g), 1); doiTen('td', g, 'Khác'); });
        } else if (k === 'lich') daSua((p) => p.lich.splice(i, 1));
      } else if (t.dataset.addl !== undefined) {
        daSua((p) => p.lich.push({ ten: 'Ngày nghỉ mới', bd: new Date().toISOString().slice(0, 10), kt: new Date().toISOString().slice(0, 10), kieu: 'nghi', tyLe: 0, phamVi: 'tuan' }));
      } else if (t.dataset.sinh !== undefined) {
        const n = S.nl;
        if (confirm('Thay toàn bộ lịch hiện tại bằng lịch lễ VN mới sinh?')) daSua((p) => { p.lich = E.lichNghiVN(+n.tu, +n.den, { truocTet: +n.truocTet, tyLeTruoc: +n.tyLeTruoc, sauTet: +n.sauTet, tyLeSau: +n.tyLeSau }); });
      } else if (t.dataset.dung !== undefined) { /* checkbox xử lý ở onchange */ }
    };
    el.oninput = (e) => {
      const t = e.target;
      if (t.dataset.s !== undefined) { S.q = t.value; const p = t.selectionStart; ve(el, ctx); const n = el.querySelector('[data-s]'); n.focus(); n.setSelectionRange(p, p); }
      else if (t.dataset.nl) S.nl[t.dataset.nl] = t.value;
    };
    el.onchange = (e) => {
      const t = e.target, a = t.dataset.a;
      if (t.dataset.bbt !== undefined && sua) { const g = t.dataset.bbt; daSua((p) => { const b = bb(p); if (t.checked) { if (!b.nhom.includes(g)) { const k = b.nhom.indexOf('Khác'); k >= 0 && g !== 'Khác' ? b.nhom.splice(k, 0, g) : b.nhom.push(g); } } else b.nhom = b.nhom.filter((x) => x !== g); }); return; }
      if (t.dataset.bbl !== undefined && sua) { const g = t.dataset.bbl, v = t.value.trim(); daSua((p) => { const b = bb(p); if (!v || v === g) delete b.tenTrenBB[g]; else b.tenTrenBB[g] = v; }); return; }
      if (t.dataset.dung !== undefined) { S.dung = t.checked; ve(el, ctx); return; }
      if (t.dataset.goc !== undefined) { if (sua) daSua((p) => { p.dungLichFileGoc = t.checked; }); return; }
      if (!a || !sua) return;
      const i = t.dataset.i, f = t.dataset.f, v = t.type === 'checkbox' ? t.checked : t.type === 'number' ? parseFloat(t.value) || 0 : t.value;
      if (a === 'ct') {
        const nv = String(v).trim(); if (!nv) { ve(el, ctx); return; }
        const cu = d.rows.find((r) => String(r.r) === i).ten;
        if (nv !== cu) { Store.state.duAn[id] && doiTen('ct', cu, nv); daSua((p) => { p.rows.find((r) => String(r.r) === i).ten = nv; }); }
      } else if (a === 'nt') {
        const x = DM.nhaThau[+i];
        if (f === 'ten') { const nv = String(v).trim(); if (!nv || DM.nhaThau.some((y) => y.ten === nv)) { ve(el, ctx); return; } const cu = x.ten; dmSua(() => { x.ten = nv; doiTen('nt', cu, nv); }); }
        else dmSua(() => { x[f] = v; });
      } else if (a === 'cn') dmSua(() => { DM.loaiCn[+i][f] = v; });
      else if (a === 'td') {
        const cu = DM.nhomTd[+i], nv = String(v).trim();
        if (!nv || nv === cu || DM.nhomTd.includes(nv)) { ve(el, ctx); return; }
        dmSua(() => { DM.nhomTd[+i] = nv; DM.loaiCn.forEach((x) => { if (x.nhomTd === cu) x.nhomTd = nv; }); doiTen('td', cu, nv); });
      } else if (a === 'lich') daSua((p) => { const x = p.lich[+i]; x[f] = v; if (f === 'kieu') x.tyLe = v === 'nghi' ? 0 : (x.tyLe || 0.5); });
    };
  }

  App.dangKy({ id: 'danh-muc', tab: 'kh', nhom: 'caidat', ten:'Danh mục', icon: '📋', thuTu: 4, ve });
})();
