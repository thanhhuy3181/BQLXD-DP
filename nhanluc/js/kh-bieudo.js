/* Kế hoạch › Biểu đồ nhân lực */
(function () {
  'use strict';
  const st = { sub: 'nt', cap: 'td', hs: true, cn: null, nt: null, ct: null };
  const KG = { tuan: 'tuần', thang: 'tháng', quy: 'quý', nam: 'năm' };

  App.dangKy({
    id: 'bieudo', tab: 'kh', ten: 'Biểu đồ nhân lực', tenNgan: 'Biểu đồ', icon: '📈', thuTu: 6,
    ve(el, ctx) {
      const { Store, duAnId } = ctx, U = App.ui, esc = U.esc;
      const { data, tuan } = Store.tinh(duAnId), kt = ctx.kieuTg;
      const head = document.createElement('div'); head.className = 'pghead';
      head.innerHTML = '<h2>Biểu đồ nhân lực</h2><div class="sp"></div>';
      head.appendChild(U.seg([[true, 'Sau hệ số'], [false, 'Gốc']], st.hs, (v) => { st.hs = v; App.ve(); }));
      el.appendChild(head);
      el.appendChild(U.pills([['nt', 'Theo nhà thầu'], ['cn', 'Theo loại công nhân'], ['ntcn', 'Nhà thầu → loại CN'], ['ct', 'Theo công trình']], st.sub, (v) => { st.sub = v; App.ve(); }));
      const body = document.createElement('div'); el.appendChild(body);
      const card = (t, inner) => { const c = document.createElement('div'); c.className = 'card'; c.innerHTML = (t ? `<h3>${t}<small>người/ngày · theo ${KG[kt]}${st.hs ? ' · sau hệ số' : ' · gốc'}</small></h3>` : '') + (inner || ''); body.appendChild(c); return c; };
      const chartMa = (tieuDe, ch, cao) => {
        const c = card(tieuDe, '<div class="cb"></div><div class="mt" style="margin-top:12px"></div>');
        U.stack(c.querySelector('.cb'), ch, cao || 'lg');
        c.querySelector('.mt').innerHTML = U.ma(ch.labels, ch.ds);
      };
      const tenCt = (k) => k;

      if (st.sub === 'nt') {
        const nt = U.nhaThau(duAnId, st.hs);
        chartMa('Theo nhà thầu', U.chuoi(tuan, nt.series, kt, ['Nhà thầu khác']));
      } else if (st.sub === 'ct') {
        const kq = Store.bieuDo(duAnId, 'ct', null, st.hs);
        chartMa('Theo công trình', U.chuoi(tuan, Object.keys(kq.nhom).map((k) => ({ ten: tenCt(k), arr: kq.nhom[k] })), kt));
      } else if (st.sub === 'cn') {
        const map = Store.loaiCnMap();
        const kq = Store.bieuDo(duAnId, st.cap, null, st.hs);
        const items = Object.keys(kq.nhom).map((k) => ({ k, ten: st.cap === 'cn' ? U.nhanLoai(k) : k, arr: kq.nhom[k], ...U.tomTat(tuan, kq.nhom[k]) })).filter((x) => x.cong > 0).sort((a, b) => b.cong - a.cong);
        const c = card('', '');
        const bar = document.createElement('div'); bar.className = 'pghead';
        bar.innerHTML = '<b>Mức xem:</b>';
        bar.appendChild(U.seg([['td', 'Nhóm theo dõi'], ['cn', 'Loại chi tiết']], st.cap, (v) => { st.cap = v; st.cn = null; App.ve(); }));
        c.appendChild(bar);
        const g = document.createElement('div'); g.className = 'cards';
        g.innerHTML = items.map((x) => `<div class="mini ${x.k === st.cn ? 'on' : ''}" data-k="${esc(x.k)}"><b>${esc(x.ten)}</b>${U.spark(x.arr)}<small>Đỉnh ${App.so(x.dinh, 0)} · Tổng ${App.so(x.cong, 0)} công</small></div>`).join('') || '<p class="trong">Chưa có dữ liệu.</p>';
        g.onclick = (e) => { const m = e.target.closest('.mini'); if (m) { st.cn = m.dataset.k; App.ve(); } };
        c.appendChild(g);
        if (st.cn && items.some((x) => x.k === st.cn)) {
          const set = new Set(st.cap === 'cn' ? [st.cn] : Object.keys(map).filter((id) => (map[id].nhomTd || 'Khác') === st.cn));
          const nt = U.nhaThau(duAnId, st.hs, null, set);
          const ten = st.cap === 'cn' ? U.nhanLoai(st.cn) : st.cn;
          chartMa(`${esc(ten)} — theo nhà thầu`, U.chuoi(tuan, nt.series, kt, ['Nhà thầu khác']), '');
        } else card('', '<p class="trong">Chọn một thẻ để xem chi tiết theo nhà thầu.</p>');
      } else { // ntcn
        const dsNt = [...new Set(data.viec.map((v) => v.nt))].sort();
        if (!st.nt || !dsNt.includes(st.nt)) st.nt = dsNt.find((n) => n[0] !== '(') || dsNt[0];
        const c = card('', '');
        const bar = document.createElement('div'); bar.className = 'pghead';
        bar.innerHTML = '<b>Nhà thầu:</b><select class="sel">' + dsNt.map((n) => `<option ${n === st.nt ? 'selected' : ''}>${esc(n)}</option>`).join('') + '</select>';
        bar.querySelector('select').onchange = (e) => { st.nt = e.target.value; App.ve(); };
        c.appendChild(bar);
        const kq = Store.bieuDo(duAnId, 'cn', { nt: st.nt }, st.hs);
        const ch = U.chuoi(tuan, Object.keys(kq.nhom).map((k) => ({ ten: U.nhanLoai(k), arr: kq.nhom[k] })), kt);
        if (!ch.ds.length) card('', '<p class="trong">Nhà thầu này chưa có nhân lực.</p>');
        else chartMa(`${esc(st.nt)} — theo loại công nhân`, ch);
      }
    },
  });
})();
