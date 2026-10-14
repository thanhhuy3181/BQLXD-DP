/**
 * hsmt.js — Logic for Hồ sơ mời thầu (HSMT) screen.
 */
'use strict';

const HsmtState = {
  page: 1,
  pageSize: 50,
  totalPages: 1,
  total: 0,
  search: '',
  filterCdt: '',
  sortCol: 'stt',
  sortDir: 'asc',
  items: [],
  debounceTimer: null,
};

window.loadHsmt = async function(page) {
  if (page !== undefined) HsmtState.page = page;

  const searchEl = document.getElementById('hsmt-search');
  if (searchEl) HsmtState.search = searchEl.value.trim();

  const cdtEl = document.getElementById('hsmt-filter-cdt');
  if (cdtEl) HsmtState.filterCdt = cdtEl.value;

  const sortEl = document.getElementById('hsmt-sort');
  if (sortEl) {
    const [col, dir] = sortEl.value.split('|');
    HsmtState.sortCol = col;
    HsmtState.sortDir = dir;
  }

  const psEl = document.getElementById('hsmt-pagesize');
  if (psEl) HsmtState.pageSize = parseInt(psEl.value, 10);

  setLoading(true);
  try {
    const res = await API.getHsmtList({
      page: HsmtState.page,
      pageSize: HsmtState.pageSize,
      search: HsmtState.search,
      filterCdt: HsmtState.filterCdt,
      sortCol: HsmtState.sortCol,
      sortDir: HsmtState.sortDir,
    });

    if (!res.ok) {
      toast('Lỗi tải dữ liệu HSMT: ' + res.error, 'error');
      return;
    }

    const { items, total, total_pages } = res.data;
    HsmtState.items = items;
    HsmtState.total = total;
    const count = document.getElementById('hsmt-total-count');
    if (count) count.textContent = `${total} bản ghi`;
    HsmtState.totalPages = total_pages;

    _renderHsmtTable(items);
    _renderHsmtPagination(HsmtState.page, total_pages, total);
    await _updateHsmtSummary();
  } catch (err) {
    toast('Lỗi hệ thống: ' + err.message, 'error');
  } finally {
    setLoading(false);
  }
};

window.debounceHsmtSearch = function() {
  clearTimeout(HsmtState.debounceTimer);
  HsmtState.debounceTimer = setTimeout(() => {
    HsmtState.page = 1;
    loadHsmt();
  }, 250);
};

