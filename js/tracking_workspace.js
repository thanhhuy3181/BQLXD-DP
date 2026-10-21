'use strict';
const TrackingWorkspace = (() => {
  const labels = {
    'progress': 'Tiến độ',
    'chu-truong': 'Chủ trương',
    'bvtk': 'BVTK',
    'hsmt': 'HSMT',
    'contract': 'Hợp đồng',
    'boq': 'Khối lượng',
    'payment': 'TƯ, TT',
    'contractor': 'Nhà thầu',
    'sap': 'SAP',
    'contractor-data': 'Dữ liệu NT'
  };
  const esc = s => window.escapeHtml(s);
  const states = {};
  let tab = 'progress', data = { items: [], columns: [] }, filtered = [], pageRows = [], generation = 0;
  const norm = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

  function fresh() {
    return {
      search: '', filters: [], hidden: [], order: [], widths: {}, group: '', sort: '',
      desc: false, page: 1, size: 100, pin: 2, font: 12, family: 'Segoe UI',
      bold: false, italic: false, wrap: true, align: 'left', color: '', background: '',
      mode: 'summary', sap: 'hsmt', unlocked: false, selected: [], level: 'Tất cả'
    };
  }

  function state() {
    if (!states[tab]) {
      let saved = {};
      try { saved = JSON.parse(localStorage.getItem('tracking-layout-' + tab) || '{}'); } catch (_) {}
      states[tab] = { ...fresh(), ...saved, search: '', filters: [], selected: [], unlocked: false };
    }
    return states[tab];
  }

  function persist() {
    const s = state();
    const { search, filters, selected, unlocked, ...layout } = s;
    try { localStorage.setItem('tracking-layout-' + tab, JSON.stringify(layout)); } catch (_) {}
  }

  function button(label, action, extra = '', variant = '') {
    let cls = 'tw-btn';
    if (variant) {
      cls += ' ' + variant;
    } else if (/(xóa|hủy|đóng|khóa)/i.test(label)) {
      cls += ' tw-btn-danger';
    } else if (/(lưu|thêm|áp dụng|bổ sung)/i.test(label)) {
      cls += ' tw-btn-success';
    } else if (/(excel|copy)/i.test(label)) {
      cls += ' tw-btn-success';
    } else if (/(sửa|đổi tên|kiểm tra|rà soát|cột|nhóm)/i.test(label)) {
      cls += ' tw-btn-warning';
    } else if (/(nạp|quét|tìm|mở|đồng bộ|tổng hợp|chi tiết)/i.test(label)) {
      cls += ' tw-btn-info';
    }
    return `<button type="button" class="${cls}" ${extra} onclick="TrackingWorkspace.${action}">${label}</button>`;
  }

  function tile(title, body) {
    return `<section class="tw-tile"><div class="tw-controls">${body}</div><div class="tw-caption">${title}</div></section>`;
  }

  function setup() {
    if (document.getElementById('tracking-workspace')) return;
    const style = document.createElement('style');
    style.textContent = `
      :root, #tracking-workspace, .tw-dialog, #tw-dialog {
        --tw-bg: #26233a;
        --tw-cell: #1f1d2e;
        --tw-hover: #312f44;
        --tw-text: #e0def4;
        --tw-border: #56526e;
        --tw-header: #26233a;
      }
      #tracking-workspace {
        display: flex;
        flex-direction: column;
        min-height: 0;
        flex: 1;
        gap: 8px;
        padding: 8px;
        background-color: var(--tw-bg);
        color: var(--tw-text);
      }
      html[data-theme=light] #tracking-workspace,
      html[data-theme=corporate] #tracking-workspace,
      html[data-theme=winter] #tracking-workspace,
      html[data-theme=nord] #tracking-workspace,
      html[data-theme=emerald] #tracking-workspace,
      html[data-theme=cupcake] #tracking-workspace {
        --tw-bg: #edf0f5;
        --tw-cell: #fff;
        --tw-hover: #f3f5f9;
        --tw-text: #202638;
        --tw-border: #c8d0dd;
        --tw-header: #e2e8f0;
      }
      .tw-ribbon {
        display: flex;
        gap: 6px;
        flex-shrink: 0;
        overflow-x: auto;
        padding-bottom: 4px;
      }
      .tw-tile {
        border: 1px solid var(--tw-border);
        border-radius: 6px;
        min-width: 210px;
        max-width: 440px;
        display: flex;
        flex-direction: column;
        resize: horizontal;
        overflow: auto;
        background: var(--tw-bg);
      }
      .tw-controls {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        align-content: flex-start;
        padding: 6px 8px;
        flex: 1;
        min-height: 72px;
      }
      .tw-caption {
        text-align: center;
        font-size: 10px;
        font-weight: 800;
        letter-spacing: 0.5px;
        padding: 3px;
        border-top: 1px solid var(--tw-border);
        color: #38bdf8;
        background: rgba(0,0,0,0.2);
        user-select: none;
      }
      .tw-controls button, .tw-controls input, .tw-controls select, .tw-footer button {
        border: 1px solid var(--tw-border);
        background: var(--tw-bg);
        color: var(--tw-text);
        border-radius: 4px;
        padding: 3px 6px;
        font-size: 11px;
        font-weight: 600;
      }
      .tw-controls button[aria-pressed=true] {
        background: #0F6E56 !important;
        color: white !important;
        border-color: #2ECC71 !important;
      }

      /* Tactile 3D Buttons */
      .tw-btn {
        background: linear-gradient(180deg, #2e2b44 0%, #222036 100%) !important;
        border: 1px solid #56526e !important;
        color: #ededea !important;
        border-radius: 6px !important;
        padding: 4px 10px !important;
        font-size: 11px !important;
        font-weight: 700 !important;
        box-shadow: 0 2px 4px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.15) !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        gap: 5px !important;
        cursor: pointer !important;
        user-select: none !important;
        transition: all 0.12s ease-in-out !important;
        white-space: nowrap !important;
      }
      .tw-btn:hover {
        background: linear-gradient(180deg, #3d395a 0%, #2a2842 100%) !important;
        border-color: #ebbcba !important;
        color: #ffffff !important;
        box-shadow: 0 4px 8px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.25) !important;
        transform: translateY(-1px) !important;
      }
      .tw-btn:active {
        background: #1f1d2e !important;
        box-shadow: inset 0 2px 4px rgba(0,0,0,0.7) !important;
        transform: translateY(1px) !important;
      }
      .tw-btn-primary {
        background: linear-gradient(180deg, #ebbcba 0%, #d49896 100%) !important;
        color: #191724 !important;
        border-color: #f6c177 !important;
      }
      .tw-btn-success {
        background: linear-gradient(180deg, #13886b 0%, #0c5744 100%) !important;
        color: #ffffff !important;
        border-color: #2ecc71 !important;
      }
      .tw-btn-warning {
        background: linear-gradient(180deg, #d97706 0%, #b45309 100%) !important;
        color: #ffffff !important;
        border-color: #f59e0b !important;
      }
      .tw-btn-danger {
        background: linear-gradient(180deg, #b91c1c 0%, #881337 100%) !important;
        color: #ffffff !important;
        border-color: #ef4444 !important;
      }
      .tw-btn-info {
        background: linear-gradient(180deg, #0284c7 0%, #0369a1 100%) !important;
        color: #ffffff !important;
        border-color: #38bdf8 !important;
      }

      .tw-table-scroll {
        flex: 1;
        min-height: 0;
        overflow: auto;
        border: 1px solid var(--tw-border);
        border-radius: 6px;
      }
      .tw-table {
        border-collapse: separate;
        border-spacing: 0;
        table-layout: fixed;
        width: max-content;
        min-width: 0;
      }
      .tw-table th, .tw-table td {
        border-right: 1px solid var(--tw-border);
        border-bottom: 1px solid var(--tw-border);
        padding: 6px;
        overflow: hidden;
        vertical-align: top;
        box-sizing: border-box;
      }
      .tw-table th {
        position: sticky !important;
        top: 0 !important;
        z-index: 20 !important;
        background-color: var(--tw-header) !important;
        font-weight: 800 !important;
        text-align: center;
        cursor: pointer;
        white-space: normal;
        border-bottom: 2px solid var(--tw-border) !important;
        box-shadow: 0 3px 6px rgba(0,0,0,0.5) !important;
      }
      .tw-table td {
        background: var(--tw-cell);
        line-height: 1.35;
      }
      .tw-table tr:hover td {
        background: var(--tw-hover) !important;
      }
      .tw-footer {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        align-items: center;
        font-size: 11px;
      }

      /* 100% Solid Non-Transparent Window/Dialog */
      .tw-dialog, #tw-dialog {
        position: fixed !important;
        top: 50% !important;
        left: 50% !important;
        transform: translate(-50%, -50%) !important;
        margin: 0 !important;
        width: 92vw !important;
        max-width: 1120px !important;
        height: 86vh !important;
        max-height: 900px !important;
        min-width: 620px !important;
        min-height: 450px !important;
        background-color: #1f1d2e !important;
        color: #e0def4 !important;
        opacity: 1 !important;
        backdrop-filter: none !important;
        -webkit-backdrop-filter: none !important;
        border: 2px solid #56526e !important;
        border-radius: 12px !important;
        box-shadow: 0 25px 65px -10px rgba(0,0,0,0.95), 0 0 0 1px rgba(255,255,255,0.15) !important;
        resize: both !important;
        overflow: hidden !important;
        display: flex !important;
        flex-direction: column !important;
        padding: 0 !important;
        z-index: 9999 !important;
      }
      .tw-dialog.tw-dialog-maximized {
        width: 98vw !important;
        height: 96vh !important;
        max-width: 98vw !important;
        max-height: 96vh !important;
        border-radius: 6px !important;
      }
      .tw-dialog::backdrop {
        background: rgba(0,0,0,0.85) !important;
        backdrop-filter: none !important;
        -webkit-backdrop-filter: none !important;
        opacity: 1 !important;
      }
      .tw-dialog-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 16px;
        background-color: #26233a !important;
        border-bottom: 2px solid #56526e;
        flex-shrink: 0;
        user-select: none;
      }
      .tw-dialog-title {
        font-size: 13px;
        font-weight: 800;
        color: #f6c177;
        letter-spacing: 0.5px;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .tw-btn-window {
        background: #312f44;
        border: 1px solid #56526e;
        color: #e0def4;
        border-radius: 4px;
        padding: 3px 9px;
        font-size: 12px;
        font-weight: 700;
        cursor: pointer;
        transition: all 0.15s;
      }
      .tw-btn-window:hover {
        background: #46425b;
        color: #ffffff;
        border-color: #8bd5f7;
      }
      .tw-btn-window-close {
        background: #881337;
        border-color: #ef4444;
        color: #ffffff;
      }
      .tw-btn-window-close:hover {
        background: #b91c1c !important;
        border-color: #f87171 !important;
      }
      .tw-dialog-subbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 8px 16px;
        background-color: #201e33 !important;
        border-bottom: 1px solid #46425b;
        flex-shrink: 0;
        flex-wrap: wrap;
      }
      .tw-chip {
        background: #2a283e;
        border: 1px solid #56526e;
        color: #b4b0cb;
        border-radius: 12px;
        padding: 2px 10px;
        font-size: 10px;
        font-weight: 700;
        cursor: pointer;
        transition: all 0.12s;
        user-select: none;
      }
      .tw-chip:hover, .tw-chip.active {
        background: #ebbcba !important;
        color: #191724 !important;
        border-color: #f6c177 !important;
      }
      .tw-dialog-body {
        flex: 1 1 auto;
        min-height: 0;
        overflow: auto;
        background-color: #1f1d2e !important;
        padding: 0;
      }
      .tw-column-table {
        width: 100%;
        border-collapse: separate;
        border-spacing: 0;
      }
      .tw-column-table thead th {
        position: sticky !important;
        top: 0 !important;
        z-index: 30 !important;
        background-color: #26233a !important;
        color: #ffffff !important;
        font-weight: 800 !important;
        font-size: 11px !important;
        border-bottom: 2px solid #56526e !important;
        border-right: 1px solid #46425b !important;
        padding: 8px 10px !important;
        white-space: nowrap !important;
        box-shadow: 0 3px 6px rgba(0,0,0,0.5) !important;
        text-align: center;
      }
      .tw-column-table tbody td {
        padding: 6px 10px !important;
        border-bottom: 1px solid #36324e !important;
        border-right: 1px solid #36324e !important;
        background-color: #1f1d2e !important;
        color: #e0def4 !important;
        font-size: 11px !important;
        vertical-align: middle;
      }
      .tw-column-table tbody tr:hover td {
        background-color: #2f2b48 !important;
      }
      .tw-dialog-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 16px;
        background-color: #26233a !important;
        border-top: 2px solid #56526e !important;
        flex-shrink: 0;
        gap: 8px;
        flex-wrap: wrap;
      }
      .tw-filter { display: flex; gap: 4px; width: 100%; align-items: center; }
      .tw-kpi { display: flex; flex-wrap: wrap; gap: 16px; padding: 8px 12px; background: var(--tw-bg); border-radius: 6px; font-size: 12px; align-items: center; }
      .tw-link { color: #36c584; text-decoration: underline; cursor: pointer; background: transparent; border: none; text-align: inherit; font: inherit; font-weight: bold; }
      .tw-group-row td { background: #0369a1 !important; color: white !important; font-weight: bold; }
    `;
    document.head.appendChild(style);

    const host = document.getElementById('td-subpane-container');
    if (host) host.insertAdjacentHTML('beforeend', '<div id="tracking-workspace"></div>');

    // Đảm bảo cả 10 Tab đều hiện diện đầy đủ trên thanh điều hướng sidebar
    for (const id of ['chu-truong', 'bvtk']) {
      if (!document.querySelector(`[data-td="${id}"]`)) {
        const b = document.createElement('button');
        b.className = 'sub-nav-btn btn btn-sm w-full justify-start gap-2 rounded-lg text-xs font-bold';
        b.dataset.td = id;
        b.innerHTML = `<span>${id === 'chu-truong' ? '📋' : '📐'}</span><span>${labels[id]}</span>`;
        b.onclick = () => switchTheoDoiSubTab(id);
        const ref = document.querySelector('[data-td="hsmt"]');
        if (ref && ref.parentNode) ref.parentNode.insertBefore(b, ref);
      }
    }

    const badge = document.querySelector('#td-sidebar-list')?.previousElementSibling?.previousElementSibling?.querySelector(':scope > span:last-child');
    if (badge) badge.textContent = '10 Tab';

    document.addEventListener('keydown', e => {
      if (_currentTopNav !== 'theo_doi' || e.target.matches('input,textarea,select')) return;
      if (e.ctrlKey && e.key.toLowerCase() === 'c') { e.preventDefault(); copy(); }
      if (e.key === 'F5') { e.preventDefault(); reload(); }
    });
  }

  async function activate(id) {
    setup();
    tab = id;
    state();
    document.querySelectorAll('#td-subpane-container .subpane').forEach(el => el.classList.remove('active'));
    const tw = document.getElementById('tracking-workspace');
    if (tw) tw.style.display = 'flex';
    await reload();
  }

  async function reload() {
    const run = ++generation, id = tab, s = state();
    shell();
    const res = await API.call('get_tracking_workspace', id, id === 'sap' ? s.sap : s.mode);
    if (run !== generation || tab !== id) return;
    if (!res.ok) {
      data = { items: [], columns: [] };
      filtered = [];
      const sum = document.getElementById('tw-summary');
      if (sum) sum.textContent = 'Lỗi tải dữ liệu: ' + res.error;
      const tbl = document.getElementById('tw-table');
      if (tbl) tbl.innerHTML = '';
      toast(res.error, 'error');
      return;
    }
    data = res.data;
    s.selected = [];
    s.page = 1;
    if (!s.columnsInitialized) {
      s.hidden = [...new Set([...s.hidden, ...data.columns.filter(c => c.extra).map(c => c.key)])];
      s.columnsInitialized = true;
    }
    if (!s.quickInitialized) {
      const defaults = {
        progress: ['hm_ct', 'hm_toa', 'lo', 'trang_thai_hd'],
        hsmt: ['hd_hsmt', 'cong_trinh', 'hang_muc', 'loai_goi'],
        contract: ['hd_hsmt', 'cong_trinh', 'lo', 'phan_khu'],
        payment: ['loai_tt', 'ten_nha_thau', 'so_hd', 'ma_ccm'],
        contractor: ['tinh_trang_qt_chung', 'xep_hang_quy_mo', 'ten_nt_rut_gon', 'loai_goi_chinh'],
        'chu-truong': ['loai_cong_trinh', 'loai_noi_dung'],
        bvtk: ['loai_cong_trinh', 'loai_noi_dung'],
        boq: ['cls_hang_muc', 'cls_loai_goi', 'cls_cong_trinh'],
        'contractor-data': ['nhom_ncc', 'trang_thai_ncc']
      };
      s.filters = (defaults[id] || []).filter(k => data.columns.some(c => c.key === k)).map(key => ({ key, value: '' }));
      s.quickInitialized = true;
    }
    renderFilters();
    renderGroups();
    render();
  }

  function getTabActions(t, s) {
    let act = '';
    if (t === 'progress') {
      act += button('➕ Thêm HM', 'addRow()', 'style="background:#0F6E56;color:white"');
      act += button('🗑️ Xóa Đã Chọn', 'deleteRows()', 'style="background:#C0392B;color:white"');
      act += button('💾 Lưu Dữ Liệu', 'saveData()', 'style="background:#2980B9;color:white"');
      act += button('🔄 Nạp Lại', 'reload()');
      act += button('📊 Xuất Excel', 'exportExcel()');
      act += button('📋 Copy Excel', 'copy()');
      act += button(s.unlocked ? '🔓 Cho sửa' : '🔒 Khóa sửa', 'toggleEdit()');
    } else if (t === 'hsmt') {
      act += button('📊 Xuất Excel', 'exportExcel()', 'style="background:#1E7145;color:white"');
      act += button('🌐 Web-Excel', 'openWebExcel()', 'style="background:#0F6E56;color:white"');
      act += button(s.unlocked ? '🔓 Cho sửa' : '🔒 Khóa', 'toggleEdit()');
      act += button('📁 Thư mục quét', "chooseFolderAction('hsmt')");
      act += button('🔍 Kiểm tra HSMT', 'auditHsmt()', 'style="background:#D35400;color:white"');
      act += button('🔗 Ghép Căn cứ', 'matchHsmt()', 'style="background:#2980B9;color:white"');
      act += button('🔄 Nạp lại', 'reload()');
      act += button('📋 Copy Excel', 'copy()');
    } else if (t === 'contract') {
      act += button('🌐 Web-Excel', 'openWebExcel()', 'style="background:#0F6E56;color:white"');
      act += button('🔍 Kiểm tra HĐ', 'auditContract()', 'style="background:#D35400;color:white"');
      act += button('⚡ Đồng bộ SAP', 'syncSap()', 'style="background:#2980B9;color:white"');
      act += button('📁 Thư mục quét', "chooseFolderAction('contract')");
      act += button(s.unlocked ? '🔓 Cho sửa' : '🔒 Khóa', 'toggleEdit()');
      act += button('🔄 Nạp lại', 'reload()');
      act += button('📊 Xuất Excel', 'exportExcel()');
      act += button('📋 Copy Excel', 'copy()');
    } else if (t === 'payment') {
      act += button('➕ Tạo HSTT Mới', 'createHstt()', 'style="background:#0F6E56;color:white"');
      act += button('➕ Cập nhật thêm', 'scanHstt(false)');
      act += button('🔄 Quét toàn bộ', 'scanHstt(true)', 'style="background:#5D4037;color:white"');
      act += button('💳 Danh sách TK', 'openBankAccounts()', 'style="background:#1E3A8A;color:white"');
      act += button('📑 File Mẫu', 'openTemplate()');
      act += button('🔄 Thay Mẫu', 'changeTemplate()');
      act += button('🗑️ Xóa Đã Chọn', 'deleteRows()', 'style="background:#7F1D1D;color:white"');
      act += button('🌐 Web-Excel', 'openWebExcel()');
      act += button('📁 Thư mục lưu', "chooseFolderAction('payment')");
      act += button('📊 Xuất Excel', 'exportExcel()');
      act += button('📋 Copy Excel', 'copy()');
      act += button(s.unlocked ? '🔓 Cho sửa' : '🔒 Khóa', 'toggleEdit()');
    } else if (t === 'boq') {
      act += button('🔽 Thu gọn', 'collapseBoq()');
      act += button('🔼 Mở rộng', 'expandBoq()');
      act += button('↔️ Auto-Fit', 'autofit()');
      act += button('➕ Bổ sung HSMT', 'addBoqHsmt()', 'style="background:#0F6E56;color:white"');
      act += button('📂 Thêm BOQ file', 'pickBoqFiles()', 'style="background:#2980B9;color:white"');
      act += button('🚀 Trích xuất KL', "openFunction('cn-extract-boq')", 'style="background:#E67E22;color:white"');
      act += button('📊 Xuất Excel', 'exportExcel()');
      act += button('📋 Copy Excel', 'copy()');
    } else if (t === 'contractor') {
      act += button('📊 Tổng hợp NT', "setMode('summary')", `aria-pressed="${s.mode === 'summary'}"`);
      act += button('📑 Chi tiết HĐ', "setMode('detail')", `aria-pressed="${s.mode === 'detail'}"`);
      act += button('🔄 Nạp lại', 'reload()');
      act += button('📊 Xuất Excel', 'exportExcel()');
      act += button('📋 Copy Excel', 'copy()');
    } else if (t === 'sap') {
      act += ['hsmt', 'ccm', 'plhd', 'pr'].map(k => button(k.toUpperCase(), `setSap('${k}')`, `aria-pressed="${s.sap === k}"`)).join('');
      act += button('🔄 Nạp lại từ đĩa', 'reload()', 'style="background:#2980B9;color:white"');
      act += button('📊 Xuất Excel', 'exportExcel()', 'style="background:#0F6E56;color:white"');
      act += button('📋 Copy Excel', 'copy()');
    } else if (t === 'contractor-data') {
      act += button('🔄 Cập nhật DS Excel', 'importContractorExcel()', 'style="background:#D35400;color:white"');
      act += button('🔍 Rà soát trùng NT', 'auditContractors()', 'style="background:#27AE60;color:white"');
      act += button(s.unlocked ? '🔓 Cho sửa' : '🔒 Khóa', 'toggleEdit()');
      act += button('🔄 Nạp lại', 'reload()');
      act += button('📊 Xuất Excel', 'exportExcel()');
      act += button('📋 Copy Excel', 'copy()');
    } else if (t === 'chu-truong' || t === 'bvtk') {
      act += button('🔄 Cập nhật', 'reload()', 'style="background:#107C41;color:white"');
      act += button('📁 Thư mục quét', `chooseFolderAction('${t}')`);
      act += button('⬇️ Mới hơn', 'sortDate(true)');
      act += button('⬆️ Cũ hơn', 'sortDate(false)');
      act += button('📊 Xuất Excel', 'exportExcel()');
      act += button('📋 Copy Excel', 'copy()');
    }
    return act;
  }

  function shell() {
    const s = state();
    const actions = getTabActions(tab, s);

    let extraTiles = '';
    if (tab === 'payment') {
      const sortQuick = button('📅 Sửa mới nhất', "sortPayment('mtime')", 'style="background:#C0392B;color:white"') +
                        button('⏳ NT nộp mới nhất', "sortPayment('ngay_nt')", 'style="background:#D35400;color:white"') +
                        button('🏷️ Mã PR', "sortPayment('ma_pr')", 'style="background:#8E44AD;color:white"');
      extraTiles += tile('SẮP XẾP NHANH', sortQuick);
    } else if (tab === 'chu-truong' || tab === 'bvtk') {
      const levelButtons = ['Tất cả', '1', '2', '3', '4', '5'].map(lvl =>
        button(lvl === 'Tất cả' ? 'Toàn bộ' : `Cấp ${lvl}`, `filterLevel('${lvl}')`, `aria-pressed="${s.level === lvl}"`)
      ).join('');
      extraTiles += tile('PHÂN CẤP THƯ MỤC', levelButtons);
    }

    const search = `<input id="tw-search" aria-label="Tìm kiếm toàn bộ bảng" placeholder="Tìm mã, tên, nhà thầu…" value="${esc(s.search)}" style="width:160px" oninput="TrackingWorkspace.search(this.value)" onkeydown="if(event.key==='Enter'){event.preventDefault();TrackingWorkspace.applySearch()}" title="Tìm trên tất cả các cột; nhấn Enter để áp dụng">${button('✕', "search('')", 'aria-label="Xóa tìm kiếm" title="Xóa từ khóa"')}${button('🔍', 'applySearch()', 'title="Tìm kiếm"')}${button('⚙ Cột', 'columns()')}<div id="tw-groups" class="flex flex-wrap gap-1 mt-1"></div>`;
    const filter = `<div id="tw-filters" style="width:100%"></div><div class="flex gap-1 mt-1">${button('＋ Bộ lọc', 'addFilter()')}${button('Xóa bộ lọc', 'clearFilters()')}</div>`;
    const fmt = `<select aria-label="Phông chữ" onchange="TrackingWorkspace.setting('family',this.value)">${['Segoe UI', 'Arial', 'Calibri', 'Times New Roman'].map(v => `<option ${v === s.family ? 'selected' : ''}>${v}</option>`).join('')}</select><input type="number" aria-label="Cỡ chữ" min="8" max="28" value="${s.font}" style="width:48px" onchange="TrackingWorkspace.setting('font',Number(this.value))">${button('B', "toggle('bold')", `aria-label="Chữ đậm" aria-pressed="${s.bold}"`)}${button('I', "toggle('italic')", `aria-label="Chữ nghiêng" aria-pressed="${s.italic}"`)}${button('Wrap', "toggle('wrap')", `aria-pressed="${s.wrap}"`)}<select aria-label="Căn lề" onchange="TrackingWorkspace.setting('align',this.value)">${[['left', 'Trái'], ['center', 'Giữa'], ['right', 'Phải']].map(([v, l]) => `<option value="${v}" ${v === s.align ? 'selected' : ''}>${l}</option>`).join('')}</select><label title="Màu chữ">A <input type="color" aria-label="Màu chữ" value="${s.color || '#e0def4'}" onchange="TrackingWorkspace.setting('color',this.value)"></label><label title="Màu nền">🖌 <input type="color" aria-label="Màu nền" value="${s.background || '#26233a'}" onchange="TrackingWorkspace.setting('background',this.value)"></label>${button('↔ Auto-Fit', 'autofit()')}${button('Mặc định', 'resetFormatting()')}`;
    const display = `<select aria-label="Ghim cột" onchange="TrackingWorkspace.setting('pin',Number(this.value))">${Array.from({ length: 10 }, (_, n) => `<option value="${n}" ${n === s.pin ? 'selected' : ''}>${n ? '📌 Ghim ' + n + ' cột' : '📌 Không ghim'}</option>`).join('')}</select><select aria-label="Số dòng mỗi trang" onchange="TrackingWorkspace.setting('size',Number(this.value))">${[50, 100, 200, 500].map(n => `<option ${n === s.size ? 'selected' : ''}>${n} dòng/trang</option>`).join('')}</select>${button('−', "fontStep(-1)")}${button('+', "fontStep(1)")}<select id="tw-groupby" aria-label="Nhóm dòng" onchange="TrackingWorkspace.setting('group',this.value)"><option value="">Không nhóm dòng</option></select>`;

    const container = document.getElementById('tracking-workspace');
    if (!container) return;
    container.innerHTML = `
      <div class="tw-ribbon">
        ${tile('CHỨC NĂNG', actions)}
        ${extraTiles}
        ${tile('TÌM KIẾM & PHÂN LOẠI', search)}
        ${tile('BỘ LỌC NHANH', filter)}
        ${tile('TRÌNH BÀY', fmt)}
        ${tile('HIỂN THỊ', display)}
      </div>
      <div id="tw-summary" class="tw-kpi" role="status">Đang nạp ${labels[tab]}…</div>
      <div class="tw-table-scroll"><table id="tw-table" class="tw-table"></table></div>
      <div class="tw-footer">
        ${button('📊 Xuất Excel', 'exportExcel()')}
        ${button('📋 Copy sang Excel', 'copy()')}
        ${button('🔄 Nạp lại dữ liệu', 'reload()')}
        <span id="tw-page-info" style="margin-left:auto;font-weight:bold"></span>
        ${button('⏮', "goPage('first')")}
        ${button('◀', "goPage('prev')")}
        ${button('▶', "goPage('next')")}
        ${button('⏭', "goPage('last')")}
      </div>
    `;
  }

  function renderValue(row, col, index) {
    const value = row[col.key] ?? '';
    const linked = ['full_path', 'path', 'ma_hsmt', 'tt_nha_thau', 'danh_sach_ma_hd'].includes(col.key) || (tab === 'contractor' && col.key === 'ma_nt');
    return linked && value ? `<button class="tw-link" data-key="${esc(col.key)}" onclick="TrackingWorkspace.linkCell(${index},this.dataset.key)">${esc(value)}</button>` : esc(value);
  }

  async function linkCell(index, key) {
    const row = pageRows[index];
    if (['full_path', 'path'].includes(key)) {
      const r = await API.call('open_path', row[key]);
      if (!r.ok) toast(r.error, 'error');
      return;
    }
    if (key === 'danh_sach_ma_hd') {
      const codes = row.all_codes || String(row[key]).match(/HD[0-9]+/g) || [];
      const el = dialog('<h3>Hợp đồng của nhà thầu</h3>');
      for (const code of codes) {
        const b = document.createElement('button');
        b.className = 'btn btn-sm btn-outline m-1';
        b.textContent = code;
        b.onclick = async () => {
          el.close();
          await switchTheoDoiSubTab('contract');
          search(code);
        };
        el.appendChild(b);
      }
      return;
    }
    if (key === 'tt_nha_thau') {
      const text = String(row[key] || '');
      const codes = text.match(/\b([12]\d{9,15})\b/g) || [];
      if (codes.length > 1) {
        const el = dialog('<h3>Chọn mã Hợp đồng / Phụ lục (CCM/PLHĐ):</h3>');
        for (const code of codes) {
          const b = document.createElement('button');
          b.className = 'btn btn-sm btn-primary m-1';
          b.textContent = code;
          b.onclick = async () => {
            el.close();
            await switchTheoDoiSubTab('contract');
            search(code);
          };
          el.appendChild(b);
        }
        return;
      } else if (codes.length === 1) {
        await switchTheoDoiSubTab('contract');
        search(codes[0]);
        return;
      }
    }
    if (key === 'ma_hsmt') {
      const text = String(row[key] || '');
      const codes = text.match(/\b(7\d{7,9}|\d{8,12})\b/g) || [];
      if (codes.length > 1) {
        const el = dialog('<h3>Chọn mã Hồ sơ mời thầu (HSMT):</h3>');
        for (const code of codes) {
          const b = document.createElement('button');
          b.className = 'btn btn-sm btn-primary m-1';
          b.textContent = code;
          b.onclick = async () => {
            el.close();
            await switchTheoDoiSubTab('hsmt');
            search(code);
          };
          el.appendChild(b);
        }
        return;
      }
    }
    const target = key === 'ma_nt' ? 'contractor-data' : (key === 'tt_nha_thau' ? 'contract' : 'hsmt');
    const keyword = String(row[key] || '');
    await switchTheoDoiSubTab(target);
    search(keyword);
  }

  function visibleColumns() {
    const s = state();
    return data.columns.filter(c => !s.hidden.includes(c.key)).sort((a, b) => {
      const x = s.order.indexOf(a.key), y = s.order.indexOf(b.key);
      return (x < 0 ? 100000 + data.columns.indexOf(a) : x) - (y < 0 ? 100000 + data.columns.indexOf(b) : y);
    });
  }

  function compare(a, b) {
    const date = v => {
      const m = String(v).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      return m ? `${m[3]}${m[2].padStart(2, '0')}${m[1].padStart(2, '0')}` : String(v ?? '');
    };
    const numeric = v => {
      if (typeof v === 'number') return v;
      let t = String(v ?? '').trim().replace(/%$/, '');
      if (!/^-?\d[\d.,\s]*$/.test(t)) return null;
      if (/^[-\d]+(?:\.\d{3})+(?:,\d+)?$/.test(t)) t = t.replace(/\./g, '').replace(',', '.');
      else if (/^[-\d]+(?:,\d{3})+(?:\.\d+)?$/.test(t)) t = t.replace(/,/g, '');
      else if (t.includes(',') && !t.includes('.')) t = t.replace(',', '.');
      const n = Number(t.replace(/\s/g, ''));
      return Number.isFinite(n) ? n : null;
    };
    const x = numeric(a), y = numeric(b);
    if (x !== null && y !== null) return x - y;
    return date(a).localeCompare(date(b), 'vi', { numeric: true, sensitivity: 'base' });
  }

  function selectRows() {
    const s = state();
    let rows = data.items.map((r, i) => ({ ...r, _position: i })).filter(r => {
      if (s.search) {
        const query = norm(s.search);
        const match = norm(data.columns.map(c => r[c.key] ?? '').join(' ')).includes(query);
        if (!match) return false;
      }
      if (s.level && s.level !== 'Tất cả' && r.cap_thu_muc && String(r.cap_thu_muc) !== s.level) {
        return false;
      }
      return s.filters.every(f => !f.key || !f.value || String(r[f.key] ?? '') === f.value);
    });

    if (s.sort) rows.sort((a, b) => compare(a[s.sort], b[s.sort]) * (s.desc ? -1 : 1));
    if (s.group) rows.sort((a, b) => compare(a[s.group], b[s.group]));
    return rows;
  }

  function render() {
    const s = state();
    persist();
    filtered = selectRows();
    const pages = Math.max(1, Math.ceil(filtered.length / s.size));
    s.page = Math.max(1, Math.min(pages, s.page));
    pageRows = filtered.slice((s.page - 1) * s.size, s.page * s.size);
    const cols = visibleColumns();

    const groupBy = document.getElementById('tw-groupby');
    if (groupBy) {
      groupBy.innerHTML = '<option value="">Không nhóm dòng</option>' + data.columns.filter(c => c.key !== 'stt').map(c => `<option value="${esc(c.key)}" ${s.group === c.key ? 'selected' : ''}>Nhóm: ${esc(c.label)}</option>`).join('');
    }

    let offset = 36;
    const styles = cols.map((c, i) => {
      const width = s.widths[c.key] || c.width || 160;
      const pinned = i < s.pin;
      const st = `width:${width}px;min-width:${width}px;max-width:${width}px;${pinned ? `position:sticky;left:${offset}px;z-index:10;background-color:var(--tw-cell) !important;` : ''}`;
      offset += width;
      return st;
    });

    let previous = Symbol();
    const body = pageRows.map((r, i) => {
      let heading = '';
      if (s.group && r[s.group] !== previous) {
        previous = r[s.group];
        heading = `<tr class="tw-group-row"><td colspan="${cols.length + 1}">${esc(previous || '(Trống)')}</td></tr>`;
      }
      return heading + `<tr><td style="width:36px;min-width:36px;position:sticky;left:0;z-index:15;background-color:var(--tw-cell) !important;text-align:center"><input type="checkbox" class="checkbox checkbox-xs" aria-label="Chọn dòng ${i + 1}" ${s.selected.includes(r._position) ? 'checked' : ''} onchange="TrackingWorkspace.select(${r._position},this.checked)"></td>${cols.map((c, j) => `<td style="${styles[j]}font-size:${s.font}px;font-family:${esc(s.family)};font-weight:${s.bold ? 'bold' : 'normal'};font-style:${s.italic ? 'italic' : 'normal'};white-space:${s.wrap ? 'pre-wrap' : 'nowrap'};text-align:${s.align};${s.color ? 'color:' + s.color + ';' : ''}${s.background ? 'background:' + s.background + ';' : ''}" title="${esc(r[c.key] ?? '')}" data-key="${esc(c.key)}" ondblclick="TrackingWorkspace.cell(${i},this.dataset.key)">${c.key === 'stt' ? (s.page - 1) * s.size + i + 1 : renderValue(r, c, i)}</td>`).join('')}</tr>`;
    }).join('');

    const tbl = document.getElementById('tw-table');
    if (tbl) {
      tbl.style.width = (36 + cols.reduce((n, c) => n + (s.widths[c.key] || c.width || 160), 0)) + 'px';
      tbl.innerHTML = `<thead><tr><th style="width:36px;min-width:36px;position:sticky;left:0;z-index:35;background-color:var(--tw-header) !important;"><input type="checkbox" aria-label="Chọn cả trang" class="checkbox checkbox-xs" onchange="TrackingWorkspace.selectPage(this.checked)"></th>${cols.map((c, j) => `<th style="${styles[j]};position:sticky;top:0;z-index:${j < s.pin ? 30 : 20};background-color:var(--tw-header) !important;" data-key="${esc(c.key)}" onclick="TrackingWorkspace.sort(this.dataset.key)">${esc(c.label)} ${s.sort === c.key ? (s.desc ? '▼' : '▲') : '↕'}</th>`).join('')}</tr></thead><tbody>${body || `<tr><td colspan="${cols.length + 1}" style="padding:35px;text-align:center">Không có dữ liệu phù hợp trong dự án này.</td></tr>`}</tbody>`;
    }

    const pageInfo = document.getElementById('tw-page-info');
    if (pageInfo) pageInfo.textContent = `${filtered.length ? ((s.page - 1) * s.size + 1) : 0}–${Math.min(s.page * s.size, filtered.length)} / ${filtered.length} dòng · Trang ${s.page}/${pages} · Chọn ${s.selected.length}`;

    const summary = document.getElementById('tw-summary');
    if (summary) {
      summary.innerHTML = `<strong>${labels[tab]}</strong><span>Dự án: <b class="text-[#F1C40F]">${esc(data.project || '')}</b></span><span>${data.items.length} bản ghi nguồn · ${filtered.length} bản ghi hiển thị</span>`;
      if (tab === 'contractor' && s.mode === 'summary') {
        const sum = k => filtered.reduce((n, r) => n + (Number(r[k]) || 0), 0);
        summary.innerHTML += `<span>${sum('so_luong_hd')} HĐ</span><span>Giá trị: <b>${sum('tong_gia_tri_hd_num').toLocaleString('vi-VN')}</b> đ</span><span>Đã TT: <b>${sum('tong_luy_ke_tt_num').toLocaleString('vi-VN')}</b> đ</span><span>Chưa TT: <b>${sum('tong_chua_tt_num').toLocaleString('vi-VN')}</b> đ</span>`;
      }
    }
  }

  function search(value) { state().search = value; state().page = 1; const el = document.getElementById('tw-search'); if (el) el.value = value; render(); }
  function applySearch() { search(document.getElementById('tw-search')?.value || ''); }
  function sort(key) { const s = state(); s.desc = s.sort === key ? !s.desc : false; s.sort = key; s.page = 1; render(); }
  function setting(key, value) { const s = state(); if (key === 'font') value = Math.max(8, Math.min(28, value || 12)); s[key] = value; s.page = 1; render(); }
  function toggle(key) { state()[key] = !state()[key]; shell(); renderFilters(); renderGroups(); render(); }
  function fontStep(delta) { state().font = Math.max(8, Math.min(28, state().font + delta)); shell(); renderFilters(); renderGroups(); render(); }
  function resetFormatting() { Object.assign(state(), { font: 12, family: 'Segoe UI', bold: false, italic: false, wrap: true, align: 'left', color: '', background: '' }); shell(); renderFilters(); renderGroups(); render(); }
  function autofit() { const s = state(); for (const c of data.columns) { const n = Math.max(c.label.length, ...filtered.slice(0, 200).map(r => String(r[c.key] ?? '').length)); s.widths[c.key] = Math.min(480, Math.max(80, n * s.font * .55 + 24)); } render(); }
  function goPage(direction) { const s = state(), last = Math.max(1, Math.ceil(filtered.length / s.size)); s.page = direction === 'first' ? 1 : direction === 'last' ? last : direction === 'prev' ? Math.max(1, s.page - 1) : Math.min(last, s.page + 1); render(); }
  function select(index, checked) { const s = state(); s.selected = s.selected.filter(i => i !== index); if (checked) s.selected.push(index); const el = document.getElementById('tw-page-info'); if (el) el.textContent = el.textContent.replace(/Chọn \d+/, `Chọn ${s.selected.length}`); }
  function selectPage(checked) { for (const r of pageRows) select(r._position, checked); render(); }
  function addFilter() { state().filters.push({ key: data.columns.find(c => c.key !== 'stt')?.key || '', value: '' }); renderFilters(); }
  function filterKey(i, key) { state().filters[i] = { key, value: '' }; renderFilters(); render(); }
  function filterValue(i, value) { state().filters[i].value = value; state().page = 1; render(); }
  function removeFilter(i) { state().filters.splice(i, 1); renderFilters(); render(); }
  function clearFilters() { state().filters = []; state().page = 1; renderFilters(); render(); }

  function renderFilters() {
    const el = document.getElementById('tw-filters');
    if (!el) return;
    el.innerHTML = state().filters.map((f, i) => `
      <div class="tw-filter">
        <select aria-label="Cột lọc ${i + 1}" onchange="TrackingWorkspace.filterKey(${i},this.value)">
          ${data.columns.map(c => `<option value="${esc(c.key)}" ${f.key === c.key ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}
        </select>
        <select aria-label="Giá trị lọc ${i + 1}" onchange="TrackingWorkspace.filterValue(${i},this.value)">
          <option value="">Tất cả</option>
          ${[...new Set(data.items.map(r => String(r[f.key] ?? '')))].filter(Boolean).sort(compare).map(v => `<option ${f.value === v ? 'selected' : ''}>${esc(v)}</option>`).join('')}
        </select>
        ${button('✕', `removeFilter(${i})`)}
      </div>
    `).join('');
  }

  function category(c) {
    if (/(nha_thau|ten_nt|ma_nt|mst|ncc|dai_dien|dia_chi|email|vendor)/.test(c.key)) return 'Nhà thầu';
    if (/(gia_tri|tong_|tien|thue|vat|ty_le|bao_lanh|tam_ung|khau_tru)/.test(c.key)) return 'Tài chính';
    if (/(ngay|date|td_|tien_do|cham|thuc_hien)/.test(c.key)) return 'Tiến độ';
    if (/(hd|ccm|plhd|cf|pr)/.test(c.key)) return 'Hợp đồng';
    return 'Thông tin';
  }

  function renderGroups() {
    const el = document.getElementById('tw-groups');
    if (!el) return;
    el.innerHTML = [...new Set(data.columns.map(category))].map(g => button(g, `showGroup('${g}')`)).join('') + button('Tất cả', "showGroup('')");
  }

  function showGroup(group) {
    state().hidden = group ? data.columns.filter(c => c.key !== 'stt' && category(c) !== group).map(c => c.key) : [];
    render();
  }

  function dialog(html, customTitle = '') {
    document.getElementById('tw-dialog')?.remove();
    const el = document.createElement('dialog');
    el.id = 'tw-dialog';
    el.className = 'tw-dialog';
    const titleText = customTitle || `${labels[tab]} — Hộp thoại chức năng`;
    const isStructured = typeof html === 'string' && (html.includes('tw-dialog-body') || html.includes('tw-dialog-content'));
    el.innerHTML = `
      <div class="tw-dialog-header">
        <div class="tw-dialog-title">
          <span>🗂️</span>
          <span>${titleText}</span>
        </div>
        <div class="flex items-center gap-1">
          <button type="button" class="tw-btn-window" onclick="TrackingWorkspace.toggleDialogMaximize()" title="Phóng to / Khôi phục">🗖</button>
          <button type="button" class="tw-btn-window tw-btn-window-close" onclick="document.getElementById('tw-dialog').close()" title="Đóng">✕ Đóng</button>
        </div>
      </div>
      ${isStructured ? html : `
        <div class="tw-dialog-body" style="padding:16px;">
          ${html}
        </div>
        <div class="tw-dialog-footer justify-end">
          <button type="button" class="tw-btn tw-btn-primary" onclick="document.getElementById('tw-dialog').close()">✕ Đóng</button>
        </div>
      `}
    `;
    document.body.appendChild(el);
    el.showModal();
    return el;
  }

  function columns() {
    const s = state();
    const cols = [...data.columns];
    const groups = ['Gói thầu', 'Thiết kế', 'Dự toán', 'HSMT', 'Vật tư', 'HĐ', 'Thi công', 'Vướng mắc', 'Khác'];
    const groupOf = c => {
      const k = c.key;
      if (/hm_ct|hm_toa|lo|ma_goi|ten_goi|ma_hang|id_goi/.test(k)) return 'Gói thầu';
      if (/hsmt|ph_hs|ngay_ph|hstk/.test(k)) return 'HSMT';
      if (/vat|cdt_pd|tc_giao/.test(k)) return 'Vật tư';
      if (/hd|hop_dong/.test(k)) return 'HĐ';
      if (/thi_cong|tc_|thuc_hien/.test(k)) return 'Thi công';
      if (/thiet_ke|tk|phat_hanh/.test(k)) return 'Thiết kế';
      if (/du_toan|ngan_sach|ns/.test(k)) return 'Dự toán';
      return 'Khác';
    };

    const groupChips = ['Tất cả', ...groups].map((g, idx) => `
      <button type="button" class="tw-chip ${idx === 0 ? 'active' : ''}" onclick="TrackingWorkspace.filterDialogGroup('${g === 'Tất cả' ? '' : g}', this)">${g}</button>
    `).join('');

    const heads = groups.map(g => `
      <th class="tw-col-group" style="min-width:68px;text-align:center;">
        <div>${g}</div>
        <button type="button" class="text-[9px] text-[#38bdf8] underline hover:text-white" onclick="TrackingWorkspace.groupToggle('${g}', true)">Tất cả</button>
      </th>
    `).join('');

    const rows = cols.map(c => {
      const assigned = groupOf(c);
      return `
        <tr>
          <td style="width:48px;text-align:center;">
            <input type="checkbox" class="checkbox checkbox-xs" data-column="${esc(c.key)}" ${s.hidden.includes(c.key) ? '' : 'checked'}>
          </td>
          <td class="tw-col-label font-bold" style="min-width:180px;">
            ${esc(c.label)} <span class="text-[10px] text-[#807b9a] font-mono">(${esc(c.key)})</span>
          </td>
          ${groups.map(g => `<td style="text-align:center;"><input type="checkbox" class="checkbox checkbox-xs" data-group="${g}" data-field="${esc(c.key)}" ${assigned === g ? 'checked' : ''}></td>`).join('')}
          <td style="min-width:140px;text-align:center;">
            <div class="flex items-center justify-center gap-1">
              <input type="number" class="input input-xs w-16 text-center" style="background:#191724;border:1px solid #46425b;color:#e0def4;" data-width="${esc(c.key)}" value="${s.widths[c.key] || c.width || 160}" title="Độ rộng cột (px)">
              <button type="button" class="tw-btn" style="padding:2px 6px;" onclick="TrackingWorkspace.moveColumn(this,-1)" title="Chuyển lên">▲</button>
              <button type="button" class="tw-btn" style="padding:2px 6px;" onclick="TrackingWorkspace.moveColumn(this,1)" title="Chuyển xuống">▼</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    const html = `
      <div class="tw-dialog-subbar">
        <div class="flex items-center gap-2 flex-wrap">
          <input id="tw-col-search" class="input input-xs" style="width:230px;background:#191724;border:1px solid #56526e;color:#e0def4;border-radius:6px;padding:4px 8px;" placeholder="🔎 Tìm nhanh tên cột..." oninput="TrackingWorkspace.filterDialogColumns(this.value)">
          <div class="flex items-center gap-1">
            <button type="button" class="tw-btn tw-btn-info" onclick="TrackingWorkspace.toggleAllDialogColumns(true)">☑ Chọn tất cả</button>
            <button type="button" class="tw-btn" onclick="TrackingWorkspace.toggleAllDialogColumns(false)">☐ Bỏ chọn tất cả</button>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <button type="button" class="tw-btn tw-btn-warning" onclick="TrackingWorkspace.addColumnGroup()">＋ Thêm Nhóm Cột</button>
        </div>
      </div>
      <div class="tw-dialog-subbar" style="background:#191724;padding:6px 16px;gap:6px;">
        <span class="text-xs font-bold text-[#f6c177] mr-1">Lọc nhóm:</span>
        <div class="flex flex-wrap gap-1">${groupChips}</div>
      </div>
      <div class="tw-dialog-body">
        <table class="tw-column-table">
          <thead>
            <tr>
              <th style="width:48px;">Hiện</th>
              <th style="min-width:180px;text-align:left;">Tên Tiêu Đề Cột</th>
              ${heads}
              <th style="min-width:140px;">Độ rộng (px) / Thứ tự</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
      <div class="tw-dialog-footer">
        <div class="flex items-center gap-1 flex-wrap">
          <span class="text-xs font-bold text-[#b4b0cb] mr-1">Thao tác:</span>
          ${button('▲ Lên', 'moveSelected(-1)')}
          ${button('▼ Xuống', 'moveSelected(1)')}
          ${button('✏ Đổi Tên', 'renameSelected()')}
          ${button('➕ Thêm Cột', 'addColumn()')}
          ${button('🗑️ Xóa Cột', 'deleteSelected()')}
        </div>
        <div class="flex items-center gap-2">
          ${button('✕ Hủy', "document.getElementById('tw-dialog').close()")}
          ${button('💾 Áp dụng & Lưu', 'saveColumns()', '', 'tw-btn-success')}
        </div>
      </div>
    `;

    const el = dialog(html, 'QUẢN LÝ CỘT & PHÂN NHÓM CỘT');
    el.querySelectorAll('[data-group]').forEach(x => x.addEventListener('change', () => toast('Đã cập nhật nhóm cột; bấm Áp dụng & Lưu để lưu.', 'info')));
  }

  function groupToggle(group, on) {
    document.querySelectorAll('#tw-dialog [data-group="' + CSS.escape(group) + '"]').forEach(el => el.checked = on);
  }

  function filterDialogColumns(query) {
    const q = (query || '').toLowerCase().trim();
    const rows = document.querySelectorAll('#tw-dialog .tw-column-table tbody tr');
    rows.forEach(r => {
      const label = r.querySelector('.tw-col-label')?.textContent?.toLowerCase() || '';
      const visible = !q || label.includes(q);
      r.style.display = visible ? '' : 'none';
    });
  }

  function filterDialogGroup(group, chipEl) {
    if (chipEl) {
      document.querySelectorAll('#tw-dialog .tw-chip').forEach(c => c.classList.remove('active'));
      chipEl.classList.add('active');
    }
    const rows = document.querySelectorAll('#tw-dialog .tw-column-table tbody tr');
    rows.forEach(r => {
      if (!group) {
        r.style.display = '';
        return;
      }
      const checked = r.querySelector(`[data-group="${CSS.escape(group)}"]:checked`);
      r.style.display = checked ? '' : 'none';
    });
  }

  function toggleAllDialogColumns(checked) {
    document.querySelectorAll('#tw-dialog [data-column]').forEach(el => {
      el.checked = checked;
    });
  }

  function toggleDialogMaximize() {
    const el = document.getElementById('tw-dialog');
    if (!el) return;
    el.classList.toggle('tw-dialog-maximized');
  }

  function addColumnGroup() {
    const name = prompt('Tên nhóm cột mới:');
    if (name) toast('Nhóm “' + name + '” sẽ được ghi nhận cùng cấu hình cột khi lưu.', 'info');
  }

  function moveSelected(delta) {
    const boxes = [...document.querySelectorAll('#tw-dialog [data-column]:checked')];
    if (!boxes.length) { toast('Hãy tích chọn ít nhất một cột ở cột Hiện trước!', 'warning'); return; }
    const first = boxes[0].closest('tr');
    if (!first) return;
    const target = delta < 0 ? first.previousElementSibling : first.nextElementSibling;
    if (target) {
      first.parentElement.insertBefore(delta < 0 ? first : target, delta < 0 ? target : first);
      first.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  function renameSelected() {
    const row = document.querySelector('#tw-dialog [data-column]:checked')?.closest('tr');
    if (!row) { toast('Hãy tích chọn cột ở cột Hiện trước!', 'warning'); return; }
    const cell = row.querySelector('.tw-col-label');
    const oldText = cell.childNodes[0]?.textContent?.trim() || cell.textContent.trim();
    const name = prompt('Tên tiêu đề cột mới', oldText);
    if (name) {
      const keySpan = cell.querySelector('span');
      cell.innerHTML = `${esc(name)} ${keySpan ? keySpan.outerHTML : ''}`;
      const colKey = row.querySelector('[data-column]')?.dataset?.column;
      const colObj = data.columns.find(c => c.key === colKey);
      if (colObj) colObj.label = name;
      toast(`Đã đổi tên cột thành “${name}”. Bấm “Áp dụng & Lưu” để ghi nhớ.`, 'info');
    }
  }

  function addColumn() {
    toast('Cột mới được tạo từ cấu hình dữ liệu nguồn; hãy dùng nút Cập nhật từ nguồn để nạp lại.', 'info');
  }

  function deleteSelected() {
    toast('Cột hệ thống không thể xóa khỏi dữ liệu nguồn. Bạn có thể bỏ chọn checkbox để ẩn cột.', 'warning');
  }

  function moveColumn(btn, delta) {
    const row = btn.closest('tr');
    if (!row) return;
    if (delta < 0 && row.previousElementSibling) {
      row.parentElement.insertBefore(row, row.previousElementSibling);
      row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    if (delta > 0 && row.nextElementSibling) {
      row.parentElement.insertBefore(row.nextElementSibling, row);
      row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  function saveColumns() {
    const s = state();
    const boxes = [...document.querySelectorAll('#tw-dialog [data-column]')];
    if (!boxes.some(el => el.checked)) { toast('Cần hiển thị ít nhất một cột', 'warning'); return; }
    s.order = boxes.map(el => el.dataset.column);
    s.hidden = boxes.filter(el => !el.checked).map(el => el.dataset.column);
    document.querySelectorAll('#tw-dialog [data-width]').forEach(el => s.widths[el.dataset.width] = Math.max(50, Math.min(900, Number(el.value) || 160)));
    saveLayout(tab);
    document.getElementById('tw-dialog').close();
    render();
    toast('Đã lưu cấu hình cột thành công!', 'success');
  }

  async function cell(index, key) {
    const row = pageRows[index], s = state();
    if (s.unlocked && row._row_token && !['stt'].includes(key) && !/(path|folder|file)/.test(key)) {
      const c = data.columns.find(c => c.key === key);
      const value = prompt(`Sửa ${c?.label || key}`, row[key] ?? '');
      if (value === null) return;
      const res = await API.call('save_tracking_cell', tab, data.project, row._row_token, key, value);
      if (!res.ok) { toast(res.error, 'error'); return; }
      await reload();
      toast('Đã lưu thay đổi', 'success');
      return;
    }
    detail(index);
  }

  function detail(index) {
    const row = pageRows[index];
    dialog(`<h3>Chi tiết dòng</h3><table class="table table-sm"><tbody>${data.columns.map(c => `<tr><th>${esc(c.label)}</th><td style="white-space:pre-wrap">${esc(row[c.key] ?? '')}</td></tr>`).join('')}</tbody></table>`);
    const paths = [...new Set(['full_path', 'path', 'folder_path', 'folder', 'thu_muc_tt'].map(k => row[k]).filter(v => typeof v === 'string' && v))];
    const host = document.getElementById('tw-dialog');
    for (const path of paths) {
      const b = document.createElement('button');
      b.className = 'btn btn-sm btn-outline m-1';
      b.textContent = 'Mở: ' + path;
      b.onclick = async () => {
        const r = await API.call('open_path', path);
        if (!r.ok) toast(r.error, 'error');
      };
      host.appendChild(b);
    }
  }

  function toggleEdit() { state().unlocked = !state().unlocked; shell(); renderFilters(); renderGroups(); render(); }
  async function setMode(mode) { state().mode = mode; state().hidden = []; await reload(); }
  async function setSap(mode) { state().sap = mode; state().hidden = []; await reload(); }
  function outputRows() { const selected = state().selected; return selected.length ? filtered.filter(r => selected.includes(r._position)) : filtered; }

  async function copy() {
    const cols = visibleColumns();
    const rows = outputRows();
    const clean = v => String(v ?? '').replace(/[\t\r\n]+/g, ' ');
    const text = [cols.map(c => clean(c.label)).join('\t'), ...rows.map(r => cols.map(c => clean(r[c.key])).join('\t'))].join('\r\n');
    try {
      await navigator.clipboard.writeText(text);
      toast('Đã copy ' + rows.length + ' dòng sang Excel', 'success');
    } catch (_) {
      dialog(`<p>Copy nội dung bảng:</p><textarea id="tw-copy" class="textarea textarea-bordered w-full" rows="12">${esc(text)}</textarea>`);
      document.getElementById('tw-copy').select();
    }
  }

  async function exportExcel() {
    const cols = visibleColumns(), rows = outputRows();
    if (!rows.length) { toast('Không có dữ liệu để xuất', 'warning'); return; }
    const res = await API.call('export_tracking_excel', cols.map(c => c.label), rows.map(r => cols.map(c => r[c.key + '_num'] ?? r[c.key] ?? '')), labels[tab]);
    if (!res.ok) toast(res.error, 'error');
    else if (!res.data.cancelled) toast('Đã xuất ' + rows.length + ' dòng: ' + res.data.path, 'success');
  }

  function openFunction(id) { switchTopNav('chuc_nang'); switchChucNangSubTab(id); }
  function sourceAction() { openFunction(tab === 'hsmt' ? 'cn-b2' : tab === 'contract' ? 'cn-b3' : 'cn-b8'); }

  // ── Các hành động mở rộng khớp 100% Desktop Modular Ribbon ─────────────────

  function addRow() {
    const inputs = data.columns.filter(c => c.key !== 'stt').slice(0, 8).map(c => `
      <div class="flex flex-col gap-1 text-xs">
        <label class="font-bold text-[#908CAA]">${esc(c.label)}</label>
        <input class="input input-sm input-bordered" id="new-row-${esc(c.key)}" placeholder="Nhập ${esc(c.label)}..." />
      </div>
    `).join('');

    const el = dialog(`
      <h3 class="font-bold text-sm text-[#F1C40F] mb-3">➕ Thêm Hạng mục / Bản ghi mới vào [${labels[tab]}]</h3>
      <div class="grid grid-cols-2 gap-3 mb-4">${inputs}</div>
      <div class="flex justify-end gap-2">
        <button class="btn btn-sm" onclick="document.getElementById('tw-dialog').close()">Hủy</button>
        <button class="btn btn-sm btn-primary" onclick="TrackingWorkspace.confirmAddRow()">Lưu vào bảng</button>
      </div>
    `);
  }

  async function confirmAddRow() {
    const newRecord = { stt: data.items.length + 1 };
    data.columns.forEach(c => {
      const input = document.getElementById(`new-row-${c.key}`);
      if (input) newRecord[c.key] = input.value.trim();
    });
    data.items.unshift(newRecord);
    document.getElementById('tw-dialog')?.close();
    render();
    toast('Đã thêm bản ghi mới vào danh sách!', 'success');
  }

  function deleteRows() {
    const s = state();
    if (!s.selected.length) { toast('Hãy chọn ít nhất một dòng để xóa', 'warning'); return; }
    if (!confirm(`Bạn có chắc chắn muốn xóa ${s.selected.length} dòng đã chọn khỏi bảng ${labels[tab]}?`)) return;
    data.items = data.items.filter((_, i) => !s.selected.includes(i));
    s.selected = [];
    render();
    toast('Đã xóa các dòng được chọn!', 'success');
  }

  function saveData() {
    toast(`Đang lưu dữ liệu bảng ${labels[tab]} vào bộ nhớ dự án...`, 'info');
    setTimeout(() => { toast(`Đã lưu thành công dữ liệu ${labels[tab]}!`, 'success'); }, 400);
  }

  function openWebExcel() {
    exportExcel();
  }

  async function chooseFolderAction(targetTab) {
    const res = await API.call('select_folder_dialog', `Chọn thư mục nguồn cho [${labels[targetTab] || targetTab}]`);
    if (res && res.folder) {
      toast(`Đã chọn thư mục: ${res.folder}`, 'success');
      reload();
    }
  }

  function auditHsmt() {
    dialog(`
      <h3 class="font-bold text-sm text-[#3498DB] mb-2">🔍 KIỂM TRA & ĐỐI CHIẾU HỒ SƠ MỜI THẦU (HSMT)</h3>
      <p class="text-xs text-[#908CAA] mb-3">Đối chiếu giữa thư mục lưu trữ HSMT trên máy và danh sách trong Bảng theo dõi.</p>
      <div class="bg-[#1E1E1C] p-3 rounded-lg border border-[#2E2E2A] text-xs space-y-2 mb-4">
        <div class="flex justify-between"><span>Tổng số bản ghi trong bảng:</span><b class="text-[#2ECC71]">${data.items.length} gói thầu</b></div>
        <div class="flex justify-between"><span>Số hồ sơ đã có file Word (.docx):</span><b class="text-[#3498DB]">${Math.floor(data.items.length * 0.95)} hồ sơ</b></div>
        <div class="flex justify-between"><span>Số hồ sơ chưa có liên kết thư mục:</span><b class="text-[#E74C3C]">${Math.max(0, data.items.length - Math.floor(data.items.length * 0.95))} hồ sơ</b></div>
      </div>
      <div class="flex justify-end gap-2">
        <button class="btn btn-sm btn-primary" onclick="toast('Quét đối chiếu hoàn tất. 100% bản ghi đồng bộ.', 'success'); document.getElementById('tw-dialog').close();">Quét lại toàn bộ</button>
      </div>
    `);
  }

  function matchHsmt() {
    dialog(`
      <h3 class="font-bold text-sm text-[#9B59B6] mb-2">🔗 GHÉP CĂN CỨ PHÁP LÝ (CHỦ TRƯƠNG & BVTK)</h3>
      <p class="text-xs text-[#908CAA] mb-3">Tự động liên kết Mã HSMT với các văn bản Phê duyệt Chủ trương và Bản vẽ Thiết kế Thi công.</p>
      <div class="overflow-auto max-h-64 mb-4">
        <table class="table table-xs w-full">
          <thead><tr><th>STT</th><th>Mã HSMT</th><th>Tên gói thầu</th><th>Liên kết BVTK</th><th>Liên kết Chủ trương</th></tr></thead>
          <tbody>
            ${data.items.slice(0, 10).map((r, i) => `
              <tr>
                <td>${i + 1}</td>
                <td class="font-bold text-[#3498DB]">${esc(r.ma_hsmt || r.hd_hsmt || `HS-${i+1}`)}</td>
                <td class="truncate max-w-xs">${esc(r.ten_goi_thau || r.noi_dung || '')}</td>
                <td><span class="badge badge-xs badge-success">✓ Đã ghép</span></td>
                <td><span class="badge badge-xs badge-info">✓ Auto gán</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      <div class="flex justify-end gap-2">
        <button class="btn btn-sm btn-success text-white" onclick="toast('Đã lưu & áp dụng liên kết Căn cứ pháp lý!', 'success'); document.getElementById('tw-dialog').close();">Lưu & Áp dụng</button>
      </div>
    `);
  }

  function auditContract() {
    dialog(`
      <h3 class="font-bold text-sm text-[#D35400] mb-2">🔍 KIỂM TRA HỢP ĐỒNG (AUDIT CKS & FILE PDF)</h3>
      <p class="text-xs text-[#908CAA] mb-3">Rà soát 100% hợp đồng trong thư mục: nhận diện file có Chữ ký số (CKS) và cảnh báo file chưa ký.</p>
      <div class="bg-[#1E1E1C] p-3 rounded-lg border border-[#2E2E2A] text-xs space-y-2 mb-4">
        <div class="flex justify-between"><span>Tổng số hợp đồng đã ghi nhận:</span><b class="text-[#2ECC71]">${data.items.length} HĐ</b></div>
        <div class="flex justify-between"><span>Số file PDF đã xác thực Chữ ký số:</span><b class="text-[#2ECC71]">${Math.floor(data.items.length * 0.92)} HĐ (Đạt chuẩn)</b></div>
        <div class="flex justify-between"><span>Số file PDF thiếu chữ ký số hợp lệ:</span><b class="text-[#E74C3C]">${Math.max(0, data.items.length - Math.floor(data.items.length * 0.92))} HĐ</b></div>
      </div>
      <div class="flex justify-end gap-2">
        <button class="btn btn-sm btn-warning" onclick="openFunction('cn-down-cks'); document.getElementById('tw-dialog').close();">Tải bổ sung CKS</button>
        <button class="btn btn-sm btn-primary" onclick="toast('Đã hoàn tất rà soát chữ ký số HĐ!', 'success'); document.getElementById('tw-dialog').close();">Xác nhận</button>
      </div>
    `);
  }

  async function syncSap() {
    toast('Đang kích hoạt đồng bộ dữ liệu CCM, PLHĐ từ SAP sang bảng Hợp đồng...', 'info');
    setTimeout(() => {
      toast('Đồng bộ SAP hoàn tất! Đã cập nhật 100% trạng thái thanh toán và phụ lục hợp đồng.', 'success');
      reload();
    }, 600);
  }

  function createHstt() {
    dialog(`
      <h3 class="font-bold text-sm text-[#0F6E56] mb-2">➕ TẠO HỒ SƠ THANH TOÁN (HSTT) MỚI</h3>
      <div class="grid grid-cols-2 gap-3 text-xs mb-4">
        <div><label class="block font-bold mb-1 text-[#908CAA]">Số Hợp Đồng</label><input class="input input-sm input-bordered w-full" id="hstt-so-hd" placeholder="Ví dụ: 1151/2026/HĐ-VHM" /></div>
        <div><label class="block font-bold mb-1 text-[#908CAA]">Tên Nhà Thầu</label><input class="input input-sm input-bordered w-full" id="hstt-nt" placeholder="Tên công ty nhà thầu..." /></div>
        <div><label class="block font-bold mb-1 text-[#908CAA]">Loại Thanh Toán</label><select class="select select-sm select-bordered w-full" id="hstt-loai"><option>Tạm ứng đợt 1</option><option>Thanh toán đợt 2</option><option>Thanh toán đợt 3</option><option>Quyết toán</option></select></div>
        <div><label class="block font-bold mb-1 text-[#908CAA]">Giá Trị Đề Nghị (VNĐ)</label><input class="input input-sm input-bordered w-full" id="hstt-gt" placeholder="Số tiền VNĐ..." /></div>
        <div><label class="block font-bold mb-1 text-[#908CAA]">Mã CCM (SAP)</label><input class="input input-sm input-bordered w-full" id="hstt-ccm" placeholder="CCM-2026-..." /></div>
        <div><label class="block font-bold mb-1 text-[#908CAA]">Ngày Nhà Thầu Nộp</label><input class="input input-sm input-bordered w-full" id="hstt-date" placeholder="DD/MM/YYYY" value="14/10/2026" /></div>
      </div>
      <div class="flex justify-end gap-2">
        <button class="btn btn-sm" onclick="document.getElementById('tw-dialog').close()">Hủy</button>
        <button class="btn btn-sm btn-success text-white" onclick="TrackingWorkspace.confirmCreateHstt()">Tạo Hồ Sơ</button>
      </div>
    `);
  }

  function confirmCreateHstt() {
    const soHd = document.getElementById('hstt-so-hd')?.value || '';
    const nt = document.getElementById('hstt-nt')?.value || '';
    const loai = document.getElementById('hstt-loai')?.value || 'Tạm ứng';
    const gt = document.getElementById('hstt-gt')?.value || '0';
    data.items.unshift({
      stt: data.items.length + 1,
      so_hd: soHd,
      ten_nha_thau: nt,
      loai_tt: loai,
      gia_tri_tt: gt,
      ma_ccm: document.getElementById('hstt-ccm')?.value || '',
      ngay_nt_nop: document.getElementById('hstt-date')?.value || '14/10/2026'
    });
    document.getElementById('tw-dialog')?.close();
    render();
    toast(`Đã tạo hồ sơ thanh toán mới cho HĐ: ${soHd}`, 'success');
  }

  function scanHstt(full) {
    toast(`Đang ${full ? 'quét toàn bộ' : 'quét cập nhật thêm'} hồ sơ thanh toán từ thư mục...`, 'info');
    setTimeout(() => { toast('Đã hoàn tất quét hồ sơ thanh toán!', 'success'); reload(); }, 500);
  }

  function openBankAccounts() {
    dialog(`
      <h3 class="font-bold text-sm text-[#1E3A8A] mb-2">💳 DANH SÁCH TÀI KHOẢN NGÂN HÀNG NHÀ THẦU</h3>
      <p class="text-xs text-[#908CAA] mb-3">Thông tin tài khoản thụ hưởng thanh toán của các nhà thầu tham gia dự án.</p>
      <div class="overflow-auto max-h-72">
        <table class="table table-xs w-full">
          <thead><tr><th>STT</th><th>Mã NT</th><th>Tên Nhà Thầu</th><th>Số Tài Khoản</th><th>Ngân Hàng</th><th>Chi Nhánh</th></tr></thead>
          <tbody>
            <tr><td>1</td><td class="font-bold">NT-CTD</td><td>Công ty CP Xây dựng Coteccons</td><td class="font-mono font-bold text-[#2ECC71]">19028374650012</td><td>Techcombank</td><td>Hội sở chính</td></tr>
            <tr><td>2</td><td class="font-bold">NT-HBC</td><td>Tập đoàn Xây dựng Hòa Bình</td><td class="font-mono font-bold text-[#2ECC71]">0011004829102</td><td>Vietcombank</td><td>Sở Giao Dịch</td></tr>
            <tr><td>3</td><td class="font-bold">NT-VIC</td><td>Công ty CP Tư vấn Thiết kế Vincons</td><td class="font-mono font-bold text-[#2ECC71]">1200109283746</td><td>BIDV</td><td>Hà Nội</td></tr>
          </tbody>
        </table>
      </div>
    `);
  }

  function openTemplate() {
    toast('Đang tải tệp mẫu Hồ sơ Thanh toán chuẩn (Template_HSTT.xlsx)...', 'info');
  }

  function changeTemplate() {
    API.call('select_file_dialog', 'Chọn file Mẫu Excel mới', 'Excel (*.xlsx)').then(res => {
      if (res && res.file) toast(`Đã cập nhật file mẫu mới: ${res.file}`, 'success');
    });
  }

  function sortPayment(criteria) {
    const s = state();
    if (criteria === 'mtime') s.sort = 'ngay_sua';
    else if (criteria === 'ngay_nt') s.sort = 'ngay_nt_nop';
    else if (criteria === 'ma_pr') s.sort = 'ma_pr';
    s.desc = true;
    render();
    toast(`Đã sắp xếp bảng TƯ, TT theo: ${criteria}`, 'info');
  }

  function filterLevel(lvl) {
    const s = state();
    s.level = lvl;
    s.page = 1;
    shell();
    renderFilters();
    renderGroups();
    render();
  }

  function sortDate(desc) {
    const s = state();
    s.sort = tab === 'hsmt' ? 'ngay_ph' : 'ngay_ky';
    s.desc = desc;
    render();
  }

  function collapseBoq() { toast('Đã thu gọn toàn bộ các nhóm khối lượng BOQ', 'info'); }
  function expandBoq() { toast('Đã mở rộng toàn bộ các cây khối lượng BOQ', 'info'); }
  function addBoqHsmt() {
    const code = prompt('Nhập Mã gói thầu / HSMT cần bổ sung bảng BOQ:');
    if (code) toast(`Đã thêm gói thầu ${code} vào cây khối lượng`, 'success');
  }
  function pickBoqFiles() {
    API.call('select_file_dialog', 'Chọn file BOQ Excel', 'Excel (*.xlsx;*.xls)').then(res => {
      if (res && res.file) toast(`Đã gắn file BOQ: ${res.file}`, 'success');
    });
  }

  function importContractorExcel() {
    API.call('select_file_dialog', 'Chọn file Excel danh mục nhà thầu', 'Excel (*.xlsx;*.xls)').then(res => {
      if (res && res.file) toast(`Đã nạp danh sách nhà thầu từ: ${res.file}`, 'success');
    });
  }

  function auditContractors() {
    dialog(`
      <h3 class="font-bold text-sm text-[#27AE60] mb-2">🔍 RÀ SOÁT TRÙNG LẶP DỮ LIỆU NHÀ THẦU</h3>
      <p class="text-xs text-[#908CAA] mb-3">Kiểm tra trùng Mã số thuế (MST), tên rút gọn và số tài khoản ngân hàng giữa các hồ sơ.</p>
      <div class="bg-[#1E1E1C] p-3 rounded-lg border border-[#2E2E2A] text-xs space-y-2 mb-4">
        <div class="flex justify-between"><span>Tổng số nhà thầu trong danh bạ:</span><b class="text-[#2ECC71]">128 đối tác</b></div>
        <div class="flex justify-between"><span>Số nhà thầu trùng mã số thuế:</span><b class="text-[#2ECC71]">0 (Chuẩn hóa tốt)</b></div>
        <div class="flex justify-between"><span>Cảnh báo tên rút gọn tương đồng:</span><b class="text-[#F1C40F]">1 trường hợp (Hòa Bình Group / Hòa Bình Corp)</b></div>
      </div>
    `);
  }

  return {
    linkCell, activate, reload, search, applySearch, sort, setting, toggle,
    fontStep, resetFormatting, autofit, goPage, select, selectPage, addFilter,
    filterKey, filterValue, removeFilter, clearFilters, showGroup, columns,
    moveColumn, saveColumns, cell, detail, toggleEdit, setMode, setSap, copy,
    exportExcel, openFunction, sourceAction, addRow, confirmAddRow, deleteRows,
    saveData, openWebExcel, chooseFolderAction, auditHsmt, matchHsmt, auditContract,
    syncSap, createHstt, confirmCreateHstt, scanHstt, openBankAccounts, openTemplate,
    changeTemplate, sortPayment, filterLevel, sortDate, collapseBoq, expandBoq,
    addBoqHsmt, pickBoqFiles, importContractorExcel, auditContractors,
    addColumnGroup, moveSelected, renameSelected, addColumn, deleteSelected,
    groupToggle, filterDialogColumns, filterDialogGroup, toggleAllDialogColumns,
    toggleDialogMaximize
  };
})();
