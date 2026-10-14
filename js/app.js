/**
 * app.js — Master application bootstrap, top navigation, and router
 * Exactly matching Desktop V386: 5 Level-1 tabs, Left Sidebars, Status bar, Zoom, Popups.
 */
'use strict';

const PAGE_META = {
  home:       { title: 'Trang chủ • Dashboard Tổng quan' },
  'ql-file':  { title: 'Quản lý Hồ sơ & Thư mục Dự án' },
  theo_doi:   { title: 'Theo dõi • Tiến độ & Hợp đồng & Tài chính' },
  chuc_nang:  { title: 'Chức năng • Nghiệp vụ Tự động Hóa' },
  cai_dat:    { title: 'Cài đặt Hệ thống & Bảo mật' },
};

let _currentTopNav = 'home';
let _currentTdSubTab = 'progress';
let _currentCnSubTab = 'word';
let _currentCdSubTab = 'cd-theme';
let _currentZoom = 90;

// ── 1. Top Navigation Routing (5 Level-1 Tabs) ───────────────────────────────
window.switchTopNav = function(navId) {
  const requiredPermission = typeof AccountsModule !== 'undefined' ? AccountsModule.navPermission(navId) : null;
  if (requiredPermission && !AccountsModule.navAllowed(navId)) {
    AccountsModule.denyAccess();
    return;
  }
  _currentTopNav = navId;

  // Highlight active main tab
  document.querySelectorAll('.main-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === navId);
  });

  // Hide all 5 main sections
  document.querySelectorAll('.page-section').forEach(sec => sec.classList.remove('active'));

  // Show active section & trigger module init
  if (navId === 'home') {
    const el = document.getElementById('page-home');
    if (el) el.classList.add('active');
    if (typeof HomeModule !== 'undefined') HomeModule.init();
    App.setStatus('Trang chủ — Hệ thống Quản lý Dự án sẵn sàng.');
  } else if (navId === 'ql-file') {
    const el = document.getElementById('page-ql-file');
    if (el) el.classList.add('active');
    if (typeof ExplorerModule !== 'undefined') ExplorerModule.init();
    App.setStatus('Quản lý Hồ sơ & Thư mục Dự án sẵn sàng.');
  } else if (navId === 'theo_doi') {
    const el = document.getElementById('page-theo-doi');
    if (el) el.classList.add('active');
    syncTdProjectPills();
    switchTheoDoiSubTab(_currentTdSubTab);
  } else if (navId === 'chuc_nang') {
    const el = document.getElementById('page-chuc-nang');
    if (el) el.classList.add('active');
    switchChucNangSubTab(_currentCnSubTab);
  } else if (navId === 'cai_dat') {
    const el = document.getElementById('page-cai-dat-full');
    if (el) el.classList.add('active');
    switchCaiDatSubTab(_currentCdSubTab);
  }
};

// Backward-compatible alias for existing code
window.showPage = function(pageId) {
  if (pageId === 'home' || pageId === 'ql-file') {
    switchTopNav(pageId);
  } else if (['payment', 'hsmt', 'contract', 'progress', 'chu-truong', 'bvtk', 'boq', 'contractor', 'sap', 'contractor-data'].includes(pageId)) {
    switchTopNav('theo_doi');
    switchTheoDoiSubTab(pageId);
  } else if (pageId === 'word' || pageId.startsWith('cn-')) {
    switchTopNav('chuc_nang');
    switchChucNangSubTab(pageId);
  } else if (pageId === 'links' || pageId === 'cai-dat' || pageId.startsWith('cd-')) {
    switchTopNav('cai_dat');
    switchCaiDatSubTab(pageId === 'links' ? 'cd-links' : pageId);
  } else {
    switchTopNav('home');
  }
};

