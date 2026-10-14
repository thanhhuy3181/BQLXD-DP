/**
 * accounts.js — Quản lý Tài khoản & Ma trận Phân quyền (RBAC)
 */
'use strict';

const AccountsModule = (function() {
  let _currentUser = null;
  let _users = [];
  let _permData = null;

  const NAV_PERMISSIONS = {home:'tab_home','ql-file':'tab_quan_ly','chuc_nang':'tab_chuc_nang','cai_dat':'tab_cai_dat'};
  const SETTINGS_PERMISSIONS = {'cd-acc':'cd_ql_acc','cd-perm':'cd_perm','cd-ai':'cd_ai_engine','cd-excel':'cd_excel_cfg','cd-backup':'cd_backup'};
  const FUNCTION_PERMISSIONS = {word:'cn_tab_b1_word','cn-b2':'cn_tab_b2_hsmt','cn-b3':'cn_tab_b3_hd','cn-b4':'cn_tab_b4_heading','cn-skill-hsmt':'cn_tab_b5_skill_hsmt','cn-skill-hd':'cn_tab_b5_skill_hd','cn-b6':'cn_tab_b6_ai','cn-b7':'cn_tab_b7_search','cn-b8':'cn_tab_b8_central','cn-extract-boq':'cn_tab_b9_merge_boq'};

  async function init() {
    await checkCurrentUser();
    await loadAccessControl();
    await loadUsers();
    await loadPermissions();
  }

  function canAccess(permissionKey) {
    if (!permissionKey || _currentUser?.role === 'Admin') return true;
    const level = _permData?.permissions?.[_currentUser?.role]?.[permissionKey];
    return level !== 'none' && level !== false;
  }

  function denyAccess() {
    toast('Bạn không được phân quyền cho chức năng này.', 'warning');
  }

  function applyAccessControl() {
    if (!_currentUser) return;
    Object.entries(NAV_PERMISSIONS).forEach(([tab, key]) => {
      document.querySelectorAll(`[data-tab="${tab}"]`).forEach(el => el.classList.toggle('hidden', !canAccess(key)));
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
      _permData = res.data;
      applyAccessControl();
    }
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
      tbody.innerHTML = '<tr><td colspan="6" class="text-center py-6 text-base-content/50 text-xs">Chưa có người dùng</td></tr>';
      return;
    }

    tbody.innerHTML = _users.map((u, idx) => {
      const isLocked = u.status === 'Locked';
      const isAdmin = u.username === 'admin';
      return `
        <tr class="hover text-xs">
          <td class="text-center font-medium">${idx + 1}</td>
          <td>
            <div class="font-bold text-primary">${escapeHtml(u.username)}</div>
            <div class="text-[11px] text-base-content/70">${escapeHtml(u.fullname || '')}</div>
          </td>
          <td class="text-base-content/70">${escapeHtml(u.email || '—')}</td>
          <td>
            <select class="select select-bordered select-xs" ${isAdmin ? 'disabled' : ''}
                    onchange="AccountsModule.changeRole('${escapeAttr(u.username)}', this.value)">
              <option value="Admin" ${u.role === 'Admin' ? 'selected' : ''}>👑 Admin</option>
              <option value="Phó nhóm" ${u.role === 'Phó nhóm' ? 'selected' : ''}>✏️ Phó nhóm</option>
              <option value="Thành viên" ${u.role === 'Thành viên' ? 'selected' : ''}>👁️ Thành viên</option>
            </select>
          </td>
          <td>
            <span class="badge ${isLocked ? 'badge-error' : 'badge-success'} badge-xs font-semibold">
              ${isLocked ? '🔒 Đã khóa' : '✔ Hoạt động'}
            </span>
          </td>
          <td>
            ${!isAdmin ? `
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
    _permData = res.data;
    renderPermMatrix();
  }

  function renderPermMatrix() {
    const tbody = document.getElementById('perm-matrix-tbody');
    if (!tbody || !_permData) return;

    const perms = _permData.permissions || {};
    const groups = _permData.groups || [];

    let html = '';
    groups.forEach(([grpTitle, grpItems]) => {
      html += `
        <tr class="bg-base-200/80 font-bold text-xs">
          <td colspan="4" class="py-2 px-3 text-primary">${escapeHtml(grpTitle)}</td>
        </tr>
      `;
      grpItems.forEach(([pkey, pdesc]) => {
        const adminVal = perms.Admin?.[pkey] || 'full';
        const phoVal = perms['Phó nhóm']?.[pkey] || 'edit';
        const tvVal = perms['Thành viên']?.[pkey] || 'view';

        html += `
          <tr class="hover text-xs border-b border-base-200">
            <td class="pl-6 font-medium">${escapeHtml(pdesc)}</td>
            <td class="text-center font-bold text-success">${getPermLabel(adminVal)}</td>
            <td class="text-center">
              <select class="select select-bordered select-xs"
                      onchange="AccountsModule.setPermVal('Phó nhóm', '${pkey}', this.value)">
                <option value="full" ${phoVal === 'full' ? 'selected' : ''}>Full quyền</option>
                <option value="edit" ${phoVal === 'edit' ? 'selected' : ''}>Chỉnh sửa</option>
                <option value="view" ${phoVal === 'view' ? 'selected' : ''}>Xem</option>
                <option value="none" ${phoVal === 'none' ? 'selected' : ''}>Khóa</option>
              </select>
            </td>
            <td class="text-center">
              <select class="select select-bordered select-xs"
                      onchange="AccountsModule.setPermVal('Thành viên', '${pkey}', this.value)">
                <option value="full" ${tvVal === 'full' ? 'selected' : ''}>Full quyền</option>
                <option value="edit" ${tvVal === 'edit' ? 'selected' : ''}>Chỉnh sửa</option>
                <option value="view" ${tvVal === 'view' ? 'selected' : ''}>Xem</option>
                <option value="none" ${tvVal === 'none' ? 'selected' : ''}>Khóa</option>
              </select>
            </td>
          </tr>
        `;
      });
    });
    tbody.innerHTML = html;
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
  }

  async function savePermissions() {
    if (!_permData?.permissions) return;
    const res = await API.saveRolePermissions(_permData.permissions);
    if (res.ok) {
      toast('Đã lưu ma trận phân quyền thành công!', 'success');
    } else {
      toast('Lỗi lưu phân quyền: ' + res.error, 'error');
    }
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
      toast('Đăng ký tài khoản thành công! Bạn có thể đăng nhập ngay.', 'success');
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
    canAccess,
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
    }
  }
});
