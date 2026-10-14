/**
 * contractor.js — Quản lý & Phân tích Nhà thầu Đã ký Hợp đồng
 */
'use strict';

const ContractorModule = (function() {
  let _page = 1;
  let _pageSize = 50;
  let _search = '';
  let _sortCol = 'hd_count';
  let _sortDir = 'desc';
  let _data = null;

  async function init() {
    await loadData();
  }

  async function loadData() {
    const res = await API.getContractorSummary({
      page: _page,
      pageSize: _pageSize,
      search: _search,
      sortCol: _sortCol,
      sortDir: _sortDir,
    });
    if (!res.ok) {
      toast('Không thể tải dữ liệu Nhà thầu: ' + res.error, 'error');
      return;
    }
    _data = res.data;
    renderTable();
    renderPagination();
  }

  function renderTable() {
    const tbody = document.getElementById('contractor-tbody');
    const countEl = document.getElementById('contractor-count');
    if (!tbody) return;

    if (countEl && _data) countEl.textContent = `${_data.total} Nhà thầu`;

    const items = _data?.items || [];
    if (items.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" class="text-center py-8 text-base-content/50 text-xs">Không tìm thấy nhà thầu nào</td></tr>';
      return;
    }

    tbody.innerHTML = items.map((c, idx) => {
      const stt = (_page - 1) * _pageSize + idx + 1;
      const progressColor = c.paid_ratio >= 100 ? 'progress-success' : c.paid_ratio >= 50 ? 'progress-warning' : 'progress-info';
      return `
        <tr class="hover cursor-pointer" onclick="ContractorModule.viewDetail('${escapeAttr(c.name)}')">
          <td class="text-center text-xs text-base-content/60 font-semibold">${stt}</td>
          <td>
            <div class="font-bold text-xs hover:text-primary max-w-sm truncate" title="${escapeAttr(c.name)}">${escapeHtml(c.name)}</div>
            ${c.ten_tat ? `<div class="text-[10px] text-base-content/60">${escapeHtml(c.ten_tat)}</div>` : ''}
          </td>
          <td class="text-center font-bold text-primary">${c.hd_count}</td>
          <td class="text-right font-semibold text-xs">${c.total_value_fmt} đ</td>
          <td class="text-right font-semibold text-xs text-success">${c.total_paid_fmt} đ</td>
          <td class="text-right font-semibold text-xs text-warning">${c.remaining_fmt} đ</td>
          <td>
            <div class="flex items-center gap-1.5 min-w-[120px]">
              <progress class="progress ${progressColor} w-16" value="${c.paid_ratio}" max="100"></progress>
              <span class="text-[11px] font-bold">${c.paid_ratio}%</span>
            </div>
          </td>
          <td class="text-center">
            ${c.signed_count > 0 ? `<span class="badge badge-success badge-xs gap-1">✔ ${c.signed_count} CKS</span>` : `<span class="badge badge-ghost badge-xs">Chưa CKS</span>`}
          </td>
          <td class="text-center" onclick="event.stopPropagation()">
            <button class="btn btn-ghost btn-xs text-primary" onclick="ContractorModule.viewDetail('${escapeAttr(c.name)}')">Chi tiết</button>
          </td>
        </tr>
      `;
    }).join('');
  }

  function renderPagination() {
    const el = document.getElementById('contractor-pagination');
    if (!el || !_data) return;
    const totalPages = _data.total_pages || 1;
    el.innerHTML = `
      <div class="flex items-center gap-2 text-xs">
        <span>Trang ${_page} / ${totalPages}</span>
        <div class="btn-group">
          <button class="btn btn-xs" ${_page <= 1 ? 'disabled' : ''} onclick="ContractorModule.goPage(${_page - 1})">«</button>
          <button class="btn btn-xs" ${_page >= totalPages ? 'disabled' : ''} onclick="ContractorModule.goPage(${_page + 1})">»</button>
        </div>
      </div>
    `;
  }

  function goPage(p) {
    _page = p;
    loadData();
  }

  function onSearch(val) {
    _search = val;
    _page = 1;
    loadData();
  }

  function onSort(col) {
    if (_sortCol === col) {
      _sortDir = _sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      _sortCol = col;
      _sortDir = 'desc';
    }
    loadData();
  }

  async function viewDetail(nhaThau) {
    const res = await API.getContractorDetail(nhaThau);
    if (!res.ok) {
      toast('Lỗi tải chi tiết nhà thầu: ' + res.error, 'error');
      return;
    }
    const d = res.data;
    const modal = document.getElementById('modal-contractor-detail');
    if (!modal) return;

    document.getElementById('modal-nt-name').textContent = d.name;
    document.getElementById('modal-nt-total-val').textContent = d.total_value_fmt + ' đ';
    document.getElementById('modal-nt-paid-val').textContent = d.total_paid_fmt + ' đ';
    document.getElementById('modal-nt-rem-val').textContent = d.remaining_fmt + ' đ';

    const tbody = document.getElementById('modal-nt-contracts-tbody');
    if (tbody) {
      tbody.innerHTML = (d.contracts || []).map((h, idx) => `
        <tr class="hover text-xs">
          <td class="text-center font-medium">${idx + 1}</td>
          <td class="font-bold text-primary">${escapeHtml(h.so_hd || '—')}</td>
          <td>${escapeHtml(h.name || '—')}</td>
          <td class="text-right font-semibold">${h.gia_tri_fmt || '—'} đ</td>
          <td class="text-center">${escapeHtml(h.ngay_ky || '—')}</td>
          <td class="text-center">
            ${h.full_path ? `<button class="btn btn-ghost btn-xs text-primary" onclick="API.openPath('${escapeAttr(h.full_path)}')">Mở PDF</button>` : '—'}
          </td>
        </tr>
      `).join('');
    }

    modal.showModal();
  }

  function escapeHtml(s) {
    if (!s) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function escapeAttr(s) {
    if (!s) return '';
    return String(s).replace(/'/g, "\\'").replace(/"/g, '&quot;');
  }

  return {
    init,
    loadData,
    onSearch,
    onSort,
    goPage,
    viewDetail
  };
})();