// ── 2. Theo Dõi Sub-Navigation (8 Tracking Tabs) ─────────────────────────────
window.switchTheoDoiSubTab = function(subId) {
  _currentTdSubTab = subId;
  if (typeof TrackingWorkspace !== 'undefined') {
    const loading = TrackingWorkspace.activate(subId);
    document.querySelectorAll('#td-sidebar-list .sub-nav-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.td === subId));
    App.setStatus('Đang xem: Theo dõi > ' + (document.querySelector(`[data-td="${subId}"] span:last-child`)?.textContent || subId));
    return loading;
  }

  // Highlight button in sidebar
  document.querySelectorAll('#td-sidebar-list .sub-nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.td === subId);
  });

  // Switch subpanes
  document.querySelectorAll('#td-subpane-container .subpane').forEach(p => p.classList.remove('active'));
  const target = document.getElementById(`td-subpane-${subId}`);
  if (target) target.classList.add('active');

  // Trigger data loader
  try {
    if (subId === 'progress') {
      if (typeof loadProgress === 'function') loadProgress(1);
      App.setStatus('Đang xem: Theo dõi > Tiến độ thực hiện.');
    } else if (subId === 'hsmt') {
      if (typeof loadHsmt === 'function') loadHsmt(1);
      if (typeof _loadHsmtFilters === 'function') _loadHsmtFilters();
      App.setStatus('Đang xem: Theo dõi > Hồ sơ mời thầu (HSMT).');
    } else if (subId === 'contract') {
      if (typeof loadContracts === 'function') loadContracts(1);
      App.setStatus('Đang xem: Theo dõi > Hợp đồng kinh tế.');
    } else if (subId === 'boq') {
      if (typeof BoqModule !== 'undefined') BoqModule.init();
      App.setStatus('Đang xem: Theo dõi > Khối lượng (BOQ).');
    } else if (subId === 'payment') {
      if (typeof loadPayments === 'function') loadPayments(1);
      if (typeof _loadPaymentFilters === 'function') _loadPaymentFilters();
      App.setStatus('Đang xem: Theo dõi > Tạm ứng – Thanh toán (TƯ, TT).');
    } else if (subId === 'contractor') {
      if (typeof ContractorModule !== 'undefined') ContractorModule.init();
      App.setStatus('Đang xem: Theo dõi > Tổng hợp Nhà thầu & KPI.');
    } else if (subId === 'sap') {
      if (typeof SapModule !== 'undefined') SapModule.init();
      App.setStatus('Đang xem: Theo dõi > Hệ thống SAP (HSMT, CCM, PLHĐ, PR).');
    } else if (subId === 'contractor-data') {
      if (typeof ContractorDataModule !== 'undefined') ContractorDataModule.init();
      App.setStatus('Đang xem: Theo dõi > Dữ liệu Nhà thầu.');
    }
  } catch (e) {
    console.warn('Error loading tracking subtab:', subId, e);
  }
};

// ── 3. Chức Năng Sub-Navigation (11 Function Tabs) ───────────────────────────
window.switchChucNangSubTab = function(subId) {
  const requiredPermission = typeof AccountsModule !== 'undefined' ? AccountsModule.functionPermission(subId) : null;
  if (requiredPermission && !AccountsModule.canAccess(requiredPermission)) {
    AccountsModule.denyAccess();
    return;
  }
  _currentCnSubTab = subId;
  if (typeof FunctionsFullModule !== 'undefined') FunctionsFullModule.init(subId);

  // Highlight button in sidebar
  document.querySelectorAll('#cn-sidebar-list .sub-nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.cn === subId);
  });

  // Switch subpanes
  const wordPane = document.getElementById('cn-subpane-word');
  const otherPane = document.getElementById('cn-subpane-other');

  if (subId === 'word') {
    if (wordPane) wordPane.classList.add('active');
    if (otherPane) otherPane.classList.remove('active');
    if (typeof WordModule !== 'undefined') WordModule.init();
    App.setStatus('Đang thực hiện: Chức năng > B1. Tạo Word từ Mail.');
  } else {
    if (wordPane) wordPane.classList.remove('active');
    if (otherPane) otherPane.classList.add('active');
    if (typeof ChucNangModule !== 'undefined') ChucNangModule.switchSubTab(subId);
    App.setStatus(`Đang thực hiện: Chức năng > ${subId}.`);
  }
};

