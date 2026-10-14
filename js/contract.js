/**
 * contract.js — Logic for Hợp đồng (Contracts) screen.
 */
'use strict';

const ContractState = {
  page: 1,
  pageSize: 50,
  totalPages: 1,
  total: 0,
  search: '',
  filterNt: '',
  sortCol: 'stt',
  sortDir: 'asc',
  items: [],
  debounceTimer: null,
};

window.loadContracts = async function(page) {
  if (page !== undefined) ContractState.page = page;

  const searchEl = document.getElementById('contract-search');
  if (searchEl) ContractState.search = searchEl.value.trim();

  const sortEl = document.getElementById('contract-sort');
  if (sortEl) {
    const [col, dir] = sortEl.value.split('|');
    ContractState.sortCol = col;
    ContractState.sortDir = dir;
  }

  const psEl = document.getElementById('contract-pagesize');
  if (psEl) ContractState.pageSize = parseInt(psEl.value, 10);

  setLoading(true);
  try {
    const res = await API.getHdList({
      page: ContractState.page,
      pageSize: ContractState.pageSize,
      search: ContractState.search,
      filterNt: ContractState.filterNt,
      sortCol: ContractState.sortCol,
      sortDir: ContractState.sortDir,
    });

    if (!res.ok) {
      toast('Lỗi tải dữ liệu Hợp đồng: ' + res.error, 'error');
      return;
    }

    const { items, total, total_pages } = res.data;
    ContractState.items = items;
    ContractState.total = total;
    const count = document.getElementById('contract-total-count');
    if (count) count.textContent = `${total} bản ghi`;
    ContractState.totalPages = total_pages;

    _renderContractTable(items);
    _renderContractPagination(ContractState.page, total_pages, total);
    await _updateContractSummary();
  } catch (err) {
    toast('Lỗi hệ thống: ' + err.message, 'error');
  } finally {
    setLoading(false);
  }
};

window.debounceContractSearch = function() {
  clearTimeout(ContractState.debounceTimer);
  ContractState.debounceTimer = setTimeout(() => {
    ContractState.page = 1;
    loadContracts();
  }, 250);
};

function _renderContractTable(items) {
  const tbody = document.getElementById('contract-tbody');
  if (!tbody) return;

  if (!items || items.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" class="text-center py-12 text-base-content/40">Không tìm thấy hợp đồng nào</td></tr>`;
    return;
  }

  tbody.innerHTML = items.map((r, i) => {
    const stt = (ContractState.page - 1) * ContractState.pageSize + i + 1;
    const hasFile = r.full_path && r.full_path.trim();
    const hasFolder = r.folder_path && r.folder_path.trim();

    return `<tr class="cursor-pointer" ondblclick="showContractDetail(${i})">
      <td class="text-center text-xs text-base-content/50">${stt}</td>
      <td>
        ${hasFile
          ? `<button class="link link-primary text-xs font-mono font-bold" onclick="openPayPath(event,'${_esc(r.full_path)}')">${_esc(r.code || '(trống)')}</button>`
          : `<span class="text-xs font-mono font-medium">${_esc(r.code || '(trống)')}</span>`}
        ${r.so_hd ? `<div class="text-xs text-base-content/50 font-mono">${_esc(r.so_hd)}</div>` : ''}
      </td>
      <td>
        <div class="font-medium text-sm line-clamp-1" title="${_esc(r.name || '')}">${_esc(r.name || '—')}</div>
        ${r.ben_a ? `<div class="text-xs text-base-content/40">Bên A: ${_esc(r.ben_a)}</div>` : ''}
      </td>
      <td>
        <div class="font-medium text-xs text-primary">${_esc(r.ten_nt_tat || r.nha_thau || '—')}</div>
        ${r.ten_nt_tat && r.nha_thau && r.ten_nt_tat !== r.nha_thau ? `<div class="text-xs text-base-content/40 truncate max-w-44" title="${_esc(r.nha_thau)}">${_esc(r.nha_thau)}</div>` : ''}
      </td>
      <td class="text-right font-mono text-xs font-medium">${_esc(r._gia_tri_hd_fmt || '0')} ₫</td>
      <td class="text-xs">${_esc(r.date_sign || '—')}</td>
      <td class="text-right font-mono text-xs text-base-content/60">${_esc(r._tam_ung_fmt || '—')}</td>
      <td class="text-right font-mono text-xs text-info font-medium">${_esc(r._tt_tong_da_tt_fmt || '—')}</td>
      <td class="text-center">
        ${hasFolder
          ? `<button class="btn btn-ghost btn-xs" title="Mở thư mục HĐ" onclick="openPayPath(event,'${_esc(r.folder_path)}')">
              <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
             </button>`
          : '—'}
      </td>
      <td>
        <button class="btn btn-ghost btn-xs" onclick="showContractDetail(${i})">Chi tiết</button>
      </td>
    </tr>`;
  }).join('');
}

