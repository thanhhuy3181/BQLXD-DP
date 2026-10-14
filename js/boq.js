/**
 * boq.js — Bảng Theo Dõi Khối Lượng HSMT / BOQ
 */
'use strict';

const BoqModule = (function() {
  let _page = 1;
  let _pageSize = 50;
  let _search = '';
  let _data = null;

  async function init() {
    await loadData();
  }

  async function loadData() {
    const res = await API.getBoqData({
      search: _search,
      page: _page,
      pageSize: _pageSize,
    });
    if (!res.ok) {
      toast('Không thể tải dữ liệu BOQ: ' + res.error, 'error');
      return;
    }
    _data = res.data;
    renderTable();
    renderPagination();
  }

  function renderTable() {
    const tbody = document.getElementById('boq-tbody');
    const countEl = document.getElementById('boq-count');
    if (!tbody) return;

    if (countEl && _data) countEl.textContent = `${_data.total} dòng`;

    const items = _data?.items || [];
    if (items.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="text-center py-10 text-base-content/50 text-xs">
            <div class="flex flex-col items-center gap-2">
              <span class="text-2xl">📦</span>
              <span>Chưa có dữ liệu BOQ trong cache dự án này.</span>
              <button class="btn btn-xs btn-outline btn-primary mt-2" onclick="ChucNangModule.switchSubTab('cn-skill-hsmt')">
                Bóc tách Khối lượng từ Bước B5. Skill HSMT
              </button>
            </div>
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = items.map((r, idx) => {
      const stt = (_page - 1) * _pageSize + idx + 1;
      return `
        <tr class="hover text-xs">
          <td class="text-center font-medium">${stt}</td>
          <td class="font-bold text-primary">${escapeHtml(r.goi_thau || r.code || '—')}</td>
          <td>${escapeHtml(r.hang_muc || r.name || '—')}</td>
          <td class="text-center">${escapeHtml(r.dvt || '—')}</td>
          <td class="text-right font-medium">${r.khoi_luong != null ? r.khoi_luong : '—'}</td>
          <td class="text-right font-medium">${r.don_gia_fmt || r.don_gia || '—'}</td>
          <td class="text-right font-bold text-success">${r.thanh_tien_fmt || r.thanh_tien || '—'}</td>
        </tr>
      `;
    }).join('');
  }

  function renderPagination() {
    const el = document.getElementById('boq-pagination');
    if (!el || !_data) return;
    const totalPages = _data.total_pages || 1;
    el.innerHTML = `
      <div class="flex items-center gap-2 text-xs">
        <span>Trang ${_page} / ${totalPages}</span>
        <div class="btn-group">
          <button class="btn btn-xs" ${_page <= 1 ? 'disabled' : ''} onclick="BoqModule.goPage(${_page - 1})">«</button>
          <button class="btn btn-xs" ${_page >= totalPages ? 'disabled' : ''} onclick="BoqModule.goPage(${_page + 1})">»</button>
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

  return { init, loadData, onSearch, goPage };
})();
