/* Kế hoạch › Tổng quan */
(function () {
  'use strict';
  const ui = () => App.ui, esc = (s) => App.ui.esc(s);
  App.dangKy({
    id: 'tongquan', tab: 'kh', ten: 'Tổng quan', icon: '📊', thuTu: 1,
    ve(el, ctx) {
      const { Store, E, duAnId } = ctx, U = ui();
      const { data, tuan } = Store.tinh(duAnId), da = Store.state.org.duAn.find((d) => d.id === duAnId);
      const nt = U.nhaThau(duAnId, true), tong = Store.bieuDo(duAnId, 'nt').tong;
      const ts = U.tomTat(tuan, tong);
      const cn = Store.bieuDo(duAnId, 'cn'), soCn = Object.keys(cn.nhom).filter((k) => cn.nhom[k].some((x) => x > 0)).length;
      const soNt = new Set(data.viec.map((v) => v.nt)).size;
      const bd = tuan[0].bd, kt = tuan[tuan.length - 1].kt - 1;
      el.innerHTML = `<div class="pghead"><h2>Tổng quan · ${esc(da ? da.ten : '')}</h2></div>
      <div class="kpis">
        <div class="kpi hi"><div class="l">Đỉnh nhân lực</div><div class="n">${App.so(ts.dinh, 0)}</div><div class="s">người/ngày · ${App.ngay(ts.ngay)}</div></div>
        <div class="kpi"><div class="l">Tổng công</div><div class="n">${App.so(ts.cong, 0)}</div><div class="s">công</div></div>
        <div class="kpi"><div class="l">Đầu việc tính</div><div class="n">${App.so(data.viec.length, 0)}</div><div class="s">dòng tiến độ</div></div>
        <div class="kpi"><div class="l">Loại CN dùng</div><div class="n">${soCn}</div><div class="s">loại công nhân</div></div>
        <div class="kpi"><div class="l">Nhà thầu</div><div class="n">${soNt}</div><div class="s">đơn vị</div></div>
        <div class="kpi"><div class="l">Thời gian</div><div class="n">${App.so((kt - bd) / 30.4, 0)} tháng</div><div class="s">${App.ngay(E.ds(bd))} → ${App.ngay(E.ds(kt))}</div></div>
      </div>
      <div class="card"><h3>Nhân lực theo nhà thầu<small>người/ngày · theo ${{ tuan: 'tuần', thang: 'tháng', quy: 'quý', nam: 'năm' }[ctx.kieuTg]}</small></h3><div id="tq-ch"></div></div>
      <div class="grid2"><div class="card"><h3>Top 8 nhóm CN theo dõi</h3><div id="tq-td"></div></div><div class="card"><h3>Cảnh báo dữ liệu</h3><div id="tq-cb"></div></div></div>`;
      U.stack(el.querySelector('#tq-ch'), U.chuoi(tuan, nt.series, ctx.kieuTg, ['Nhà thầu khác']), 'lg');
      // top nhóm theo dõi
      const td = Store.bieuDo(duAnId, 'td'), mx = {};
      const rows = Object.keys(td.nhom).map((k) => ({ k, ...U.tomTat(tuan, td.nhom[k]), arr: td.nhom[k] })).sort((a, b) => b.cong - a.cong).slice(0, 8);
      const maxC = rows.length ? rows[0].cong : 1;
      el.querySelector('#tq-td').innerHTML = '<table class="t"><thead><tr><th>Nhóm</th><th></th><th>Đỉnh</th><th>Tổng công</th></tr></thead><tbody>' +
        rows.map((r) => `<tr><td>${esc(r.k)}</td><td style="width:90px"><div class="hbar" style="width:${(r.cong / maxC * 100).toFixed(0)}%"></div></td><td>${App.so(r.dinh, 0)}</td><td>${App.so(r.cong, 0)}</td></tr>`).join('') + '</tbody></table>';
      // cảnh báo
      const cb = E.canhBao(data), gr = {};
      cb.forEach((c) => (gr[c.loi.replace(/: .*/, '')] = gr[c.loi.replace(/: .*/, '')] || []).push(c));
      const host = el.querySelector('#tq-cb');
      if (!cb.length) host.innerHTML = '<p class="trong">Không có cảnh báo.</p>';
      else host.innerHTML = Object.keys(gr).map((k) => `<details><summary><span class="chip ${/Cần nhập|Chưa/.test(k) ? 'w' : 'e'}">${gr[k].length}</span>${esc(k)}</summary><div class="scroll" style="max-height:220px"><table class="t"><tbody>${gr[k].slice(0, 200).map((c) => `<tr><td>Dòng ${c.r}</td><td style="white-space:normal">${esc(c.ten)}</td></tr>`).join('')}</tbody></table></div></details>`).join('');
    },
  });
})();