function _renderContractPagination(page, totalPages, total) {
  const info = document.getElementById('contract-page-info');
  const pag = document.getElementById('contract-pagination');
  if (!info || !pag) return;

  const start = total === 0 ? 0 : (page - 1) * ContractState.pageSize + 1;
  const end = Math.min(page * ContractState.pageSize, total);
  info.textContent = `Hiển thị ${start}–${end} / ${total} bản ghi`;

  if (totalPages <= 1) { pag.innerHTML = ''; return; }

  let html = '';
  html += `<button class="join-item btn btn-sm ${page===1?'btn-disabled':''}" onclick="loadContracts(${page-1})">«</button>`;
  const pages = _contractPageRange(page, totalPages);
  let prev = null;
  for (const p of pages) {
    if (prev !== null && p - prev > 1) html += `<button class="join-item btn btn-sm btn-disabled">…</button>`;
    html += `<button class="join-item btn btn-sm ${p===page?'btn-primary':''}" onclick="loadContracts(${p})">${p}</button>`;
    prev = p;
  }
  html += `<button class="join-item btn btn-sm ${page===totalPages?'btn-disabled':''}" onclick="loadContracts(${page+1})">»</button>`;
  pag.innerHTML = html;
}

function _contractPageRange(current, total) {
  const delta = 2;
  const range = [];
  for (let p = Math.max(1, current - delta); p <= Math.min(total, current + delta); p++) range.push(p);
  if (!range.includes(1)) range.unshift(1);
  if (!range.includes(total)) range.push(total);
  return range;
}

async function _updateContractSummary() {
  const el = document.getElementById('contract-summary');
  if (!el) return;
  const res = await API.getHdSummary();
  if (!res.ok) return;
  const d = res.data;
  el.innerHTML = `
    <span class="font-medium">${d.count} hợp đồng</span>
    <span class="text-base-content/30">|</span>
    <span>Tổng giá trị HĐ: <strong class="text-primary">${d.total_gia_tri_fmt}</strong> ₫</span>
    <span class="text-base-content/30">|</span>
    <span>Tổng đã TT: <strong class="text-info">${d.total_tt_fmt}</strong> ₫</span>
  `;
}

window.showContractDetail = function(index) {
  const r = ContractState.items[index];
  if (!r) return;

  const modal = document.getElementById('modal-contract-detail');
  const title = document.getElementById('modal-contract-title');
  const content = document.getElementById('modal-contract-content');
  if (!modal || !content) return;

  title.textContent = `${r.code || 'Chi tiết HĐ'} — ${r.ten_nt_tat || r.nha_thau || ''}`;

  const FIELDS = [
    ['Mã HĐ', r.code], ['Số HĐ', r.so_hd], ['Ngày ký', r.date_sign],
    ['Tên gói thầu / HĐ', r.name], ['Nhà thầu', r.nha_thau], ['Tên NT rút gọn', r.ten_nt_tat],
    ['Mã NT', r.ma_nt], ['Tên SAP', r.ten_sap], ['Vendor', r.vendor],
    ['Giá trị HĐ', r._gia_tri_hd_fmt ? `${r._gia_tri_hd_fmt} ₫` : r.gia_tri_hd],
    ['Tạm ứng', r._tam_ung_fmt ? `${r._tam_ung_fmt} ₫` : r.tam_ung],
    ['Đã thanh toán', r._tt_tong_da_tt_fmt ? `${r._tt_tong_da_tt_fmt} ₫` : r.tt_tong_da_tt],
    ['Trạng thái TT', r.tt_status], ['Số đợt TT', r.tt_so_dot],
    ['Bên A', r.ben_a], ['Số PLHĐ', r.so_plhd], ['Ngày ký PLHĐ', r.date_sign_plhd],
    ['Bắt đầu TC', r.td_bat_dau], ['Kết thúc TC', r.td_ket_thuc],
    ['Bảo lãnh BH', r.bao_lanh_bh], ['TG bảo hành', r.tg_bao_hanh],
    ['Công trình', r.cong_trinh], ['Hạng mục', r.hang_muc], ['Phân khu', r.phan_khu]
  ];

  content.innerHTML = FIELDS.map(([label, val]) => {
    if (!val && val !== 0) return '';
    return `
      <div class="flex flex-col gap-0.5">
        <span class="text-xs text-base-content/50">${label}</span>
        <span class="text-sm font-medium break-all">${_esc(String(val))}</span>
      </div>`;
  }).filter(Boolean).join('');

  let actions = '';
  if (r.full_path) {
    actions += `<button class="btn btn-xs btn-primary gap-1" onclick="openPayPath(event,'${_esc(r.full_path)}')">
      <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
      Mở file HĐ
    </button>`;
  }
  if (r.folder_path) {
    actions += `<button class="btn btn-xs btn-outline gap-1" onclick="openPayPath(event,'${_esc(r.folder_path)}')">
      <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
      Mở thư mục
    </button>`;
  }

  if (actions) {
    content.innerHTML += `<div class="col-span-2 flex gap-2 mt-3 pt-3 border-t border-base-200">${actions}</div>`;
  }

  modal.showModal();
};
