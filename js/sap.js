/**
 * sap.js — Quản lý Dữ liệu Hệ thống SAP & CCM (HSMT, CCM, PLHD, PR)
 */
'use strict';

const SapModule = (function() {
  let _activeTab = 'hsmt';
  let _page = 1;
  let _pageSize = 50;
  let _search = '';
  let _data = null;

  async function init() {
    await loadData();
  }

  function setTab(tab) {
    _activeTab = tab;
    _page = 1;
    _search = '';
    const searchInput = document.getElementById('sap-search');
    if (searchInput) searchInput.value = '';
    updateTabButtons();
    loadData();
  }

  function updateTabButtons() {
    ['hsmt', 'ccm', 'plhd', 'pr'].forEach(t => {
      const btn = document.getElementById(`btn-sap-${t}`);
      if (btn) {
        if (t === _activeTab) {
          btn.className = 'btn btn-xs btn-primary font-bold';
        } else {
          btn.className = 'btn btn-xs btn-ghost';
        }
      }
    });
  }

  async function loadData() {
    const res = await API.getSapData(_activeTab, {
      page: _page,
      pageSize: _pageSize,
      search: _search,
    });
    if (!res.ok) {
      toast('Không thể tải dữ liệu SAP: ' + res.error, 'error');
      return;
    }
    _data = res.data;
    renderTable();
    renderPagination();
  }

  function renderTable() {
    const thead = document.getElementById('sap-thead');
    const tbody = document.getElementById('sap-tbody');
    const countEl = document.getElementById('sap-count');
    if (!thead || !tbody) return;

    if (countEl && _data) countEl.textContent = `${_data.total} dòng`;

    const headers = _data?.headers || [];
    const rows = _data?.rows || [];

    if (headers.length === 0) {
      thead.innerHTML = '<tr><th>Dữ liệu</th></tr>';
      tbody.innerHTML = '<tr><td class="text-center py-8 text-base-content/50 text-xs">Chưa có dữ liệu SAP trong hệ thống</td></tr>';
      return;
    }

    thead.innerHTML = '<tr>' + headers.map(h => `<th class="text-xs font-semibold whitespace-nowrap">${escapeHtml(h)}</th>`).join('') + '</tr>';

    if (rows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="${headers.length}" class="text-center py-8 text-base-content/50 text-xs">Không tìm thấy dữ liệu</td></tr>`;
      return;
    }

    tbody.innerHTML = rows.map((r, idx) => {
      return '<tr class="hover text-xs">' + r.map(c => {
        const val = String(c != null ? c : '');
        let badge = escapeHtml(val);
        if (val === 'Đã có' || val.toLowerCase() === 'da co') {
          badge = '<span class="badge badge-success badge-xs font-bold">Đã có</span>';
        } else if (val === 'Chưa có' || val.toLowerCase() === 'chua co') {
          badge = '<span class="badge badge-error badge-xs font-bold">Chưa có</span>';
        }
        return `<td class="whitespace-nowrap">${badge}</td>`;
      }).join('') + '</tr>';
    }).join('');
  }

  function renderPagination() {
    const el = document.getElementById('sap-pagination');
    if (!el || !_data) return;
    const totalPages = _data.total_pages || 1;
    el.innerHTML = `
      <div class="flex items-center gap-2 text-xs">
        <span>Trang ${_page} / ${totalPages}</span>
        <div class="btn-group">
          <button class="btn btn-xs" ${_page <= 1 ? 'disabled' : ''} onclick="SapModule.goPage(${_page - 1})">«</button>
          <button class="btn btn-xs" ${_page >= totalPages ? 'disabled' : ''} onclick="SapModule.goPage(${_page + 1})">»</button>
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

  return {
    init,
    setTab,
    loadData,
    onSearch,
    goPage
  };
})();
