/**
 * payment.js — Tạm ứng – Thanh toán screen logic.
 * Handles: paginated table, search/filter/sort, cell editing, path opening, detail modal.
 */

'use strict';

// ── State ────────────────────────────────────────────────────────────────────
const PayState = {
  page: 1,
  pageSize: 50,
  totalPages: 1,
  total: 0,
  search: '',
  filterLoaiTt: '',
  sortCol: 'stt',
  sortDir: 'asc',
  items: [],
};

let _searchTimer = null;

// ── Debounced search ──────────────────────────────────────────────────────────
window.debounceSearch = function() {
  clearTimeout(_searchTimer);
  _searchTimer = setTimeout(loadPayments, 350);
};

// ── Main load function ────────────────────────────────────────────────────────
window.loadPayments = async function(page) {
  if (page !== undefined) PayState.page = page;

  const search = document.getElementById('pay-search')?.value || '';
  const filterLoaiTt = document.getElementById('pay-filter-loai')?.value || '';
  const sortRaw = document.getElementById('pay-sort')?.value || 'stt|asc';
  const [sortCol, sortDir] = sortRaw.split('|');
  const pageSize = parseInt(document.getElementById('pay-pagesize')?.value || '50');

  Object.assign(PayState, { search, filterLoaiTt, sortCol, sortDir, pageSize });

  setLoading(true);
  try {
    const res = await API.getPaymentList({
      page: PayState.page,
      pageSize: PayState.pageSize,
      search: PayState.search,
      filterLoaiTt: PayState.filterLoaiTt,
      sortCol: PayState.sortCol,
      sortDir: PayState.sortDir,
    });

    if (!res.ok) {
      toast('Lỗi tải dữ liệu: ' + res.error, 'error');
      return;
    }

    const { items, total, page: pg, total_pages } = res.data;
    PayState.items = items;
    PayState.page = pg;
    PayState.totalPages = total_pages;
    PayState.total = total;
    const count = document.getElementById('payment-total-count');
    if (count) count.textContent = `${total} bản ghi`;

    _renderTable(items);
    _renderPagination(pg, total_pages, total);
    _updateSummary();
  } finally {
    setLoading(false);
  }
};

// ── Table rendering ───────────────────────────────────────────────────────────
function _renderTable(items) {
  const tbody = document.getElementById('pay-tbody');
  if (!tbody) return;

  if (!items.length) {
    tbody.innerHTML = '<tr><td colspan="12" class="text-center py-8 text-base-content/40">Không có dữ liệu</td></tr>';
    return;
  }

  tbody.innerHTML = items.map((r, i) => {
    const idx = (PayState.page - 1) * PayState.pageSize + i; // absolute index in full list
    const stt = r.stt ?? (idx + 1);
    const hasExcel = r.excel_path && r.excel_path.trim();
    const hasFolder = r.folder_path && r.folder_path.trim();

    // Color-code loai_tt
    const loaiBadge = _loaiBadge(r.loai_tt || '');

    return `<tr class="cursor-pointer" ondblclick="showPaymentDetail(${i})">
      <td class="text-center text-xs text-base-content/50">${stt}</td>
      <td>
        ${hasExcel
          ? `<button class="link link-primary text-xs font-mono" onclick="openPayPath(event,'${_esc(r.excel_path)}')">${_esc(r.ma_hd)}</button>`
          : `<span class="text-xs font-mono">${_esc(r.ma_hd)}</span>`}
        ${r.ma_cf ? `<div class="text-xs text-base-content/50 font-mono">${_esc(r.ma_cf)}</div>` : ''}
      </td>
      <td>
        <div class="font-medium text-sm">${_esc(r.ten_nt_rut_gon || r.ten_nha_thau || '')}</div>
        ${r.ten_nt_rut_gon && r.ten_nha_thau && r.ten_nt_rut_gon !== r.ten_nha_thau
          ? `<div class="text-xs text-base-content/40 truncate max-w-48" title="${_esc(r.ten_nha_thau)}">${_esc(r.ten_nha_thau)}</div>`
          : ''}
      </td>
      <td>${loaiBadge}</td>
      <td class="text-right font-mono text-sm">${_esc(r._so_tien_fmt || r.so_tien_dntt || '')}</td>
      <td class="text-right font-mono text-sm text-base-content/60">${_esc(r._gia_tri_hd_fmt || r.gia_tri_hd || '')}</td>
      <td class="font-mono text-xs">${_esc(r.ma_cf || '')}</td>
      <td class="text-xs">${_esc(r.ngay_nt_nop || '')}</td>
      <td class="font-mono text-xs">${_esc(r.ma_pr || '')}</td>
      <td class="text-xs truncate max-w-32" title="${_esc(r.ngan_hang || '')}">${_esc(r.ngan_hang || '')}</td>
      <td>
        ${hasFolder
          ? `<button class="btn btn-ghost btn-xs" title="Mở thư mục" onclick="openPayPath(event,'${_esc(r.folder_path)}')">
              <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
             </button>`
          : ''}
      </td>
      <td>
        <div class="dropdown dropdown-end">
          <button tabindex="0" class="btn btn-ghost btn-xs" onclick="event.stopPropagation()">
            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>
          </button>
          <ul tabindex="0" class="dropdown-content menu p-1 shadow bg-base-100 rounded-box w-44 text-xs z-50">
            <li><a onclick="showPaymentDetail(${i})">Chi tiết</a></li>
            ${hasExcel ? `<li><a onclick="openPayPath(event,'${_esc(r.excel_path)}')">Mở file Excel</a></li>` : ''}
            ${hasFolder ? `<li><a onclick="openPayPath(event,'${_esc(r.folder_path)}')">Mở thư mục</a></li>` : ''}
          </ul>
        </div>
      </td>
    </tr>`;
  }).join('');
}

