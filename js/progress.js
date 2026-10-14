/**
 * progress.js — Logic for Tiến độ (Progress) screen.
 */
'use strict';

const ProgressState = {
  page: 1,
  pageSize: 50,
  totalPages: 1,
  total: 0,
  search: '',
  sortCol: 'stt',
  sortDir: 'asc',
  items: [],
  debounceTimer: null,
};

window.loadProgress = async function(page) {
  if (page !== undefined) ProgressState.page = page;

  const searchEl = document.getElementById('progress-search');
  if (searchEl) ProgressState.search = searchEl.value.trim();

  const sortEl = document.getElementById('progress-sort');
  if (sortEl) {
    const [col, dir] = sortEl.value.split('|');
    ProgressState.sortCol = col;
    ProgressState.sortDir = dir;
  }

  const psEl = document.getElementById('progress-pagesize');
  if (psEl) ProgressState.pageSize = parseInt(psEl.value, 10);

  setLoading(true);
  try {
    const res = await API.getProgressList({
      page: ProgressState.page,
      pageSize: ProgressState.pageSize,
      search: ProgressState.search,
      sortCol: ProgressState.sortCol,
      sortDir: ProgressState.sortDir,
    });

    if (!res.ok) {
      toast('Lỗi tải dữ liệu Tiến độ: ' + res.error, 'error');
      return;
    }

    const { items, total, total_pages } = res.data;
    ProgressState.items = items;
    ProgressState.total = total;
    const count = document.getElementById('progress-total-count');
    if (count) count.textContent = `${total} gói thầu`;
    ProgressState.totalPages = total_pages;

    _renderProgressTable(items);
    _renderProgressPagination(ProgressState.page, total_pages, total);
    await _updateProgressSummary();
  } catch (err) {
    toast('Lỗi hệ thống: ' + err.message, 'error');
  } finally {
    setLoading(false);
  }
};

window.debounceProgressSearch = function() {
  clearTimeout(ProgressState.debounceTimer);
  ProgressState.debounceTimer = setTimeout(() => {
    ProgressState.page = 1;
    loadProgress();
  }, 250);
};