// ── 4. Cài Đặt Sub-Navigation (9 Settings Tabs) ──────────────────────────────
window.switchCaiDatSubTab = function(subId) {
  const requiredPermission = typeof AccountsModule !== 'undefined' ? AccountsModule.settingsPermission(subId) : null;
  if (requiredPermission && !AccountsModule.canAccess(requiredPermission)) {
    AccountsModule.denyAccess();
    return;
  }
  _currentCdSubTab = subId;

  // Highlight button in sidebar
  document.querySelectorAll('#cd-sidebar-list .sub-nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.cd === subId);
  });

  const linksPane = document.getElementById('cd-pane-links');

  if (subId === 'cd-links') {
    document.querySelectorAll('.cd-subtab-pane').forEach(p => p.classList.add('hidden'));
    if (linksPane) linksPane.classList.remove('hidden');
    if (typeof LinksModule !== 'undefined') LinksModule.init();
    App.setStatus('Đang cấu hình: Cài đặt > Quản lý Link.');
  } else {
    if (linksPane) linksPane.classList.add('hidden');
    if (typeof SettingsFullModule !== 'undefined') SettingsFullModule.switchCdSubTab(subId);
    if (['cd-acc', 'cd-perm'].includes(subId) && typeof AccountsModule !== 'undefined') AccountsModule.init();
    App.setStatus(`Đang cấu hình: Cài đặt > ${subId}.`);
  }
};

// ── 5. Project Bar Synchronization across QL File & Theo dõi ────────────────
function syncTdProjectPills() {
  const qlPills = document.getElementById('ql-project-pills');
  const tdPills = document.getElementById('td-project-pills');
  if (qlPills && tdPills) {
    tdPills.innerHTML = qlPills.innerHTML;
  }
}