function _loaiBadge(loai) {
  const l = loai.toLowerCase();
  let cls = 'badge-ghost';
  if (l.includes('tạm ứng') || l.includes('tam ung')) cls = 'badge-warning';
  else if (l.includes('quyết toán') || l.includes('quyet toan')) cls = 'badge-success';
  else if (l.includes('thanh toán') || l.includes('thanh toan')) cls = 'badge-info';
  else if (l.includes('tất toán') || l.includes('tat toan')) cls = 'badge-error';
  return `<span class="badge badge-sm ${cls}">${_esc(loai)}</span>`;
}

// ── Pagination ────────────────────────────────────────────────────────────────
function _renderPagination(page, totalPages, total) {
  const info = document.getElementById('pay-page-info');
  const pag = document.getElementById('pay-pagination');
  if (!info || !pag) return;

  const start = (page - 1) * PayState.pageSize + 1;
  const end = Math.min(page * PayState.pageSize, total);
  info.textContent = `Hiển thị ${start}–${end} / ${total} bản ghi`;

  if (totalPages <= 1) { pag.innerHTML = ''; return; }

  let html = '';
  // Prev
  html += `<button class="join-item btn btn-sm ${page===1?'btn-disabled':''}" onclick="loadPayments(${page-1})">«</button>`;

  // Page numbers (show up to 7 around current)
  const pages = _pageRange(page, totalPages);
  let prev = null;
  for (const p of pages) {
    if (prev !== null && p - prev > 1) html += `<button class="join-item btn btn-sm btn-disabled">…</button>`;
    html += `<button class="join-item btn btn-sm ${p===page?'btn-primary':''}" onclick="loadPayments(${p})">${p}</button>`;
    prev = p;
  }

  // Next
  html += `<button class="join-item btn btn-sm ${page===totalPages?'btn-disabled':''}" onclick="loadPayments(${page+1})">»</button>`;

  pag.innerHTML = html;
}

function _pageRange(current, total) {
  const delta = 2;
  const range = [];
  for (let p = Math.max(1, current - delta); p <= Math.min(total, current + delta); p++) range.push(p);
  if (!range.includes(1)) range.unshift(1);
  if (!range.includes(total)) range.push(total);
  return range;
}

// ── Summary bar ───────────────────────────────────────────────────────────────
async function _updateSummary() {
  const el = document.getElementById('pay-summary');
  if (!el) return;
  const res = await API.getPaymentSummary();
  if (!res.ok) return;
  const d = res.data;
  const loaiStr = Object.entries(d.loai_counts || {})
    .sort((a,b) => b[1]-a[1]).slice(0,4)
    .map(([k,v]) => `${k}: ${v}`).join(' · ');
  el.innerHTML = `
    <span class="font-medium">${d.count} bản ghi</span>
    <span class="text-base-content/30">|</span>
    <span>Tổng ĐNTT: <strong class="text-primary">${d.total_so_tien_fmt}</strong> ₫</span>
    <span class="text-base-content/30">|</span>
    <span>${loaiStr}</span>
  `;
}

