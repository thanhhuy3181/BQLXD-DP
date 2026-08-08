/**
 * ADMIN LIVE UI CUSTOMIZER & USER ACCOUNT MANAGEMENT STUDIO
 * Allows System Admin to visually reorder modules, adjust theme tokens,
 * edit RBAC permission matrix, and fully manage user accounts (Add, Edit, Delete, Lock, Gmail Connect).
 */

class AdminStudio {
  constructor() {
    this.isEditMode = false;
    this.config = MASTER_DATA.adminConfig;
    this.loadSavedConfig();
  }

  loadSavedConfig() {
    const saved = localStorage.getItem("bql_admin_config");
    if (saved) {
      try {
        this.config = JSON.parse(saved);
        MASTER_DATA.adminConfig = this.config;
      } catch (e) {}
    }
  }

  saveConfig() {
    localStorage.setItem("bql_admin_config", JSON.stringify(this.config));
    MASTER_DATA.adminConfig = this.config;
    this.applyThemeToDOM();
    this.reorderModulesInDOM();
  }

  toggleEditMode() {
    this.isEditMode = !this.isEditMode;
    const body = document.body;
    if (this.isEditMode) {
      body.classList.add("admin-edit-mode");
    } else {
      body.classList.remove("admin-edit-mode");
    }
    this.renderStudioDrawer();
  }

  applyThemeToDOM() {
    document.documentElement.style.setProperty("--primary", this.config.primaryColor || "#2563eb");
    if (this.config.glassmorphism) {
      document.body.classList.add("glass-active");
    } else {
      document.body.classList.remove("glass-active");
    }
  }

  reorderModulesInDOM() {
    const container = document.getElementById("mainModulesContainer");
    if (!container) return;

    const currentOrder = this.config.moduleOrder || [];
    currentOrder.forEach(modId => {
      const el = document.getElementById(modId);
      if (el) {
        container.appendChild(el);
      }
    });
  }

  moveModuleUp(modId) {
    const order = [...this.config.moduleOrder];
    const idx = order.indexOf(modId);
    if (idx > 0) {
      const temp = order[idx - 1];
      order[idx - 1] = order[idx];
      order[idx] = temp;
      this.config.moduleOrder = order;
      this.saveConfig();
      this.renderStudioDrawer();
    }
  }

  moveModuleDown(modId) {
    const order = [...this.config.moduleOrder];
    const idx = order.indexOf(modId);
    if (idx >= 0 && idx < order.length - 1) {
      const temp = order[idx + 1];
      order[idx + 1] = order[idx];
      order[idx] = temp;
      this.config.moduleOrder = order;
      this.saveConfig();
      this.renderStudioDrawer();
    }
  }

  setPrimaryColor(colorHex) {
    this.config.primaryColor = colorHex;
    this.saveConfig();
  }

  togglePermission(role, moduleKey) {
    if (!this.config.rolePermissions[role]) {
      this.config.rolePermissions[role] = [];
    }
    const perms = this.config.rolePermissions[role];
    const idx = perms.indexOf(moduleKey);
    if (idx >= 0) {
      perms.splice(idx, 1);
    } else {
      perms.push(moduleKey);
    }
    this.saveConfig();
    this.renderStudioDrawer();
  }

