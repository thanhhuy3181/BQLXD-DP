/**
 * AUTHENTICATION & RBAC ENGINE (Google Gmail Login & User Account Management)
 */

class AuthEngine {
  constructor() {
    this.currentUser = null;
    
    // Undo / Redo History Stack for Org Structure & Titles
    this.orgHistoryStack = [];
    this.orgHistoryIndex = -1;

    this.loadSavedStaffList();
    this.loadSavedOrgStructure();
    this.loadSavedDeptsAndTitles();
    this.loadSavedLevelNames();
    this.initSession();

    // Push initial snapshot to history stack
    this.pushOrgSnapshot(true);
  }

  loadSavedStaffList() {
    const saved = localStorage.getItem("bql_staff_list");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          MASTER_DATA.staffList = parsed;
        }
      } catch (e) {}
    }
  }

  saveStaffList() {
    localStorage.setItem("bql_staff_list", JSON.stringify(MASTER_DATA.staffList));
  }

  loadSavedOrgStructure() {
    const saved = localStorage.getItem("bql_org_structure");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          MASTER_DATA.orgStructure = parsed;
        }
      } catch (e) {}
    }
    this.updateFlattenedDepartments();
  }

  saveOrgStructure() {
    localStorage.setItem("bql_org_structure", JSON.stringify(MASTER_DATA.orgStructure));
    this.updateFlattenedDepartments();
  }

  loadSavedLevelNames() {
    const saved = localStorage.getItem("bql_level_custom_names");
    if (saved) {
      try {
        MASTER_DATA.levelCustomNames = { ...MASTER_DATA.levelCustomNames, ...JSON.parse(saved) };
      } catch (e) {}
    }
  }

  saveLevelCustomNames() {
    localStorage.setItem("bql_level_custom_names", JSON.stringify(MASTER_DATA.levelCustomNames));
  }

  // ====================================================
  // UNDO / REDO HISTORY SNAPSHOT ENGINE
  // ====================================================
  pushOrgSnapshot(isInitial = false) {
    const snapshot = JSON.stringify({
      orgStructure: MASTER_DATA.orgStructure,
      departments: MASTER_DATA.departments,
      titles: MASTER_DATA.titles,
      levelCustomNames: MASTER_DATA.levelCustomNames
    });

    if (this.orgHistoryIndex >= 0 && this.orgHistoryStack[this.orgHistoryIndex] === snapshot) {
      return; // Skip duplicate
    }

    // Truncate any redo stack if we made a new change after undoing
    this.orgHistoryStack = this.orgHistoryStack.slice(0, this.orgHistoryIndex + 1);
    this.orgHistoryStack.push(snapshot);

    // Limit history stack size to 30 steps
    if (this.orgHistoryStack.length > 30) {
      this.orgHistoryStack.shift();
    }
    this.orgHistoryIndex = this.orgHistoryStack.length - 1;
  }

  canUndo() {
    return this.orgHistoryIndex > 0;
  }

  canRedo() {
    return this.orgHistoryIndex < this.orgHistoryStack.length - 1;
  }

  undoOrgState() {
    if (this.canUndo()) {
      this.orgHistoryIndex--;
      this.restoreOrgSnapshot(this.orgHistoryStack[this.orgHistoryIndex]);
      return true;
    }
    return false;
  }

  redoOrgState() {
    if (this.canRedo()) {
      this.orgHistoryIndex++;
      this.restoreOrgSnapshot(this.orgHistoryStack[this.orgHistoryIndex]);
      return true;
    }
    return false;
  }

  restoreOrgSnapshot(snapshotStr) {
    try {
      const data = JSON.parse(snapshotStr);
      MASTER_DATA.orgStructure = data.orgStructure || [];
      MASTER_DATA.departments = data.departments || [];
      MASTER_DATA.titles = data.titles || [];
      MASTER_DATA.levelCustomNames = data.levelCustomNames || MASTER_DATA.levelCustomNames;

      this.saveOrgStructure();
      this.saveDeptsAndTitles();
      this.saveLevelCustomNames();
    } catch (e) {}
  }

  updateLevelCustomName(level, newName) {
    if (level && newName && newName.trim()) {
      MASTER_DATA.levelCustomNames[level] = newName.trim();
      this.saveLevelCustomNames();
      this.pushOrgSnapshot();
      return true;
    }
    return false;
  }

  loadSavedDeptsAndTitles() {
    const savedTitles = localStorage.getItem("bql_titles");
    if (savedTitles) {
      try { MASTER_DATA.titles = JSON.parse(savedTitles); } catch(e){}
    }
  }

  saveDeptsAndTitles() {
    localStorage.setItem("bql_titles", JSON.stringify(MASTER_DATA.titles));
  }

  initSession() {
    const saved = localStorage.getItem("bql_user_session");
    if (saved) {
      try {
        const parsedUser = JSON.parse(saved);
        const fresh = MASTER_DATA.staffList.find(s => s.email.toLowerCase() === parsedUser.email.toLowerCase());
        this.currentUser = fresh || parsedUser;
      } catch (e) {
        this.setGuestDefault();
      }
    } else {
      this.loginByEmail("lanhdao.bql@gmail.com");
    }
  }

  setGuestDefault() {
    this.currentUser = MASTER_DATA.staffList[0];
    localStorage.setItem("bql_user_session", JSON.stringify(this.currentUser));
  }

  loginByEmail(email, password = null) {
    const staff = MASTER_DATA.staffList.find(s => s.email.toLowerCase() === email.toLowerCase());
    if (staff) {
      if (staff.status === "locked") {
        alert("🔒 Tài khoản này đã bị KHÓA bởi Admin. Vui lòng liên hệ Admin để mở khóa!");
        return false;
      }
      if (password && staff.password && staff.password !== password) {
        alert("❌ Mật khẩu không chính xác!");
        return false;
      }
      this.currentUser = staff;
    } else {
      this.currentUser = {
        id: "NV_" + Date.now().toString().slice(-4),
        name: email.split("@")[0].toUpperCase(),
        email: email,
        password: "123",
        phone: "Chưa cập nhật",
        role: "inspector",
        title: "CBGS Xây dựng",
        dept: "BQLXD Vinhomes Đan Phượng ➔ Bộ Phận Giám Sát Hiện Trường",
        avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${email}`,
        gmailConnected: true,
        address: "Ban QLDA",
        status: "active"
      };
      MASTER_DATA.staffList.push(this.currentUser);
      this.saveStaffList();
    }

    localStorage.setItem("bql_user_session", JSON.stringify(this.currentUser));
    window.dispatchEvent(new CustomEvent("userSessionChanged", { detail: this.currentUser }));
    return this.currentUser;
  }

  switchRole(roleName) {
    const staffWithRole = MASTER_DATA.staffList.find(s => s.role === roleName && s.status === 'active');
    if (staffWithRole) {
      return this.loginByEmail(staffWithRole.email);
    }
    return this.currentUser;
  }

  getCurrentUser() {
    return this.currentUser;
  }

  hasPermission(moduleKey) {
    if (!this.currentUser) return false;
    const role = this.currentUser.role;
    if (role === "admin" || role === "leader") return true;

    const perms = MASTER_DATA.adminConfig.rolePermissions[role];
    if (!perms) return false;
    if (perms.includes("all")) return true;
    return perms.includes(moduleKey);
  }

  getRoleLabel(role) {
    const map = {
      leader: "👑 Lãnh Đạo BQL",
      secretary: "📝 Thư Ký Giao Ban",
      team_lead: "👷 Đội Trưởng Giám Sát",
      inspector: "🔍 Cán Bộ Giám Sát",
      internal_ops: "🏛️ Nội Nghiệp & Hành Chính",
      admin: "⚙️ Admin System Studio"
    };
    return map[role] || role;
  }

  // ====================================================
  // ADMIN USER ACCOUNT MANAGEMENT METHODS
  // ====================================================
  addAccount(accData) {
    const newId = "NV" + (MASTER_DATA.staffList.length + 1).toString().padStart(3, "0");
    const account = {
      id: newId,
      name: accData.name || "Nhân Viên Mới",
      email: accData.email || `user${newId}@gmail.com`,
      password: accData.password || "123456",
      phone: accData.phone || "0900 000 000",
      role: accData.role || "inspector",
      title: accData.title || "CBGS Xây dựng",
      dept: accData.dept || "BQLXD Vinhomes Đan Phượng",
      avatar: accData.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${accData.email || newId}`,
      gmailConnected: accData.gmailConnected !== undefined ? accData.gmailConnected : true,
      address: accData.address || "Chưa cập nhật",
      status: "active"
    };

    MASTER_DATA.staffList.push(account);
    this.saveStaffList();
    return account;
  }

  updateAccount(accId, updatedFields) {
    const index = MASTER_DATA.staffList.findIndex(s => s.id === accId);
    if (index !== -1) {
      MASTER_DATA.staffList[index] = { ...MASTER_DATA.staffList[index], ...updatedFields };
      this.saveStaffList();

      if (this.currentUser && this.currentUser.id === accId) {
        this.currentUser = MASTER_DATA.staffList[index];
        localStorage.setItem("bql_user_session", JSON.stringify(this.currentUser));
      }
      return MASTER_DATA.staffList[index];
    }
    return null;
  }

  deleteAccount(accId) {
    if (this.currentUser && this.currentUser.id === accId) {
      alert("❌ Bạn không thể xóa tài khoản Admin/Chính đang đăng nhập!");
      return false;
    }
    MASTER_DATA.staffList = MASTER_DATA.staffList.filter(s => s.id !== accId);
    this.saveStaffList();
    return true;
  }

  toggleAccountStatus(accId) {
    const acc = MASTER_DATA.staffList.find(s => s.id === accId);
    if (acc) {
      acc.status = acc.status === "active" ? "locked" : "active";
      this.saveStaffList();
      return acc.status;
    }
    return null;
  }

  toggleGmailConnection(accId) {
    const acc = MASTER_DATA.staffList.find(s => s.id === accId);
    if (acc) {
      acc.gmailConnected = !acc.gmailConnected;
      this.saveStaffList();
      return acc.gmailConnected;
    }
    return null;
  }

  // ====================================================
  // MULTI-LEVEL ORGANIZATIONAL HIERARCHY TREE METHODS
  // ====================================================
  addOrgNode(parentId, name, level = 1) {
    if (!name || !name.trim()) return false;
    const newNode = {
      id: "ORG-" + Date.now().toString().slice(-4),
      name: name.trim(),
      level: level,
      children: []
    };

    if (!parentId) {
      MASTER_DATA.orgStructure.push(newNode);
    } else {
      const parentNode = this.findOrgNodeById(MASTER_DATA.orgStructure, parentId);
      if (parentNode) {
        if (!parentNode.children) parentNode.children = [];
        newNode.level = parentNode.level + 1;
        parentNode.children.push(newNode);
      }
    }

    this.saveOrgStructure();
    this.pushOrgSnapshot();
    return true;
  }

  updateOrgNode(id, newName) {
    const node = this.findOrgNodeById(MASTER_DATA.orgStructure, id);
    if (node && newName && newName.trim()) {
      node.name = newName.trim();
      this.saveOrgStructure();
      this.pushOrgSnapshot();
      return true;
    }
    return false;
  }

  deleteOrgNode(id) {
    let deleted = false;
    const removeRecursive = (list) => {
      const idx = list.findIndex(n => n.id === id);
      if (idx !== -1) {
        list.splice(idx, 1);
        deleted = true;
        return;
      }
      list.forEach(n => {
        if (n.children && n.children.length > 0) {
          removeRecursive(n.children);
        }
      });
    };

    removeRecursive(MASTER_DATA.orgStructure);
    if (deleted) {
      this.saveOrgStructure();
      this.pushOrgSnapshot();
    }
    return deleted;
  }

  moveOrgNode(draggedId, targetParentId) {
    if (draggedId === targetParentId) return false;

    // Detach dragged node
    let detachedNode = null;
    const detachRecursive = (list) => {
      const idx = list.findIndex(n => n.id === draggedId);
      if (idx !== -1) {
        detachedNode = list.splice(idx, 1)[0];
        return;
      }
      list.forEach(n => {
        if (n.children && n.children.length > 0) {
          detachRecursive(n.children);
        }
      });
    };

    detachRecursive(MASTER_DATA.orgStructure);

    if (detachedNode) {
      if (!targetParentId) {
        // Move to root Level 1
        detachedNode.level = 1;
        this.updateNodeLevelRecursive(detachedNode, 1);
        MASTER_DATA.orgStructure.push(detachedNode);
      } else {
        const targetParent = this.findOrgNodeById(MASTER_DATA.orgStructure, targetParentId);
        if (targetParent) {
          if (!targetParent.children) targetParent.children = [];
          detachedNode.level = targetParent.level + 1;
          this.updateNodeLevelRecursive(detachedNode, targetParent.level + 1);
          targetParent.children.push(detachedNode);
        } else {
          // Fallback to root
          MASTER_DATA.orgStructure.push(detachedNode);
        }
      }
      this.saveOrgStructure();
      this.pushOrgSnapshot();
      return true;
    }
    return false;
  }

  updateNodeLevelRecursive(node, newLevel) {
    node.level = newLevel;
    if (node.children && node.children.length > 0) {
      node.children.forEach(c => this.updateNodeLevelRecursive(c, newLevel + 1));
    }
  }

  findOrgNodeById(nodes, id) {
    for (let node of nodes) {
      if (node.id === id) return node;
      if (node.children && node.children.length > 0) {
        const found = this.findOrgNodeById(node.children, id);
        if (found) return found;
      }
    }
    return null;
  }

  updateFlattenedDepartments() {
    const list = [];
    const traverse = (nodes, prefix = "") => {
      nodes.forEach(n => {
        const currentPath = prefix ? `${prefix} ➔ ${n.name}` : n.name;
        list.push(currentPath);
        if (n.children && n.children.length > 0) {
          traverse(n.children, currentPath);
        }
      });
    };
    traverse(MASTER_DATA.orgStructure);
    MASTER_DATA.departments = list.length > 0 ? list : MASTER_DATA.departments;
  }

  // ====================================================
  // TITLE MANAGEMENT METHODS
  // ====================================================
  addTitle(titleName) {
    if (!titleName || !titleName.trim()) return false;
    const name = titleName.trim();
    if (!MASTER_DATA.titles.includes(name)) {
      MASTER_DATA.titles.push(name);
      this.saveDeptsAndTitles();
      this.pushOrgSnapshot();
    }
    return true;
  }

  updateTitle(oldTitle, newTitle) {
    if (!newTitle || !newTitle.trim()) return false;
    const idx = MASTER_DATA.titles.indexOf(oldTitle);
    if (idx !== -1) {
      MASTER_DATA.titles[idx] = newTitle.trim();
      this.saveDeptsAndTitles();
      this.pushOrgSnapshot();
      return true;
    }
    return false;
  }

  deleteTitle(titleName) {
    MASTER_DATA.titles = MASTER_DATA.titles.filter(t => t !== titleName);
    this.saveDeptsAndTitles();
    this.pushOrgSnapshot();
  }
}

window.authEngine = new AuthEngine();