function _renderHsmtTable(items) {
  const tbody = document.getElementById('hsmt-tbody');
  if (!tbody) return;

  if (!items || items.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="text-center py-12 text-base-content/40">Không tìm thấy bản ghi nào</td></tr>`;
    return;
  }

  tbody.innerHTML = items.map((r, i) => {
    const stt = (HsmtState.page - 1) * HsmtState.pageSize + i + 1;
    const hasFile = r.full_path && r.full_path.trim();

    return `<tr class="cursor-pointer" ondblclick="showHsmtDetail(${i})">
      <td class="text-center text-xs text-base-content/50">${stt}</td>
      <td>
        ${hasFile
          ? `<button class="link link-primary text-xs font-mono font-bold" onclick="openPayPath(event,'${_esc(r.full_path)}')">${_esc(r.code || '(trống)')}</button>`
          : `<span class="text-xs font-mono font-medium">${_esc(r.code || '(trống)')}</span>`}
        ${r.date ? `<div class="text-xs text-base-content/50">${_esc(r.date)}</div>` : ''}
      </td>
      <td>
        <div class="font-medium text-sm line-clamp-1" title="${_esc(r.name || '')}">${_esc(r.name || '—')}</div>
        ${r.hang_muc ? `<div class="text-xs text-base-content/50 truncate max-w-sm">${_esc(r.hang_muc)}</div>` : ''}
      </td>
      <td class="text-xs max-w-xs truncate" title="${_esc(r.noidung || '')}">${_esc(r.noidung || '—')}</td>
      <td class="text-xs">${_esc(r.cdt || '—')}</td>
      <td><span class="badge badge-sm badge-ghost">${_esc(r.hinh_thuc_ph || '—')}</span></td>
      <td class="text-xs font-mono">${_esc(r.ngan_sach || '—')}</td>
      <td class="text-xs">${_esc(r.phan_khu || r.cong_trinh || '—')}</td>
      <td>
        <button class="btn btn-ghost btn-xs" onclick="showHsmtDetail(${i})">Chi tiết</button>
      </td>
    </tr>`;
  }).join('');
}

function _renderHsmtPagination(page, totalPages, total) {
  const info = document.getElementById('hsmt-page-info');
  const pag = document.getElementById('hsmt-pagination');
  if (!info || !pag) return;

  const start = total === 0 ? 0 : (page - 1) * HsmtState.pageSize + 1;
  const end = Math.min(page * HsmtState.pageSize, total);
  info.textContent = `Hiển thị ${start}–${end} / ${total} bản ghi`;

  if (totalPages <= 1) { pag.innerHTML = ''; return; }

  let html = '';
  html += `<button class="join-item btn btn-sm ${page===1?'btn-disabled':''}" onclick="loadHsmt(${page-1})">«</button>`;
  const pages = _hsmtPageRange(page, totalPages);
  let prev = null;
  for (const p of pages) {
    if (prev !== null && p - prev > 1) html += `<button class="join-item btn btn-sm btn-disabled">…</button>`;
    html += `<button class="join-item btn btn-sm ${p===page?'btn-primary':''}" onclick="loadHsmt(${p})">${p}</button>`;
    prev = p;
  }
  html += `<button class="join-item btn btn-sm ${page===totalPages?'btn-disabled':''}" onclick="loadHsmt(${page+1})">»</button>`;
  pag.innerHTML = html;
}

function _hsmtPageRange(current, total) {
  const delta = 2;
  const range = [];
  for (let p = Math.max(1, current - delta); p <= Math.min(total, current + delta); p++) range.push(p);
  if (!range.includes(1)) range.unshift(1);
  if (!range.includes(total)) range.push(total);
  return range;
}

async function _updateHsmtSummary() {
  const el = document.getElementById('hsmt-summary');
  if (!el) return;
  const res = await API.getHsmtSummary();
  if (!res.ok) return;
  const d = res.data;
  el.innerHTML = `
    <span class="font-medium">${d.count} hồ sơ mời thầu</span>
    <span class="text-base-content/30">|</span>
    <span>Có file đính kèm: <strong class="text-primary">${d.has_file}</strong></span>
    <span class="text-base-content/30">|</span>
    <span>Chủ đầu tư: ${d.cdts ? d.cdts.slice(0, 3).join(', ') : '—'}</span>
  `;
}

window.showHsmtDetail = function(index) {
  const r = HsmtState.items[index];
  if (!r) return;

  const modal = document.getElementById('modal-hsmt-detail');
  const title = document.getElementById('modal-hsmt-title');
  const content = document.getElementById('modal-hsmt-content');
  if (!modal || !content) return;

  title.textContent = `${r.code || 'Chi tiết HSMT'} — ${r.name || ''}`;

  const FIELDS = [
    ['Mã HSMT', r.code], ['Ngày PH', r.date], ['Rev', r.rev],
    ['Tên gói thầu', r.name], ['Nội dung', r.noidung], ['Chủ đầu tư', r.cdt],
    ['Hình thức phát hành', r.hinh_thuc_ph], ['Ngân sách', r.ngan_sach],
    ['Công trình', r.cong_trinh], ['Hạng mục', r.hang_muc],
    ['Phân khu', r.phan_khu], ['Lô', r.lo],
    ['Lần phê duyệt', r.lan_pd], ['Phòng ban', r.phong_ban],
    ['TT Tiến độ', r.thong_tin_tien_do], ['TĐ Đấu thầu', r.td_dau_thau],
    ['TĐ Bắt đầu', r.td_bat_dau], ['TĐ Kết thúc', r.td_ket_thuc],
    ['Tồn kho', r.ton_kho], ['Pháp lý', r.phap_ly],
    ['KSTĐ', r.kstd], ['KSTK', r.kstk], ['Ghi chú', r.ghi_chu]
  ];

  content.innerHTML = FIELDS.map(([label, val]) => {
    if (!val && val !== 0) return '';
    return `
      <div class="flex flex-col gap-0.5">
        <span class="text-xs text-base-content/50">${label}</span>
        <span class="text-sm font-medium break-all">${_esc(String(val))}</span>
      </div>`;
  }).filter(Boolean).join('');

  if (r.full_path) {
    content.innerHTML += `
      <div class="col-span-2 flex gap-2 mt-3 pt-3 border-t border-base-200">
        <button class="btn btn-xs btn-primary gap-1" onclick="openPayPath(event,'${_esc(r.full_path)}')">
          <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          Mở file HSMT
        </button>
      </div>`;
  }

  modal.showModal();
};
