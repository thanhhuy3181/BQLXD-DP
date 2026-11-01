/* Kế hoạch › Tiến độ & khối lượng — lưới WBS kiểu Excel (sửa tại chỗ, thu gọn nhóm, Gantt mini, dán từ Excel). */
(function () {
  'use strict';
  const E = window.BDNL;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const num = (v) => (typeof v === 'number' && isFinite(v));
  const so = (n, c) => (window.App ? App.so(n, c) : String(n == null ? '' : n));
  const F = { ct: '', nt: '', cb: false, q: '', limit: 200, sel: null, dong: new Set(), daId: null };
  let pos = null;

  if (!document.getElementById('khtd-css')) {
    const st = document.createElement('style'); st.id = 'khtd-css';
    st.textContent = `
.khtd-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:8px}
.khtd-bar input,.khtd-bar select,.khtd-bar button,.khtd-paste textarea{font:inherit;padding:4px 8px;border:1px solid var(--line);border-radius:6px;background:var(--card);color:var(--ink)}
.khtd-bar button{cursor:pointer}.khtd-bar button.p{background:var(--teal);color:#fff;border-color:transparent}
.khtd-wrap{overflow:auto;max-height:calc(100vh - 230px);border:1px solid var(--line);border-radius:8px;background:var(--card)}
.khtd-t{border-collapse:collapse;font-size:12.5px;width:100%;min-width:1280px}
.khtd-t th{position:sticky;top:0;z-index:2;background:var(--head);color:var(--mut);text-align:left;padding:5px 6px;border-bottom:1px solid var(--line);white-space:nowrap}
.khtd-t td{padding:2px 6px;border-bottom:1px solid var(--line);white-space:nowrap;height:24px}
.khtd-t td.n{text-align:right;font-variant-numeric:tabular-nums}
.khtd-t td.e{cursor:text}.khtd-t td.e:hover{background:rgba(15,118,110,.08)}
.khtd-t td input{width:100%;box-sizing:border-box;font:inherit;padding:1px 3px;min-width:70px}
.khtd-t tr.g td{background:var(--head);font-weight:600}
.khtd-t tr.sel td{outline:1px solid var(--teal);outline-offset:-1px}
.khtd-t td.nm{max-width:420px;overflow:hidden;text-overflow:ellipsis}
.khtd-tg{cursor:pointer;display:inline-block;width:14px;color:var(--mut)}
.khtd-cb{color:#b91c1c;font-size:11px;max-width:220px;overflow:hidden;text-overflow:ellipsis}
.khtd-flag{color:#b45309;font-size:10px;border:1px solid #b45309;border-radius:4px;padding:0 3px;margin-left:3px}
.khtd-g{position:relative;width:170px;height:12px;background:rgba(120,130,140,.12);border-radius:3px}
.khtd-g i{position:absolute;top:2px;height:8px;border-radius:2px;background:var(--teal)}
.khtd-g.gr i{background:#64748b}
.khtd-x{cursor:pointer;color:#b91c1c;border:0;background:none}
.khtd-paste{margin-bottom:8px;display:none}.khtd-paste.m{display:block}.khtd-paste textarea{width:100%;height:110px;box-sizing:border-box}
.khtd-more{margin:8px 0}`;
    document.head.appendChild(st);
  }

  const parseNum = (s) => {
    s = String(s).trim().replace(/\s/g, ''); if (s === '') return null;
    if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.'); else s = s.replace(',', '.');
    const n = parseFloat(s); return isFinite(n) ? n : null;
  };
  const parseNgay = (s) => {
    s = String(s || '').trim(); let m;
    if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    if ((m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/))) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    return null;
  };
  const ok2000 = (d) => d != null && d > E.dn('2000-01-01');

  function ve(el, ctx) {
    const { Store } = ctx, id = ctx.duAnId, sua = ctx.coSua;
    if (F.daId !== id) { F.daId = id; F.ct = F.nt = F.q = ''; F.cb = false; F.limit = 200; F.sel = null; F.dong = new Set(); }
    const rows = Store.da(id).rows;
    let viec = new Map(), cbao = new Map();
    try {
      const data = Store.tinh(id).data;
      data.viec.forEach((v) => viec.set(String(v.src.r), v));
      E.canhBao(data).forEach((c) => { const k = String(c.r); (cbao.get(k) || cbao.set(k, []).get(k)).push(c.loi); });
    } catch (e) { /* chưa đủ dữ liệu ngày */ }
    const cts = rows.filter((r) => r.cap === 3);
    const nts = [...new Set(rows.filter((r) => r.tinh && r.nt).map((r) => r.nt))].sort();
    const ntAll = Store.state.danhMuc.nhaThau.map((n) => n.ten);
    // khoảng thời gian Gantt
    let g0 = Infinity, g1 = -Infinity;
    for (const r of rows) { const a = E.dn(r.bd), b = E.dn(r.kt); if (ok2000(a) && b != null) { g0 = Math.min(g0, a); g1 = Math.max(g1, b); } }
    const gSpan = Math.max(1, g1 - g0);

    el.innerHTML = `<div class="khtd-bar">
      <select data-f="ct"><option value="">Tất cả công trình</option>${cts.map((r) => `<option value="${esc(r.r)}"${String(r.r) === F.ct ? ' selected' : ''}>${esc(r.ten)}</option>`).join('')}</select>
      <select data-f="nt"><option value="">Tất cả nhà thầu</option>${nts.map((n) => `<option${n === F.nt ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select>
      <label><input type="checkbox" data-f="cb"${F.cb ? ' checked' : ''}> Chỉ việc có cảnh báo</label>
      <input data-f="q" placeholder="Tìm tên việc..." value="${esc(F.q)}">
      <select data-f="cap" title="Mở đến cấp"><option value="">Mở/thu gọn…</option><option value="3">Chỉ đến cấp 3</option><option value="4">Đến cấp 4</option><option value="5">Đến cấp 5</option><option value="6">Đến cấp 6</option><option value="9">Mở tất cả</option></select>
      <span class="khtd-info" style="color:var(--mut)"></span>
      ${sua ? '<button data-a="addv">+ Việc</button><button data-a="addg">+ Nhóm</button><button data-a="paste">Dán từ Excel</button>' : ''}
    </div>
    <div class="khtd-paste"><div style="margin-bottom:4px;color:var(--mut)">Cột (phân cách Tab): Tên | Nhà thầu | Bắt đầu | Kết thúc | KL | ĐV. Chèn vào cuối nhóm đang chọn (bấm vào 1 dòng nhóm).</div>
      <textarea placeholder="Dán từ Excel..."></textarea><div class="khtd-bar"><button class="p" data-a="paste-ok">Chèn</button><button data-a="paste">Đóng</button></div></div>
    <datalist id="khtd-nt">${ntAll.map((n) => `<option value="${esc(n)}">`).join('')}</datalist>
    <div class="khtd-wrap"><div class="khtd-body"></div></div><div class="khtd-more"></div>`;
    const body = el.querySelector('.khtd-body'), more = el.querySelector('.khtd-more');

    function hienThi() {
      const loc = F.ct || F.nt || F.cb || F.q, q = F.q.trim().toLowerCase(), show = new Array(rows.length).fill(false);
      let inCt = !F.ct, stack = [];
      rows.forEach((r, i) => {
        if (r.cap === 3) inCt = !F.ct || String(r.r) === F.ct;
        if (!inCt) return;
        while (stack.length && rows[stack[stack.length - 1]].cap >= r.cap) stack.pop();
        if (!loc) { show[i] = true; if (!r.tinh) stack.push(i); return; }
        if (r.tinh) {
          const m = (!F.nt || r.nt === F.nt) && (!F.cb || cbao.has(String(r.r))) && (!q || r.ten.toLowerCase().includes(q));
          if (m) { show[i] = true; stack.forEach((j) => (show[j] = true)); }
        } else { stack.push(i); if (q && !F.nt && !F.cb && r.ten.toLowerCase().includes(q)) { show[i] = true; stack.forEach((j) => (show[j] = true)); } }
      });
      if (!loc) { // áp dụng thu gọn
        let lv = null;
        rows.forEach((r, i) => {
          if (!show[i]) return;
          if (lv != null && r.cap > lv) { show[i] = false; return; }
          lv = null;
          if (!r.tinh && F.dong.has(String(r.r))) lv = r.cap;
        });
      }
      const out = []; show.forEach((s, i) => s && out.push(i)); return out;
    }

    function ve1() {
      const idx = hienThi(), cut = idx.slice(0, F.limit), cell = (r, f, t, v, txt, cls) => `<td class="${cls || 'n'}${sua ? ' e' : ''}" data-r="${esc(r.r)}" data-f="${f}" data-t="${t}">${txt}</td>`;
      let h = `<table class="khtd-t"><thead><tr><th>STT</th><th>Tên việc</th><th>Nhà thầu</th><th>Bắt đầu</th><th>Kết thúc</th><th>Ngày</th><th>Căn LK</th><th>KL/căn</th><th>Căn ĐL</th><th>KL/căn</th><th>KL tổng</th><th>ĐV</th><th>Tính</th><th>NC/ngày</th><th>Cảnh báo</th><th>Gantt</th><th></th></tr></thead><tbody>`;
      for (const i of cut) {
        const r = rows[i], k = String(r.r), v = viec.get(k), leaf = !!r.tinh, cb = cbao.get(k);
        const nc = v ? Object.values(v.nc).reduce((a, b) => a + b, 0) : 0;
        const a = E.dn(r.bd), b = E.dn(r.kt);
        const gantt = ok2000(a) && b != null && b >= a ? `<div class="khtd-g${leaf ? '' : ' gr'}"><i style="left:${((a - g0) / gSpan * 100).toFixed(2)}%;width:${Math.max(0.6, (b - a) / gSpan * 100).toFixed(2)}%"></div></div>` : '';
        let flag = '';
        if (leaf && num(r.kl)) { const c = E.klTheoCan(r); if (c > 0 && Math.abs(c - r.kl) > 1e-6 * Math.max(1, c)) flag = `<span class="khtd-flag" title="KL theo căn = ${so(c, 2)}; đang dùng KL nhập tay">≠căn</span>`; }
        const tg = leaf ? '<span class="khtd-tg"></span>' : `<span class="khtd-tg" data-tg="${esc(k)}">${F.dong.has(k) ? '▸' : '▾'}</span>`;
        h += `<tr class="${leaf ? '' : 'g'}${F.sel === k ? ' sel' : ''}" data-k="${esc(k)}"><td>${i + 1}</td>
          <td class="nm${sua ? ' e' : ''}" data-r="${esc(k)}" data-f="ten" data-t="s" style="padding-left:${(Math.max(0, r.cap - 2)) * 12 + 4}px" title="${esc(r.ten)}">${tg}${esc(r.ten)}</td>
          ${cell(r, 'nt', 's', r.nt, esc(r.nt || ''), '')}${cell(r, 'bd', 'd', r.bd, esc(App.ngay(r.bd)), '')}${cell(r, 'kt', 'd', r.kt, esc(App.ngay(r.kt)), '')}
          <td class="n">${leaf && v && v.ngay != null ? v.ngay : ''}</td>
          ${cell(r, 'can_lk', 'n', r.can_lk, num(r.can_lk) ? so(r.can_lk, 0) : '')}${leaf ? cell(r, 'kl_lk', 'n', r.kl_lk, num(r.kl_lk) ? so(r.kl_lk, 2) : '') : '<td></td>'}
          ${cell(r, 'can_dl', 'n', r.can_dl, num(r.can_dl) ? so(r.can_dl, 0) : '')}${leaf ? cell(r, 'kl_dl', 'n', r.kl_dl, num(r.kl_dl) ? so(r.kl_dl, 2) : '') : '<td></td>'}
          ${leaf ? cell(r, 'kl', 'n', r.kl, so(E.khoiLuong(r), 1) + flag) : '<td></td>'}${leaf ? cell(r, 'dv', 's', r.dv, esc(r.dv || ''), '') : '<td></td>'}
          <td><input type="checkbox" data-tinh="${esc(k)}"${leaf ? ' checked' : ''}${sua ? '' : ' disabled'}></td>
          <td class="n">${nc ? so(nc, 1) : ''}</td><td class="khtd-cb" title="${esc((cb || []).join('; '))}">${esc([...new Set(cb || [])].join('; '))}</td>
          <td>${gantt}</td><td>${sua ? `<button class="khtd-x" data-del="${esc(k)}" title="Xóa">✕</button>` : ''}</td></tr>`;
      }
      body.innerHTML = h + '</tbody></table>';
      more.innerHTML = idx.length > cut.length ? `<button data-a="more" style="padding:4px 10px">Hiện thêm 200 dòng (còn ${idx.length - cut.length})</button>` : '';
      el.querySelector('.khtd-info').textContent = `${idx.length} dòng`;
    }
    ve1();

    // ---- bộ lọc ----
    el.querySelector('.khtd-bar').addEventListener('input', (e) => {
      const f = e.target.dataset.f; if (!f || f === 'cap') return;
      F[f] = e.target.type === 'checkbox' ? e.target.checked : e.target.value; F.limit = 200; ve1();
    });
    el.querySelector('[data-f=cap]').onchange = (e) => {
      const n = +e.target.value; F.dong = new Set(n === 9 ? [] : rows.filter((r) => !r.tinh && r.cap >= n).map((r) => String(r.r)));
      e.target.value = ''; F.ct = F.nt = F.q = ''; F.cb = false; ve(el, ctx);
    };

    // ---- thao tác ----
    const lay = (d, k) => d.rows.find((x) => String(x.r) === k);
    const moiR = (d) => Math.max(0, ...d.rows.map((x) => +x.r || 0)) + 1;
    const chenVao = (d, selK, ds) => { // chèn vào cuối nhóm / sau dòng
      let at = d.rows.length;
      const i = d.rows.findIndex((x) => String(x.r) === selK);
      if (i >= 0) {
        const s = d.rows[i]; at = i + 1;
        if (!s.tinh) while (at < d.rows.length && d.rows[at].cap > s.cap) at++;
      }
      d.rows.splice(at, 0, ...ds);
    };
    const luuViTri = () => { const w = el.querySelector('.khtd-wrap'); pos = { y: window.scrollY, w: w ? w.scrollTop : 0, p: el.parentElement ? el.parentElement.scrollTop : 0 }; };
    const sd = (fn) => { luuViTri(); Store.suaDuAn(id, fn); };

    function edit(td) {
      const k = td.dataset.r, f = td.dataset.f, t = td.dataset.t, row = rows.find((x) => String(x.r) === k);
      const inp = document.createElement('input'); inp.type = t === 'd' ? 'date' : 'text';
      inp.value = row[f] == null ? '' : row[f]; if (f === 'nt') inp.setAttribute('list', 'khtd-nt');
      if (t === 'n' && f === 'kl' && !num(row.kl)) inp.value = '';
      td.innerHTML = ''; td.appendChild(inp); inp.focus(); inp.select();
      let xong = false;
      const commit = (ghi) => {
        if (xong) return; xong = true;
        if (!ghi) { ve1(); return; }
        let v = inp.value;
        if (t === 'n') v = parseNum(v); else if (t === 'd') v = v || null; else if (f === 'nt' || f === 'dv') v = v.trim() || null; else v = v.trim() || row.ten;
        if (v === row[f] || (v == null && row[f] == null)) { ve1(); return; }
        sd((d) => { const r = lay(d, k); if (r) r[f] = v; });
      };
      inp.onkeydown = (e) => { if (e.key === 'Enter') commit(true); else if (e.key === 'Escape') commit(false); };
      inp.onblur = () => commit(true);
    }

    el.onclick = (e) => {
      const t = e.target, tg = t.closest('[data-tg]');
      if (tg) { const k = tg.dataset.tg; F.dong.has(k) ? F.dong.delete(k) : F.dong.add(k); ve1(); return; }
      const del = t.closest('[data-del]');
      if (del && sua) {
        const k = del.dataset.del, r = rows.find((x) => String(x.r) === k);
        const i = rows.indexOf(r); let n = 1; if (!r.tinh) while (i + n < rows.length && rows[i + n].cap > r.cap) n++;
        if (confirm(`Xóa "${r.ten}"${n > 1 ? ` cùng ${n - 1} dòng con` : ''}?`)) sd((d) => { const j = d.rows.findIndex((x) => String(x.r) === k); d.rows.splice(j, n); });
        return;
      }
      const a = t.closest('[data-a]');
      if (a) {
        const act = a.dataset.a;
        if (act === 'more') { F.limit += 200; ve1(); }
        else if (act === 'paste') el.querySelector('.khtd-paste').classList.toggle('m');
        else if (act === 'addv' || act === 'addg') {
          const s = rows.find((x) => String(x.r) === F.sel);
          if (!s) { App.thongBao('Bấm chọn 1 dòng/nhóm trước để chèn vào.', 'loi'); return; }
          sd((d) => {
            const r = moiR(d), sr = lay(d, F.sel);
            const nr = act === 'addv'
              ? { r, cap: 7, ten: 'Việc mới', nt: sr.nt || null, tinh: true, bd: sr.bd || null, kt: sr.kt || null, can_lk: null, kl_lk: null, can_dl: null, kl_dl: null, kl: null, dv: sr.dv || null, dm: {} }
              : { r, cap: Math.min(6, (sr.tinh ? sr.cap - 1 : sr.cap) + 1), ten: 'Nhóm mới', nt: null, tinh: false, bd: null, kt: null, can_lk: null, kl_lk: null, can_dl: null, kl_dl: null, kl: null, dv: null, dm: {} };
            chenVao(d, F.sel, [nr]); F.sel = String(r);
          });
        } else if (act === 'paste-ok') {
          const s = rows.find((x) => String(x.r) === F.sel);
          if (!s) { App.thongBao('Chọn 1 dòng nhóm (bấm vào dòng) để chèn.', 'loi'); return; }
          const ls = el.querySelector('.khtd-paste textarea').value.split(/\r?\n/).filter((x) => x.trim());
          if (!ls.length) return;
          sd((d) => {
            let r0 = moiR(d);
            const ds = ls.map((l) => { const c = l.split('\t'); return { r: r0++, cap: 7, ten: (c[0] || '').trim() || 'Việc', nt: (c[1] || '').trim() || null, tinh: true, bd: parseNgay(c[2]), kt: parseNgay(c[3]), can_lk: null, kl_lk: null, can_dl: null, kl_dl: null, kl: parseNum(c[4] || ''), dv: (c[5] || '').trim() || null, dm: {} }; });
            chenVao(d, F.sel, ds);
          });
        }
        return;
      }
      const tr = t.closest('tr[data-k]');
      if (tr) {
        if (F.sel !== tr.dataset.k) { const o = body.querySelector('tr.sel'); if (o) o.classList.remove('sel'); tr.classList.add('sel'); F.sel = tr.dataset.k; }
        const td = t.closest('td.e');
        if (sua && td && !td.querySelector('input') && td.dataset.f) edit(td);
      }
    };
    el.onchange = (e) => {
      const k = e.target.dataset.tinh; if (k == null || !sua) return;
      sd((d) => { const r = lay(d, k); if (r) { r.tinh = e.target.checked; if (r.tinh && r.cap < 7) r.cap = 7; } });
    };

    if (pos) { const p = pos; pos = null; requestAnimationFrame(() => { const w = el.querySelector('.khtd-wrap'); if (w) w.scrollTop = p.w; if (el.parentElement) el.parentElement.scrollTop = p.p; window.scrollTo(window.scrollX, p.y); }); }
  }

  App.dangKy({ id: 'tien-do', tab: 'kh', ten: 'Tiến độ & khối lượng', tenNgan: 'TĐ & KL', icon: '📅', thuTu: 2, ve });
})();
