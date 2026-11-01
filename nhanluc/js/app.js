/* Lõi ứng dụng: đăng ký màn hình, ngữ cảnh chung, vẽ lại. Giao diện khung (menu, cây dự án, tab) ở js/shell.js.
 *
 * Mỗi màn hình là 1 file js/<tab>-<ten>.js gọi:
 *   App.dangKy({ id, tab: 'kh'|'tt', ten, icon, thuTu, ve(el, ctx) })
 * ctx = { duAnId, quyen ('sua'|'nhap'|'xem'), coSua, kieuTg ('tuan'|'thang'|'quy'|'nam'), Store, E (engine), tab }
 * Màn hình tự vẽ toàn bộ vào el; khi dữ liệu đổi, App gọi lại ve().
 */
(function () {
  'use strict';
  const fmt0 = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 });
  const fmt1 = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 });
  const fmt2 = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 });
  const App = {
    manHinh: [],
    trangThai: { tab: 'kh', manHinh: null, duAnId: null, kieuTg: 'thang' },
    dangKy(m) { this.manHinh.push(m); this.manHinh.sort((a, b) => (a.thuTu || 99) - (b.thuTu || 99)); },
    dsManHinh(tab) { return this.manHinh.filter((m) => m.tab === tab); },
    /** Màn hiện trên menu (màn có nhom:'caidat' nằm trong màn Cài đặt) */
    dsMenu(tab) { return this.manHinh.filter((m) => m.tab === tab && !m.nhom); },
    /** Màn con của Cài đặt (mọi tab) */
    dsCaiDat() { return this.manHinh.filter((m) => m.nhom === 'caidat'); },
    ctx() {
      const t = this.trangThai, q = Store.quyen(t.duAnId);
      return { duAnId: t.duAnId, quyen: q, coSua: q === 'sua', kieuTg: t.kieuTg, tab: t.tab, Store, E: window.BDNL };
    },
    chon(patch) { Object.assign(this.trangThai, patch); try { localStorage.setItem('bdnl.ui', JSON.stringify(this.trangThai)); } catch (e) { /* bỏ qua */ } this.ve(); },
    /** shell.js gán hàm này: vẽ khung rồi gọi App.veManHinh(el) */
    ve() { if (this.veKhung) this.veKhung(); },
    veManHinh(el) {
      const t = this.trangThai, ds = this.dsMenu(t.tab);
      const m = ds.find((x) => x.id === t.manHinh) || ds[0];
      if (!m) { el.innerHTML = '<p class="trong">Chưa có màn hình.</p>'; return; }
      t.manHinh = m.id;
      if (!t.duAnId) { el.innerHTML = '<p class="trong">Chọn dự án ở cây bên trái.</p>'; return; }
      el.innerHTML = '';
      try { m.ve(el, this.ctx()); } catch (e) { console.error(e); el.innerHTML = `<pre class="loi">Lỗi màn hình ${m.ten}: ${e.message}</pre>`; }
    },
    // ---- tiện ích dùng chung ----
    so(n, chuSo) { if (n == null || isNaN(n)) return ''; return (chuSo === 0 ? fmt0 : chuSo === 2 ? fmt2 : fmt1).format(n); },
    ngay(s) { return s ? s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4) : ''; },
    thongBao(msg, loai) { if (this.veThongBao) this.veThongBao(msg, loai); else alert(msg); },
    /** Gộp chuỗi tuần theo kiểu thời gian đang chọn → [{nhan, tb, dinh, cong}] */
    gop(tuan, arr, kieu) { return window.BDNL.gop(tuan, arr, kieu || this.trangThai.kieuTg); },
    mau(i) { const P = ['#0f766e', '#1d4ed8', '#b45309', '#7c3aed', '#be123c', '#047857', '#4338ca', '#a16207', '#0e7490', '#9d174d', '#15803d', '#c2410c', '#6d28d9', '#334155']; return P[i % P.length]; },
  };
  window.App = App;
  try { Object.assign(App.trangThai, JSON.parse(localStorage.getItem('bdnl.ui') || '{}')); } catch (e) { /* bỏ qua */ }
})();
