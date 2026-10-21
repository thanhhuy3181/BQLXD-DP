/**
 * explorer.js — Phân hệ Quản lý Hồ sơ & File Explorer
 * Chuyển đổi toàn diện 100% từ ExplorerTab, SidebarNotebook và ProjectTabBar của desktop app.
 */
'use strict';

const ExplorerModule = (function() {
  // ── State ──────────────────────────────────────────────────────────────────
  let _tabs = [];
  let _activeTab = null;
  let _activeTabId = null;
  let _onlineTreeRoot = '';
  let _onlineTree = [];
  let _folderRequest = 0;
  let _levelReloadTimer = null;
  function treeLocation(nodes,path,trail=[]){
    for(const n of nodes){
      const chain=[...trail,n];
      if(n.path===path)return chain;
      const found=treeLocation(n.children||[],path,chain);if(found)return found;
    }
    return null;
  }
  function sourcePath(){return _activeTab?.active_online_source || _activeTab?.path || '';}
  function renderSources(){
    const select=document.getElementById('ql-online-source');if(!select)return;
    select.innerHTML='<option value="">📁 Nguồn trên máy</option>'+(_activeTab?.online_sources||[]).map(s=>`<option value="${escapeHtml(s.path)}">${escapeHtml(s.email)} / ${escapeHtml(s.name)}</option>`).join('');
    select.value=_activeTab?.active_online_source||'';
  }
  async function changeSource(path){
    if(!_activeTab)return;
    const res=await API.updateExplorerTab(_activeTab.id,{active_online_source:path});
    if(!res.ok){toast(res.error,'error');renderSources();return;}
    _activeTab.active_online_source=path;_selectedSubPath='';refreshCurrentFolder();
  }
  function chooseOnlineSource(){
    if(!_activeTab){toast('Chọn mục quản lý trước','warning');return;}
    DrivePicker.open({..._activeTab,project:_currentProject});
  }
  async function applyOnlineSource(tabId,source){
    const tab=_tabs.find(t=>t.id===tabId);if(!tab)return;
    tab.online_sources=[...(tab.online_sources||[]).filter(s=>s.path!==source.path),source];
    tab.active_online_source=source.path;
    tab.show_file=true;
    if(_activeTabId===tabId){_showFile=true;_selectedSubPath='';syncFilterUi();renderSources();await refreshCurrentFolder();}
  }
  let _currentProject = 'Vinhomes Đan Phượng';
  let _tabProjects = [];
  let _allProjects = [];
  let _managementCategories = [];
  function escapeHtml(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }


  // Filter & View State
  let _levelFlags = [true, false, false, false, false]; // [lvl1, lvl2, lvl3, lvl4, lvl5]
  let _showDir = true;
  let _showFile = true;
  let _searchQuery = '';
  let _useDateFilter = false;
  let _fromDate = '';
  let _toDate = '';
  let _sortCol = '#0'; // '#0' | 'name' | 'date' | 'size'
  let _sortReverse = false;
  let _sortDirLeftReverse = false;
  let _selectedSubPath = '';
  let _fontSizeDelta = 0; // -2 to +4

  // Tree and Files Data
  let _treeData = [];
  let _filesData = [];
  let _folderExists = true;

  // ── Initialization ─────────────────────────────────────────────────────────
  async function init() {
    await loadCategoriesCatalog();
    await loadProjectBar();
    await loadTabs();
  }

  // ── 1. Catalog & Projects Bar ──────────────────────────────────────────────
  async function loadCategoriesCatalog() {
    try {
      const res = await API.getManagementCategoriesCatalog();
      if (res && res.ok) {
        _managementCategories = res.data || [];
      }
    } catch (e) {
      console.warn('loadCategoriesCatalog error:', e);
    }
  }

  async function loadProjectBar() {
    try {
      const res = await API.getProjectsBarData();
      if (res && res.ok && res.data) {
        _currentProject = res.data.current_project || 'Vinhomes Đan Phượng';
        _tabProjects = res.data.tab_projects || [_currentProject];
        _allProjects = res.data.all_projects || [];
        renderProjectBar();
      }
    } catch (e) {
      console.warn('loadProjectBar error:', e);
    }
  }

  function renderProjectBar() {
    const html = _tabProjects.map(p => {
      const isActive = (p === _currentProject);
      return `
        <button class="btn btn-xs rounded-lg whitespace-nowrap transition-all ${isActive ? 'bg-[#F39C12] text-black font-extrabold shadow-sm border-none' : 'bg-[#26233A] text-[#E0DEF4] hover:bg-[#312F44] border border-[#312F44]'}"
                onclick="ExplorerModule.switchProject('${escapeHtml(p)}')">
          <span>${isActive ? '⭐ ' : ''}${escapeHtml(p)}${isActive ? ' •' : ''}</span>
        </button>
      `;
    }).join('');

    const qlPills = document.getElementById('ql-project-pills');
    if (qlPills) qlPills.innerHTML = html;
    const tdPills = document.getElementById('td-project-pills');
    if (tdPills) tdPills.innerHTML = html;
  }

  async function switchProject(projectName) {
    if (!projectName || projectName === _currentProject) return;
    if (typeof showLoading === 'function') showLoading();
    try {
      const res = await API.switchProject(projectName);
      if (res && res.ok) {
        _currentProject = projectName;
        await loadProjectBar();
        await loadTabs();
        toast(`Đã chuyển sang dự án: ${projectName}`, 'success');
      } else {
        toast('Không thể chuyển dự án: ' + (res?.error || 'Lỗi không xác định'), 'error');
      }
    } catch (e) {
      toast('Lỗi chuyển dự án: ' + e, 'error');
    } finally {
      if (typeof hideLoading === 'function') hideLoading();
    }
  }

  function openAddProjectModal() {
    const datalist = document.getElementById('modal-prj-datalist');
    if (datalist) {
      datalist.innerHTML = _allProjects.map(n => `<option value="${escapeHtml(n)}"></option>`).join('');
    }
    const input = document.getElementById('modal-prj-name-input');
    if (input) input.value = '';
    onProjectSelectChange('');
    const modal = document.getElementById('modal-add-project-bar');
    if (modal) modal.showModal();
  }

  function nonAccentVietnamese(str) {
    return String(str || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .toLowerCase()
      .trim();
  }

  function onProjectSelectChange(typed) {
    const codeEl = document.getElementById('modal-prj-code');
    const invEl = document.getElementById('modal-prj-inv');
    const locEl = document.getElementById('modal-prj-loc');
    const sugEl = document.getElementById('modal-prj-suggestions');
    if (!codeEl) return;

    if (!typed || !typed.trim()) {
      codeEl.textContent = '—';
      invEl.textContent = '—';
      locEl.textContent = '—';
      if (sugEl) { sugEl.innerHTML = ''; sugEl.classList.add('hidden'); }
      return;
    }
    codeEl.textContent = 'Đang tra cứu...';
    invEl.textContent = 'Công ty Cổ phần Vinhomes';
    locEl.textContent = '—';

    if (sugEl && Array.isArray(_allProjects) && _allProjects.length) {
      const q = nonAccentVietnamese(typed);
      const matches = _allProjects.filter(p => nonAccentVietnamese(p).includes(q));
      if (matches.length > 0 && !(matches.length === 1 && matches[0] === typed)) {
        sugEl.innerHTML = matches.slice(0, 8).map(p => {
          return `<button type="button" class="btn btn-xs btn-ghost justify-between text-left w-full normal-case text-xs truncate bg-base-100 hover:bg-base-300 border border-base-300 py-1 px-2 h-auto" onclick="document.getElementById('modal-prj-name-input').value='${escapeHtml(p)}';ExplorerModule.onProjectSelectChange('${escapeHtml(p)}');"><span>🏢 ${escapeHtml(p)}</span><span class="text-[10px] text-primary font-bold">Chọn ↵</span></button>`;
        }).join('');
        sugEl.classList.remove('hidden');
      } else {
        sugEl.innerHTML = '';
        sugEl.classList.add('hidden');
      }
    }
  }

  async function submitAddProject() {
    const input = document.getElementById('modal-prj-name-input');
    const pName = input ? input.value.trim() : '';
    if (!pName) {
      toast('Vui lòng chọn hoặc nhập Tên Dự Án!', 'warning');
      return;
    }
    const modal = document.getElementById('modal-add-project-bar');
    if (modal) modal.close();

    if (typeof showLoading === 'function') showLoading();
    try {
      const res = await API.addProjectToBar(pName);
      if (res && res.ok) {
        await loadProjectBar();
        await switchProject(pName);
        toast(`Đã thêm dự án '${pName}' lên thanh Tab!`, 'success');
      } else {
        toast('Lỗi thêm dự án: ' + (res?.error || ''), 'error');
      }
    } catch (e) {
      toast('Lỗi thêm dự án: ' + e, 'error');
    } finally {
      if (typeof hideLoading === 'function') hideLoading();
    }
  }

  // ── 2. Tabs Management (Vertical Sidebar) ──────────────────────────────────
  async function loadTabs() {
    try {
      const res = await API.getExplorerTabs();
      if (!res.ok) {
        toast('Không thể tải danh mục Tab Quản lý: ' + res.error, 'error');
        return;
      }
      const data = res.data || {};
      _tabs = data.tabs || [];
      _currentProject = data.current_project || _currentProject;

      const countEl = document.getElementById('ql-sidebar-count');
      if (countEl) countEl.textContent = `${_tabs.length} Tab`;

      renderSidebarTabs();

      if (_tabs.length > 0) {
        const found = _tabs.find(t => t.id === _activeTabId);
        selectTab(found || _tabs[0]);
      } else {
        _activeTab = null;
        _activeTabId = null;
        renderFolderContent();
      }
    } catch (e) {
      console.warn('loadTabs error:', e);
    }
  }

  function renderSidebarTabs() {
    const container = document.getElementById('ql-sidebar-tabs');
    if (!container) return;

    if (_tabs.length === 0) {
      container.innerHTML = `
        <div class="p-4 text-center text-xs text-base-content/50">
          Chưa có tab hồ sơ nào.<br/>Bấm [➕ Thêm tab...] bên dưới để tạo.
        </div>
      `;
      return;
    }

    container.innerHTML = _tabs.map((t, idx) => {
      const isActive = (_activeTab && _activeTab.id === t.id);
      const icon = t.icon || '📁';
      const cleanName = (t.name || `Tab ${idx + 1}`).trim();
      const color = t.color || '#0F6E56';

      return `
        <div class="group relative flex items-center">
          <button class="btn btn-sm w-full justify-start gap-2 rounded-lg text-xs font-semibold transition-all truncate pr-7 text-left ${isActive ? 'text-white shadow-sm' : 'btn-ghost text-base-content/80 hover:bg-base-300/80'}"
                  style="${isActive ? `background-color: ${color}; border-color: ${color};` : ''}"
                  onclick="ExplorerModule.selectTabById('${t.id}')"
                  oncontextmenu="ExplorerModule.onTabRightClick(event, '${t.id}')">
            <span class="text-sm flex-shrink-0">${icon}</span>
            <span class="truncate flex-1">${escapeHtml(cleanName)}</span>
          </button>
          <div class="absolute right-1 hidden group-hover:flex items-center gap-0.5">
            <button class="btn btn-ghost btn-xs px-1 text-base-content/50 hover:text-error hover:bg-error/20 rounded"
                    title="Xóa tab"
                    onclick="event.stopPropagation(); ExplorerModule.removeTab('${t.id}')">×</button>
          </div>
        </div>
      `;
    }).join('');
  }

  function selectTabById(tabId) {
    const t = _tabs.find(x => x.id === tabId);
    if (t) selectTab(t);
  }

  function selectTab(tab) {
    _activeTab = tab;
    _activeTabId = tab.id;
    _selectedSubPath = '';

    // Apply tab stored flags
    _levelFlags = [
      tab.level_1 !== false,
      Boolean(tab.level_2),
      Boolean(tab.level_3),
      Boolean(tab.level_4),
      Boolean(tab.level_5),
    ];
    const highest=_levelFlags.reduce((max,value,i)=>value?i+1:max,0);
    for(let i=0;i<highest;i++)_levelFlags[i]=true;
    _showDir = tab.show_dir !== false;
    _showFile = tab.show_file !== false;

    syncFilterUi();
    renderSidebarTabs();
    renderSources();
    refreshCurrentFolder();
  }

  function syncFilterUi() {
    for (let i = 1; i <= 5; i++) {
      const chk = document.getElementById(`ql-chk-level-${i}`);
      if (chk) chk.checked = _levelFlags[i - 1];
    }
    const chkDir = document.getElementById('ql-chk-show-dir');
    if (chkDir) chkDir.checked = _showDir;
    const chkFile = document.getElementById('ql-chk-show-file');
    if (chkFile) chkFile.checked = _showFile;

    const pathLabel = document.getElementById('ql-current-path-label');
    if (pathLabel) {
      pathLabel.textContent = (_activeTab?.online_sources||[]).find(s=>s.path===sourcePath())?.display_path || sourcePath() || 'Chưa chọn thư mục nguồn';
    }
  }

  // ── 3. Folder Tree & Dual Pane Scanning ────────────────────────────────────
  async function refreshCurrentFolder() {
    const request=++_folderRequest;
    const requestedTab=_activeTabId;
    const requestedSource=sourcePath();
    const requestedSubPath=_selectedSubPath;
    if (!_activeTab || !requestedSource) {
      _treeData = [];
      _filesData = [];
      _folderExists = false;
      renderFolderContent();
      return;
    }

    const pathLabel = document.getElementById('ql-current-path-label');
    const levels=_levelFlags.map((v,i)=>v?'C'+(i+1):'').filter(Boolean).join(', ')||'Không chọn cấp';
    const started=Date.now();
    const loadLabel=document.getElementById('ql-status-left');
    function showLoading(){
      if(request===_folderRequest && loadLabel) loadLabel.textContent=`Đang tải ${levels} từ ${requestedSource.startsWith('gdrive://')?'Google Drive':'nguồn đã chọn'}… ${Math.floor((Date.now()-started)/1000)} giây`;
    }
    showLoading();
    const loadingTimer=setInterval(showLoading,1000);
    if (pathLabel) {
      const onlineSource=(_activeTab.online_sources||[]).find(s=>s.path===requestedSource);
      const trail=treeLocation(_onlineTree,requestedSubPath)||[];
      pathLabel.textContent=onlineSource ? [onlineSource.display_path||onlineSource.name,...trail.map(n=>n.name)].join(' / ') : requestedSubPath||requestedSource;
    }

    try {
      const res = await API.getFolderTreeAndFiles({
        path: requestedSource,
        subPath: _selectedSubPath,
        levelFlags: [..._levelFlags],
        showDir: _showDir,
        showFile: _showFile,
        search: _searchQuery,
        fromDate: _useDateFilter ? _fromDate : '',
        toDate: _useDateFilter ? _toDate : '',
        sortCol: _sortCol,
        sortReverse: _sortReverse
      });

      if(request!==_folderRequest || requestedTab!==_activeTabId || requestedSource!==sourcePath() || requestedSubPath!==_selectedSubPath)return;
      if (!res || !res.ok) {
        if(loadLabel)loadLabel.textContent='Tải thất bại — '+(res?.error||'Không nhận được dữ liệu');
        const errText = String(res?.error || '');
        if(errText.includes('hết hạn') || errText.includes('đăng nhập lại')){
          renderExpiredSession(errText);
          return;
        }
        toast('Lỗi đọc thư mục: ' + (errText || 'Unknown error'), 'error');
        return;
      }

      const data = res.data || {};
      _folderExists = data.exists !== false;
      _treeData = data.tree || [];
      _filesData = data.files || [];
      if(requestedSource.startsWith('gdrive://')){
        if(_onlineTreeRoot!==requestedSource){_onlineTreeRoot=requestedSource;_onlineTree=[];}
        if(!requestedSubPath){_onlineTree=_treeData;}
        else {
          const chain=treeLocation(_onlineTree,requestedSubPath);
          if(chain){const node=chain[chain.length-1];node.children=_treeData;node.has_children=_treeData.length>0;}
        }
        _treeData=_onlineTree;
        const rootName=(_activeTab.online_sources||[]).find(s=>s.path===requestedSource)?.name||_activeTab.name;
        const chain=treeLocation(_onlineTree,requestedSubPath)||[];
        const basePath=(_activeTab.online_sources||[]).find(s=>s.path===requestedSource)?.display_path||rootName;
        if(pathLabel)pathLabel.textContent=[basePath,...chain.map(n=>n.name)].join(' / ');
      }

      renderFolderContent(data.message);
    } catch (e) {
      if(request!==_folderRequest)return;
      if(loadLabel)loadLabel.textContent='Tải thất bại — '+e.message;
      console.warn('refreshCurrentFolder error:', e);
      const msg = String(e.message || e);
      if(msg.includes('hết hạn') || msg.includes('đăng nhập lại')){
        renderExpiredSession(msg);
      } else {
        toast('Lỗi quét thư mục: ' + msg, 'error');
      }
    } finally {
      clearInterval(loadingTimer);
    }
  }

  function renderExpiredSession(msg) {
    const tbody = document.getElementById('ql-file-tbody');
    const container = document.getElementById('ql-folder-tree-container');
    const alertBox = document.getElementById('ql-explorer-alert');
    const alertMsgEl = document.getElementById('ql-explorer-alert-msg');
    if (alertBox) {
      alertBox.classList.remove('hidden');
      if (alertMsgEl) alertMsgEl.innerHTML = '<strong>' + escapeHtml(msg) + '</strong><br><small>Nhấn vào nút bên dưới để xác thực lại tài khoản Google Drive cá nhân hoặc chuyển nguồn dự án.</small>';
    }
    if (container) {
      container.innerHTML = '<div class="p-3 text-center"><button type="button" class="btn btn-sm btn-primary w-full" onclick="ExplorerModule.reauthDrive()">🔑 Đăng nhập lại Google Drive</button></div>';
    }
    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="3" class="text-center py-10"><div class="max-w-md mx-auto p-4 bg-base-200 rounded-lg text-center"><div class="text-3xl mb-2">🔒</div><h4 class="font-bold mb-1">Phiên Google Drive đã hết hạn</h4><p class="text-xs text-base-content/70 mb-4">Để tiếp tục duyệt file Drive cá nhân, hãy bấm xác thực lại tài khoản Google.</p><button type="button" class="btn btn-sm btn-primary" onclick="ExplorerModule.reauthDrive()">Đăng nhập lại Google Drive ↗</button></div></td></tr>';
    }
    updateStatusBar();
  }

  function reauthDrive() {
    if (window.DrivePicker && typeof DrivePicker.open === 'function') {
      DrivePicker.open({ ..._activeTab, project: _currentProject });
    } else {
      API.call('login_drive_account').then(() => refreshCurrentFolder()).catch(err => toast(err.message, 'error'));
    }
  }

  function renderFolderContent(alertMsg) {
    const alertBox = document.getElementById('ql-explorer-alert');
    const alertMsgEl = document.getElementById('ql-explorer-alert-msg');

    if (!_folderExists || alertMsg) {
      if (alertBox) {
        alertBox.classList.remove('hidden');
        if (alertMsgEl) {
          alertMsgEl.textContent = alertMsg || `Đường dẫn không tồn tại: ${_activeTab?.path}`;
        }
      }
    } else {
      if (alertBox) alertBox.classList.add('hidden');
    }

    renderLeftTree();
    renderRightTable();
    updateStatusBar();
  }

  function renderLeftTree() {
    const container = document.getElementById('ql-folder-tree-container');
    const countEl = document.getElementById('ql-tree-node-count');
    if (!container) return;

    function countNodes(nodes){return nodes.reduce((count,n)=>count+1+countNodes(n.children||[]),0);}
    if (countEl) countEl.textContent = countNodes(_treeData);

    if (_treeData.length === 0) {
      container.innerHTML = `
        ${_selectedSubPath ? '<button class="btn btn-xs btn-outline w-full mb-2" onclick="ExplorerModule.selectSubFolder(\'\')">← Về thư mục nguồn</button>' : ''}
        <div class="p-3 text-center text-base-content/40 italic">
          ${_folderExists ? 'Không có thư mục con' : 'Chưa kết nối thư mục'}
        </div>
      `;
      return;
    }

    // Root node
    const rootName = ((_activeTab?.online_sources||[]).find(s=>s.path===sourcePath())?.name || _activeTab?.name || 'Thư mục gốc');
    let html = `
      <div class="flex items-center gap-1.5 p-1 rounded-md cursor-pointer hover:bg-base-200 transition-colors ${!_selectedSubPath ? 'bg-primary/10 text-primary font-bold' : ''}"
           onclick="ExplorerModule.selectSubFolder('')">
        <span>📁</span>
        <span class="truncate font-semibold">${escapeHtml(rootName)}</span>
      </div>
      <div class="pl-2 flex flex-col gap-0.5 border-l border-base-300 ml-1.5 mt-0.5">
    `;

    function renderNode(node) {
      const isSelected = (_selectedSubPath === node.path);
      const hasChildren = node.has_children && node.children && node.children.length > 0;

      let subHtml = `
        <div class="flex items-center gap-1.5 py-1 px-1.5 rounded-md cursor-pointer hover:bg-base-200 transition-colors ${isSelected ? 'bg-primary/15 text-primary font-bold' : 'text-base-content/80'}"
             aria-current="${isSelected ? 'location' : 'false'}" data-folder-path="${escapeHtml(node.path)}"
             onclick="ExplorerModule.selectSubFolder('${escapeHtml(node.path)}')">
          <span class="text-xs">${hasChildren ? '📂' : '📁'}</span>
          <span class="truncate flex-1 text-[11px]">${escapeHtml(node.name)}${isSelected ? ' • Đang mở' : ''}</span>
        </div>
      `;

      if (hasChildren) {
        subHtml += `<div class="pl-2 border-l border-base-300 ml-2 flex flex-col gap-0.5">`;
        for (const child of node.children) {
          subHtml += renderNode(child);
        }
        subHtml += `</div>`;
      }
      return subHtml;
    }

    for (const node of _treeData) {
      html += renderNode(node);
    }
    html += `</div>`;
    container.innerHTML = html;
  }

  function selectSubFolder(subPath) {
    _selectedSubPath = subPath;
    refreshCurrentFolder();
  }

  function renderRightTable() {
    const tbody = document.getElementById('ql-file-tbody');
    if (!tbody) return;

    if (_filesData.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="3" class="text-center py-8 text-xs text-base-content/40 italic">
            ${_folderExists ? 'Thư mục trống hoặc không có mục nào khớp bộ lọc' : 'Thư mục chưa kết nối'}
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = _filesData.map((f, idx) => {
      const isDir = f.is_dir;
      const icon = isDir ? '📁' : getFileIcon(f.ext);
      const level = f.level || 1;
      const indentPx = Math.max(0, (level - 1) * 16);
      const levelBadge = level > 1 ? `<span class="badge badge-xs badge-outline text-[9px] opacity-60">C${level}</span>` : '';

      return `
        <tr class="hover:bg-base-200/70 transition-colors cursor-pointer text-xs"
            ondblclick="ExplorerModule.onItemDoubleClick('${escapeHtml(f.path)}', ${isDir})"
            oncontextmenu="ExplorerModule.onItemRightClick(event, '${escapeHtml(f.path)}', ${isDir})">
          <td class="font-medium">
            <div class="flex items-center gap-1.5" style="padding-left: ${indentPx}px">
              <span class="text-sm flex-shrink-0">${icon}</span>
              <span class="truncate hover:text-primary ${isDir ? 'font-bold' : ''}">${escapeHtml(f.name)}</span>
              ${levelBadge}
            </div>
          </td>
          <td class="text-base-content/70 font-mono text-[11px] whitespace-nowrap">${escapeHtml(f.date_str || '—')}</td>
          <td class="text-right pr-4 font-mono text-[11px] ${isDir ? 'text-base-content/50 italic' : 'text-base-content/90 font-semibold'} whitespace-nowrap">
            ${escapeHtml(f.size_fmt || '')}
          </td>
        </tr>
      `;
    }).join('');
  }

  function getFileIcon(ext) {
    const e = (ext || '').toLowerCase();
    if (['.pdf'].includes(e)) return '📕';
    if (['.doc', '.docx'].includes(e)) return '📘';
    if (['.xls', '.xlsx', '.xlsm'].includes(e)) return '📗';
    if (['.dwg', '.dxf'].includes(e)) return '📐';
    if (['.msg', '.eml'].includes(e)) return '✉️';
    if (['.zip', '.rar', '.7z'].includes(e)) return '📦';
    if (['.jpg', '.png', '.jpeg', '.webp'].includes(e)) return '🖼️';
    if (['.txt', '.csv'].includes(e)) return '📄';
    return '📄';
  }

  function updateStatusBar() {
    const statusLeft = document.getElementById('ql-status-left');
    if (statusLeft) {
      const dirsCnt = _filesData.filter(x => x.is_dir).length;
      const filesCnt = _filesData.filter(x => !x.is_dir).length;
      statusLeft.innerHTML = `
        <span class="font-bold text-base-content/80">${_filesData.length} mục</span>
        <span class="text-base-content/40">•</span>
        <span>${dirsCnt} thư mục</span>
        <span class="text-base-content/40">•</span>
        <span>${filesCnt} tệp tin</span>
        <span class="text-base-content/40">•</span>
        <span class="text-primary font-semibold">Cấp hiển thị: ${_levelFlags.map((v, i) => v ? `C${i+1}` : '').filter(Boolean).join(', ') || 'C1'}</span>
      `;
    }
  }

  // ── 4. User Actions & Toolbar Handlers ─────────────────────────────────────
  async function chooseSourceFolder() {
    if (!_activeTab) {
      toast('Vui lòng chọn một tab trước!', 'warning');
      return;
    }
    try {
      const res = await API.selectFolderDialog('Chọn thư mục quản lý nguồn');
      if (res && res.ok && res.data && res.data.folder) {
        const newPath = res.data.folder;
        _activeTab.path = newPath;
        _activeTab.active_online_source='';
        await API.updateExplorerTab(_activeTab.id, { path: newPath, active_online_source:'' });
        renderSources();
        toast(`Đã cập nhật nguồn cho tab '${_activeTab.name}'`, 'success');
        refreshCurrentFolder();
      }
    } catch (e) {
      toast('Lỗi chọn thư mục: ' + e, 'error');
    }
  }

  function openInWindowsExplorer() {
    const target = _selectedSubPath || sourcePath();
    if (target) {
      if(target.startsWith('gdrive://')) API.openLink('https://drive.google.com/drive/folders/'+target.split('/').pop());
      else API.openPath(target);
    } else {
      toast('Chưa có đường dẫn thư mục!', 'warning');
    }
  }

  function toggleSortDir() {
    _sortDirLeftReverse = !_sortDirLeftReverse;
    const txt = document.getElementById('ql-sort-dir-text');
    if (txt) txt.textContent = _sortDirLeftReverse ? 'Z-A' : 'A-Z';
    _treeData.reverse();
    renderLeftTree();
  }

  function adjustFontSize(delta) {
    _fontSizeDelta = Math.max(-2, Math.min(4, _fontSizeDelta + delta));
    const table = document.getElementById('ql-file-table');
    const tree = document.getElementById('ql-folder-tree-container');
    const baseSize = 12 + _fontSizeDelta;
    if (table) table.style.fontSize = `${baseSize}px`;
    if (tree) tree.style.fontSize = `${baseSize}px`;
  }

  function sortBy(col) {
    if (_sortCol === col) {
      _sortReverse = !_sortReverse;
    } else {
      _sortCol = col;
      _sortReverse = false;
    }
    // Update icons
    const nameIc = document.getElementById('ql-sort-icon-name');
    const dateIc = document.getElementById('ql-sort-icon-date');
    const sizeIc = document.getElementById('ql-sort-icon-size');
    if (nameIc) nameIc.textContent = '↕';
    if (dateIc) dateIc.textContent = '↕';
    if (sizeIc) sizeIc.textContent = '↕';

    const activeIc = (_sortCol === 'size') ? sizeIc : (_sortCol === 'date') ? dateIc : nameIc;
    if (activeIc) activeIc.textContent = _sortReverse ? '▼' : '▲';

    refreshCurrentFolder();
  }

  function onLevelChange(levelNum, isChecked) {
    ++_folderRequest;
    if(isChecked){for(let i=0;i<levelNum;i++)_levelFlags[i]=true;}
    else {for(let i=levelNum-1;i<5;i++)_levelFlags[i]=false;}
    // Persist to current tab config
    if (_activeTab) {
      const levels={};
      _levelFlags.forEach((value,i)=>{levels['level_'+(i+1)]=value;_activeTab['level_'+(i+1)]=value;});
      API.updateExplorerTab(_activeTab.id,levels);
    }
    syncFilterUi();
    clearTimeout(_levelReloadTimer);
    _levelReloadTimer=setTimeout(refreshCurrentFolder,250);
  }

  function onShowDirChange(isChecked) {
    _showDir = isChecked;
    if (_activeTab) {
      _activeTab.show_dir = isChecked;
      API.updateExplorerTab(_activeTab.id, { show_dir: isChecked });
    }
    refreshCurrentFolder();
  }

  function onShowFileChange(isChecked) {
    _showFile = isChecked;
    if (_activeTab) {
      _activeTab.show_file = isChecked;
      API.updateExplorerTab(_activeTab.id, { show_file: isChecked });
    }
    refreshCurrentFolder();
  }

  function onSearchInput(val) {
    _searchQuery = val.trim();
    refreshCurrentFolder();
  }

  function clearSearch() {
    const input = document.getElementById('ql-search-input');
    if (input) input.value = '';
    _searchQuery = '';
    refreshCurrentFolder();
  }

  function onDateFilterToggle(isChecked) {
    _useDateFilter = isChecked;
    refreshCurrentFolder();
  }

  function onDateChange() {
    const fromEl = document.getElementById('ql-from-date');
    const toEl = document.getElementById('ql-to-date');
    _fromDate = fromEl ? fromEl.value.trim() : '';
    _toDate = toEl ? toEl.value.trim() : '';
    if (_useDateFilter) {
      refreshCurrentFolder();
    }
  }

  function onItemDoubleClick(path, isDir) {
    if (isDir) {
      selectSubFolder(path);
    } else {
      const fileName = String(path || '').split('/').pop().split('\\').pop();
      if (/\.pdf$/i.test(fileName) && window.openDesktopPdf) {
        const file=_filesData.find(f=>f.path===path);
        window.openDesktopPdf(fileName,path,file?.url);return;
      }
      if (fileName.toLowerCase().endsWith('.msg') && typeof window.openDesktopOutlookMsg === 'function') {
        window.openDesktopOutlookMsg(fileName, path);
        return;
      }
      const lowerFn = fileName.toLowerCase();
      if ((lowerFn.endsWith('.dwg') || lowerFn.endsWith('.dxf')) && typeof window.openDesktopCadViewer === 'function') {
        const file = _filesData.find(f => f.path === path);
        window.openDesktopCadViewer(fileName, path, file?.url);
        return;
      }
      if(path.startsWith('gdrive://')){
        const file=_filesData.find(f=>f.path===path);
        API.openLink(file?.url || 'https://drive.google.com/file/d/'+path.split('/').pop()+'/view');
      }else API.openPath(path);
    }
  }

  function onItemRightClick(e, path, isDir) {
    e.preventDefault();
    if (confirm(`${isDir ? 'Thư mục' : 'Tệp tin'}: ${path}\n\nBạn có muốn mở trong Windows Explorer không?`)) {
      API.openPath(path);
    }
  }

  // ── 5. Add / Rename / Move / Icon Modals ───────────────────────────────────
  function openAddTabModal() {
    const select = document.getElementById('modal-ql-category-select');
    if (select) {
      select.innerHTML = _managementCategories.map(c => `
        <option value="${c.code}">${c.code !== 'custom' ? `[${c.code}] ` : ''}${escapeHtml(c.name)}</option>
      `).join('');
      select.value = _managementCategories[0]?.code || '01.01';
      onCategorySelectChanged(select.value);
    }
    const modal = document.getElementById('modal-add-explorer-tab');
    if (modal) modal.showModal();
  }

  function onCategorySelectChanged(catCode) {
    const cat = _managementCategories.find(c => c.code === catCode);
    const descEl = document.getElementById('modal-ql-category-desc');
    const nameEl = document.getElementById('modal-ql-tab-name');
    const pathEl = document.getElementById('modal-ql-tab-path');

    if (!cat) return;
    if (descEl) descEl.textContent = cat.desc || '';
    if (nameEl && (!nameEl.value || catCode !== 'custom')) {
      nameEl.value = cat.name;
    }
    if (pathEl && (!pathEl.value || catCode !== 'custom')) {
      pathEl.value = cat.default_path || '';
    }

    // Set level defaults
    for (let i = 1; i <= 5; i++) {
      const chk = document.getElementById(`modal-ql-chk-lvl${i}`);
      if (chk) chk.checked = Boolean(cat[`level_${i}`]);
    }
    const chkDir = document.getElementById('modal-ql-chk-dir');
    if (chkDir) chkDir.checked = cat.show_dir !== false;
    const chkFile = document.getElementById('modal-ql-chk-file');
    if (chkFile) chkFile.checked = cat.show_file !== false;
  }

  async function browseFolderForNewTab() {
    try {
      const res = await API.selectFolderDialog('Chọn thư mục nguồn cho tab');
      if (res && res.ok && res.data && res.data.folder) {
        const pathEl = document.getElementById('modal-ql-tab-path');
        if (pathEl) pathEl.value = res.data.folder;
      }
    } catch (e) {
      toast('Lỗi chọn thư mục: ' + e, 'error');
    }
  }

  async function submitAddTab() {
    const select = document.getElementById('modal-ql-category-select');
    const nameEl = document.getElementById('modal-ql-tab-name');
    const pathEl = document.getElementById('modal-ql-tab-path');

    const catCode = select ? select.value : 'custom';
    const name = nameEl ? nameEl.value.trim() : '';
    const path = pathEl ? pathEl.value.trim() : '';

    if (!name) {
      toast('Vui lòng nhập Tên Tab!', 'warning');
      return;
    }

    const options = {
      level_1: document.getElementById('modal-ql-chk-lvl1')?.checked !== false,
      level_2: Boolean(document.getElementById('modal-ql-chk-lvl2')?.checked),
      level_3: Boolean(document.getElementById('modal-ql-chk-lvl3')?.checked),
      level_4: Boolean(document.getElementById('modal-ql-chk-lvl4')?.checked),
      level_5: Boolean(document.getElementById('modal-ql-chk-lvl5')?.checked),
      show_dir: document.getElementById('modal-ql-chk-dir')?.checked !== false,
      show_file: document.getElementById('modal-ql-chk-file')?.checked !== false,
    };

    const modal = document.getElementById('modal-add-explorer-tab');
    if (modal) modal.close();

    if (typeof showLoading === 'function') showLoading();
    try {
      const res = await API.addExplorerTab(name, path, catCode, options);
      if (res && res.ok) {
        toast(`Đã thêm tab '${name}' thành công!`, 'success');
        await loadTabs();
        selectTabById(res.data.id);
      } else {
        toast('Lỗi thêm tab: ' + (res?.error || ''), 'error');
      }
    } catch (e) {
      toast('Lỗi thêm tab: ' + e, 'error');
    } finally {
      if (typeof hideLoading === 'function') hideLoading();
    }
  }

  async function moveActiveTab(direction) {
    if (!_activeTab) return;
    try {
      const res = await API.moveExplorerTab(_activeTab.id, direction);
      if (res && res.ok && res.data && res.data.moved) {
        await loadTabs();
      }
    } catch (e) {
      toast('Lỗi di chuyển tab: ' + e, 'error');
    }
  }

  function openRenameActiveTabModal() {
    if (!_activeTab) return;
    const input = document.getElementById('modal-rename-input');
    if (input) input.value = _activeTab.name || '';
    const modal = document.getElementById('modal-rename-explorer-tab');
    if (modal) modal.showModal();
  }

  async function submitRenameTab() {
    if (!_activeTab) return;
    const input = document.getElementById('modal-rename-input');
    const newName = input ? input.value.trim() : '';
    if (!newName) {
      toast('Tên tab không được để trống!', 'warning');
      return;
    }
    const modal = document.getElementById('modal-rename-explorer-tab');
    if (modal) modal.close();

    try {
      const res = await API.updateExplorerTab(_activeTab.id, { name: newName });
      if (res && res.ok) {
        _activeTab.name = newName;
        renderSidebarTabs();
        toast('Đã đổi tên tab thành công!', 'success');
      } else {
        toast('Lỗi đổi tên: ' + (res?.error || ''), 'error');
      }
    } catch (e) {
      toast('Lỗi đổi tên: ' + e, 'error');
    }
  }

  function openChangeIconModal() {
    if (!_activeTab) return;
    const icons = ['📁', '📑', '🤝', '⏳', '🏢', '🌍', '📦', '💻', '👥', '📐', '🤖', '🔍', '⚙️', '📝', '⚡', '📊', '🛡️', '🌟'];
    const colors = ['#0F6E56', '#2980b9', '#8e44ad', '#d35400', '#27ae60', '#c0392b', '#2c3e50'];

    const iconList = document.getElementById('modal-icon-picker-list');
    if (iconList) {
      iconList.innerHTML = icons.map(ic => `
        <button class="btn btn-ghost btn-sm p-1 rounded-lg hover:bg-primary/20 text-lg" onclick="ExplorerModule.chooseIcon('${ic}')">
          ${ic}
        </button>
      `).join('');
    }

    const colorList = document.getElementById('modal-color-picker-list');
    if (colorList) {
      colorList.innerHTML = colors.map(c => `
        <button class="w-6 h-6 rounded-full border border-base-300 transition-transform hover:scale-110" style="background-color: ${c}" onclick="ExplorerModule.chooseColor('${c}')"></button>
      `).join('');
    }

    const modal = document.getElementById('modal-icon-explorer-tab');
    if (modal) modal.showModal();
  }

  function chooseIcon(ic) {
    if (_activeTab) {
      _activeTab.icon = ic;
      API.updateExplorerTab(_activeTab.id, { icon: ic });
      renderSidebarTabs();
      const modal = document.getElementById('modal-icon-explorer-tab');
      if (modal) modal.close();
      toast('Đã đổi icon tab!', 'success');
    }
  }

  function chooseColor(color) {
    if (_activeTab) {
      _activeTab.color = color;
      API.updateExplorerTab(_activeTab.id, { color: color });
      renderSidebarTabs();
      const modal = document.getElementById('modal-icon-explorer-tab');
      if (modal) modal.close();
      toast('Đã đổi màu sắc tab!', 'success');
    }
  }

  async function removeTab(tabId) {
    const t = _tabs.find(x => x.id === tabId);
    const name = t ? t.name : 'tab này';
    if (!confirm(`Bạn có chắc chắn muốn xóa tab '${name}' không?\n(Chỉ xóa khỏi giao diện phần mềm, không xóa dữ liệu trên máy).`)) {
      return;
    }
    try {
      const res = await API.removeExplorerTab(tabId);
      if (res && res.ok) {
        toast(`Đã xóa tab '${name}'`, 'info');
        await loadTabs();
      } else {
        toast('Lỗi xóa tab: ' + (res?.error || ''), 'error');
      }
    } catch (e) {
      toast('Lỗi xóa tab: ' + e, 'error');
    }
  }

  function onTabRightClick(e, tabId) {
    e.preventDefault();
    selectTabById(tabId);
    openRenameActiveTabModal();
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  return {
    init,
    loadTabs,
    selectTabById,
    selectTab,
    refreshCurrentFolder,
    chooseSourceFolder,
    chooseOnlineSource,
    changeSource,
    applyOnlineSource,
    openInWindowsExplorer,
    toggleSortDir,
    adjustFontSize,
    sortBy,
    onLevelChange,
    onShowDirChange,
    onShowFileChange,
    onSearchInput,
    clearSearch,
    onDateFilterToggle,
    onDateChange,
    onItemDoubleClick,
    onItemRightClick,
    selectSubFolder,
    reauthDrive,
    moveActiveTab,
    openAddTabModal,
    onCategorySelectChanged,
    browseFolderForNewTab,
    submitAddTab,
    openRenameActiveTabModal,
    submitRenameTab,
    openChangeIconModal,
    chooseIcon,
    chooseColor,
    removeTab,
    onTabRightClick,
    switchProject,
    openAddProjectModal,
    onProjectSelectChange,
    submitAddProject,
    _currentPath: () => _activeTab?.path || '',
  };
})();
