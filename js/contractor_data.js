/**
 * contractor_data.js — Dữ liệu Nhà thầu Gốc (Danh bạ 13,853 NT toàn hệ thống)
 */
'use strict';

const ContractorDataModule = (function() {
  let _page = 1;
  let _pageSize = 50;
  let _search = '';
  let _data = null;

  async function init() {
    await loadData();
  }

  async function loadData() {
    const res = await API.getContractorDirectory({
      page: _page,
      pageSize: _pageSize,
      search: _search,
    });
    if (!res.ok) {
      toast('Không thể tải Danh bạ Nhà thầu: ' + res.error, 'error');
      return;
    }
    _data = res.data;
    renderTable();
    renderPagination();
  }

  function renderTable() {
    const tbody = document.getElementById('contractor-data-tbody');
    const countEl = document.getElementById('contractor-data-count');
    if (!tbody) return;

    if (countEl && _data) countEl.textContent = `${_data.total.toLocaleString('vi-VN')} Nhà thầu`;

    const items = _data?.items || [];
    if (items.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-base-content/50 text-xs">Không tìm thấy nhà thầu phù hợp</td></tr>';
      return;
    }

    tbody.innerHTML = items.map(c => `
      <tr class="hover text-xs">
        <td class="text-center font-medium">${c.stt}</td>
        <td>
          <div class="font-bold text-primary max-w-sm truncate" title="${escapeHtml(c.name)}">${escapeHtml(c.name)}</div>
          ${c.short_name ? `<div class="text-[10px] text-base-content/60">${escapeHtml(c.short_name)}</div>` : ''}
        </td>
        <td class="font-mono text-xs">${escapeHtml(c.tax_code || '—')}</td>
        <td class="max-w-xs truncate text-base-content/80" title="${escapeHtml(c.address)}">${escapeHtml(c.address || '—')}</td>
        <td>${escapeHtml(c.phone || '—')}</td>
        <td>${escapeHtml(c.email || '—')}</td>
        <td class="text-center">
          <button class="btn btn-ghost btn-xs text-primary" onclick="ContractorModule.viewDetail('${escapeAttr(c.name)}')">Tra cứu HĐ</button>
        </td>
      </tr>
    `).join('');
  }

  function renderPagination() {
    const el = document.getElementById('contractor-data-pagination');
    if (!el || !_data) return;
    const totalPages = _data.total_pages || 1;
    el.innerHTML = `
      <div class="flex items-center gap-2 text-xs">
        <span>Trang ${_page} / ${totalPages}</span>
        <div class="btn-group">
          <button class="btn btn-xs" ${_page <= 1 ? 'disabled' : ''} onclick="ContractorDataModule.goPage(${_page - 1})">«</button>
          <button class="btn btn-xs" ${_page >= totalPages ? 'disabled' : ''} onclick="ContractorDataModule.goPage(${_page + 1})">»</button>
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

  function escapeHtml(s) {
    if (!s) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function escapeAttr(s) {
    if (!s) return '';
    return String(s).replace(/'/g, "\\'").replace(/"/g, '&quot;');
  }

  return { init, loadData, onSearch, goPage };
})();