function _renderProgressTable(items) {
  const tbody = document.getElementById('progress-tbody');
  if (!tbody) return;

  if (!items || items.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="text-center py-12 text-base-content/40">Không tìm thấy tiến độ nào</td></tr>`;
    return;
  }

  tbody.innerHTML = items.map((r, i) => {
    const stt = (ProgressState.page - 1) * ProgressState.pageSize + i + 1;
    let statusBadge = 'badge-ghost';
    const st = (r.trang_thai_hd || '').toLowerCase();
    if (st.includes('hoàn thành') || st.includes('xong')) statusBadge = 'badge-success';
    else if (st.includes('chậm') || st.includes('quá hạn')) statusBadge = 'badge-error';
    else if (st.includes('đang')) statusBadge = 'badge-info';

    return `<tr class="cursor-pointer" ondblclick="showProgressDetail(${i})">
      <td class="text-center text-xs text-base-content/50">${stt}</td>
      <td class="font-mono text-xs font-semibold">${_esc(r.ma_goi_thau || r.id_goi_thau || '—')}</td>
      <td>
        <div class="font-medium text-sm line-clamp-1" title="${_esc(r.ten_goi_thau || '')}">${_esc(r.ten_goi_thau || '—')}</div>
        ${r.hang_muc ? `<div class="text-xs text-base-content/50">${_esc(r.hang_muc)}</div>` : ''}
      </td>
      <td class="text-xs font-medium text-primary">${_esc(r.ten_nha_thau || '—')}</td>
      <td class="text-xs font-mono">${_esc(r.ngay_ph_hsmt || '—')}</td>
      <td class="text-xs font-mono">${_esc(r.ngay_bd_tc_tt || r.ngay_bd_tc || '—')}</td>
      <td class="text-xs font-mono">${_esc(r.ngay_kt_tc || '—')}</td>
      <td>
        ${r.trang_thai_hd ? `<span class="badge badge-sm ${statusBadge}">${_esc(r.trang_thai_hd)}</span>` : '—'}
      </td>
      <td>
        <button class="btn btn-ghost btn-xs" onclick="showProgressDetail(${i})">Chi tiết</button>
      </td>
    </tr>`;
  }).join('');
}

function _renderProgressPagination(page, totalPages, total) {
  const info = document.getElementById('progress-page-info');
  const pag = document.getElementById('progress-pagination');
  if (!info || !pag) return;

  const start = total === 0 ? 0 : (page - 1) * ProgressState.pageSize + 1;
  const end = Math.min(page * ProgressState.pageSize, total);
  info.textContent = `Hiển thị ${start}–${end} / ${total} bản ghi`;

  if (totalPages <= 1) { pag.innerHTML = ''; return; }

  let html = '';
  html += `<button class="join-item btn btn-sm ${page===1?'btn-disabled':''}" onclick="loadProgress(${page-1})">«</button>`;
  const pages = _progressPageRange(page, totalPages);
  let prev = null;
  for (const p of pages) {
    if (prev !== null && p - prev > 1) html += `<button class="join-item btn btn-sm btn-disabled">…</button>`;
    html += `<button class="join-item btn btn-sm ${p===page?'btn-primary':''}" onclick="loadProgress(${p})">${p}</button>`;
    prev = p;
  }
  html += `<button class="join-item btn btn-sm ${page===totalPages?'btn-disabled':''}" onclick="loadProgress(${page+1})">»</button>`;
  pag.innerHTML = html;
}

function _progressPageRange(current, total) {
  const delta = 2;
  const range = [];
  for (let p = Math.max(1, current - delta); p <= Math.min(total, current + delta); p++) range.push(p);
  if (!range.includes(1)) range.unshift(1);
  if (!range.includes(total)) range.push(total);
  return range;
}

async function _updateProgressSummary() {
  const el = document.getElementById('progress-summary');
  if (!el) return;
  const res = await API.getProgressSummary();
  if (!res.ok) return;
  el.innerHTML = `
    <span class="font-medium">${res.data.count} gói thầu theo dõi tiến độ</span>
  `;
}

window.showProgressDetail = function(index) {
  const r = ProgressState.items[index];
  if (!r) return;

  const modal = document.getElementById('modal-progress-detail');
  const title = document.getElementById('modal-progress-title');
  const content = document.getElementById('modal-progress-content');
  if (!modal || !content) return;

  title.textContent = `${r.ma_goi_thau || r.id_goi_thau || ''} — ${r.ten_goi_thau || ''}`;

  const FIELDS = [
    ['Mã gói thầu', r.ma_goi_thau], ['ID gói thầu', r.id_goi_thau],
    ['Tên gói thầu', r.ten_goi_thau], ['Hạng mục', r.hang_muc],
    ['Công trình', r.hm_ct], ['Tòa', r.hm_toa], ['Lô', r.lo],
    ['Nhà thầu', r.ten_nha_thau], ['Người TH ĐT-HĐ', r.nguoi_th_dt_hd],
    ['Ngày PH HSMT', r.ngay_ph_hsmt], ['TT PH HSMT', r.trang_thai_ph_hsmt],
    ['Mã HSMT', r.ma_hsmt], ['Số ngày ĐT-HĐ', r.so_ngay_dt_hd],
    ['Ngày BĐ TC', r.ngay_bd_tc], ['Ngày BĐ TC thực tế', r.ngay_bd_tc_tt],
    ['Số ngày thực hiện', r.so_ngay_thuc_hien], ['Ngày KT TC', r.ngay_kt_tc],
    ['Trạng thái BĐ TC', r.trang_thai_bd_tc], ['Trạng thái KT TC', r.trang_thai_kt_tc],
    ['Trạng thái HĐ', r.trang_thai_hd], ['Vướng mắc TĐ', r.vuong_mac_td],
    ['Đề xuất PA', r.de_xuat_pa], ['Trách nhiệm BP', r.trach_nhiem_bp],
    ['Ghi chú', r.ghi_chu]
  ];

  content.innerHTML = FIELDS.map(([label, val]) => {
    if (!val && val !== 0) return '';
    return `
      <div class="flex flex-col gap-0.5">
        <span class="text-xs text-base-content/50">${label}</span>
        <span class="text-sm font-medium break-all">${_esc(String(val))}</span>
      </div>`;
  }).filter(Boolean).join('');

  modal.showModal();
};
