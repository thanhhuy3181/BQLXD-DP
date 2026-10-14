/**
 * api.js — pywebview Python ↔ JavaScript bridge wrapper
 * Wraps window.pywebview.api with consistent error handling and promise support.
 */

'use strict';

// ── Global Error & Log Reporting ──────────────────────────────────────────
window.onerror = function(msg, url, line, col, error) {
  const stack = error && error.stack ? error.stack : '';
  try {
    if (window.pywebview && window.pywebview.api && window.pywebview.api.report_js_error) {
      window.pywebview.api.report_js_error(String(msg), String(url), line || 0, col || 0, String(stack));
    }
  } catch(_) {}
};

window.addEventListener('unhandledrejection', function(event) {
  const msg = event.reason ? (event.reason.stack || event.reason.message || String(event.reason)) : 'Unhandled Rejection';
  try {
    if (window.pywebview && window.pywebview.api && window.pywebview.api.report_js_error) {
      window.pywebview.api.report_js_error(String(msg), 'unhandledrejection', 0, 0, String(msg));
    }
  } catch(_) {}
});

// ── Global HTML escaper ─────────────────────────────────────────────────────
window.escapeHtml = function(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

// ── Global event dispatcher ─────────────────────────────────────────────────
window._pyEvent = function(event, data) {
  document.dispatchEvent(new CustomEvent('py:' + event, { detail: data }));
};

// ── API proxy with retry / ready wait ───────────────────────────────────────
const API = (function() {
  const MAX_WAIT_MS = 8000;
  const RETRY_MS = 80;

  function _waitReady() {
    return new Promise((resolve, reject) => {
      const deadline = Date.now() + MAX_WAIT_MS;
      function check() {
        if (window.pywebview && window.pywebview.api) { resolve(); return; }
        if (Date.now() > deadline) { reject(new Error('pywebview API timeout')); return; }
        setTimeout(check, RETRY_MS);
      }
      check();
    });
  }

  async function call(method, ...args) {
    try {
      if (!(window.pywebview && window.pywebview.api) && window.BrowserRuntime && window.BrowserMenuRuntime) {
        return await window.BrowserMenuRuntime.call(method, ...args);
      }
      // Browser/Vercel runtime. The desktop build keeps using pywebview.
      if (!(window.pywebview && window.pywebview.api) && window.BrowserRuntime) {
        return await window.BrowserRuntime.call(method, ...args);
      }
      await _waitReady();
      const result = await window.pywebview.api[method](...args);
      if (!result) return { ok: false, data: null, error: 'No response' };
      return result;
    } catch (e) {
      return { ok: false, data: null, error: String(e) };
    }
  }

  return {
    call,
    getAppInfo:            ()       => call('get_app_info'),
    getTheme:              ()       => call('get_theme'),
    saveTheme:             (t,f,c)  => call('save_theme', t, f, c),
    getProjects:           ()       => call('get_projects'),
    switchProject:         (name)   => call('switch_project', name),
    getPaymentList:        (opts)   => call('get_payment_list',
                                            opts.page||1, opts.pageSize||50,
                                            opts.search||'', opts.filterLoaiTt||'',
                                            opts.sortCol||'stt', opts.sortDir||'asc'),
    getPaymentSummary:     ()       => call('get_payment_summary'),
    getPaymentLoaiTtList:  ()       => call('get_payment_loai_tt_list'),
    getPaymentRecord:      (idx)    => call('get_payment_record', idx),
    savePaymentRecord:     (i,r)    => call('save_payment_record', i, r),
    deletePaymentRecord:   (idx)    => call('delete_payment_record', idx),
    openPath:              (p)      => call('open_path', p),
    pathExists:            (p)      => call('path_exists', p),
    getContractorList:     ()       => call('get_contractor_list'),
    searchContractor:      (q)      => call('search_contractor', q),
    getHsmtList:           (opts)   => call('get_hsmt_list',
                                            opts.page||1, opts.pageSize||50,
                                            opts.search||'', opts.filterCdt||'',
                                            opts.sortCol||'stt', opts.sortDir||'asc'),
    getHsmtSummary:        ()       => call('get_hsmt_summary'),
    getHdList:             (opts)   => call('get_hd_list',
                                            opts.page||1, opts.pageSize||50,
                                            opts.search||'', opts.filterNt||'',
                                            opts.sortCol||'stt', opts.sortDir||'asc'),
    getHdSummary:          ()       => call('get_hd_summary'),
    getProgressList:       (opts)   => call('get_progress_list',
                                            opts.page||1, opts.pageSize||50,
                                            opts.search||'',
                                            opts.sortCol||'stt', opts.sortDir||'asc'),
    getProgressSummary:    ()       => call('get_progress_summary'),
    selectFolderDialog:    (title)  => call('select_folder_dialog', title||'Chọn thư mục'),
    selectFileDialog:      (t,ft)   => call('select_file_dialog', t||'Chọn file', ft||''),
    scanMsgFolder:         (folder) => call('scan_msg_folder', folder),
    exportWordFiles:       (files, outDir, saveMode, pattern) => call('export_word_files', files, outDir||'', saveMode||'same', pattern||''),
    scanPaymentFolder:     (folder) => call('scan_payment_folder', folder),
    minimizeWindow:        ()       => call('minimize_window'),
    toggleMaximize:        ()       => call('toggle_maximize'),
    closeWindow:           ()       => call('close_window'),

    // ── New Full-App APIs ──────────────────────────────────────────────────
    getDashboardStats:     ()       => call('get_dashboard_stats'),
    getProgressAlerts:     ()       => call('get_progress_alerts'),
    getHomeProgressAlerts: ()       => call('get_home_progress_alerts'),
    getProjectsBarData:    ()       => call('get_projects_bar_data'),
    addProjectToBar:       (p)      => call('add_project_to_bar', p),
    getManagementCategoriesCatalog: () => call('get_management_categories_catalog'),
    getExplorerTabs:       ()       => call('get_explorer_tabs'),
    saveExplorerTabs:      (tabs)   => call('save_explorer_tabs', tabs),
    addExplorerTab:        (n,p,c,o)=> call('add_explorer_tab', n, p, c||'custom', o||{}),
    updateExplorerTab:     (id,d)   => call('update_explorer_tab', id, d),
    moveExplorerTab:       (id,dir) => call('move_explorer_tab', id, dir),
    removeExplorerTab:     (id)     => call('remove_explorer_tab', id),
    getFolderTreeAndFiles: (opts)   => call('get_folder_tree_and_files',
                                            opts.path, opts.subPath||'',
                                            opts.levelFlags||[true,false,false,false,false],
                                            opts.showDir!==false, opts.showFile!==false,
                                            opts.search||'', opts.fromDate||'', opts.toDate||'',
                                            opts.sortCol||'name', opts.sortReverse||false),
    getFolderContents:     (p,s,l)  => call('get_folder_contents', p, s||'', l||1),

    getContractorSummary:  (opts)   => call('get_contractor_summary',
                                            opts.page||1, opts.pageSize||50,
                                            opts.search||'', opts.sortCol||'hd_count',
                                            opts.sortDir||'desc'),
    getContractorDetail:   (nt)     => call('get_contractor_detail', nt),
    getContractorDirectory:(opts)   => call('get_contractor_directory',
                                            opts.page||1, opts.pageSize||50, opts.search||''),

    getBoqData:            (opts)   => call('get_boq_data', opts.search||'', opts.page||1, opts.pageSize||50),
    getSapData:            (tab,opts)=>call('get_sap_data', tab||'hsmt', (opts&&opts.search)||'', (opts&&opts.page)||1, (opts&&opts.pageSize)||50),

    getManagedLinks:       (q,s)    => call('get_managed_links', q||'',s||''),
    saveManagedLink:       (l,s)    => call('save_managed_link', l,s||''),
    deleteManagedLink:     (id,s)   => call('delete_managed_link', id,s||''),
    openLink:              (u)      => call('open_link', u),

    getCurrentUser:        ()       => call('get_current_user'),
    loginUser:             (u,p)    => call('login_user', u, p),
    googleLogin:           (credential) => call('google_login', credential),
    logoutUser:            ()       => call('logout_user'),
    getUsersList:          ()       => call('get_users_list'),
    updateUserRole:        (u,r)    => call('update_user_role', u, r),
    toggleUserLock:        (u)      => call('toggle_user_lock', u),
    registerUser:          (d)      => call('register_user', d),
    getRolePermissions:   ()       => call('get_role_permissions'),
    saveRolePermissions:  (p)      => call('save_role_permissions', p),

    scanFilesInFolder:     (f,ext)  => call('scan_files_in_folder', f, ext||'.docx'),
    runAiChat:             (pr,m,k) => call('run_ai_chat', pr, m||'gemini', k||''),
    searchSystemFiles:     (q,f,ext)=> call('search_system_files', q, f||'', ext||''),

    getAppConfigFull:      ()       => call('get_app_config_full'),
    saveAppConfigFull:     (cfg)    => call('save_app_config_full', cfg),
    getActionHistoryLogs:  (lim)    => call('get_action_history_logs', lim||50),
    openMasterExcel:       ()       => call('open_master_excel'),
    openProjectFolder:     ()       => call('open_project_folder'),
    pauseProcess:          ()       => call('pause_process'),
    resumeProcess:         ()       => call('resume_process'),
    cancelProcess:         ()       => call('cancel_process'),
    selectBoqPdfFilesDialog: ()     => call('select_boq_pdf_files_dialog'),
    scanBoqFolder:         (f)      => call('scan_boq_folder', f),
    extractBoqContractData:(paths)  => call('extract_boq_contract_data', paths),
    stopBoqContractExtraction: ()   => call('stop_boq_contract_extraction'),
    exportBoqExcelFile:    (r, p, o)=> call('export_boq_excel_file', r, p||'', o||false),
  };
})();

// ── Quick helper for one-off calls from HTML onclick ────────────────────────
window.pyApi = function(method, ...args) {
  API.call(method, ...args).catch(() => {});
};

// ── Toast utility ─────────────────────────────────────────────────────────
window.toast = function(msg, type='info', durationMs=3500) {
  const c = document.getElementById('toast-container');
  if (!c) return;
  const alertClass = {
    success: 'alert-success', error: 'alert-error',
    warning: 'alert-warning', info: 'alert-info'
  }[type] || 'alert-info';
  const el = document.createElement('div');
  el.className = `alert ${alertClass} shadow-lg py-2 px-4 text-sm max-w-xs`;
  el.innerHTML = `<span>${msg}</span>`;
  c.appendChild(el);
  setTimeout(() => { el.style.opacity='0'; el.style.transition='opacity 0.3s'; setTimeout(()=>el.remove(), 300); }, durationMs);
};

// ── Loading overlay ──────────────────────────────────────────────────────
window.setLoading = function(show) {
  const el = document.getElementById('loading-overlay');
  if (el) el.classList.toggle('hidden', !show);
};
