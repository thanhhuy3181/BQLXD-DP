/**
 * home.js — Dashboard, Milestone Assessment Matrix & Progress Warning Table
 * Exactly matching Desktop V386 HomeProgressAlertDashboard.
 */
'use strict';

const HomeModule = (function() {
  let _loaded = false;
  let _allRecords = [];
  let _filteredRecords = [];
  let _matrix = null;
  let _curProject = 'Vinhomes Đan Phượng';
  let _evalDate = '';

  let _statusFilter = 'CANH_BAO'; // 'CANH_BAO', 'CHAM', 'SAP_TOI', 'DUNG_HAN', 'HOAN_THANH', 'ALL'
  let _milestoneFilter = 'ALL';   // 'ALL', 'HSMT', 'HD', 'BD_TC', 'KT_TC'
  let _searchQuery = '';

  async function init() {
    await refresh();
    _loaded = true;
  }

  async function refresh(forceReload) {
    const res = await API.getHomeProgressAlerts();
    if (!res || !res.ok) {
      if (typeof toast === 'function') toast('Không thể tải cảnh báo tiến độ: ' + (res?.error || 'Lỗi'), 'error');
      return;
    }
    const d = res.data;
    _curProject = d.current_project || 'Vinhomes Đan Phượng';
    _evalDate = d.eval_date || '';
    _matrix = d.matrix || {};
    _allRecords = d.records || [];

    renderHeader();
    renderMatrix();
    applyFilters();
  }

  function renderHeader() {
    const prjEl = document.getElementById('home-project-badge');
    if (prjEl) prjEl.textContent = `🏢 Dự án: ${_curProject}`;
    const dateEl = document.getElementById('home-eval-date');
    if (dateEl) dateEl.textContent = `📅 Hôm nay: ${_evalDate}`;
  }

  function renderMatrix() {
    if (!_matrix) return;
    const m = _matrix;

    const fillCell = (id, count, badgeClass, icon) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (count > 0) {
        el.innerHTML = `<span class="${badgeClass} font-bold">${icon ? icon + ' ' : ''}${count} gói</span>`;
      } else {
        el.innerHTML = `<span class="text-[#908CAA] opacity-50">0 gói</span>`;
      }
    };

    // HSMT
    fillCell('m-hsmt-cham', m.hsmt?.cham_count || 0, 'text-[#E74C3C]', '🔴');
    fillCell('m-hsmt-sap-toi', m.hsmt?.sap_toi_count || 0, 'text-[#F39C12]', '🟡');
    fillCell('m-hsmt-dung-han', m.hsmt?.dung_han_count || 0, 'text-[#2ECC71]', '🟢');
    fillCell('m-hsmt-ht', m.hsmt?.hoan_thanh_count || 0, 'text-[#2ECC71]', '☑️');
    fillCell('m-hsmt-total', m.hsmt?.total_count || 0, 'text-[#E0DEF4]', '📊');

    // HĐ
    fillCell('m-hd-cham', m.hd?.cham_count || 0, 'text-[#E74C3C]', '🔴');
    fillCell('m-hd-sap-toi', m.hd?.sap_toi_count || 0, 'text-[#F39C12]', '🟡');
    fillCell('m-hd-dung-han', m.hd?.dung_han_count || 0, 'text-[#2ECC71]', '🟢');
    fillCell('m-hd-ht', m.hd?.hoan_thanh_count || 0, 'text-[#2ECC71]', '☑️');
    fillCell('m-hd-total', m.hd?.total_count || 0, 'text-[#E0DEF4]', '📊');

    // BĐTC
    fillCell('m-bdtc-cham', m.bd_tc?.cham_count || 0, 'text-[#E74C3C]', '🔴');
    fillCell('m-bdtc-sap-toi', m.bd_tc?.sap_toi_count || 0, 'text-[#F39C12]', '🟡');
    fillCell('m-bdtc-dung-han', m.bd_tc?.dung_han_count || 0, 'text-[#2ECC71]', '🟢');
    fillCell('m-bdtc-ht', m.bd_tc?.hoan_thanh_count || 0, 'text-[#2ECC71]', '☑️');
    fillCell('m-bdtc-total', m.bd_tc?.total_count || 0, 'text-[#E0DEF4]', '📊');

    // KTTC
    fillCell('m-kttc-cham', m.kt_tc?.cham_count || 0, 'text-[#E74C3C]', '🔴');
    fillCell('m-kttc-sap-toi', m.kt_tc?.sap_toi_count || 0, 'text-[#F39C12]', '🟡');
    fillCell('m-kttc-dung-han', m.kt_tc?.dung_han_count || 0, 'text-[#2ECC71]', '🟢');
    fillCell('m-kttc-ht', m.kt_tc?.hoan_thanh_count || 0, 'text-[#2ECC71]', '☑️');
    fillCell('m-kttc-total', m.kt_tc?.total_count || 0, 'text-[#E0DEF4]', '📊');
  }

  function setStatusFilter(key) {
    _statusFilter = key;
    document.querySelectorAll('.home-status-chip').forEach(btn => {
      const active = (btn.dataset.filter === key);
      btn.classList.toggle('active', active);
    });
    applyFilters();
  }

  function setMilestoneFilter(key) {
    _milestoneFilter = key;
    document.querySelectorAll('.home-milestone-chip').forEach(btn => {
      const active = (btn.dataset.milestone === key);
      btn.classList.toggle('active', active);
    });
    applyFilters();
  }

  function onSearchChange(val) {
    _searchQuery = (val || '').trim().toLowerCase();
    applyFilters();
  }

  function clearSearch() {
    const input = document.getElementById('home-search-input');
    if (input) input.value = '';
    _searchQuery = '';
    applyFilters();
  }

  function onMatrixCellClick(milestone, status) {
    if (milestone) setMilestoneFilter(milestone);
    if (status) setStatusFilter(status);
  }

  function applyFilters() {
    _filteredRecords = _allRecords.filter(r => {
      // 1. Status Filter
      if (_statusFilter === 'CANH_BAO') {
        if (r.status_code !== 'CHAM' && r.status_code !== 'SAP_TOI') return false;
      } else if (_statusFilter === 'CHAM') {
        if (r.status_code !== 'CHAM') return false;
      } else if (_statusFilter === 'SAP_TOI') {
        if (r.status_code !== 'SAP_TOI') return false;
      } else if (_statusFilter === 'DUNG_HAN') {
        if (r.status_code !== 'DUNG_HAN') return false;
      } else if (_statusFilter === 'HOAN_THANH') {
        if (r.status_code !== 'HOAN_THANH') return false;
      }

      // 2. Milestone Filter
      if (_milestoneFilter !== 'ALL') {
        if (r.moc_key !== _milestoneFilter) return false;
      }

      // 3. Search Query
      if (_searchQuery) {
        const text = `${r.magt} ${r.ten} ${r.hm} ${r.note} ${r.status_text}`.toLowerCase();
        if (!text.includes(_searchQuery)) return false;
      }

      return true;
    });

    renderTable();
  }

  function renderTable() {
    const countEl = document.getElementById('home-table-count');
    if (countEl) {
      countEl.textContent = `Hiển thị: ${_filteredRecords.length} / ${_allRecords.length} dòng đánh giá`;
    }

    const tbody = document.getElementById('home-table-body');
    if (!tbody) return;

    if (_filteredRecords.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="9" class="text-center py-8 text-xs text-[#908CAA]">
            Không tìm thấy dòng đánh giá nào phù hợp với bộ lọc hiện tại.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = _filteredRecords.slice(0, 200).map(r => {
      let badgeHtml = '';
      if (r.status_code === 'CHAM') {
        badgeHtml = `<span class="text-[#E74C3C] font-bold">🔴 ${escapeHtml(r.status_text)}</span>`;
      } else if (r.status_code === 'SAP_TOI') {
        badgeHtml = `<span class="text-[#F39C12] font-bold">🟡 ${escapeHtml(r.status_text)}</span>`;
      } else if (r.status_code === 'DUNG_HAN') {
        badgeHtml = `<span class="text-[#2ECC71] font-semibold">🟢 ${escapeHtml(r.status_text)}</span>`;
      } else {
        badgeHtml = `<span class="text-[#2ECC71] font-semibold">✅ ${escapeHtml(r.status_text)}</span>`;
      }

      return `
        <tr class="hover:bg-[#2A283E] transition-colors border-b border-[#2E2E2A] text-xs">
          <td class="text-center font-mono py-1.5 px-2 text-[#908CAA]">${escapeHtml(r.stt)}</td>
          <td class="font-mono text-[#2ECC71] font-semibold py-1.5 px-2 whitespace-nowrap">${escapeHtml(r.magt || '—')}</td>
          <td class="font-medium py-1.5 px-2 max-w-xs truncate" title="${escapeHtml(r.ten)}">${escapeHtml(r.ten)}</td>
          <td class="py-1.5 px-2 text-[#908CAA] max-w-xs truncate" title="${escapeHtml(r.hm)}">${escapeHtml(r.hm || '—')}</td>
          <td class="text-center py-1.5 px-2 whitespace-nowrap font-medium">${escapeHtml(r.moc_title)}</td>
          <td class="text-center font-mono py-1.5 px-2 text-[#908CAA] whitespace-nowrap">${escapeHtml(r.kh_str || '—')}</td>
          <td class="text-center font-mono py-1.5 px-2 whitespace-nowrap">${escapeHtml(r.tt_str || '—')}</td>
          <td class="py-1.5 px-2 whitespace-nowrap">${badgeHtml}</td>
          <td class="py-1.5 px-2 text-[#908CAA] max-w-xs truncate" title="${escapeHtml(r.note)}">${escapeHtml(r.note || '—')}</td>
        </tr>
      `;
    }).join('');
  }

  return {
    init,
    refresh,
    setStatusFilter,
    setMilestoneFilter,
    onSearchChange,
    clearSearch,
    onMatrixCellClick,
  };
})();
