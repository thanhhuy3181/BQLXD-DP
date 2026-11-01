/* Kế hoạch › Định mức — (A) định mức CN ban hành (cố định), (B) định mức công trình tùy chỉnh theo dự án. */
(function () {
  'use strict';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const num = (v) => typeof v === 'number' && isFinite(v);
  const S = { q: '', ct: '', limit: 100, daId: null };
  let pos = null;

  if (!document.getElementById('khdm-css')) {
    const st = document.createElement('style'); st.id = 'khdm-css';
    st.textContent = `
.khdm h3{margin:14px 0 6px;font-size:15px}.khdm .m{color:var(--mut);font-size:12px}
.khdm table{border-collapse:collapse;font-size:12.5px;width:100%;background:var(--card)}
.khdm th{background:var(--head);color:var(--mut);text-align:left;padding:5px 6px;border-bottom:1px solid var(--line);position:sticky;top:0}
.khdm td{padding:3px 6px;border-bottom:1px solid var(--line);vertical-align:top}
.khdm input,.khdm select,.khdm button{font:inherit;padding:3px 6px;border:1px solid var(--line);border-radius:6px;background:var(--card);color:var(--ink)}
.khdm input.v{width:70px;text-align:right}.khdm button{cursor:pointer}
.khdm .box{max-height:420px;overflow:auto;border:1px solid var(--line);border-radius:8px}
.khdm .bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:6px}
.khdm .chip{display:inline-flex;align-items:center;gap:4px;margin:2px 6px 2px 0;padding:2px 6px;border:1px solid var(--line);border-radius:14px;background:var(--head)}
.khdm .b{font-size:10px;padding:0 5px;border-radius:8px;color:#fff;background:#0f766e}.khdm .b.r{background:#b45309}
.khdm .x{border:0;background:none;color:#b91c1c;padding:0 2px}`;
    document.head.appendChild(st);
  }

  function ve(el, ctx) {
    const { Store } = ctx, id = ctx.duAnId, sua = ctx.coSua, DM = Store.state.danhMuc;
    if (S.daId !== id) { S.daId = id; S.q = S.ct = ''; S.limit = 100; }
    const admin = Store.nguoi().vaiTro === 'quanTriKhoi';
    const rows = Store.da(id).rows, lm = Store.loaiCnMap(), chuan = DM.dmChuan || {};
    const dmSua = (fn) => { fn(); Store._cache = {}; Store.save(); Store.emit('doi'); };
    const sd = (fn) => { const w = el.querySelector('.box.b2'); pos = { y: window.scrollY, w: w ? w.scrollTop : 0, p: el.parentElement ? el.parentElement.scrollTop : 0 }; Store.suaDuAn(id, fn); };
    const parse = (s) => { s = String(s).trim().replace(',', '.'); const n = parseFloat(s); return s !== '' && isFinite(n) ? n : null; };

    // ---- Khối A ----
    const dis = admin ? '' : ' disabled';
    const A = DM.dmCn.map((x, i) => `<tr><td>${esc(x.ten)}</td><td>${esc(x.nhom || '')}</td><td>${esc(x.dv || '')}</td>
      <td><input class="v" data-a="${i}" data-f="kl_cong" value="${x.kl_cong == null ? '' : x.kl_cong}"${dis}></td>
      <td><input class="v" data-a="${i}" data-f="hs_tang_ca" value="${x.hs_tang_ca == null ? '' : x.hs_tang_ca}"${dis}></td>
      <td><input class="v" data-a="${i}" data-f="dm_ngay" value="${x.dm_ngay == null ? '' : x.dm_ngay}"${dis}></td><td class="m">${esc(x.ghi_chu || '')}</td></tr>`).join('');

    // ---- Khối B ----
    const cts = rows.filter((r) => r.cap === 3);
    const q = S.q.trim().toLowerCase();
    let inCt = !S.ct, ds = [];
    for (const r of rows) {
      if (r.cap === 3) inCt = !S.ct || String(r.r) === S.ct;
      if (inCt && r.tinh && (!q || r.ten.toLowerCase().includes(q))) ds.push(r);
    }
    const tenCn = (cid) => (lm[cid] ? lm[cid].ten : cid);
    const hang = ds.slice(0, S.limit).map((r) => {
      const chips = Object.keys(r.dm || {}).map((cid) => {
        const v = r.dm[cid], std = chuan[cid], dung = num(std) && v === std, dv = lm[cid] ? lm[cid].loai_dm : '';
        return `<span class="chip" title="${esc(dv)}">${esc(tenCn(cid))} <input class="v" data-r="${esc(r.r)}" data-c="${esc(cid)}" value="${v == null ? '' : v}"${sua ? '' : ' disabled'}>
          <span class="b${dung ? '' : ' r'}">${dung ? 'ĐM chuẩn' : 'ĐM riêng'}</span>${sua ? `<button class="x" data-rm="${esc(r.r)}|${esc(cid)}" title="Bỏ loại CN">✕</button>` : ''}</span>`;
      }).join('');
      return `<tr><td>${esc(r.ten)}</td><td>${esc(r.dv || '')}</td><td>${chips || '<span class="m">chưa có</span>'}${sua ? ` <input list="khdm-cn" data-add="${esc(r.r)}" placeholder="+ loại CN" size="14">` : ''}</td>
        <td>${sua ? `<button data-rs="${esc(r.r)}" title="Khôi phục định mức chuẩn / theo mẫu">Khôi phục mẫu</button>` : ''}</td></tr>`;
    }).join('');

    el.innerHTML = `<div class="khdm">
      <h3>A. Định mức công nhân (ban hành – cố định) ${admin ? '' : '🔒'}</h3>
      <div class="m">${admin ? 'Quản trị Khối được sửa. Sửa KL/công hoặc HS tăng ca sẽ co giãn ĐM/ngày tương ứng.' : 'Chỉ Quản trị Khối được chỉnh sửa.'}</div>
      <div class="box" style="max-height:300px"><table><thead><tr><th>Tên</th><th>Nhóm</th><th>ĐV</th><th>KL/công 8h</th><th>HS tăng ca</th><th>ĐM/ngày</th><th>Ghi chú</th></tr></thead><tbody>${A}</tbody></table></div>
      <h3>B. Định mức công trình (tùy chỉnh theo dự án)</h3>
      <div class="bar"><select data-f="ct"><option value="">Tất cả công trình</option>${cts.map((r) => `<option value="${esc(r.r)}"${String(r.r) === S.ct ? ' selected' : ''}>${esc(r.ten)}</option>`).join('')}</select>
        <input data-f="q" placeholder="Tìm việc..." value="${esc(S.q)}"><span class="m">${ds.length} việc</span>
        ${sua ? '<button data-all>Khôi phục mẫu (tất cả việc đang lọc)</button>' : ''}</div>
      <datalist id="khdm-cn">${DM.loaiCn.map((t) => `<option value="${esc(t.ten)}">`).join('')}</datalist>
      <div class="box b2"><table><thead><tr><th style="width:30%">Việc</th><th>ĐV</th><th>Loại CN & định mức/ngày</th><th></th></tr></thead><tbody>${hang}</tbody></table></div>
      ${ds.length > S.limit ? `<button data-more style="margin-top:6px">Hiện thêm 100 việc (còn ${ds.length - S.limit})</button>` : ''}</div>`;

    const lay = (d, k) => d.rows.find((x) => String(x.r) === k);
    const khoiPhuc = (d, r) => {
      const m = r.mau && window.MAU_CT && window.MAU_CT.mau.find((x) => x.id === r.mau), v = m && m.viec.find((x) => x.ten === r.ten);
      const ids = v ? v.cn : Object.keys(r.dm || {}), dm = {};
      ids.forEach((cid) => { if (num(chuan[cid])) dm[cid] = chuan[cid]; else if (r.dm && num(r.dm[cid])) dm[cid] = r.dm[cid]; });
      r.dm = dm;
    };

    // Khối A: sửa
    el.querySelectorAll('input[data-a]').forEach((inp) => (inp.onchange = () => {
      if (!admin) return;
      const x = DM.dmCn[+inp.dataset.a], f = inp.dataset.f, v = parse(inp.value);
      dmSua(() => {
        const cu = (x.kl_cong || 0) * (x.hs_tang_ca || 0);
        x[f] = v;
        if (f !== 'dm_ngay' && cu && num(x.dm_ngay) && v != null) x.dm_ngay = +(x.dm_ngay * ((x.kl_cong || 0) * (x.hs_tang_ca || 0)) / cu).toPrecision(6);
      });
    }));
    // Khối B: lọc & thao tác
    el.querySelector('[data-f=ct]').onchange = (e) => { S.ct = e.target.value; S.limit = 100; ve(el, ctx); };
    el.querySelector('[data-f=q]').oninput = (e) => {
      S.q = e.target.value; S.limit = 100; const p = e.target.selectionStart; ve(el, ctx);
      const n = el.querySelector('[data-f=q]'); n.focus(); n.setSelectionRange(p, p);
    };
    el.onchange = (e) => {
      const t = e.target;
      if (!sua) return;
      if (t.dataset.c != null) { const v = parse(t.value); sd((d) => { const r = lay(d, t.dataset.r); if (r) { if (v == null) delete r.dm[t.dataset.c]; else r.dm[t.dataset.c] = v; } }); }
      else if (t.dataset.add != null) {
        const l = DM.loaiCn.find((x) => x.ten === t.value.trim()); if (!l) return;
        sd((d) => { const r = lay(d, t.dataset.add); if (r && !(l.id in r.dm)) r.dm[l.id] = num(chuan[l.id]) ? chuan[l.id] : 1; });
      }
    };
    el.onclick = (e) => {
      const t = e.target.closest('button'); if (!t || !sua) { return; }
      if (t.dataset.rm != null) { const [k, c] = t.dataset.rm.split('|'); sd((d) => { const r = lay(d, k); if (r) delete r.dm[c]; }); }
      else if (t.dataset.rs != null) sd((d) => { const r = lay(d, t.dataset.rs); if (r) khoiPhuc(d, r); });
      else if (t.dataset.all != null) { if (confirm(`Khôi phục định mức chuẩn cho ${ds.length} việc đang lọc?`)) { const ks = new Set(ds.map((r) => String(r.r))); sd((d) => d.rows.forEach((r) => { if (ks.has(String(r.r))) khoiPhuc(d, r); })); } }
      else if (t.dataset.more != null) { S.limit += 100; ve(el, ctx); }
    };
    if (!sua) { const mb = el.querySelector('[data-more]'); if (mb) mb.onclick = () => { S.limit += 100; ve(el, ctx); }; }
    if (pos) { const p = pos; pos = null; requestAnimationFrame(() => { const w = el.querySelector('.box.b2'); if (w) w.scrollTop = p.w; if (el.parentElement) el.parentElement.scrollTop = p.p; window.scrollTo(window.scrollX, p.y); }); }
  }

  App.dangKy({ id: 'dinh-muc', tab: 'kh', nhom: 'caidat', ten: 'Định mức', icon: '📐', thuTu: 3, ve });
})();