  renderStudioDrawer() {
    let drawer = document.getElementById("adminStudioDrawer");
    if (!drawer) {
      drawer = document.createElement("div");
      drawer.id = "adminStudioDrawer";
      drawer.className = "admin-studio-drawer";
      document.body.appendChild(drawer);
    }

    if (!this.isEditMode) {
      drawer.style.display = "none";
      return;
    }

    drawer.style.display = "block";
    
    const moduleNames = {
      newsfeedModule: "📢 Bảng Tin Email Giao Ban Sáng",
      directivesModule: "📋 Biên Bản Chỉ Đạo Giao Ban",
      handoverModule: "📊 Đảo Bàn Giao & Kế Hoạch Báo Cáo",
      gisMapModule: "🗺️ Sơ Đồ Tổng Mặt Bằng (GIS Interactive)",
      deptTracksModule: "🧰 Trục Công Việc 3 Bộ Môn",
      personalAppsModule: "👤 Trang Cá Nhân & Sub-App Builder",
      chatModule: "💬 Chat Nội Bộ & Tagging @Mention",
      stickyNotesWidget: "📝 Desktop Sticky Notes Widget"
    };

    let modulesListHTML = "";
    (this.config.moduleOrder || []).forEach((modId, i) => {
      modulesListHTML += `
        <div class="studio-mod-item">
          <span>${moduleNames[modId] || modId}</span>
          <div class="studio-mod-actions">
            <button onclick="adminStudio.moveModuleUp('${modId}')" ${i === 0 ? 'disabled' : ''}>▲ Trên</button>
            <button onclick="adminStudio.moveModuleDown('${modId}')" ${i === (this.config.moduleOrder.length - 1) ? 'disabled' : ''}>▼ Dưới</button>
          </div>
        </div>
      `;
    });

    let rbacMatrixHTML = "";
    const roles = [
      { key: "leader", label: "Lãnh Đạo" },
      { key: "secretary", label: "Thư Ký" },
      { key: "team_lead", label: "Đội Trưởng" },
      { key: "inspector", label: "Cán Bộ Giám Sát" },
      { key: "internal_ops", label: "Nội Nghiệp" }
    ];

    roles.forEach(r => {
      const activePerms = this.config.rolePermissions[r.key] || [];
      rbacMatrixHTML += `
        <div class="rbac-role-group">
          <strong>${r.label}:</strong>
          <div class="rbac-checkboxes">
            ${Object.keys(moduleNames).map(mKey => {
              const isChecked = activePerms.includes("all") || activePerms.includes(mKey);
              return `
                <label class="rbac-chip ${isChecked ? 'active' : ''}">
                  <input type="checkbox" ${isChecked ? 'checked' : ''} onchange="adminStudio.togglePermission('${r.key}', '${mKey}')">
                  ${moduleNames[mKey].split(" ")[1] || mKey}
                </label>
              `;
            }).join("")}
          </div>
        </div>
      `;
    });

    drawer.innerHTML = `
      <div class="studio-header">
        <h3>🛠️ ADMIN LIVE CUSTOMIZER & MODULE STUDIO</h3>
        <button class="studio-close-btn" onclick="adminStudio.toggleEditMode()">✕ Đóng Studio</button>
      </div>

      <div class="studio-body">
        <div class="studio-section" style="background: rgba(37, 99, 235, 0.15); padding: 12px; border-radius: 8px; border: 1px solid var(--primary);">
          <h4>👥 TRANG QUẢN TRỊ TÀI KHOẢN NHÂN SỰ</h4>
          <p style="font-size: 0.8rem; color: #cbd5e1; margin-bottom: 10px;">Thêm mới, sửa thông tin, đổi mật khẩu, kết nối Gmail & phân quyền nhân sự BQLDA.</p>
          <button class="btn-primary btn-sm" style="width: 100%;" onclick="openUserManagementModal()">👥 Quản Lý Danh Sách Tài Khoản</button>
        </div>

        <div class="studio-section">
          <h4>🎨 TÙY BIẾN THEME & MÀU SẮC GIAO DIỆN</h4>
          <div class="theme-picker">
            <label>Màu chủ đạo:</label>
            <input type="color" value="${this.config.primaryColor || '#2563eb'}" onchange="adminStudio.setPrimaryColor(this.value)">
            <button class="btn-preset" style="background:#2563eb" onclick="adminStudio.setPrimaryColor('#2563eb')"></button>
            <button class="btn-preset" style="background:#0d9488" onclick="adminStudio.setPrimaryColor('#0d9488')"></button>
            <button class="btn-preset" style="background:#7c3aed" onclick="adminStudio.setPrimaryColor('#7c3aed')"></button>
            <button class="btn-preset" style="background:#e11d48" onclick="adminStudio.setPrimaryColor('#e11d48')"></button>
          </div>
        </div>

        <div class="studio-section">
          <h4>📌 THỨ TỰ CÁC MODULE TRÊN TRANG CHỦ (DRAG & DROP ORDER)</h4>
          <div class="studio-modules-list">
            ${modulesListHTML}
          </div>
        </div>

        <div class="studio-section">
          <h4>🔐 MA TRẬN PHÂN QUYỀN TRUY CẬP HỆ THỐNG (RBAC PERMISSIONS)</h4>
          <div class="rbac-matrix-container">
            ${rbacMatrixHTML}
          </div>
        </div>
      </div>
    `;
  }
}

window.adminStudio = new AdminStudio();
