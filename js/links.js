/**
 * links.js — Quản lý & Mở nhanh Đường link / Thư mục đã kết nối
 */
'use strict';

const LinksModule = (function() {
  let _links = [];
  let _search = '';
  let _driveSyncBusy = false;
  let _drivePoll = null;
  let _scope='', _editScope='', _knownProject='', _loadVersion=0;

  async function init() {
    const scopes=await API.call('get_link_scopes');
    if(scopes.ok && scopes.data.current_project){
      if(!_scope || _knownProject!==scopes.data.current_project)_scope=scopes.data.current_project;
      _knownProject=scopes.data.current_project;
      const select=document.getElementById('links-project-select');
      select.innerHTML=scopes.data.projects.map(p=>`<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join('');
      renderScope();
    }
    await loadLinks();
    await loadDriveAccounts();
    await refreshDriveState();
  }

  async function loadLinks() {
    const scope=_scope,version=++_loadVersion;
    const res = await API.getManagedLinks(_search,scope);
    if(version!==_loadVersion || scope!==_scope)return;
    if (!res.ok) {
      toast('Không thể tải danh sách liên kết: ' + res.error, 'error');
      return;
    }
    _links = res.data || [];
    renderTable();
  }

  function renderScope(){
    const common=_scope==='__common__';
    document.getElementById('links-common-btn').classList.toggle('btn-primary',common);
    document.getElementById('links-project-select').value=common?'':_scope;
    document.getElementById('links-scope-label').textContent=common?'Link dùng chung':'Dự án: '+_scope;
  }
  async function selectScope(scope){_scope=scope;renderScope();await loadLinks();}

  function renderTable() {
    const tbody = document.getElementById('links-tbody');
    const countEl = document.getElementById('links-count');
    if (!tbody) return;

    if (countEl) countEl.textContent = `${_links.length} liên kết`;

    if (_links.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-base-content/50 text-xs">Không có liên kết nào</td></tr>';
      return;
    }

    tbody.innerHTML = _links.map((l, idx) => {
      const isWeb = (l.url || '').startsWith('http');
      const badgeType = isWeb ? 'badge-primary' : 'badge-secondary';
      return `
        <tr class="hover text-xs">
          <td class="text-center font-medium">${idx + 1}</td>
          <td>
            <div class="font-bold text-primary flex items-center gap-1.5 cursor-pointer hover:underline"
                 onclick="API.openLink('${escapeAttr(l.url)}')">
              <span>${isWeb ? '🌐' : '📁'}</span>
              <span>${escapeHtml(l.name)}</span>
            </div>
          </td>
          <td class="max-w-md truncate font-mono text-[11px] text-base-content/70" title="${escapeAttr(l.url)}">
            ${escapeHtml(l.display_path || l.url)}
          </td>
          <td><span class="badge ${badgeType} badge-xs font-semibold">${escapeHtml(l.category || 'Chung')}</span></td>
          <td class="text-base-content/60 text-[11px]">${escapeHtml(l.notes || '—')}</td>
          <td class="text-center">
            <div class="flex items-center justify-center gap-1">
              <button class="btn btn-xs btn-primary gap-1" ${l.pending_online ? 'disabled' : ''} onclick="API.openLink('${escapeAttr(l.url)}')">
                <span>Mở</span>
              </button>
              <button class="btn btn-xs btn-outline" onclick="LinksModule.showEditModal(${idx})">Sửa</button>
              <button class="btn btn-ghost btn-xs text-error hover:bg-error/20" onclick="LinksModule.deleteLink('${escapeAttr(l.id)}')">
                Xóa
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  function onSearch(val) {
    _search = val;
    loadLinks();
  }

  function showAddModal() {
    _editScope=_scope;
    document.getElementById('link-modal-title').textContent = 'Thêm Đường link / Thư mục Mới';
    document.getElementById('link-form-id').value = '';
    document.getElementById('link-form-name').value = '';
    document.getElementById('link-form-url').value = '';
    document.getElementById('link-form-cat').value = 'Hệ thống';
    document.getElementById('link-form-notes').value = '';
    document.getElementById('modal-edit-link').showModal();
  }

  function showEditModal(index) {
    _editScope=_scope;
    const link = _links[index];
    if (!link) return;
    document.getElementById('link-modal-title').textContent = 'Sửa liên kết / Thư mục';
    for (const [field, value] of Object.entries({id:link.id,name:link.name,url:link.url,cat:link.category,notes:link.notes})) {
      const input = document.getElementById('link-form-'+field);
      if (field === 'cat' && input.tagName === 'SELECT' && ![...input.options].some(o=>o.value===value)) {
        input.add(new Option(value || 'Chung', value || 'Chung'));
      }
      input.value = value || '';
    }
    document.getElementById('modal-edit-link').showModal();
  }

  async function submitSaveLink() {
    const name = document.getElementById('link-form-name')?.value.trim();
    const url = document.getElementById('link-form-url')?.value.trim();
    const cat = document.getElementById('link-form-cat')?.value.trim();
    const notes = document.getElementById('link-form-notes')?.value.trim();
    const id = document.getElementById('link-form-id')?.value.trim();

    if (!name || !url) {
      toast('Vui lòng nhập Tên và Đường dẫn / URL!', 'warning');
      return;
    }

    const existing = _links.find(link => link.id === id) || {};
    const edited={ ...existing, id, name, url, category: cat, notes };
    if(existing.url!==url) {delete edited.display_path;delete edited.pending_online;}
    const res = await API.saveManagedLink(edited,_editScope);
    if (res.ok) {
      toast('Đã lưu liên kết thành công', 'success');
      document.getElementById('modal-edit-link')?.close();
      loadLinks();
    } else {
      toast('Lỗi lưu liên kết: ' + res.error, 'error');
    }
  }

  async function deleteLink(lid) {
    if (!confirm('Bạn có chắc muốn xóa liên kết này?')) return;
    const res = await API.deleteManagedLink(lid,_scope);
    if (res.ok) {
      toast('Đã xóa liên kết', 'success');
      loadLinks();
    } else {
      toast('Lỗi xóa liên kết: ' + res.error, 'error');
    }
  }

  async function loadDriveAccounts() {
    const res = await API.call('get_drive_accounts');
    if (!res.ok) { driveStatus(res.error); return; }
    const select = document.getElementById('drive-account-select');
    const previous = select.value;
    select.innerHTML = '<option value="">Tất cả tài khoản</option>' + res.data.map(a =>
      `<option value="${a.id}">${escapeHtml(a.email || a.name)}</option>`).join('');
    if (res.data.some(a => a.id === previous)) select.value = previous;
    document.getElementById('drive-accounts').innerHTML = res.data.map(a =>
      `<span class="badge badge-outline gap-2 py-3">${escapeHtml(a.email || a.name)} <button aria-label="Ngắt tài khoản" onclick="LinksModule.removeDrive('${a.id}')">×</button></span>`).join('');
    document.getElementById('drive-sync-btn').disabled = _driveSyncBusy || !res.data.length;
    if (!_driveSyncBusy && !document.getElementById('drive-login-btn').disabled) {
      driveStatus(res.data.length ? `Đã kết nối ${res.data.length} tài khoản Google Drive.` : 'Chưa kết nối Google Drive. Có thể sử dụng nhiều tài khoản.');
    }
  }

  function driveStatus(message) {
    document.getElementById('drive-status').textContent = message;
  }

  async function refreshDriveState() {
    clearTimeout(_drivePoll);
    try {
      const res = await API.call('get_drive_state');
      if (!res.ok) throw new Error(res.error);
      const state = res.data;
      const wasSyncing = _driveSyncBusy;
      const wasLoggingIn = document.getElementById('drive-login-btn').disabled;
      _driveSyncBusy = state.sync_busy;
      document.getElementById('drive-login-btn').disabled = state.login_busy;
      await loadDriveAccounts();
      if (state.login_busy) driveStatus('Đang chờ chọn tài khoản trong trình duyệt Google…');
      else if (state.sync_busy) driveStatus('Đang lấy link Drive… Bạn vẫn có thể thêm tài khoản Google.');
      else if (wasLoggingIn && state.login_result) driveStatus(state.login_result.ok ? 'Đã kết nối: '+state.login_result.data.email : state.login_result.error);
      else if (wasSyncing && state.sync_result) {
        await loadLinks();
        driveStatus(`Đã lấy ${state.sync_result.count} tài liệu / thư mục. `+state.sync_result.errors.join('; '));
      }
      if (state.login_busy || state.sync_busy) _drivePoll = setTimeout(refreshDriveState, 1500);
    } catch (e) {
      _driveSyncBusy = false;
      document.getElementById('drive-login-btn').disabled = false;
      driveStatus('Không nhận được trạng thái Drive: '+e.message);
    }
  }

  async function loginDrive() {
    const btn = document.getElementById('drive-login-btn');
    btn.disabled = true;
    driveStatus('Chọn tài khoản và cấp quyền trong trình duyệt Google…');
    const res = await API.call('login_drive_account');
    if (!res.ok) { btn.disabled = false; driveStatus(res.error); }
    else _drivePoll = setTimeout(refreshDriveState,1500);
  }

  async function configureDrive() {
    const res = await API.call('import_drive_oauth_config');
    if (!res.ok) driveStatus(res.error);
    else if (res.data && res.data.imported) driveStatus('Đã lưu cấu hình OAuth. Bấm Đăng nhập / Thêm tài khoản Google để thử lại.');
  }

  async function removeDrive(id) {
    const res = await API.call('remove_drive_account', id);
    if (!res.ok) { driveStatus(res.error); return; }
    await loadDriveAccounts();
    driveStatus('Đã ngắt tài khoản. Các link đã lấy vẫn được giữ.');
  }

  async function syncDrive() {
    _driveSyncBusy = true;
    document.getElementById('drive-sync-btn').disabled = true;
    driveStatus('Đang lấy danh sách tài liệu và thư mục từ Drive…');
    const res = await API.call('sync_drive_links', document.getElementById('drive-account-select').value,_scope);
    if (!res.ok) { _driveSyncBusy = false; await loadDriveAccounts(); driveStatus(res.error); }
    else _drivePoll = setTimeout(refreshDriveState,1500);
  }

  document.addEventListener('py:drive_login', async e => {
    document.getElementById('drive-login-btn').disabled = false;
    await loadDriveAccounts();
    driveStatus(e.detail.ok ? 'Đã kết nối: '+e.detail.data.email : 'Đăng nhập thất bại: '+e.detail.error);
  });
  document.addEventListener('py:drive_sync_progress', e => {
    driveStatus(`Đang lấy link ${e.detail.email}: ${e.detail.count} tài liệu / thư mục…`);
  });
  document.addEventListener('py:drive_sync_done', async e => {
    _driveSyncBusy = false;
    await loadDriveAccounts();
    await loadLinks();
    driveStatus(`Đã lấy ${e.detail.count} lượt tài liệu / thư mục; link trùng đã gộp.`+
      (e.detail.errors.length ? ' Lỗi: '+e.detail.errors.join('; ') : ''));
  });

  function escapeHtml(s) {
    if (!s) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  function escapeAttr(s) {
    if (!s) return '';
    return String(s).replace(/'/g, "\\'").replace(/"/g, '&quot;');
  }

  return {
    init,
    loadLinks,
    selectScope,
    onSearch,
    showAddModal,
    showEditModal,
    submitSaveLink,
    deleteLink,
    loginDrive,
    configureDrive,
    syncDrive,
    removeDrive
  };
})();