// ── 6. Global App Helper Object ──────────────────────────────────────────────
window.App = {
  zoom(delta) {
    _currentZoom = Math.max(80, Math.min(150, _currentZoom + (delta * 10)));
    const lbl = document.getElementById('app-zoom-val');
    if (lbl) lbl.textContent = _currentZoom + '%';
    document.documentElement.style.fontSize = (_currentZoom / 100 * 14) + 'px';
    try { localStorage.setItem('app_zoom', _currentZoom); } catch (_) {}
  },

  resetZoom() {
    _currentZoom = 90;
    const lbl = document.getElementById('app-zoom-val');
    if (lbl) lbl.textContent = '90%';
    document.documentElement.style.fontSize = '12.6px';
    try { localStorage.setItem('app_zoom', _currentZoom); } catch (_) {}
  },

  setStatus(msg) {
    const el = document.getElementById('bottom-status-text');
    if (el) el.textContent = msg;
  },

  checkUpdate() {
    const m = document.getElementById('modal-app-check-update');
    if (m) m.showModal();
  },

  async pauseProcess() {
    App.setStatus('⏸️ Đang gửi tín hiệu tạm dừng tiến trình...');
    try {
      if (window.pywebview && window.pywebview.api && window.pywebview.api.pause_process) {
        await window.pywebview.api.pause_process();
      }
      App.setStatus('⏸️ Tiến trình đã tạm dừng.');
      if (typeof toast === 'function') toast('Đã tạm dừng tiến trình!', 'warning');
    } catch (_) {
      App.setStatus('⏸️ Tiến trình đã tạm dừng.');
    }
  },

  async resumeProcess() {
    App.setStatus('▶️ Đang tiếp tục chạy tiến trình...');
    try {
      if (window.pywebview && window.pywebview.api && window.pywebview.api.resume_process) {
        await window.pywebview.api.resume_process();
      }
      App.setStatus('▶️ Tiến trình đang tiếp tục chạy.');
      if (typeof toast === 'function') toast('Đang tiếp tục tiến trình!', 'success');
    } catch (_) {
      App.setStatus('▶️ Tiến trình đang tiếp tục chạy.');
    }
  },

  async cancelProcess() {
    App.setStatus('⏹️ Đang dừng tiến trình...');
    try {
      if (window.pywebview && window.pywebview.api && window.pywebview.api.cancel_process) {
        await window.pywebview.api.cancel_process();
      }
      App.setStatus('⏹️ Tiến trình đã dừng hoàn toàn.');
      if (typeof toast === 'function') toast('Đã hủy bỏ tiến trình!', 'error');
    } catch (_) {
      App.setStatus('⏹️ Tiến trình đã dừng.');
    }
  },

  moveTheoDoiSubTab(dir) {
    const list = document.getElementById('td-sidebar-list');
    if (!list) return;
    const activeBtn = list.querySelector(`.sub-nav-btn[data-td="${_currentTdSubTab}"]`);
    if (!activeBtn) return;
    if (dir === 'up' && activeBtn.previousElementSibling) {
      list.insertBefore(activeBtn, activeBtn.previousElementSibling);
    } else if (dir === 'down' && activeBtn.nextElementSibling) {
      list.insertBefore(activeBtn.nextElementSibling, activeBtn);
    }
  },

  moveChucNangSubTab(dir) {
    const list = document.getElementById('cn-sidebar-list');
    if (!list) return;
    const activeBtn = list.querySelector(`.sub-nav-btn[data-cn="${_currentCnSubTab}"]`);
    if (!activeBtn) return;
    if (dir === 'up' && activeBtn.previousElementSibling) {
      list.insertBefore(activeBtn, activeBtn.previousElementSibling);
    } else if (dir === 'down' && activeBtn.nextElementSibling) {
      list.insertBefore(activeBtn.nextElementSibling, activeBtn);
    }
  },

  _renameContext: null,
  openRenameTabDialog(context) {
    this._renameContext = context;
    const modal = document.getElementById('modal-app-rename-tab');
    const input = document.getElementById('modal-rename-input');
    if (!modal || !input) return;

    let curName = '';
    if (context === 'theo_doi') {
      const btn = document.querySelector(`#td-sidebar-list .sub-nav-btn[data-td="${_currentTdSubTab}"] span:last-child`);
      if (btn) curName = btn.textContent;
    } else if (context === 'chuc_nang') {
      const btn = document.querySelector(`#cn-sidebar-list .sub-nav-btn[data-cn="${_currentCnSubTab}"] span:last-child`);
      if (btn) curName = btn.textContent;
    }
    input.value = curName.trim();
    modal.showModal();
  },

  confirmRenameTab() {
    const input = document.getElementById('modal-rename-input');
    const val = input ? input.value.trim() : '';
    if (!val) return;

    if (this._renameContext === 'theo_doi') {
      const btn = document.querySelector(`#td-sidebar-list .sub-nav-btn[data-td="${_currentTdSubTab}"] span:last-child`);
      if (btn) btn.textContent = val;
    } else if (this._renameContext === 'chuc_nang') {
      const btn = document.querySelector(`#cn-sidebar-list .sub-nav-btn[data-cn="${_currentCnSubTab}"] span:last-child`);
      if (btn) btn.textContent = val;
    }
    document.getElementById('modal-app-rename-tab').close();
    if (typeof toast === 'function') toast(`Đã đổi tên tab thành: ${val}`, 'success');
  },

  _iconContext: null,
  openIconDialog(context) {
    this._iconContext = context;
    const modal = document.getElementById('modal-app-icon-picker');
    const grid = document.getElementById('modal-icon-grid');
    if (!modal || !grid) return;

    const icons = ['📁','📄','📊','⏱','👥','🏢','🌐','⚙️','🛠️','📦','💻','📋','✓','☑','🔍','🚀','⚡','🤖','🔒','🔑','⭐','📌','🏆','💡'];
    grid.innerHTML = icons.map(ic => `
      <button class="btn btn-sm bg-[#26233A] hover:bg-[#EBBCBA] hover:text-black text-lg p-1 rounded-lg border border-[#312F44]" onclick="App.selectIcon('${ic}')">
        ${ic}
      </button>
    `).join('');
    modal.showModal();
  },

  selectIcon(icon) {
    if (this._iconContext === 'theo_doi') {
      const btn = document.querySelector(`#td-sidebar-list .sub-nav-btn[data-td="${_currentTdSubTab}"] span:first-child`);
      if (btn) btn.textContent = icon;
    } else if (this._iconContext === 'chuc_nang') {
      const btn = document.querySelector(`#cn-sidebar-list .sub-nav-btn[data-cn="${_currentCnSubTab}"] span:first-child`);
      if (btn) btn.textContent = icon;
    }
    document.getElementById('modal-app-icon-picker').close();
    if (typeof toast === 'function') toast(`Đã cập nhật biểu tượng: ${icon}`, 'success');
  }
};

