/**
 * accounts.js — Quản lý Tài khoản & Ma trận Phân quyền (RBAC)
 */
'use strict';

const AccountsModule = (function() {
  let _currentUser = null;
  let _users = [];
  let _permData = null;
  let _permissionSaveChain = Promise.resolve();

  const NAV_PERMISSIONS = {home:'tab_home',mail:'tab_mail','ql-file':'tab_quan_ly',theo_doi:'tab_theo_doi',bao_cao:'tab_bao_cao',so_sanh:'tab_so_sanh',thanh_toan:'tab_thanh_toan',chuc_nang:'tab_chuc_nang',cai_dat:'tab_cai_dat'};
  // Keep AwD's display rule aligned with the API/AwM rule while older saved
  // matrices still use the former role names.
  const LEGACY_ROLE = {CBGS:'Thành viên','Nội nghiệp':'Phó nhóm'};
  const SETTINGS_PERMISSIONS = {'cd-theme':'cd_theme','cd-hm-ctr':'cd_hm_ctr','cd-acc':'cd_ql_acc','cd-perm':'cd_perm','cd-ai':'cd_ai_engine','cd-excel':'cd_excel_cfg','cd-links':'cd_links','cd-data-matrix':'cd_data_matrix','cd-backup':'cd_backup'};
  const FUNCTION_PERMISSIONS = {word:'cn_tab_b1_word','cn-down-hd':'cn_down_hd','cn-down-cks':'cn_down_cks','cn-skill-hsmt':'cn_tab_b5_skill_hsmt','cn-b9-merge-boq':'cn_tab_b9_merge_boq','cn-skill-hd':'cn_tab_b5_skill_hd','cn-extract-boq':'cn_tab_b9_merge_boq','cn-b2':'cn_tab_b2_hsmt','cn-b3':'cn_tab_b3_hd','cn-b8':'cn_tab_b8_central','cn-b7':'cn_tab_b7_search','cn-b6':'cn_tab_b6_ai','cn-b4':'cn_tab_b4_heading'};

  async function init() {
    await checkCurrentUser();
    await loadAccessControl();
    await loadUsers();
    await loadPermissions();
  }

  function canAccess(permissionKey) {
    if (!permissionKey || _currentUser?.role === 'Admin') return true;
    const role = _currentUser?.role;
    const own = _permData?.permissions?.[role]?.[permissionKey];
    const level = own === undefined ? _permData?.permissions?.[LEGACY_ROLE[role]]?.[permissionKey] : own;
    return level === 'view' || level === 'edit' || level === 'full' || level === true;
  }

  function canEdit(permissionKey) {
    if (!permissionKey || _currentUser?.role === 'Admin') return true;
    const role = _currentUser?.role;
    const own = _permData?.permissions?.[role]?.[permissionKey];
    const level = own === undefined ? _permData?.permissions?.[LEGACY_ROLE[role]]?.[permissionKey] : own;
    return level === 'edit' || level === 'full' || level === true;
  }

  function navAllowed(tab) {
    const key = NAV_PERMISSIONS[tab];
    // Settings is a container: it stays visible if the person can view any
    // child setting, even when the broad tab flag itself is locked.
    if (tab === 'cai_dat') return canAccess(key) || Object.values(SETTINGS_PERMISSIONS).some(canAccess);
    return canAccess(key);
  }

  function denyAccess() {
    toast('Bạn không được phân quyền cho chức năng này.', 'warning');
  }

  function applyAccessControl() {
    if (!_currentUser) return;
    Object.entries(NAV_PERMISSIONS).forEach(([tab]) => {
      document.querySelectorAll(`[data-tab="${tab}"]`).forEach(el => el.classList.toggle('hidden', !navAllowed(tab)));
    });
    Object.entries(SETTINGS_PERMISSIONS).forEach(([tab, key]) => {
      document.querySelectorAll(`[data-cd="${tab}"]`).forEach(el => el.classList.toggle('hidden', !canAccess(key)));
    });
    Object.entries(FUNCTION_PERMISSIONS).forEach(([tab, key]) => {
      document.querySelectorAll(`[data-cn="${tab}"]`).forEach(el => el.classList.toggle('hidden', !canAccess(key)));
    });
  }

  async function loadAccessControl() {
    const res = await API.getRolePermissions();
    if (res.ok) {
      _permData = window.PermissionCatalog ? PermissionCatalog.ensure(res.data) : res.data;
      applyAccessControl();
    }
  }

  async function refreshAccessControl() {
    await checkCurrentUser();
    await loadAccessControl();
  }

  async function checkCurrentUser() {
    const res = await API.getCurrentUser();
    if (res.ok && res.data) {
      _currentUser = res.data;
      updateHeaderUser();
    }
  }

  function updateHeaderUser() {
    const nameEl = document.getElementById('header-user-name');
    const badgeEl = document.getElementById('header-user-role');
    if (nameEl) nameEl.textContent = _currentUser?.fullname || _currentUser?.username || 'Chưa đăng nhập';
    if (badgeEl) {
      badgeEl.textContent = _currentUser?.role || 'Khách';
      if (_currentUser?.role === 'Admin') {
        badgeEl.className = 'badge badge-xs badge-primary font-bold';
      } else {
        badgeEl.className = 'badge badge-xs badge-ghost';
      }
    }
  }

  async function loadUsers() {
    const res = await API.getUsersList();
    if (!res.ok) return;
    _users = res.data || [];
    renderUsersTable();
  }

  function renderUsersTable() {
    const tbody = document.getElementById('accounts-tbody');
    if (!tbody) return;

    if (_users.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center py-6 text-base-content/50 text-xs">Chưa có người dùng</td></tr>';
      return;
    }

    tbody.innerHTML = _users.map((u, idx) => {
      const isLocked = u.status === 'Locked';
      const isPending = u.status === 'Pending';
      const isAdmin = u.username === 'admin';
      const projects = Array.isArray(u.allowed_projects) ? u.allowed_projects : [];
      const projectLabel = projects.includes('*') ? 'Tất cả dự án' : (projects.length ? `${projects.length} dự án` : 'Chưa gán dự án');
      const projectTitle = projects.includes('*') ? 'Tất cả dự án' : projects.join(', ');
      return `
        <tr class="hover text-xs">
          <td class="text-center font-medium">${idx + 1}</td>
          <td>
            <div class="font-bold text-primary">${escapeHtml(u.username)}</div>
            <div class="text-[11px] text-base-content/70">${escapeHtml(u.fullname || '')}</div>
          </td>
          <td class="text-base-content/70">${escapeHtml(u.email || '—')}</td>
          <td>
            <button class="btn btn-ghost btn-xs normal-case max-w-[170px] truncate" title="${escapeAttr(projectTitle || 'Chưa có dự án')}"
                    ${isAdmin ? 'disabled' : ''} onclick="AccountsModule.showProjectAccess('${escapeAttr(u.username)}')">
              📁 ${escapeHtml(projectLabel)}
            </button>
          </td>
          <td>
            <select class="select select-bordered select-xs" ${isAdmin ? 'disabled' : ''}
                    onchange="AccountsModule.changeRole('${escapeAttr(u.username)}', this.value)">
              <option value="Admin" ${u.role === 'Admin' ? 'selected' : ''}>👑 Admin</option>
              <option value="Văn phòng" ${u.role === 'Văn phòng' ? 'selected' : ''}>🏢 Văn phòng</option>
              <option value="Nội nghiệp" ${u.role === 'Nội nghiệp' ? 'selected' : ''}>🗂️ Nội nghiệp</option>
              <option value="ĐTGS" ${u.role === 'ĐTGS' ? 'selected' : ''}>🦺 ĐTGS</option>
              <option value="CBGS" ${u.role === 'CBGS' || u.role === 'Thành viên' ? 'selected' : ''}>👷 CBGS</option>
            </select>
          </td>
          <td>
            <span class="badge ${isPending ? 'badge-warning' : (isLocked ? 'badge-error' : 'badge-success')} badge-xs font-semibold">
              ${isPending ? '⏳ Chờ duyệt' : (isLocked ? '🔒 Đã khóa' : '✔ Hoạt động')}
            </span>
          </td>
          <td>
            ${!isAdmin ? `
              ${isPending ? `<button class="btn btn-xs btn-success btn-outline" onclick="AccountsModule.approveUser('${escapeAttr(u.username)}')">Duyệt</button>` : ''}
              <button class="btn btn-xs btn-info btn-outline" onclick="AccountsModule.showProjectAccess('${escapeAttr(u.username)}')">Dự án</button>
              <button class="btn btn-xs ${isLocked ? 'btn-success' : 'btn-warning'} btn-outline"
                      onclick="AccountsModule.toggleLock('${escapeAttr(u.username)}')">
                ${isLocked ? 'Mở khóa' : 'Khóa'}
              </button>
            ` : '<span class="text-[11px] text-base-content/40 italic">Hệ thống</span>'}
          </td>
        </tr>
      `;
    }).join('');
  }

  async function loadPermissions() {
    const res = await API.getRolePermissions();
    if (!res.ok) return;
    _permData = window.PermissionCatalog ? PermissionCatalog.ensure(res.data) : res.data;
    renderPermMatrix();
  }

  function renderPermMatrix() {
    const tbody = document.getElementById('perm-matrix-tbody');
    if (!tbody || !_permData) return;

    const perms = _permData.permissions || {};
    const readOnly = _currentUser?.role !== 'Admin';
    const status = document.getElementById('perm-autosave-status');
    if (status) status.textContent = readOnly ? 'Chỉ xem — thay đổi do Admin thực hiện' : 'Tự động lưu khi thay đổi';
    const groups = window.PermissionCatalog?.groups || _permData.groups || [];

    const roles = ['Admin','Văn phòng','Nội nghiệp','ĐTGS','CBGS'];
    let html = '';
    groups.forEach(([grpTitle, grpItems]) => {
      html += `
        <tr class="bg-base-200/80 font-bold text-xs">
          <td colspan="6" class="py-2 px-3 text-primary">${escapeHtml(grpTitle)}</td>
        </tr>
      `;
      grpItems.forEach(([pkey, pdesc]) => {
        const adminVal = perms.Admin?.[pkey] || 'full';
        html += `
          <tr class="hover text-xs border-b border-base-200">
            <td class="pl-6 font-medium">${escapeHtml(pdesc)}</td>
            <td class="text-center font-bold text-success">${getPermLabel(adminVal)}</td>
            ${roles.slice(1).map(role => permissionSelect(role, pkey, perms[role]?.[pkey] || 'none', readOnly)).join('')}
          </tr>
        `;
      });
    });
    tbody.innerHTML = html;
  }

  function permissionSelect(role, pkey, val, readOnly) {
    return `<td class="text-center"><select class="select select-bordered select-xs" ${readOnly ? 'disabled' : ''}
      onchange="AccountsModule.setPermVal('${role}', '${pkey}', this.value)">
      <option value="full" ${val === 'full' ? 'selected' : ''}>Full</option>
      <option value="edit" ${val === 'edit' ? 'selected' : ''}>Sửa</option>
      <option value="view" ${val === 'view' ? 'selected' : ''}>Xem</option>
      <option value="none" ${val === 'none' ? 'selected' : ''}>Khóa</option>
    </select></td>`;
  }

  function getPermLabel(val) {
    if (val === 'full') return '👑 Full quyền';
    if (val === 'edit') return '✏️ Chỉnh sửa';
    if (val === 'view') return '👁️ Xem';
    return '🔒 Khóa';
  }

  function setPermVal(role, pkey, val) {
    if (!_permData?.permissions) return;
    _permData.permissions[role] = _permData.permissions[role] || {};
    _permData.permissions[role][pkey] = val;
    savePermissions(true);
  }

  async function savePermissions(silent = false) {
    if (_currentUser?.role !== 'Admin') {
      if (!silent) toast('Bạn chỉ có quyền xem ma trận phân quyền.', 'warning');
      return;
    }
    if (!_permData?.permissions) return;
    const status = document.getElementById('perm-autosave-status');
    if (status) status.textContent = 'Đang lưu…';
    // Serialize writes so quick edits cannot overwrite one another out of order.
    _permissionSaveChain = _permissionSaveChain.then(async () => {
      const res = await API.saveRolePermissions(_permData.permissions);
      if (res.ok) {
        if (status) status.textContent = '✓ Đã tự lưu';
      } else {
        if (status) status.textContent = '⚠ Lưu không thành công';
        toast('Lỗi lưu phân quyền: ' + res.error, 'error');
      }
    });
    return _permissionSaveChain;
  }

  async function changeRole(username, role) {
    const res = await API.updateUserRole(username, role);
    if (res.ok) {
      toast(`Đã cập nhật quyền của ${username} thành ${role}`, 'success');
      loadUsers();
    } else {
      toast('Lỗi cập nhật: ' + res.error, 'error');
    }
  }

  async function toggleLock(username) {
    const res = await API.toggleUserLock(username);
    if (res.ok) {
      toast(`Đã chuyển trạng thái tài khoản ${username} thành ${res.data.status}`, 'info');
      loadUsers();
    } else {
      toast('Lỗi thao tác: ' + res.error, 'error');
    }
  }

  async function approveUser(username) {
    const res = await API.approveUser(username);
    if (res.ok) {
      toast(`Đã duyệt tài khoản ${username}. Hãy gán dự án trước khi người dùng làm việc.`, 'success');
      loadUsers();
    } else {
      toast('Không thể duyệt tài khoản: ' + res.error, 'error');
    }
  }

  function removeAccountDialog() {
    document.getElementById('account-management-dialog')?.remove();
  }

  async function showProjectAccess(username) {
    const account = _users.find(item => item.username === username);
    if (!account) return toast('Không tìm thấy tài khoản.', 'error');
    const projectsRes = await API.getProjectsBarData();
    if (!projectsRes.ok) return toast('Không tải được danh sách dự án: ' + projectsRes.error, 'error');
    const projects = projectsRes.data?.all_projects || [];
    const granted = new Set(account.allowed_projects || []);
    removeAccountDialog();
    const dialog = document.createElement('dialog');
    dialog.id = 'account-management-dialog';
    dialog.className = 'modal';
    dialog.innerHTML = `<div class="modal-box max-w-xl">
      <h3 class="font-bold text-lg">📁 Dự án được phép xem</h3>
      <p class="text-sm opacity-70 mt-1"><b>${escapeHtml(account.fullname || account.username)}</b> chỉ xem dữ liệu thuộc dự án được chọn và các dữ liệu dùng chung.</p>
      <div class="max-h-72 overflow-y-auto mt-4 space-y-2 border border-base-300 rounded-lg p-3">
        ${projects.length ? projects.map(project => `<label class="flex items-center gap-3 cursor-pointer py-1"><input type="checkbox" class="checkbox checkbox-sm checkbox-primary account-project-check" value="${escapeAttr(project)}" ${granted.has('*') || granted.has(project) ? 'checked' : ''}><span>${escapeHtml(project)}</span></label>`).join('') : '<p class="opacity-60 text-sm">Chưa có dự án. Hãy bấm “Thêm dự án” trước.</p>'}
      </div>
      <div class="modal-action"><button class="btn btn-sm" onclick="document.getElementById('account-management-dialog').close()">Hủy</button><button class="btn btn-sm btn-primary" onclick="AccountsModule.saveProjectAccess('${escapeAttr(username)}')">Lưu phân dự án</button></div>
    </div><form method="dialog" class="modal-backdrop"><button>Đóng</button></form>`;
    document.body.appendChild(dialog);
    dialog.addEventListener('close', removeAccountDialog, {once:true});
    dialog.showModal();
  }

  async function saveProjectAccess(username) {
    const projects = [...document.querySelectorAll('.account-project-check:checked')].map(input => input.value);
    const res = await API.updateUserProjects(username, projects);
    if (!res.ok) return toast('Không lưu được phân dự án: ' + res.error, 'error');
    document.getElementById('account-management-dialog')?.close();
    toast(`Đã gán ${projects.length} dự án cho ${username}.`, 'success');
    loadUsers();
  }

  function showCreateProjectModal() {
    removeAccountDialog();
    const dialog = document.createElement('dialog');
    dialog.id = 'account-management-dialog';
    dialog.className = 'modal';
    dialog.innerHTML = `<div class="modal-box max-w-md"><h3 class="font-bold text-lg">➕ Thêm dự án</h3>
      <p class="text-sm opacity-70 mt-1">Dự án mới sẽ xuất hiện trong danh sách gán quyền của từng tài khoản.</p>
      <label class="form-control mt-4"><span class="label-text text-sm font-semibold">Tên dự án</span><input id="new-project-name" class="input input-bordered" maxlength="160" placeholder="Ví dụ: Dự án Vinhomes Đan Phượng"></label>
      <div class="modal-action"><button class="btn btn-sm" onclick="document.getElementById('account-management-dialog').close()">Hủy</button><button class="btn btn-sm btn-primary" onclick="AccountsModule.createProject()">Thêm dự án</button></div>
    </div><form method="dialog" class="modal-backdrop"><button>Đóng</button></form>`;
    document.body.appendChild(dialog);
    dialog.addEventListener('close', removeAccountDialog, {once:true});
    dialog.showModal();
    setTimeout(() => document.getElementById('new-project-name')?.focus(), 0);
  }

  async function createProject() {
    const name = document.getElementById('new-project-name')?.value.trim();
    if (!name) return toast('Nhập tên dự án.', 'warning');
    const res = await API.createProject(name);
    if (!res.ok) return toast('Không thêm được dự án: ' + res.error, 'error');
    document.getElementById('account-management-dialog')?.close();
    toast(`Đã thêm dự án ${name}.`, 'success');
  }

  function showAuthModal() {
    const modal = document.getElementById('modal-auth-login');
    if (!modal) return;
    const usernameInput = document.getElementById('auth-username');
    const pwdInput = document.getElementById('auth-password');
    if (usernameInput) usernameInput.value = _currentUser?.username || 'admin';
    if (pwdInput) pwdInput.value = '';
    modal.showModal();
    renderGoogleButton('google-login-button');
  }

  function renderGoogleButton(elementId) {
    const target = document.getElementById(elementId);
    if (!target || !window.google?.accounts?.id || !window.BQLDA_WEB_CLIENT_ID) return;
    target.innerHTML = '';
    google.accounts.id.initialize({
      client_id: window.BQLDA_WEB_CLIENT_ID,
      callback: handleGoogleCredential,
      cancel_on_tap_outside: true
    });
    google.accounts.id.renderButton(target, { theme: 'outline', size: 'medium', width: 300, text: 'continue_with' });
  }

  async function handleGoogleCredential(response) {
    if (!response?.credential) return;
    const res = await API.googleLogin(response.credential);
    if (!res.ok) { toast('Đăng nhập Google thất bại: ' + res.error, 'error'); return; }
    _currentUser = res.data;
    await loadAccessControl();
    // Persist the session and rebuild the app state so the user lands in the
    // authenticated web UI after Google's account chooser closes.
    try { localStorage.setItem('bqlda_current_user', JSON.stringify(_currentUser)); } catch (_) {}
    updateHeaderUser();
    document.getElementById('modal-auth-login')?.close();
    document.getElementById('modal-auth-register')?.close();
    document.body.classList.remove('auth-gate');
    toast(`Đăng nhập Google thành công! Chào mừng ${_currentUser.fullname}`, 'success');
  }

  async function submitLogin() {
    const u = document.getElementById('auth-username')?.value.trim();
    const p = document.getElementById('auth-password')?.value.trim();
    if (!u || !p) {
      toast('Vui lòng nhập tên đăng nhập và mật khẩu!', 'warning');
      return;
    }
    const res = await API.loginUser(u, p);
    if (res.ok) {
      _currentUser = res.data;
    await loadAccessControl();
      updateHeaderUser();
      toast(`Đăng nhập thành công! Chào mừng ${_currentUser.fullname}`, 'success');
      document.getElementById('modal-auth-login')?.close();
      document.body.classList.remove('auth-gate');
      loadUsers();
    } else {
      toast('Đăng nhập thất bại: ' + res.error, 'error');
    }
  }

  async function submitLogout() {
    await API.logoutUser();
    _currentUser = { username: 'guest', fullname: 'Khách', role: 'Thành viên' };
    updateHeaderUser();
    toast('Đã đăng xuất', 'info');
    document.getElementById('modal-auth-login')?.close();
    if (!window.pywebview) { document.body.classList.add('auth-gate'); setTimeout(() => showAuthModal(), 100); }
  }

  function showRegisterModal() {
    document.getElementById('modal-auth-login')?.close();
    document.getElementById('modal-auth-register')?.showModal();
    setTimeout(() => renderGoogleButton('google-register-button'), 0);
  }

  async function submitRegister() {
    const u = document.getElementById('reg-username')?.value.trim();
    const fn = document.getElementById('reg-fullname')?.value.trim();
    const em = document.getElementById('reg-email')?.value.trim();
    const ph = document.getElementById('reg-phone')?.value.trim();
    const pw = document.getElementById('reg-password')?.value.trim();

    if (!u || !pw) {
      toast('Vui lòng nhập Tên đăng nhập và Mật khẩu!', 'warning');
      return;
    }

    const res = await API.registerUser({ username: u, fullname: fn, email: em, phone: ph, password: pw });
    if (res.ok) {
      toast('Đăng ký thành công. Tài khoản sẽ dùng được sau khi Quản trị viên phê duyệt.', 'success');
      document.getElementById('modal-auth-register')?.close();
      showAuthModal();
      loadUsers();
    } else {
      toast('Đăng ký thất bại: ' + res.error, 'error');
    }
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
    refreshAccessControl,
    canAccess,
    canEdit,
    navAllowed,
    denyAccess,
    navPermission: tab => NAV_PERMISSIONS[tab],
    settingsPermission: tab => SETTINGS_PERMISSIONS[tab],
    functionPermission: tab => FUNCTION_PERMISSIONS[tab],
    checkCurrentUser,
    showAuthModal,
    submitLogin,
    submitLogout,
    showRegisterModal,
    submitRegister,
    handleGoogleCredential,
    changeRole,
    toggleLock,
    approveUser,
    showProjectAccess,
    saveProjectAccess,
    showCreateProjectModal,
    createProject,
    setPermVal,
    savePermissions
  };
})();

// The browser build always starts at the authentication gate.  The desktop
// pywebview build keeps its existing startup behaviour.
document.addEventListener('DOMContentLoaded', () => {
  if (!window.pywebview) {
    const style = document.createElement('style');
    style.textContent = 'body.auth-gate{background:#090812!important}body.auth-gate> *:not(dialog){visibility:hidden!important}body.auth-gate dialog{visibility:visible!important}body.auth-gate dialog::backdrop{background:#090812!important;opacity:1!important}';
    document.head.appendChild(style);
    // A saved server session means the user has already authenticated.  Only
    // show the gate for a new/expired browser session.
    if (!localStorage.getItem('bqlda_web_session')) {
      document.body.classList.add('auth-gate');
      setTimeout(() => AccountsModule.showAuthModal(), 250);
    } else {
      // Restore the authenticated person's name in the global header before
      // any settings screen is opened.
      setTimeout(() => AccountsModule.init(), 250);
      // Admin changes take effect for an already-open member session without
      // forcing a logout or a hard refresh.
      setInterval(() => AccountsModule.refreshAccessControl(), 10000);
    }
  }
});