// ── Detail modal ──────────────────────────────────────────────────────────────
window.showPaymentDetail = async function(pageIndex) {
  const r = PayState.items[pageIndex];
  if (!r) return;

  const modal = document.getElementById('modal-payment-detail');
  const title = document.getElementById('modal-pay-title');
  const content = document.getElementById('modal-pay-content');
  if (!modal || !content) return;

  title.textContent = `${r.ma_hd || '(chưa có mã HD)'} — ${r.ten_nt_rut_gon || r.ten_nha_thau || ''}`;

  const FIELDS = [
    ['Mã HD', r.ma_hd], ['Mã CF', r.ma_cf], ['Mã CCM', r.ma_ccm],
    ['Mã PR', r.ma_pr], ['Planned', r.planned], ['Loại HD', r.loai_hd],
    ['Số HĐ', r.so_hd], ['Ngày ký HĐ', r.ngay_ky_hd],
    ['Số PLHĐ', r.so_plhd], ['Ngày ký PLHĐ', r.ngay_ky_plhd],
    ['Nhà thầu', r.ten_nha_thau], ['Tên rút gọn', r.ten_nt_rut_gon],
    ['Giá trị HĐ', r._gia_tri_hd_fmt || r.gia_tri_hd], ['Loại TT', r.loai_tt],
    ['Số tiền ĐNTT', r._so_tien_fmt || r.so_tien_dntt],
    ['Giá trị thực hiện', r.gia_tri_thuc_hien],
    ['Tiền TT trước thuế', r.tien_tt_truoc_thue], ['Thuế VAT', r.thue_vat],
    ['Khấu trừ TU', r.khau_tru_tu],
    ['Số TK', r.so_tk], ['Ngân hàng', r.ngan_hang],
    ['Ngày NT nộp', r.ngay_nt_nop], ['Ngày BQL chuyển QS', r.ngay_bql_chuyen_qs],
    ['Ngày GH cuối', r.ngay_gh_cuoi],
    ['Người ĐNTT', r.nguoi_dntt], ['GĐ BQLXD', r.gd_bqlxd],
    ['Dự án', r.du_an], ['Gói thầu', r.goi_thau],
    ['Nội dung HĐ', r.noi_dung_hd], ['Ghi chú', r.ghi_chu],
    ['Lũy kế TT', r.luy_ke_ty_le_tt], ['Giá trị còn lại', r.gia_tri_con_lai],
  ];

  content.innerHTML = FIELDS.map(([label, val]) => {
    if (!val && val !== 0) return '';
    return `
      <div class="flex flex-col gap-0.5">
        <span class="text-xs text-base-content/50">${label}</span>
        <span class="text-sm font-medium break-all">${_esc(String(val))}</span>
      </div>`;
  }).filter(Boolean).join('');

  // File links
  let links = '';
  if (r.excel_path) links += `<button class="btn btn-xs btn-outline gap-1" onclick="openPayPath(event,'${_esc(r.excel_path)}')">
    <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
    Mở Excel
  </button>`;
  if (r.folder_path) links += `<button class="btn btn-xs btn-outline gap-1" onclick="openPayPath(event,'${_esc(r.folder_path)}')">
    <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
    Mở thư mục
  </button>`;

  if (links) {
    content.innerHTML += `<div class="col-span-2 flex gap-2 mt-2">${links}</div>`;
  }

  modal.showModal();
};

// ── Path open ─────────────────────────────────────────────────────────────────
window.openPayPath = function(event, path) {
  event.stopPropagation();
  if (!path) return;
  API.openPath(path).then(res => {
    if (!res.ok) toast('Không mở được: ' + res.error, 'error');
  });
};

// ── Refresh all ───────────────────────────────────────────────────────────────
window.refreshAll = async function() {
  PayState.page = 1;
  await loadPayments();
  toast('Đã làm mới dữ liệu', 'success', 1500);
};

// ── Init filter dropdown ──────────────────────────────────────────────────────
async function initPaymentFilters() {
  const res = await API.getPaymentLoaiTtList();
  if (!res.ok) return;
  const sel = document.getElementById('pay-filter-loai');
  if (!sel) return;
  res.data.forEach(v => {
    const opt = document.createElement('option');
    opt.value = v; opt.textContent = v;
    sel.appendChild(opt);
  });
}

// ── Escape HTML ───────────────────────────────────────────────────────────────
function _esc(str) {
  if (!str && str !== 0) return '';
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}