// ── 7. DOM Ready & Pywebview Bootstrap ────────────────────────────────────────
async function bootstrapApp() {
  console.log('App Bootstrapping V386 Desktop-Identical Webview...');

  // Restore saved zoom
  try {
    const savedZoom = localStorage.getItem('app_zoom');
    if (savedZoom) {
      _currentZoom = parseInt(savedZoom, 10) || 90;
      const lbl = document.getElementById('app-zoom-val');
      if (lbl) lbl.textContent = _currentZoom + '%';
      document.documentElement.style.fontSize = (_currentZoom / 100 * 14) + 'px';
    }
  } catch (_) {}

  // Restore the persisted appearance rather than resetting it on every launch.
  if (typeof initTheme === 'function') initTheme();

  // Boot active tab
  switchTopNav(_currentTopNav || 'home');
}

document.addEventListener('DOMContentLoaded', () => {
  // Global hotkeys for tabs: Alt+1..5
  document.addEventListener('keydown', (e) => {
    if (e.altKey) {
      if (e.key === '1') { e.preventDefault(); switchTopNav('home'); }
      else if (e.key === '2') { e.preventDefault(); switchTopNav('ql-file'); }
      else if (e.key === '3') { e.preventDefault(); switchTopNav('theo_doi'); }
      else if (e.key === '4') { e.preventDefault(); switchTopNav('chuc_nang'); }
      else if (e.key === '5') { e.preventDefault(); switchTopNav('cai_dat'); }
    }
  });

  bootstrapApp();
});

window.addEventListener('pywebviewready', () => {
  console.log('pywebview is ready! Re-synchronizing modules...');
  if (typeof API !== 'undefined' && API.reportJsLog) {
    API.call('report_js_log', 'pywebviewready fired successfully in JS');
  }
  // Re-run active tab data loading
  if (_currentTopNav === 'home' && typeof HomeModule !== 'undefined') {
    HomeModule.init();
  } else if (_currentTopNav === 'ql-file' && typeof ExplorerModule !== 'undefined') {
    ExplorerModule.init();
  }
});



// ── Mobile navigation drawer ────────────────────────────────────────────────
(function initMobileDrawer(){
  let startX = 0, startY = 0;
  window.toggleMobileSidebar = function(force){
    const open = typeof force === 'boolean' ? force : !document.body.classList.contains('mobile-sidebar-open');
    document.body.classList.toggle('mobile-sidebar-open', open);
    const b = document.getElementById('mobile-sidebar-toggle');
    if (b) { b.setAttribute('aria-expanded', String(open)); b.innerHTML = open ? '✕ <span>Đóng</span>' : '☰ <span>Danh mục</span>'; }
    const o = document.getElementById('mobile-sidebar-backdrop');
    if (o) o.setAttribute('aria-hidden', String(!open));
  };
  window.closeMobileSidebar = () => window.toggleMobileSidebar(false);
  document.addEventListener('click', e => {
    if (window.matchMedia && !window.matchMedia('(max-width: 760px)').matches) return;
    if (e.target.closest('.sub-nav-btn,.sidebar-tab-btn,[data-td],[data-cn],[data-cd]')) window.closeMobileSidebar();
  }, true);
  document.addEventListener('touchstart', e => { const t=e.changedTouches[0]; startX=t.clientX; startY=t.clientY; }, {passive:true});
  document.addEventListener('touchend', e => {
    if (!window.matchMedia || !window.matchMedia('(max-width: 760px)').matches) return;
    const t=e.changedTouches[0], dx=t.clientX-startX, dy=t.clientY-startY;
    if (Math.abs(dx)<55 || Math.abs(dx)<Math.abs(dy)*1.25) return;
    if (dx<0 && document.body.classList.contains('mobile-sidebar-open')) window.closeMobileSidebar();
    else if (dx>0 && startX<34) window.toggleMobileSidebar(true);
  }, {passive:true});
})();
