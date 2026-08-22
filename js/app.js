/**
 * MAIN APPLICATION CONTROLLER
 * Super App BQLDA - Enterprise All-in-One Platform
 */

document.addEventListener("DOMContentLoaded", () => {
  // Apply saved theme config
  adminStudio.applyThemeToDOM();

  // Initialize UI & Event Handlers
  initAppHeader();
  initNewsfeedModule();
  initDirectivesModule();
  initHandoverModule();
  initGISMapModule();
  renderDataManagementModule();
  initDeptTracksModule();
  initPersonalAppsModule();
  initChatModule();
  initStickyNotesWidget();

  // Listen to Role / Auth Changes
  window.addEventListener("userSessionChanged", (e) => {
    updateUIByRole(e.detail);
  });

  // Reorder modules based on saved Admin Studio config
  adminStudio.reorderModulesInDOM();
});

// ==========================================
// 1. HEADER & AUTH ROLE SWITCHER
// ==========================================
function initAppHeader() {
  renderUserHeader();
}

function renderUserHeader() {
  const user = authEngine.getCurrentUser();
  const userBadge = document.getElementById("currentUserBadge");
  if (userBadge) {
    userBadge.innerHTML = `
      <img src="${user.avatar}" class="user-avatar-img" alt="${user.name}">
      <div class="user-info">
        <span class="user-name">${user.name}</span>
        <span class="user-role">${authEngine.getRoleLabel(user.role)}</span>
      </div>
    `;
  }

  // Toggle Admin Studio & Account Management Button Visibility
  const studioBtn = document.getElementById("adminStudioToggleBtn");
  const userMgmtBtn = document.getElementById("userMgmtToggleBtn");
  const isPowerUser = (user.role === "admin" || user.role === "leader");

  if (studioBtn) studioBtn.style.display = isPowerUser ? "inline-flex" : "none";
  if (userMgmtBtn) userMgmtBtn.style.display = isPowerUser ? "inline-flex" : "none";
}

function openGmailLoginModal() {
  const modal = document.getElementById("gmailLoginModal");
  if (!modal) return;

  const currentUser = authEngine.getCurrentUser();
  const isPowerUser = currentUser && (currentUser.role === "admin" || currentUser.role === "leader");

  const staffOptions = MASTER_DATA.staffList.map(s => `
    <div class="account-select-card ${s.status === 'locked' ? 'row-locked' : ''}">
      <img src="${s.avatar}" alt="${s.name}">
      <div style="flex:1;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <strong>${s.name}</strong>
          <span class="badge-item">${authEngine.getRoleLabel(s.role)}</span>
        </div>
        <div style="font-size: 0.8rem; color: #60a5fa;">📧 ${s.email} | 📞 ${s.phone || 'Chưa có SĐT'}</div>
        <div style="font-size: 0.75rem; color: #94a3b8;">🔑 Mật khẩu: <code>${s.password}</code> | 🏢 ${s.title} (${s.dept})</div>
      </div>
      <button class="btn-sm btn-primary" onclick="selectStaffAccount('${s.email}')" ${s.status === 'locked' ? 'disabled' : ''}>
        ${s.status === 'locked' ? '🔒 Đã khóa' : '🔑 Đăng nhập'}
      </button>
    </div>
  `).join("");

  modal.querySelector(".modal-body").innerHTML = `
    <!-- LOGGED IN USER INFO CARD -->
    <div style="background: rgba(37, 99, 235, 0.15); border: 1px solid var(--primary); padding: 12px; border-radius: 10px; margin-bottom: 15px; display: flex; align-items: center; gap: 12px;">
      <img src="${currentUser.avatar}" style="width: 48px; height: 48px; border-radius: 50%; background: #1e293b;">
      <div style="flex: 1;">
        <div style="font-size: 0.75rem; color: #60a5fa; font-weight: 700;">TÀI KHOẢN ĐANG ĐĂNG NHẬP:</div>
        <strong style="font-size: 1rem;">${currentUser.name}</strong> (${authEngine.getRoleLabel(currentUser.role)})
        <div style="font-size: 0.8rem; color: #cbd5e1;">📧 Gmail: ${currentUser.email} | 📞 SĐT: ${currentUser.phone || 'Chưa cập nhật'}</div>
      </div>
      ${isPowerUser ? `
        <button class="btn-primary btn-sm" onclick="document.getElementById('gmailLoginModal').style.display='none'; openUserManagementModal();">
          👥 Trang Quản Trị Tài Khoản
        </button>
      ` : ''}
    </div>

    <!-- DIRECT GMAIL & PASSWORD LOGIN FORM -->
    <div style="background: rgba(15, 23, 42, 0.7); border: 1px solid var(--glass-border); padding: 12px; border-radius: 10px; margin-bottom: 15px;">
      <p style="font-size: 0.85rem; font-weight: 600; margin-bottom: 8px;">🔑 Đăng nhập nhanh bằng Gmail & Mật khẩu bất kỳ:</p>
      <div style="display:grid; grid-template-columns: 1fr 1fr auto; gap: 8px;">
        <input type="email" id="customGmailInput" placeholder="Gmail đăng nhập" class="input-text">
        <input type="password" id="customPassInput" placeholder="Mật khẩu" class="input-text">
        <button class="btn-primary" onclick="loginCustomGmail()">🔑 Đăng Nhập</button>
      </div>
    </div>

    <p style="font-weight: 600; font-size: 0.85rem; margin-bottom: 8px;">📋 Danh sách tất cả Tài khoản Nhân sự BQLDA (${MASTER_DATA.staffList.length} tài khoản):</p>
    <div class="account-list-grid" style="max-height: 45vh; overflow-y: auto;">
      ${staffOptions}
    </div>
  `;
  modal.style.display = "flex";
}

function selectStaffAccount(email) {
  authEngine.loginByEmail(email);
  document.getElementById("gmailLoginModal").style.display = "none";
  renderUserHeader();
  showToast(`🟢 Đã đăng nhập tài khoản: ${email}`);
}

function loginCustomGmail() {
  const emailInput = document.getElementById("customGmailInput");
  const passInput = document.getElementById("customPassInput");
  
  if (emailInput && emailInput.value) {
    const email = emailInput.value.trim();
    const pass = passInput ? passInput.value.trim() : null;
    const res = authEngine.loginByEmail(email, pass);
    if (res) {
      document.getElementById("gmailLoginModal").style.display = "none";
      renderUserHeader();
      showToast(`🟢 Đăng nhập thành công với ${email}!`);
    }
  } else {
    alert("Vui lòng nhập địa chỉ Gmail!");
  }
}

// ==========================================
// 2. NEWSFEED & EMAIL AI SUMMARIZER
// ==========================================
function initNewsfeedModule() {
  renderNewsfeed();
}

function renderNewsfeed() {
  const container = document.getElementById("newsfeedList");
  if (!container) return;

  container.innerHTML = MASTER_DATA.flaggedEmails.map(eml => `
    <div class="newsfeed-card priority-${eml.priority}">
      <div class="newsfeed-header">
        <span class="newsfeed-tag">🚩 FLAG EMAIL</span>
        <span class="newsfeed-sender">${eml.sender}</span>
        <span class="newsfeed-date">${eml.date}</span>
      </div>
      <h4 class="newsfeed-subject">${eml.subject}</h4>
      <div class="newsfeed-ai-box">
        <span class="ai-badge">🤖 GEMINI AI TÓM TẮT:</span>
        <p>${eml.aiSummary}</p>
      </div>
      <div class="newsfeed-footer">
        <button class="btn-sm btn-outline" onclick="openDriveFile('${eml.drivePath}')">📂 Mở File Drive (${eml.drivePath.split('\\').pop()})</button>
        <button class="btn-sm btn-primary" onclick="pushEmailToDirective('${eml.id}')">🚀 Đẩy vào Lệnh Giao Ban</button>
      </div>
    </div>
  `).join("");
}

async function triggerAISummarizeEmail(emailId) {
  const eml = MASTER_DATA.flaggedEmails.find(e => e.id === emailId);
  if (!eml) return;
  showToast("🤖 Gemini AI đang phân tích & tóm tắt email...");
  const summary = await aiEngine.summarizeEmail(eml.subject, eml.aiSummary);
  eml.aiSummary = summary;
  renderNewsfeed();
  showToast("✨ Đã cập nhật tóm tắt AI!");
}

function pushEmailToDirective(emailId) {
  const eml = MASTER_DATA.flaggedEmails.find(e => e.id === emailId);
  if (!eml) return;

  const newDir = {
    id: Date.now(),
    item: eml.subject.substring(0, 30) + "...",
    content: eml.aiSummary,
    assignee: "Phạm Văn Giám Sát",
    assigneeEmail: "cbgs.xaydung@gmail.com",
    deadline: "2026-07-30",
    status: "in_progress",
    reportText: "🟢 Đã tiếp nhận chỉ đạo từ email",
    photoProof: null
  };

  MASTER_DATA.directives.push(newDir);
  storageEngine.saveDirectives();
  renderDirectivesTable();
  showToast("🚀 Đã đẩy chỉ đạo vào Bảng Biên bản Giao ban Sáng!");
}

// ==========================================
// 3. MORNING DIRECTIVES & TASKS
// ==========================================
function initDirectivesModule() {
  renderDirectivesTable();
}

function renderDirectivesTable() {
  const tbody = document.getElementById("directivesTableBody");
  if (!tbody) return;

  tbody.innerHTML = MASTER_DATA.directives.map((d, index) => `
    <tr>
      <td><strong>${index + 1}</strong></td>
      <td><span class="badge-item">${d.item}</span></td>
      <td>${d.content}</td>
      <td>
        <div class="user-chip">
          <strong>${d.assignee}</strong>
          <span style="font-size:0.75rem; color:#94a3b8;">${d.assigneeEmail}</span>
        </div>
      </td>
      <td><span class="deadline-tag">${d.deadline}</span></td>
      <td>
        <div class="report-cell">
          <div>${d.reportText || "Chưa có báo cáo"}</div>
          ${d.photoProof ? `<a href="${d.photoProof}" target="_blank" class="link-photo">📸 Xem ảnh minh chứng</a>` : ""}
        </div>
      </td>
      <td>
        <button class="btn-sm btn-success" onclick="openReportModal(${d.id})">🟢 Báo cáo KQ</button>
      </td>
    </tr>
  `).join("");
}

function addNewDirective() {
  const item = prompt("Nhập Tên Hạng mục:");
  const content = prompt("Nhập Nội dung Lệnh chỉ đạo:");
  if (!item || !content) return;

  MASTER_DATA.directives.push({
    id: Date.now(),
    item: item,
    content: content,
    assignee: "Phạm Văn Giám Sát",
    assigneeEmail: "cbgs.xaydung@gmail.com",
    deadline: "2026-07-29",
    status: "in_progress",
    reportText: "🟡 Đang triển khai ngoài hiện trường",
    photoProof: null
  });

  storageEngine.saveDirectives();
  renderDirectivesTable();
  showToast("📋 Đã ghi nhận và gửi thông báo Push đến điện thoại cá nhân!");
}

function openReportModal(directiveId) {
  const d = MASTER_DATA.directives.find(x => x.id === directiveId);
  if (!d) return;

  const reportText = prompt("Nhập nội dung báo cáo thực tế hiện trường:", d.reportText || "");
  if (reportText !== null) {
    d.reportText = reportText;
    d.photoProof = "https://images.unsplash.com/photo-1541888946425-d0fbb186a5b7?auto=format&fit=crop&w=400&q=80";
    storageEngine.saveDirectives();
    renderDirectivesTable();
    showToast("🟢 Đã cập nhật báo cáo hiện trường Real-time!");
  }
}

// ==========================================
// 4. HANDOVER PLAN & CUMULATIVE STATS
// ==========================================
function initHandoverModule() {
  renderHandoverPlan();
}

function renderHandoverPlan() {
  const container = document.getElementById("handoverGrid");
  const statsContainer = document.getElementById("handoverStatsBar");
  if (!container) return;

  const plans = MASTER_DATA.handoverPlans;
  const total = plans.length;
  const passed = plans.filter(p => p.status === "passed").length;
  const failed = plans.filter(p => p.status === "failed").length;
  const scheduled = plans.filter(p => p.status === "scheduled").length;
  const rate = total > 0 ? Math.round((passed / total) * 100) : 0;

  if (statsContainer) {
    statsContainer.innerHTML = `
      <div class="stat-pill stat-total">Hôm nay: <strong>${total} căn/gian</strong></div>
      <div class="stat-pill stat-scheduled">🟡 Dự kiến: <strong>${scheduled}</strong></div>
      <div class="stat-pill stat-passed">🟢 Đạt: <strong>${passed}</strong></div>
      <div class="stat-pill stat-failed">🔴 Không đạt: <strong>${failed}</strong></div>
      <div class="stat-pill stat-rate">📊 Tỷ lệ Đạt: <strong>${rate}%</strong></div>
    `;
  }

  container.innerHTML = plans.map(p => {
    const space = MASTER_DATA.spaces.find(s => s.id === p.spaceId) || { category: p.spaceId, cbgs: "Chưa phân công" };
    return `
      <div class="handover-card status-${p.status}">
        <div class="handover-card-header">
          <span class="space-tag">${p.spaceId}</span>
          <span class="status-badge status-${p.status}">
            ${p.status === 'passed' ? '🟢 ĐẠT' : p.status === 'failed' ? '🔴 KHÔNG ĐẠT' : '🟡 DỰ KIẾN MỜI'}
          </span>
        </div>
        <h5>${space.category}</h5>
        <div class="handover-info">
          <div>🕒 <strong>${p.inviteTime}</strong> (${p.date})</div>
          <div>👤 CBGS: ${space.cbgs}</div>
          <div>📩 Số lần mời: ${p.inviteCount}</div>
        </div>
        <p class="handover-note">📝 ${p.note || ''}</p>
        <div class="handover-actions">
          <button class="btn-sm btn-success" onclick="updateHandoverStatus('${p.id}', 'passed')">🟢 Đạt</button>
          <button class="btn-sm btn-danger" onclick="updateHandoverStatus('${p.id}', 'failed')">🔴 Không đạt</button>
          <button class="btn-sm btn-outline" onclick="generateAutoInviteEmail('${p.id}')">✉️ Xuất Mail Mời</button>
        </div>
      </div>
    `;
  }).join("");
}

function updateHandoverStatus(planId, newStatus) {
  const plan = MASTER_DATA.handoverPlans.find(p => p.id === planId);
  if (!plan) return;

  plan.status = newStatus;
  if (newStatus === "failed") {
    const reason = prompt("Nhập nguyên nhân KHÔNG ĐẠT bàn giao:", "Thấm trần / Lỗi bề mặt sơn");
    plan.note = `🔴 Lỗi: ${reason || 'Không đạt'}`;
  } else {
    plan.note = "🟢 Đạt chuẩn chất lượng bàn giao";
  }

  storageEngine.saveHandovers();
  renderHandoverPlan();
  renderGISMap();
  showToast(`📊 Đã cập nhật trạng thái bàn giao: ${newStatus.toUpperCase()}`);
}

function generateAutoInviteEmail(planId) {
  const p = MASTER_DATA.handoverPlans.find(x => x.id === planId);
  if (!p) return;

  alert(`📧 TỰ ĐỘNG GỬI MAIL MỜI BÀN GIAO CĐT & NHÀ THẦU:\n\nTiêu đề: Lịch mời nghiệm thu bàn giao căn ${p.spaceId}\nThời gian: ${p.inviteTime} ngày ${p.date}\nĐịa điểm: Khối ${p.spaceId}\nThành phần: BQLDA, CĐT, CBGS (${p.note})`);
}

function registerNewHandover() {
  const spaceId = prompt("Nhập Mã Căn / Gian hàng (Ví dụ: TT-LK05-12 hoặc TTTM-L1-GH01):", "TT-LK05-12");
  if (!spaceId) return;

  MASTER_DATA.handoverPlans.push({
    id: "HO-" + Date.now(),
    spaceId: spaceId,
    date: "2026-07-26",
    inviteTime: "10:30",
    inviteCount: 1,
    status: "scheduled",
    note: "Đăng ký kế hoạch mời bàn giao mới"
  });

  storageEngine.saveHandovers();
  renderHandoverPlan();
  renderGISMap();
  showToast("✨ Đã thêm kế hoạch mời bàn giao mới!");
}

// ==========================================
// 5. INTERACTIVE GIS MASTER PLAN & FLOOR MAP
// ==========================================
function initGISMapModule() {
  renderGISMap();
}

function renderGISMap() {
  const svgContainer = document.getElementById("interactiveGisSvg");
  if (!svgContainer) return;

  // Render Interactive Master Plan with Color-Coded Zones
  svgContainer.innerHTML = `
    <svg viewBox="0 0 1000 500" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
      <!-- Background Map Grid -->
      <rect width="1000" height="500" fill="#0f172a" rx="10"/>
      <line x1="0" y1="250" x2="1000" y2="250" stroke="#1e293b" stroke-width="4" stroke-dasharray="8,8"/>
      <line x1="500" y1="0" x2="500" y2="500" stroke="#1e293b" stroke-width="4" stroke-dasharray="8,8"/>

      <!-- ZONE A: KHỐI TTTM (Tầng 1 & Tầng 2) -->
      <g class="gis-zone" onclick="showZoneDetails('TTTM')">
        <polygon points="50,50 450,50 450,220 50,220" fill="rgba(37, 99, 235, 0.3)" stroke="#3b82f6" stroke-width="3"/>
        <text x="70" y="80" fill="#93c5fd" font-size="18" font-weight="bold">🏢 KHỐI TTTM (TẦNG 1 & TẦNG 2)</text>
        <text x="70" y="110" fill="#cbd5e1" font-size="14">ĐTGS: Lê Văn Đội Trưởng | CBGS: Phạm Văn Giám Sát</text>
        
        <!-- Floor Sub-units -->
        <rect x="70" y="130" width="100" height="60" rx="6" fill="#1e293b" stroke="#eab308" stroke-width="2"/>
        <text x="80" y="165" fill="#fef08a" font-size="12">GH01 (🟡 KH)</text>

        <rect x="180" y="130" width="100" height="60" rx="6" fill="#1e293b" stroke="#22c55e" stroke-width="2"/>
        <text x="190" y="165" fill="#86efac" font-size="12">GH02 (🟢 ĐẠT)</text>

        <rect x="290" y="130" width="130" height="60" rx="6" fill="#1e293b" stroke="#ef4444" stroke-width="2"/>
        <text x="300" y="165" fill="#fca5a5" font-size="12">KT05 (🔴 LỖI)</text>
      </g>

      <!-- ZONE B: KHỐI THẤP TẦNG (SHOPHOUSE SB5 & BIỆT THỰ) -->
      <g class="gis-zone" onclick="showZoneDetails('Thấp tầng')">
        <polygon points="520,50 950,50 950,220 520,220" fill="rgba(16, 185, 129, 0.3)" stroke="#10b981" stroke-width="3"/>
        <text x="540" y="80" fill="#6ee7b7" font-size="18" font-weight="bold">🏡 KHỐI THẤP TẦNG (SHOPHOUSE SB5)</text>
        <text x="540" y="110" fill="#cbd5e1" font-size="14">ĐTGS: Lê Văn Đội Trưởng | CBGS: Hoàng Thị M&E</text>

        <rect x="540" y="130" width="110" height="60" rx="6" fill="#1e293b" stroke="#eab308" stroke-width="2"/>
        <text x="550" y="165" fill="#fef08a" font-size="12">LK05-12 (🟡)</text>

        <rect x="660" y="130" width="110" height="60" rx="6" fill="#1e293b" stroke="#22c55e" stroke-width="2"/>
        <text x="670" y="165" fill="#86efac" font-size="12">LK05-14 (🟢)</text>

        <rect x="780" y="130" width="150" height="60" rx="6" fill="#1e293b" stroke="#ef4444" stroke-width="2"/>
        <text x="790" y="165" fill="#fca5a5" font-size="12">BT02-01 (🔴 LỖI)</text>
      </g>

      <!-- ZONE C: CÔNG VIÊN & HẠ TẦNG (CỐNG D1 & TRẠM BIẾN ÁP) -->
      <g class="gis-zone" onclick="showZoneDetails('Hạ tầng')">
        <polygon points="50,270 950,270 950,450 50,450" fill="rgba(168, 85, 247, 0.2)" stroke="#a855f7" stroke-width="3"/>
        <text x="70" y="300" fill="#c084fc" font-size="18" font-weight="bold">🌳 CÔNG VIÊN TRUNG TÂM & HẠ TẦNG KỸ THUẬT D1</text>
        <text x="70" y="330" fill="#cbd5e1" font-size="14">Hạng mục: Cống hộp Đường D1 | Trạm biến áp trung tâm</text>

        <rect x="70" y="350" width="400" height="70" rx="6" fill="#1e293b" stroke="#3b82f6" stroke-width="2"/>
        <text x="90" y="390" fill="#93c5fd" font-size="14">🚧 CỐNG D1 (Đang bổ sung 1 mũi làm đêm)</text>

        <rect x="490" y="350" width="430" height="70" rx="6" fill="#1e293b" stroke="#22c55e" stroke-width="2"/>
        <text x="510" y="390" fill="#86efac" font-size="14">⚡ TRẠM BIẾN ÁP (🟢 Đã hoàn thành 100%)</text>
      </g>
    </svg>
  `;
}

function showZoneDetails(zoneName) {
  const matched = MASTER_DATA.spaces.filter(s => s.type === zoneName);
  let detailTxt = matched.map(m => `• ${m.id} (${m.category}): ĐTGS ${m.dtgs} - CBGS ${m.cbgs}`).join("\n");
  alert(`🗺️ BẢN ĐỒ TƯƠNG TÁC CHI TIẾT - PHÂN KHU ${zoneName.toUpperCase()}:\n\n${detailTxt}`);
}

// ==========================================
// 6. 3 DEPARTMENT TRACKS
// ==========================================
function initDeptTracksModule() {
  switchDeptTab('hien_truong');
}

function switchDeptTab(tabKey) {
  const container = document.getElementById("deptTrackContent");
  if (!container) return;

  if (tabKey === "hanh_chinh") {
    container.innerHTML = `
      <h4>🏛️ PHÂN HỆ HÀNH CHÍNH & CÔNG VĂN</h4>
      <table class="data-table">
        <thead><tr><th>Mã CV</th><th>Loại</th><th>Tiêu đề Công văn</th><th>Ngày lập</th><th>Trạng thái</th></tr></thead>
        <tbody>
          ${MASTER_DATA.adminDocs.map(doc => `
            <tr>
              <td><code>${doc.code}</code></td>
              <td>${doc.type}</td>
              <td>${doc.title}</td>
              <td>${doc.date}</td>
              <td><span class="badge-item">${doc.status}</span></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  } else if (tabKey === "noi_nghiep") {
    container.innerHTML = `
      <h4>🏢 PHÂN HỆ NỘI NGHIỆP & HSMT / HỢP ĐỒNG</h4>
      <div style="margin-bottom:15px;">
        <button class="btn-primary" onclick="sendCrossDeptRequest()">🛠️ Gửi Yêu cầu Giải trình tới Hiện trường</button>
      </div>
      <div class="card-glass">
        <h5>Bảng Giải trình Khối lượng Phát sinh HSMT TTTM-L2</h5>
        <p>Tình trạng: Chờ Hiện trường phản hồi đo đạc thực tế khung sắt louver.</p>
        <div id="crossDeptResponseBox" class="response-box">
          <em>Chưa có phản hồi từ hiện trường.</em>
        </div>
      </div>
    `;
  } else {
    container.innerHTML = `
      <h4>🏗️ PHÂN HỆ HIỆN TRƯỜNG & BÁO CÁO CÔNG TRƯỜNG</h4>
      <div class="card-glass">
        <h5>Nhật ký Hiện trường & Máy móc</h5>
        <p>• 05 thợ thi công đêm cống D1.<br>• Máy đào A2 đang chờ phụ tùng thủy lực thay thế.</p>
        <button class="btn-success" onclick="respondToNoiNghiep()">📸 Gửi Báo cáo Giải trình + Ảnh cho Nội nghiệp</button>
      </div>
    `;
  }
}

function sendCrossDeptRequest() {
  alert("🛠️ Nội nghiệp đã gửi Yêu cầu Giải trình tới Điện thoại của Kỹ sư Hiện trường!");
  showToast("📲 Đã gửi Notification tới CBGS hiện trường!");
}

function respondToNoiNghiep() {
  const txt = prompt("Hiện trường nhập phản hồi giải trình:", "Đã đo thực tế khung sắt louver L2: Tổng 120m2 trụ sắt 100x100mm");
  if (!txt) return;

  const box = document.getElementById("crossDeptResponseBox");
  if (box) {
    box.innerHTML = `🟢 <strong>BÁO CÁO TỪ HIỆN TRƯỜNG:</strong><br>${txt}<br><a href="https://images.unsplash.com/photo-1541888946425-d0fbb186a5b7?auto=format&fit=crop&w=400&q=80" target="_blank">📸 Ảnh đo thực tế.jpg</a>`;
  }
  showToast("✨ Đã tự động chèn dữ liệu Hiện trường vào Báo cáo Nội nghiệp!");
}

// ==========================================
// 7. PERSONAL WORKSPACE & SUB-APP BUILDER
// ==========================================
function initPersonalAppsModule() {
  renderPersonalApps();
}

function renderPersonalApps() {
  const container = document.getElementById("personalSubAppsGrid");
  if (!container) return;

  container.innerHTML = `
    <div class="subapp-card">
      <div class="subapp-icon">⚡</div>
      <h5>App Xử lý Vướng mắc Thiết kế</h5>
      <p>Hỏi-đáp AI tự động giải quyết xung đột bản vẽ CAD & HSMT.</p>
      <button class="btn-sm btn-outline" onclick="alert('Đã mở Sub-App Vướng mắc Thiết kế!')">Mở App</button>
    </div>
    <div class="subapp-card">
      <div class="subapp-icon">🎙️</div>
      <h5>Ghi chú Giọng nói (Voice-to-Text)</h5>
      <p>Chuyển giọng nói hiện trường thành checklist tự động.</p>
      <button class="btn-sm btn-outline" onclick="triggerVoiceToText()">🎙️ Bật Micro</button>
    </div>
    <div class="subapp-card subapp-builder" onclick="openNoCodeBuilder()">
      <div class="subapp-icon">➕</div>
      <h5>Trợ lý Tạo App Con (No-Code)</h5>
      <p>Tự tạo App chuyên môn cá nhân qua Hỏi-Đáp AI.</p>
    </div>
  `;
}

function triggerVoiceToText() {
  alert("🎙️ Micro đang lắng nghe... (Voice-to-Text simulation)\n\n'Ghi chú: Cần bổ sung 2 cuộn cáp điện 3 pha cho trạm biến áp công viên trước 16h.'");
  showToast("📝 Đã tự tạo Checklist từ Giọng nói!");
}

function openNoCodeBuilder() {
  const name = prompt("Nhập tên App con bạn muốn khởi tạo:", "App Quản lý Vật tư Sơn");
  if (name) {
    alert(`🚀 AI Trợ lý No-Code đã khởi tạo App "${name}" thành công và gắn vào trang cá nhân của bạn!`);
    renderPersonalApps();
  }
}

// ==========================================
// 8. INTERNAL CHAT & TAGGING SYSTEM
// ==========================================
function initChatModule() {
  renderChatMessages();
  const chatInput = document.getElementById("chatInput");
  if (chatInput) setupMentionAutocomplete(chatInput);
}

function renderChatMessages() {
  const container = document.getElementById("chatMessagesBox");
  if (!container) return;

  container.innerHTML = MASTER_DATA.chatMessages.map(msg => `
    <div class="chat-bubble">
      <div class="chat-header">
        <strong>${msg.sender}</strong>
        <span class="chat-time">${msg.time}</span>
      </div>
      <div class="chat-text">${formatChatText(msg.text)}</div>
      ${msg.fileLink ? `<div class="chat-file">📎 <a href="#" onclick="openDriveFile('${msg.fileLink}')">${msg.fileLink.split('\\').pop()}</a></div>` : ''}
    </div>
  `).join("");
}

function formatChatText(text) {
  if (!text) return "";
  let formatted = text;
  formatted = formatted.replace(/@all/gi, '<span class="badge badge-warning" style="font-weight:700; background:#facc15; color:#0f172a;">📢 @all (Tất cả BQLDA)</span>');
  return formatted.replace(/@([a-zA-Z0-9._àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ\s]+)/g, (match, p1) => {
    if (p1.toLowerCase().startsWith("all")) return match;
    return `<span class="mention-tag">@${p1.trim()}</span>`;
  });
}

function sendChatMessage() {
  const input = document.getElementById("chatInput");
  if (!input || !input.value.trim()) return;

  const user = authEngine.getCurrentUser();
  MASTER_DATA.chatMessages.push({
    id: "MSG-" + Date.now(),
    sender: user.name,
    email: user.email,
    text: input.value.trim(),
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    fileLink: null
  });

  input.value = "";
  renderChatMessages();
  const box = document.getElementById("chatMessagesBox");
  box.scrollTop = box.scrollHeight;
}

// ==========================================
// UNIVERSAL @MENTION AUTOCOMPLETE ENGINE
// ==========================================
let activeMentionInput = null;

function setupMentionAutocomplete(inputEl) {
  if (!inputEl || inputEl.dataset.mentionAttached) return;
  inputEl.dataset.mentionAttached = "true";

  inputEl.addEventListener("input", (e) => handleMentionInput(e, inputEl));
  inputEl.addEventListener("focus", (e) => handleMentionInput(e, inputEl));
  inputEl.addEventListener("keydown", (e) => {
    const dropdown = document.getElementById("globalMentionDropdown");
    if (!dropdown || !dropdown.classList.contains("active")) return;

    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      moveMentionSelection(e.key === "ArrowDown" ? 1 : -1);
    } else if (e.key === "Enter" || e.key === "Tab") {
      const selected = dropdown.querySelector(".mention-item.selected");
      if (selected) {
        e.preventDefault();
        selected.click();
      }
    } else if (e.key === "Escape") {
      hideMentionDropdown();
    }
  });
}

function handleMentionInput(e, inputEl) {
  const val = inputEl.value;
  const cursor = inputEl.selectionStart;
  const textBeforeCursor = val.slice(0, cursor);
  
  const lastAtPos = textBeforeCursor.lastIndexOf("@");

  if (lastAtPos !== -1) {
    const query = textBeforeCursor.slice(lastAtPos + 1);
    if (!query.includes("\n") && query.length < 20) {
      showMentionDropdown(inputEl, lastAtPos, query);
      return;
    }
  }

  hideMentionDropdown();
}

function showMentionDropdown(inputEl, atPos, query) {
  activeMentionInput = { el: inputEl, atPos: atPos };

  let dropdown = document.getElementById("globalMentionDropdown");
  if (!dropdown) {
    dropdown = document.createElement("div");
    dropdown.id = "globalMentionDropdown";
    dropdown.className = "mention-dropdown-box";
    document.body.appendChild(dropdown);
  }

  const staff = MASTER_DATA.staffList.filter(s => 
    s.name.toLowerCase().includes(query.toLowerCase()) ||
    s.role.toLowerCase().includes(query.toLowerCase()) ||
    (s.dept && s.dept.toLowerCase().includes(query.toLowerCase())) ||
    (s.title && s.title.toLowerCase().includes(query.toLowerCase()))
  );

  dropdown.innerHTML = staff.map((s, idx) => `
    <div class="mention-item ${idx === 0 ? 'selected' : ''}" onclick="selectMentionStaff('${s.name.replace(/'/g, "\\'")}')">
      <img src="${s.avatar}" class="mention-item-avatar" alt="${s.name}">
      <div class="mention-item-info">
        <span class="mention-item-name">${s.name}</span>
        <span class="mention-item-role">${s.title} • ${authEngine.getRoleLabel(s.role)}</span>
      </div>
    </div>
  `).join("");

  const rect = inputEl.getBoundingClientRect();
  dropdown.style.top = `${rect.bottom + window.scrollY + 4}px`;
  dropdown.style.left = `${rect.left + window.scrollX}px`;
  dropdown.style.width = `${Math.max(rect.width, 280)}px`;
  dropdown.classList.add("active");
}

function moveMentionSelection(direction) {
  const dropdown = document.getElementById("globalMentionDropdown");
  if (!dropdown) return;

  const items = Array.from(dropdown.querySelectorAll(".mention-item"));
  if (items.length === 0) return;

  let currentIndex = items.findIndex(i => i.classList.contains("selected"));
  if (currentIndex !== -1) items[currentIndex].classList.remove("selected");

  let nextIndex = currentIndex + direction;
  if (nextIndex < 0) nextIndex = items.length - 1;
  if (nextIndex >= items.length) nextIndex = 0;

  items[nextIndex].classList.add("selected");
  items[nextIndex].scrollIntoView({ block: "nearest" });
}

function selectMentionStaff(staffName) {
  if (!activeMentionInput || !activeMentionInput.el) return;

  const inputEl = activeMentionInput.el;
  const atPos = activeMentionInput.atPos;
  const val = inputEl.value;

  const beforeAt = val.slice(0, atPos);
  const afterCursor = val.slice(inputEl.selectionStart);

  inputEl.value = `${beforeAt}@${staffName} ${afterCursor}`;
  inputEl.focus();

  const newCursorPos = atPos + staffName.length + 2;
  inputEl.setSelectionRange(newCursorPos, newCursorPos);

  hideMentionDropdown();
}

function hideMentionDropdown() {
  const dropdown = document.getElementById("globalMentionDropdown");
  if (dropdown) dropdown.classList.remove("active");
}

document.addEventListener("click", (e) => {
  if (!e.target.closest(".mention-dropdown-box") && !e.target.closest("input")) {
    hideMentionDropdown();
  }
});

// ==========================================
// SIDEBAR MENU NAVIGATION & SCROLL
// ==========================================
function toggleAppSidebar() {
  const sidebar = document.getElementById("appSidebar");
  const overlay = document.getElementById("sidebarOverlay");
  if (!sidebar || !overlay) return;

  if (sidebar.classList.contains("active")) {
    sidebar.classList.remove("active");
    overlay.classList.remove("active");
  } else {
    sidebar.classList.add("active");
    overlay.classList.add("active");
  }
}

function scrollToModule(moduleId) {
  const target = document.getElementById(moduleId);
  if (target) {
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

// ==========================================
// PHÂN HỆ QUẢN LÝ DỮ LIỆU (DATA MANAGEMENT)
// ==========================================
let currentDataTab = 'progress';

function switchDataTab(tabKey) {
  currentDataTab = tabKey;
  document.querySelectorAll(".data-tab-btn").forEach(b => b.classList.remove("active"));
  const activeBtn = document.getElementById(`tab_${tabKey}`);
  if (activeBtn) activeBtn.classList.add("active");

  renderDataManagementModule();
}

function renderDataManagementModule() {
  const container = document.getElementById("dataManagementContent");
  if (!container) return;

  const data = MASTER_DATA.dataManagement;

  if (currentDataTab === 'progress') {
    container.innerHTML = `
      <div class="table-responsive">
        <table class="data-table">
          <thead>
            <tr>
              <th>Mã KH</th>
              <th>Hạng mục Công việc</th>
              <th>Phân loại</th>
              <th>Thời gian TH</th>
              <th>Tiến độ (%)</th>
              <th>Cán bộ Phụ trách</th>
              <th>Trạng thái</th>
              <th>Ghi chú</th>
            </tr>
          </thead>
          <tbody>
            ${data.progressPlans.map(p => `
              <tr>
                <td><strong>${p.id}</strong></td>
                <td><strong>${p.task}</strong></td>
                <td><span class="badge badge-info">${p.category}</span></td>
                <td>${p.startDate} ➔ ${p.endDate}</td>
                <td>
                  <div style="display:flex; align-items:center; gap:8px;">
                    <div style="flex:1; height:8px; background:#334155; border-radius:4px; overflow:hidden;">
                      <div style="width:${p.progress}%; height:100%; background:${p.progress === 100 ? '#22c55e' : '#3b82f6'};"></div>
                    </div>
                    <span>${p.progress}%</span>
                  </div>
                </td>
                <td>${p.assignee}</td>
                <td><span class="badge ${p.status === 'completed' ? 'badge-success' : 'badge-warning'}">${p.status === 'completed' ? 'Hoàn thành' : 'Đang thi công'}</span></td>
                <td>${p.note}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  } else if (currentDataTab === 'design') {
    const mapping = MASTER_DATA.subsystemDriveMappings.design;
    const account = MASTER_DATA.driveAccounts.find(a => a.id === mapping.accountId) || MASTER_DATA.driveAccounts[1];
    const activeFields = mapping.customFields.filter(f => f.active);
    const scannedFolders = MASTER_DATA.designScannedFolders;

    const activeFieldsBadges = activeFields.map(f => `<span class="badge badge-info" style="font-size:0.75rem;">✔ ${f.label}</span>`).join(" ");

    container.innerHTML = `
      <!-- GOOGLE DRIVE SCANNER INFO BAR -->
      <div style="background: rgba(15, 23, 42, 0.8); border: 1px solid var(--glass-border); border-radius: 12px; padding: 14px 16px; margin-bottom: 20px;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:10px;">
          <div>
            <div style="font-size:0.75rem; color:#60a5fa; font-weight:600;">☁️ Nguồn dữ liệu đang kết nối:</div>
            <div style="font-size:0.95rem; font-weight:700; color:#f8fafc; margin-top:2px;">
              📧 ${account.email} <span style="font-size:0.78rem; color:#94a3b8;">(${account.owner})</span>
            </div>
            <div style="font-size:0.75rem; color:#cbd5e1; margin-top:2px;">
              📁 <code style="color:#facc15;">${mapping.folderPath}</code> &nbsp;|&nbsp; Quét: ${mapping.lastScanned}
            </div>
          </div>
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <button class="btn-sm btn-outline" onclick="openDataSourceModal()">🗄️ Nguồn dữ liệu</button>
            <button class="btn-sm btn-primary" onclick="openDesignScannerFieldsModal()">⚙️ Thuộc tính quét</button>
            <button class="btn-sm btn-success" onclick="scanDesignDriveFolder()">🔄 Quét lại</button>
          </div>
        </div>
        <div style="font-size:0.75rem; color:#94a3b8;">
          Thuộc tính quét (${activeFields.length}):&nbsp;
          ${activeFieldsBadges}
        </div>
      </div>

      <!-- SCANNED DATA TABLE & FOLDER TREE FOR DESIGN SUBSYSTEM -->
      <div class="table-responsive">
        <table class="data-table">
          <thead>
            <tr>
              ${activeFields.map(f => `<th>${f.label}</th>`).join("")}
              <th>Tệp CAD / PDF Scanned</th>
              <th>AI Phân Tích</th>
              <th>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            ${scannedFolders.map(folder => `
              <tr>
                ${activeFields.map(f => {
                  if (f.id === 'folderLevel') return `<td><span class="badge badge-primary">${folder.levelBadge}</span></td>`;
                  if (f.id === 'folderName') return `<td><strong style="color:#f8fafc;">📁 ${folder.folderName}</strong></td>`;
                  if (f.id === 'releaseDate') return `<td><strong style="color:#22c55e;">📅 ${folder.releaseDate}</strong></td>`;
                  if (f.id === 'cadCode') return `<td><code style="color:#38bdf8;">${folder.cadCode}</code></td>`;
                  if (f.id === 'revision') return `<td><span class="badge badge-info">${folder.revision}</span></td>`;
                  if (f.id === 'author') return `<td>${folder.author}</td>`;
                  if (f.id === 'fileType') return `<td><span class="badge badge-warning">DWG / PDF</span></td>`;
                  if (f.id === 'status') return `<td><span class="badge ${folder.status === 'Approved' ? 'badge-success' : 'badge-warning'}">${folder.status}</span></td>`;
                  return `<td>-</td>`;
                }).join("")}
                <td>
                  <div style="display:flex; flex-direction:column; gap:2px; font-size:0.8rem;">
                    ${folder.files.map(file => `
                      <span>📄 <strong>${file.name}</strong> <span style="color:#64748b;">[${file.size}]</span></span>
                    `).join("")}
                  </div>
                </td>
                <td><span style="font-size:0.8rem; color:#cbd5e1;">🤖 ${folder.aiSummary}</span></td>
                <td>
                  <button class="btn-xs btn-outline" onclick="openDriveFile('${folder.filePath.replace(/\\/g, "\\\\")}')">📂 Xem File CAD</button>
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  } else if (currentDataTab === 'bidding') {
    container.innerHTML = `
      <div class="table-responsive">
        <table class="data-table">
          <thead>
            <tr>
              <th>Mã HSMT</th>
              <th>Tên Gói Thầu Mời Thầu</th>
              <th>Bộ phận Quản lý</th>
              <th>Ngân sách Dự toán</th>
              <th>Hạn Nộp Hồ Sơ</th>
              <th>Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            ${data.biddingDocs.map(b => `
              <tr>
                <td><strong>${b.code}</strong></td>
                <td><strong>${b.title}</strong></td>
                <td>${b.dept}</td>
                <td><strong style="color:#22c55e;">${b.budget}</strong></td>
                <td>${b.endDate}</td>
                <td><span class="badge badge-warning">${b.status}</span></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  } else if (currentDataTab === 'contracts') {
    container.innerHTML = `
      <div class="table-responsive">
        <table class="data-table">
          <thead>
            <tr>
              <th>Mã Hợp Đồng</th>
              <th>Nhà Thầu / Đối Tác</th>
              <th>Phạm vi Công việc</th>
              <th>Giá trị Hợp đồng</th>
              <th>Đã Nghiệm Thu TT</th>
              <th>Ngày Ký</th>
              <th>Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            ${data.contracts.map(c => `
              <tr>
                <td><strong>${c.code}</strong></td>
                <td><strong>${c.partner}</strong></td>
                <td>${c.scope}</td>
                <td><strong style="color:#38bdf8;">${c.value}</strong></td>
                <td><strong style="color:#22c55e;">${c.paid}</strong></td>
                <td>${c.signDate}</td>
                <td><span class="badge badge-success">${c.status}</span></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  } else if (currentDataTab === 'contractors') {
    container.innerHTML = `
      <div class="table-responsive">
        <table class="data-table">
          <thead>
            <tr>
              <th>Mã NT</th>
              <th>Tên Nhà Thầu / Đơn Vị Thi Công</th>
              <th>Mã Số Thuế</th>
              <th>Người Đại Diện</th>
              <th>Số Điện Thoại</th>
              <th>Đánh giá Năng lực</th>
              <th>Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            ${data.contractors.map(c => `
              <tr>
                <td><strong>${c.id}</strong></td>
                <td><strong>${c.name}</strong></td>
                <td>${c.taxCode}</td>
                <td>${c.representative}</td>
                <td>${c.phone}</td>
                <td>${c.rating}</td>
                <td><span class="badge badge-success">${c.status}</span></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  } else if (currentDataTab === 'quantity') {
    container.innerHTML = `
      <div class="table-responsive">
        <table class="data-table">
          <thead>
            <tr>
              <th>Mã KL</th>
              <th>Danh Mục Vật Tư / Hạng Mục</th>
              <th>Đơn vị</th>
              <th>Khối lượng Thiết Kế</th>
              <th>Khối lượng Thực Tế</th>
              <th>Chênh lệch (BOQ)</th>
              <th>Thành Tiền</th>
            </tr>
          </thead>
          <tbody>
            ${data.quantityBoqs.map(q => `
              <tr>
                <td><strong>${q.id}</strong></td>
                <td><strong>${q.item}</strong></td>
                <td>${q.unit}</td>
                <td>${q.planQty}</td>
                <td><strong>${q.actualQty}</strong></td>
                <td><span class="badge ${q.diffQty < 0 ? 'badge-danger' : 'badge-warning'}">${q.diffQty > 0 ? '+' : ''}${q.diffQty} ${q.unit}</span></td>
                <td><strong style="color:#facc15;">${q.totalAmount}</strong></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  }
}

function addNewDataRecord() {
  const tabNames = {
    progress: "Kế hoạch & Tiến độ",
    design: "Hồ sơ Thiết kế CAD",
    bidding: "Hồ sơ Mời thầu (HSMT)",
    contracts: "Hợp đồng Nhà thầu",
    contractors: "Nhà thầu & Đơn vị thi công",
    quantity: "Khối lượng & BOQ"
  };

  const title = prompt(`➕ Thêm dữ liệu mới cho Phân hệ [${tabNames[currentDataTab]}]:`);
  if (title && title.trim()) {
    showToast(`🟢 Đã lưu dữ liệu mới vào Phân hệ ${tabNames[currentDataTab]}!`);
    renderDataManagementModule();
  }
}

// ==========================================
// 9. DESKTOP STICKY NOTES WIDGET (EDITABLE & COMMENTS)
// ==========================================
function initStickyNotesWidget() {
  renderStickyNotes();
}

function renderStickyNotes() {
  const container = document.getElementById("stickyNotesGrid");
  if (!container) return;

  const currentUser = authEngine.getCurrentUser() || MASTER_DATA.staffList[0];

  container.innerHTML = MASTER_DATA.stickyNotes.map(n => {
    const commentsList = (n.comments || []).map(c => `
      <div class="note-comment-item">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:2px;">
          <strong style="font-size:0.78rem; color:#0f172a;">${c.sender}</strong>
          <span style="font-size:0.7rem; color:#64748b;">${c.time}</span>
        </div>
        <div>${c.text}</div>
      </div>
    `).join("");

    const assignedTag = (n.assignedTo || []).map(a => `<span class="badge badge-info" style="font-size:0.7rem;">👤 ${a}</span>`).join(" ");

    return `
      <div class="sticky-card" style="background-color: ${n.color};">
        <div class="sticky-header">
          <span>${n.date} (${n.source})</span>
          <div style="display:flex; gap:4px;">
            <button class="btn-xs btn-dark" title="Chỉnh sửa ghi chú" onclick="editStickyNote('${n.id}')">✏️ Sửa</button>
            <button class="btn-close-note" onclick="deleteStickyNote('${n.id}')">✕</button>
          </div>
        </div>

        <h5 class="sticky-title" style="color:#0f172a; font-weight:700;">${n.title}</h5>
        <pre class="sticky-content" style="color:#1e293b;">${n.content}</pre>

        ${assignedTag ? `<div style="margin-bottom:8px;">${assignedTag}</div>` : ''}

        <div class="sticky-actions">
          <button class="btn-xs btn-dark" onclick="pushEmailToDirective('${n.id}')">🚀 Đẩy Giao Ban</button>
          <button class="btn-xs btn-dark" onclick="assignPersonToNote('${n.id}')">🏷️ Gán Cán Bộ</button>
          <button class="btn-xs btn-dark" onclick="askAIAboutNote('${n.id}')">🤖 Hỏi AI</button>
        </div>

        <!-- REPLIES & COMMENTS SECTION -->
        <div class="note-comments-section">
          <strong style="color:#0f172a;">💬 Báo cáo & Phản hồi (${(n.comments || []).length}):</strong>
          <div style="max-height:120px; overflow-y:auto; margin-top:4px;">
            ${commentsList || '<em style="color:#64748b;">Chưa có phản hồi nào.</em>'}
          </div>

          <div class="note-reply-input-box">
            <input type="text" id="replyInput_${n.id}" class="note-reply-input" placeholder="Gõ phản hồi (@gán tên)..." onkeydown="if(event.key==='Enter') addNoteComment('${n.id}')">
            <button class="btn-xs btn-primary" onclick="addNoteComment('${n.id}')">Gửi</button>
          </div>
        </div>
      </div>
    `;
  }).join("");

  setTimeout(() => {
    container.querySelectorAll(".note-reply-input").forEach(inp => setupMentionAutocomplete(inp));
  }, 50);
}

function editStickyNote(noteId) {
  const note = MASTER_DATA.stickyNotes.find(x => x.id === noteId);
  if (!note) return;

  const newTitle = prompt("✏️ Sửa Tiêu đề Ghi chú:", note.title);
  if (newTitle === null) return;
  const newContent = prompt("✏️ Sửa Nội dung Ghi chú:", note.content);
  if (newContent === null) return;

  note.title = newTitle.trim() || note.title;
  note.content = newContent.trim() || note.content;

  storageEngine.saveNotes();
  renderStickyNotes();
  showToast("✏️ Đã cập nhật nội dung Ghi chú thành công!");
}

function addNoteComment(noteId) {
  const input = document.getElementById(`replyInput_${noteId}`);
  if (!input || !input.value.trim()) return;

  const note = MASTER_DATA.stickyNotes.find(x => x.id === noteId);
  if (!note) return;

  if (!note.comments) note.comments = [];

  const currentUser = authEngine.getCurrentUser() || MASTER_DATA.staffList[0];

  note.comments.push({
    sender: currentUser.name,
    avatar: currentUser.avatar,
    text: input.value.trim(),
    time: new Date().toLocaleDateString("vi-VN", { hour: '2-digit', minute: '2-digit' })
  });

  storageEngine.saveNotes();
  renderStickyNotes();
  showToast("💬 Đã gửi phản hồi vào Ghi chú!");
}

function openAssignStaffModal(noteId) {
  const note = MASTER_DATA.stickyNotes.find(x => x.id === noteId);
  if (!note) return;

  const modal = document.getElementById("assignStaffModal");
  const body = document.getElementById("assignStaffModalBody");
  if (!modal || !body) return;

  const currentAssigned = note.assignedTo || [];

  body.innerHTML = `
    <div style="margin-bottom:12px; display:flex; gap:10px; align-items:center;">
      <input type="text" id="assignSearchInput" class="input-text" placeholder="🔍 Tìm kiếm tên cán bộ hoặc chức danh..." style="flex:1;" oninput="filterAssignStaffList()">
      <button class="btn-sm btn-primary" onclick="toggleSelectAllAssignStaff('${noteId}')" style="white-space:nowrap;">📢 Tag Tất Cả (@all)</button>
    </div>

    <div id="assignStaffCheckboxList" style="max-height:320px; overflow-y:auto; display:flex; flex-direction:column; gap:8px; margin-bottom:16px;">
      ${MASTER_DATA.staffList.map(s => {
        const isChecked = currentAssigned.includes(s.name) || currentAssigned.includes("@all");
        return `
          <label style="display:flex; align-items:center; gap:12px; background:#1e293b; padding:10px 14px; border-radius:8px; cursor:pointer; border:1px solid var(--glass-border);">
            <input type="checkbox" class="assign-staff-chk" value="${s.name}" ${isChecked ? 'checked' : ''} style="width:18px; height:18px; cursor:pointer;">
            <img src="${s.avatar}" style="width:30px; height:30px; border-radius:50%; background:#334155;">
            <div style="display:flex; flex-direction:column;">
              <strong style="font-size:0.88rem; color:#f8fafc;">${s.name}</strong>
              <span style="font-size:0.75rem; color:#60a5fa;">${s.title} • ${s.dept ? s.dept.split('➔').pop() : ''}</span>
            </div>
          </label>
        `;
      }).join("")}
    </div>

    <div style="display:flex; justify-content:flex-end; gap:10px;">
      <button class="btn-outline" onclick="document.getElementById('assignStaffModal').style.display='none'">Hủy</button>
      <button class="btn-primary" onclick="saveAssignStaffForm('${noteId}')">💾 Lưu Phân Công</button>
    </div>
  `;

  modal.style.display = "flex";
}

function filterAssignStaffList() {
  const q = (document.getElementById("assignSearchInput").value || "").toLowerCase();
  document.querySelectorAll("#assignStaffCheckboxList label").forEach(lbl => {
    const txt = lbl.innerText.toLowerCase();
    lbl.style.display = txt.includes(q) ? "flex" : "none";
  });
}

function toggleSelectAllAssignStaff(noteId) {
  const chks = document.querySelectorAll(".assign-staff-chk");
  const allChecked = Array.from(chks).every(c => c.checked);
  chks.forEach(c => c.checked = !allChecked);
}

function saveAssignStaffForm(noteId) {
  const note = MASTER_DATA.stickyNotes.find(x => x.id === noteId);
  if (!note) return;

  const chks = Array.from(document.querySelectorAll(".assign-staff-chk:checked")).map(c => c.value);

  if (chks.length === MASTER_DATA.staffList.length) {
    note.assignedTo = ["@all"];
  } else {
    note.assignedTo = chks;
  }

  storageEngine.saveNotes();
  renderStickyNotes();
  document.getElementById("assignStaffModal").style.display = "none";
  showToast(`🏷️ Đã cập nhật phân công cán bộ phụ trách Ghi chú!`);
}

function assignPersonToNote(noteId) {
  openAssignStaffModal(noteId);
}

function createNewStickyNote() {
  const colors = ["#fef08a", "#fbcfe8", "#bbf7d0", "#bae6fd"];
  const randomColor = colors[Math.floor(Math.random() * colors.length)];
  
  MASTER_DATA.stickyNotes.unshift({
    id: "NOTE-" + Date.now(),
    color: randomColor,
    date: new Date().toLocaleDateString("vi-VN"),
    title: "📝 GHI CHÚ MỚI LÃNH ĐẠO",
    content: "• Nhập nội dung ghi chú nhanh tại đây...\n• Tự động đồng bộ với Ổ Z:\\ và Điện thoại.",
    status: "active",
    source: "Quick Desktop",
    isPinned: true
  });

  storageEngine.saveNotes();
  renderStickyNotes();
}

function deleteStickyNote(noteId) {
  MASTER_DATA.stickyNotes = MASTER_DATA.stickyNotes.filter(x => x.id !== noteId);
  storageEngine.saveNotes();
  renderStickyNotes();
}

async function askAIAboutNote(noteId) {
  const note = MASTER_DATA.stickyNotes.find(x => x.id === noteId);
  if (!note) return;
  showToast("🤖 Gemini AI đang phân tích ghi chú...");
  const ans = await aiEngine.askKnowledgeBase(note.content);
  alert(`🤖 KẾT QUẢ AI PHÂN TÍCH GHI CHÚ:\n\n${ans}`);
}

function toggleStickyWidgetWindow() {
  const widget = document.getElementById("stickyNotesWidget");
  if (!widget) return;

  if (widget.classList.contains("widget-floated")) {
    widget.classList.remove("widget-floated");
    showToast("📌 Widget đã ghim vào trang chính");
  } else {
    widget.classList.add("widget-floated");
    showToast("📌 Widget đã nổi Always-on-Top ngoài màn hình PC!");
  }
}

// ==========================================
// 10. DRIVE Z:\ EXPLORER & GAS MODAL
// ==========================================
// Kept for GAS modal reuse - do not remove
function openDriveZExplorer() { openDataSourceModal(); }

// =============================================
// NGUỒN DỮ LIỆU - GOOGLE DRIVE MULTI-ACCOUNT
// =============================================
const DATA_SUBSYSTEMS = [
  { key: 'progress',    label: 'Tiến độ / Kế hoạch' },
  { key: 'design',      label: 'Hồ sơ Thiết kế' },
  { key: 'bidding',     label: 'HSMT' },
  { key: 'contracts',   label: 'Hợp đồng' },
  { key: 'contractors', label: 'Nhà thầu' },
  { key: 'advance',     label: 'Tạm ứng / Thanh toán' },
  { key: 'settlement',  label: 'Quyết toán' },
  { key: 'quantity',    label: 'Khối lượng' },
  { key: 'handover',    label: 'Nghiệm thu / Bàn giao' }
];

function openDataSourceModal() {
  const modal = document.getElementById("driveZModal");
  if (!modal) return;

  _renderDataSourceContent(modal.querySelector(".modal-body"));
  modal.style.display = "flex";
}

function _renderDataSourceContent(container) {
  const accounts = MASTER_DATA.driveAccounts;
  const mappings = MASTER_DATA.subsystemDriveMappings;
  const clientId = (window.DriveEngine && DriveEngine.clientId) || '';
  const gisReady = !!(window.google?.accounts?.oauth2);

  container.innerHTML = `
    <!-- GOOGLE API SETUP -->
    <div style="background:rgba(250,204,21,0.08); border:1px solid rgba(250,204,21,0.3); border-radius:10px; padding:12px 14px; margin-bottom:18px;">
      <div style="font-size:0.8rem; color:#facc15; font-weight:700; margin-bottom:6px;">🔑 Cấu hình Google API Client ID</div>
      <div style="display:flex; gap:8px;">
        <input type="text" id="gClientIdInput" class="input-text" value="${clientId}" placeholder="Dán Google OAuth 2.0 Client ID vào đây..." style="flex:1; font-size:0.8rem; font-family:monospace;">
        <button class="btn-sm btn-primary" onclick="_saveGoogleClientId()">Lưu</button>
      </div>
      <div style="font-size:0.72rem; color:#64748b; margin-top:5px;">
        ➡️ Tạo tại: <strong style="color:#60a5fa;">console.cloud.google.com</strong> → APIs & Services → Credentials → Create OAuth 2.0 Client ID (Web application) → Thêm <code style="color:#facc15;">${window.location.origin}</code> vào Authorized JavaScript origins.
      </div>
      <div style="font-size:0.72rem; margin-top:3px; color:${gisReady ? '#22c55e' : '#f59e0b'};">
        ${gisReady ? '✅ Thư viện Google Identity Services đã sẵn sàng' : '⏳ Đang tải thư viện Google...'}
      </div>
    </div>

    <!-- SECTION 1: TÀI KHOẢN GOOGLE DRIVE -->
    <div style="margin-bottom:20px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
        <h4 style="color:#facc15; margin:0;">1. Tài khoản Google Drive</h4>
        <button class="btn-sm btn-primary" onclick="_addDriveAccount()">☁️ Đăng nhập Google</button>
      </div>
      <div style="display:flex; flex-direction:column; gap:7px;">
        ${accounts.length === 0
          ? `<div style="text-align:center; color:#64748b; padding:16px; font-size:0.85rem;">Chưa có tài khoản nào. Bấm "Đăng nhập Google" để kết nối!</div>`
          : accounts.map((acc, idx) => {
              const status = window.DriveEngine ? DriveEngine.getTokenStatus(acc.id) : 'manual';
              const isOAuth = acc.oauthConnected;
              const isValid = status.startsWith('valid');
              const minsLeft = isValid ? status.split(':')[1] : 0;
              let statusBadge;
              if (!isOAuth) statusBadge = `<span style="font-size:0.7rem; color:#94a3b8;">Thủ công</span>`;
              else if (isValid) statusBadge = `<span class="badge badge-success" style="font-size:0.7rem;">✅ Đã kết nối (còn ${minsLeft} phút)</span>`;
              else statusBadge = `<span class="badge badge-warning" style="font-size:0.7rem;">⚠️ Token hết hạn</span>`;

              return `
              <div style="display:flex; justify-content:space-between; align-items:center; background:#1e293b; padding:10px 14px; border-radius:8px; border:1px solid var(--glass-border);">
                <div style="display:flex; align-items:center; gap:10px; flex:1; min-width:0;">
                  ${acc.picture ? `<img src="${acc.picture}" style="width:32px; height:32px; border-radius:50%; flex-shrink:0;" alt="">` : `<span style="font-size:1.2rem;">📧</span>`}
                  <div style="min-width:0; overflow:hidden;">
                    <strong style="color:#f8fafc; font-size:0.88rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; display:block;">${acc.email}</strong>
                    <div style="font-size:0.72rem; color:#94a3b8; display:flex; gap:8px; flex-wrap:wrap; margin-top:1px;">${acc.owner} • ${acc.storage} &nbsp; ${statusBadge}</div>
                  </div>
                </div>
                <div style="display:flex; gap:5px; margin-left:8px; flex-shrink:0;">
                  ${isOAuth && !isValid ? `<button class="btn-xs btn-primary" onclick="_reconnectDriveAccount('${acc.id}')">🔄 Kết nối lại</button>` : ''}
                  <button class="btn-xs" style="background:#dc2626; color:#fff; border:none; border-radius:6px; padding:3px 8px; cursor:pointer;" onclick="_deleteDriveAccount(${idx})">🗑️</button>
                </div>
              </div>`;
            }).join("")}
      </div>
    </div>

    <!-- SECTION 2: CẤU HÌNH PHÂN HỆ -->
    <div style="border-top:1px dashed rgba(255,255,255,0.12); padding-top:16px;">
      <h4 style="color:#60a5fa; margin-bottom:12px;">2. Thư mục dữ liệu theo Phân hệ</h4>
      <div style="display:flex; flex-direction:column; gap:8px;">
        ${DATA_SUBSYSTEMS.map(sys => {
          const m = mappings[sys.key] || {};
          const acc = accounts.find(a => a.id === m.accountId);
          const isLinked = !!(acc && m.folderPath);
          return `
          <div style="background:#1e293b; border:1px solid ${isLinked ? 'rgba(34,197,94,0.3)' : 'var(--glass-border)'}; border-radius:10px; padding:10px 14px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <div style="flex:1; min-width:0;">
                <strong style="color:#f8fafc; font-size:0.88rem;">📂 ${sys.label}</strong>
                <div style="font-size:0.73rem; color:#94a3b8; margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                  ${acc ? `📧 ${acc.email}` : '<span style="color:#ef4444;">Chưa chọn tài khoản</span>'}
                  &nbsp;|&nbsp;
                  ${m.folderPath ? `📁 <span style="color:#facc15;">${m.folderPath}</span>` : '<span style="color:#ef4444;">Chưa chọn thư mục</span>'}
                </div>
              </div>
              <button class="btn-xs btn-outline" onclick="_editSubsystemMapping('${sys.key}', '${sys.label}')" style="margin-left:8px; flex-shrink:0;">⚙️ Cài đặt</button>
            </div>
          </div>`;
        }).join("")}
      </div>
    </div>
  `;
}

function _saveGoogleClientId() {
  const input = document.getElementById("gClientIdInput");
  if (!input || !input.value.trim()) { showToast('⚠️ Vui lòng nhập Client ID!'); return; }
  DriveEngine.setClientId(input.value.trim());
  showToast('🔑 Đã lưu Google API Client ID!');
  openDataSourceModal(); // Re-render to show updated status
}

function _addDriveAccount() {
  if (!window.DriveEngine) { showToast('⚠️ DriveEngine chưa sẵn sàng!'); return; }
  DriveEngine.connect(
    (account) => {
      const modal = document.getElementById("driveZModal");
      if (modal) _renderDataSourceContent(modal.querySelector(".modal-body"));
    },
    (err) => {
      if (err === 'no_client_id') {
        // Scroll to client ID input
        const input = document.getElementById("gClientIdInput");
        if (input) { input.focus(); input.style.border = '1px solid #ef4444'; }
      }
    }
  );
}

function _reconnectDriveAccount(accountId) {
  if (!window.DriveEngine) return;
  DriveEngine.reconnect(accountId, (acc) => {
    const modal = document.getElementById("driveZModal");
    if (modal) _renderDataSourceContent(modal.querySelector(".modal-body"));
  });
}

function _editDriveAccount(idx) {
  const acc = MASTER_DATA.driveAccounts[idx];
  if (!acc) return;
  const newOwner = prompt("📝 Sửa tên gợi nhớ:", acc.owner);
  if (newOwner !== null && newOwner.trim()) { acc.owner = newOwner.trim(); }
  const modal = document.getElementById("driveZModal");
  _renderDataSourceContent(modal.querySelector(".modal-body"));
  showToast("✏️ Đã cập nhật!");
}

function _deleteDriveAccount(idx) {
  const acc = MASTER_DATA.driveAccounts[idx];
  if (!acc) return;
  if (!confirm(`🗑️ Xóa tài khoản [${acc.email}]?\nCác phân hệ đang dùng tài khoản này sẽ mất cấu hình.`)) return;
  MASTER_DATA.driveAccounts.splice(idx, 1);
  if (window.DriveEngine) DriveEngine.saveOAuthAccounts();
  const modal = document.getElementById("driveZModal");
  _renderDataSourceContent(modal.querySelector(".modal-body"));
  showToast("🗑️ Đã xóa tài khoản!");
}

// ─── Subsystem Mapping Editor ─────────────────────────────────────
function _editSubsystemMapping(sysKey, sysLabel) {
  const modal = document.getElementById("driveZModal");
  const body = modal.querySelector(".modal-body");
  const accounts = MASTER_DATA.driveAccounts;
  if (!MASTER_DATA.subsystemDriveMappings[sysKey]) {
    MASTER_DATA.subsystemDriveMappings[sysKey] = { accountId: '', folderPath: '', folderId: '', customFields: [] };
  }
  const m = MASTER_DATA.subsystemDriveMappings[sysKey];

  body.innerHTML = `
    <div style="display:flex; align-items:center; gap:10px; margin-bottom:16px;">
      <button class="btn-xs btn-outline" onclick="openDataSourceModal()">← Quay lại</button>
      <h4 style="margin:0; color:#facc15;">⚙️ ${sysLabel}</h4>
    </div>

    <div style="display:flex; flex-direction:column; gap:12px;">
      <div>
        <label style="font-size:0.82rem; color:#cbd5e1; display:block; margin-bottom:4px;">Tài khoản Google Drive:</label>
        <select id="editSysAccount" class="input-text" style="width:100%;" onchange="_onSysAccountChange()">
          <option value="">-- Chọn tài khoản --</option>
          ${accounts.map(a => {
            const isOk = window.DriveEngine ? DriveEngine.isConnected(a.id) : false;
            return `<option value="${a.id}" ${a.id === m.accountId ? 'selected' : ''}>${a.email}${isOk ? ' ✅' : ' (chưa kết nối)'}</option>`;
          }).join("")}
        </select>
      </div>

      <div>
        <label style="font-size:0.82rem; color:#cbd5e1; display:block; margin-bottom:4px;">Thư mục dữ liệu:</label>
        <div style="display:flex; gap:8px;">
          <input type="text" id="editSysFolder" class="input-text" value="${m.folderPath || ''}" placeholder="Chọn thư mục hoặc nhập đường dẫn..." style="flex:1;">
          <input type="hidden" id="editSysFolderId" value="${m.folderId || ''}">
          <button class="btn-sm btn-outline" onclick="_openFolderBrowser('${sysKey}', '${sysLabel}')">📁 Chọn</button>
        </div>
      </div>
    </div>

    <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:18px;">
      <button class="btn-outline" onclick="openDataSourceModal()">Hủy</button>
      <button class="btn-primary" onclick="_saveSubsystemMapping('${sysKey}')">💾 Lưu</button>
    </div>
  `;
}

function _onSysAccountChange() {
  // Reset folder when account changes
  const folderInput = document.getElementById("editSysFolder");
  const folderIdInput = document.getElementById("editSysFolderId");
  if (folderInput) folderInput.value = '';
  if (folderIdInput) folderIdInput.value = '';
}

function _saveSubsystemMapping(sysKey) {
  const accId = document.getElementById("editSysAccount").value;
  const folder = document.getElementById("editSysFolder").value.trim();
  const folderId = document.getElementById("editSysFolderId").value.trim();
  if (!MASTER_DATA.subsystemDriveMappings[sysKey]) MASTER_DATA.subsystemDriveMappings[sysKey] = {};
  MASTER_DATA.subsystemDriveMappings[sysKey].accountId = accId;
  MASTER_DATA.subsystemDriveMappings[sysKey].folderPath = folder;
  MASTER_DATA.subsystemDriveMappings[sysKey].folderId = folderId;
  MASTER_DATA.subsystemDriveMappings[sysKey].lastScanned = new Date().toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" });
  if (window.DriveEngine) DriveEngine.saveMappings();
  openDataSourceModal();
  renderDataManagementModule();
  showToast("💾 Đã lưu cấu hình phân hệ!");
}

// ─── Real Folder Browser (Drive API) ─────────────────────────────
let _fbState = { sysKey: '', sysLabel: '', accountId: '', breadcrumbs: [{id:'root', name:'My Drive'}] };

async function _openFolderBrowser(sysKey, sysLabel) {
  const accId = document.getElementById("editSysAccount")?.value;
  if (!accId) { showToast('⚠️ Chọn tài khoản Google Drive trước!'); return; }

  if (!window.DriveEngine || !DriveEngine.isConnected(accId)) {
    showToast('⚠️ Tài khoản chưa kết nối OAuth. Vui lòng Đăng nhập Google trước!');
    return;
  }

  _fbState = { sysKey, sysLabel, accountId: accId, breadcrumbs: [{id:'root', name:'My Drive'}] };
  await _renderFolderBrowser('root', 'My Drive');
}

async function _renderFolderBrowser(folderId, folderName) {
  const modal = document.getElementById("driveZModal");
  const body = modal.querySelector(".modal-body");

  body.innerHTML = `
    <div style="display:flex; align-items:center; gap:10px; margin-bottom:14px;">
      <button class="btn-xs btn-outline" onclick="_editSubsystemMapping('${_fbState.sysKey}', '${_fbState.sysLabel}')">← Quay lại</button>
      <h4 style="margin:0; color:#60a5fa;">📁 Chọn thư mục</h4>
    </div>

    <!-- Breadcrumbs -->
    <div style="font-size:0.8rem; color:#94a3b8; margin-bottom:10px; display:flex; flex-wrap:wrap; gap:4px; align-items:center;">
      ${_fbState.breadcrumbs.map((b, i) => `
        ${i > 0 ? '<span style="color:#475569;">/</span>' : ''}
        <span onclick="_navigateTo('${b.id}', '${b.name.replace(/'/g,"\\'")}', ${i})" style="color:${i === _fbState.breadcrumbs.length - 1 ? '#f8fafc' : '#60a5fa'}; cursor:pointer; font-weight:${i === _fbState.breadcrumbs.length - 1 ? '700' : '400'};">${b.name}</span>
      `).join("")}
    </div>

    <div id="folderBrowserList" style="max-height:340px; overflow-y:auto; display:flex; flex-direction:column; gap:5px;">
      <div style="text-align:center; padding:20px; color:#64748b;">⏳ Đang tải thư mục...</div>
    </div>

    <div style="display:flex; justify-content:space-between; align-items:center; margin-top:14px; padding-top:10px; border-top:1px dashed rgba(255,255,255,0.1);">
      <div style="font-size:0.8rem; color:#94a3b8;">Chọn thư mục đang hiển thị:</div>
      <button class="btn-primary" onclick="_selectCurrentFolder('${folderId}', '${folderName.replace(/'/g,"\\'")}')">
        ✔ Chọn "<strong>${folderName}</strong>"
      </button>
    </div>
  `;

  // Load folders
  try {
    const folders = await DriveEngine.listFolders(_fbState.accountId, folderId);
    const listEl = document.getElementById("folderBrowserList");
    if (!listEl) return;

    if (folders.length === 0) {
      listEl.innerHTML = `<div style="text-align:center; padding:20px; color:#64748b;">📭 Không có thư mục con nào</div>`;
    } else {
      listEl.innerHTML = folders.map(f => `
        <div onclick="_navigateInto('${f.id}', '${f.name.replace(/'/g,"\\'")}', '${folderId}', '${folderName.replace(/'/g,"\\'")}', '${_fbState.breadcrumbs.length}')"
          style="display:flex; align-items:center; gap:10px; background:#1e293b; padding:9px 12px; border-radius:7px; cursor:pointer; transition:background 0.15s;"
          onmouseover="this.style.background='#263348'" onmouseout="this.style.background='#1e293b'">
          <span style="font-size:1.1rem;">📁</span>
          <span style="color:#f8fafc; font-size:0.88rem;">${f.name}</span>
        </div>
      `).join("");
    }
  } catch (e) {
    const listEl = document.getElementById("folderBrowserList");
    if (listEl) {
      listEl.innerHTML = `
        <div style="background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.3); border-radius:10px; padding:16px; margin:10px 0; text-align:center;">
          <div style="color:#ef4444; font-weight:700; font-size:0.95rem; margin-bottom:6px;">❌ ${e.message}</div>
          <div style="font-size:0.8rem; color:#cbd5e1; margin-bottom:12px;">Tài khoản này cần được cấp lại quyền đọc dữ liệu Google Drive (Scope drive.readonly).</div>
          <button class="btn-sm btn-primary" onclick="_reconnectDriveAccount('${_fbState.accountId}')">🔑 Đăng Nhập Lại & Cấp Quyền Drive</button>
        </div>
      `;
    }
  }
}

function _navigateInto(folderId, folderName, parentId, parentName, depth) {
  // Push to breadcrumbs
  _fbState.breadcrumbs.push({ id: folderId, name: folderName });
  _renderFolderBrowser(folderId, folderName);
}

function _navigateTo(folderId, folderName, breadcrumbIdx) {
  // Trim breadcrumbs to this index
  _fbState.breadcrumbs = _fbState.breadcrumbs.slice(0, breadcrumbIdx + 1);
  _renderFolderBrowser(folderId, folderName);
}

function _selectCurrentFolder(folderId, folderName) {
  // Build full path from breadcrumbs
  const fullPath = _fbState.breadcrumbs.map(b => b.name).join(' / ');
  const finalPath = folderId === 'root' ? fullPath : fullPath;

  // Go back to subsystem mapping editor with pre-filled values
  _editSubsystemMapping(_fbState.sysKey, _fbState.sysLabel);

  // Fill in the folder fields after re-render
  setTimeout(() => {
    const folderInput = document.getElementById("editSysFolder");
    const folderIdInput = document.getElementById("editSysFolderId");
    const accSelect = document.getElementById("editSysAccount");
    if (folderInput) folderInput.value = finalPath;
    if (folderIdInput) folderIdInput.value = folderId;
    if (accSelect) accSelect.value = _fbState.accountId;
    showToast(`📁 Đã chọn: ${folderName}`);
  }, 50);
}

function renderDriveTreeHTML(node) {
  if (node.type === "root" || node.type === "folder") {
    let childStr = "";
    if (node.children) {
      childStr = node.children.map(c => renderDriveTreeHTML(c)).join("\n");
    }
    return `📁 <strong>${node.name}</strong> ${node.count ? `(${node.count} files)` : ''}\n${childStr.split('\n').map(l => '  ' + l).join('\n')}`;
  }
  return `📄 ${node.name} <span style="color:#64748b;">[${node.size}]</span>`;
}

function openGASCodeModal() {
  const modal = document.getElementById("driveZModal");
  if (!modal) return;

  const gasScript = storageEngine.generateGASScript();
  modal.querySelector(".modal-body").innerHTML = `
    <h4>⚡ TRÌNH TẠO MÃ NGUỒN GOOGLE APPS SCRIPT (GAS)</h4>
    <p>Sao chép toàn bộ mã nguồn bên dưới và dán vào Google Sheets ➔ Extensions ➔ Apps Script để vận hành server 0 đồng:</p>
    <textarea style="width:100%; height:300px; background:#0f172a; color:#38bdf8; font-family:monospace; padding:10px; border-radius:8px;" readonly>${gasScript}</textarea>
    <div style="margin-top:10px;">
      <button class="btn-primary" onclick="navigator.clipboard.writeText(\`${gasScript.replace(/`/g, '\\`')}\`); alert('Đã sao chép mã GAS vào Clipboard!')">📋 Copy Mã GAS</button>
    </div>
  `;
  modal.style.display = "flex";
}

function openDriveFile(filePath) {
  alert(`📂 Đã mở tập tin từ Ổ đĩa ảo Z:\\:\n${filePath}`);
}

// ==========================================
// UTILS & TOAST NOTIFICATION
// ==========================================
function showToast(msg) {
  let toast = document.getElementById("appToast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "appToast";
    toast.className = "app-toast";
    document.body.appendChild(toast);
  }
  toast.innerText = msg;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 3500);
}

function updateUIByRole(user) {
  renderUserHeader();
  renderDirectivesTable();
  renderHandoverPlan();
  renderNewsfeed();
}

// ==========================================
// 11. USER ACCOUNT MANAGEMENT MODULE (TRANG QUẢN TRỊ TÀI KHOẢN)
// ==========================================
function openUserManagementModal() {
  const modal = document.getElementById("userManagementModal");
  if (!modal) return;

  renderUserManagementTable();
  modal.style.display = "flex";
}

function renderUserManagementTable(filterQuery = "", filterRole = "") {
  const container = document.getElementById("userManagementBody");
  if (!container) return;

  let list = MASTER_DATA.staffList;
  if (filterQuery) {
    const q = filterQuery.toLowerCase();
    list = list.filter(s => s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q) || (s.phone && s.phone.includes(q)) || s.title.toLowerCase().includes(q));
  }
  if (filterRole) {
    list = list.filter(s => s.role === filterRole);
  }

  container.innerHTML = `
    <div class="user-mgmt-topbar" style="flex-wrap: wrap;">
      <div style="display:flex; gap:10px; flex:1; min-width:260px;">
        <input type="text" id="userMgmtSearchInput" placeholder="🔍 Tìm theo Tên, Gmail, SĐT, Chức vụ..." class="input-text" onkeyup="filterUserMgmtList()" style="max-width:240px;">
        <select id="userMgmtRoleFilter" class="input-text" onchange="filterUserMgmtList()" style="max-width:160px;">
          <option value="">Tất cả Vai trò</option>
          <option value="leader">Lãnh Đạo</option>
          <option value="secretary">Thư Ký</option>
          <option value="team_lead">Đội Trưởng</option>
          <option value="inspector">Cán Bộ Giám Sát</option>
          <option value="internal_ops">Nội Nghiệp</option>
          <option value="admin">Admin</option>
        </select>
      </div>

      <div style="display:flex; gap:8px;">
        <button class="btn-outline btn-sm" onclick="openDeptManagementModal()">🏢 Quản Lý Phòng Ban (${MASTER_DATA.departments.length})</button>
        <button class="btn-outline btn-sm" onclick="openTitleManagementModal()">💼 Quản Lý Chức Danh (${MASTER_DATA.titles.length})</button>
        <button class="btn-primary btn-sm" onclick="openAddEditAccountModal()">➕ Thêm Tài Khoản Mới</button>
      </div>
    </div>

    <div class="table-responsive" style="margin-top:15px; max-height:60vh; overflow-y:auto;">
      <table class="data-table">
        <thead>
          <tr>
            <th style="width:70px;">Mã NV</th>
            <th>Tài Khoản / Avatar</th>
            <th>Gmail Login</th>
            <th style="width:90px;">Mật Khẩu</th>
            <th style="width:110px;">Số Điện Thoại</th>
            <th>Chức Vụ & Phòng Ban</th>
            <th style="width:120px;">Vai Trò RBAC</th>
            <th style="width:110px;">Kết Nối Gmail</th>
            <th style="width:100px;">Trạng Thái</th>
            <th style="width:180px; text-align:center;">Thao Tác</th>
          </tr>
        </thead>
        <tbody>
          ${list.map(acc => `
            <tr class="${acc.status === 'locked' ? 'row-locked' : ''}">
              <td><code>${acc.id}</code></td>
              <td>
                <div style="display:flex; align-items:center; gap:8px;">
                  <img src="${acc.avatar}" style="width:34px; height:34px; border-radius:50%; background:#1e293b;">
                  <div>
                    <strong>${acc.name}</strong>
                    <div style="font-size:0.75rem; color:#94a3b8;">${acc.address || 'BQLDA'}</div>
                  </div>
                </div>
              </td>
              <td><span style="color:#60a5fa; font-size:0.85rem;">${acc.email}</span></td>
              <td>
                <span class="password-mask" onclick="alert('Mật khẩu của ${acc.name}: ${acc.password}')" style="cursor:pointer;" title="Nhấp để xem mật khẩu">•••••• 👁️</span>
              </td>
              <td>${acc.phone || 'Chưa có'}</td>
              <td>
                <strong style="color:#e2e8f0;">${acc.title}</strong>
                <div style="font-size:0.75rem; color:#38bdf8;">🏢 ${acc.dept}</div>
              </td>
              <td><span class="badge-item">${authEngine.getRoleLabel(acc.role)}</span></td>
              <td>
                <span class="status-badge ${acc.gmailConnected ? 'status-passed' : 'status-failed'}" onclick="toggleAccountGmailLink('${acc.id}')" style="cursor:pointer;">
                  ${acc.gmailConnected ? '🟢 Active' : '🔴 Unlinked'}
                </span>
              </td>
              <td>
                <span class="status-badge ${acc.status === 'active' ? 'status-passed' : 'status-failed'}">
                  ${acc.status === 'active' ? '🟢 Hoạt động' : '🔒 Bị khóa'}
                </span>
              </td>
              <td>
                <div style="display:flex; gap:3px; justify-content:center;">
                  <button class="btn-xs btn-outline" onclick="openAddEditAccountModal('${acc.id}')" title="Chỉnh sửa thông tin">✏️ Sửa</button>
                  <button class="btn-xs btn-dark" onclick="quickChangePassword('${acc.id}')" title="Đổi mật khẩu">🔑 Pass</button>
                  <button class="btn-xs ${acc.status === 'active' ? 'btn-warning' : 'btn-success'}" onclick="toggleAccountLockStatus('${acc.id}')" title="Khóa/Mở Khóa">
                    ${acc.status === 'active' ? '🔒 Khóa' : '🔓 Mở'}
                  </button>
                  <button class="btn-xs btn-danger" onclick="deleteAccountItem('${acc.id}')" title="Xóa vĩnh viễn tài khoản">🗑️ Xóa</button>
                </div>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function filterUserMgmtList() {
  const qInput = document.getElementById("userMgmtSearchInput");
  const rInput = document.getElementById("userMgmtRoleFilter");
  const q = qInput ? qInput.value : "";
  const r = rInput ? rInput.value : "";
  renderUserManagementTable(q, r);
}

function openAddEditAccountModal(accId = null) {
  const modal = document.getElementById("addEditAccountModal");
  if (!modal) return;

  const acc = accId ? MASTER_DATA.staffList.find(s => s.id === accId) : null;
  const titleText = acc ? `✏️ CẬP NHẬT TÀI KHOẢN: ${acc.name} (${acc.id})` : "➕ THÊM TÀI KHOẢN NHÂN SỰ MỚI";

  const deptOptions = MASTER_DATA.departments.map(d => `
    <option value="${d}" ${acc && acc.dept === d ? 'selected' : ''}>${d}</option>
  `).join("");

  const titleOptions = MASTER_DATA.titles.map(t => `
    <option value="${t}" ${acc && acc.title === t ? 'selected' : ''}>${t}</option>
  `).join("");

  modal.querySelector(".modal-body").innerHTML = `
    <h4>${titleText}</h4>
    <form id="accountForm" onsubmit="event.preventDefault(); saveAccountForm('${accId || ''}');" style="display:flex; flex-direction:column; gap:12px; margin-top:15px;">
      
      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px;">
        <div>
          <label style="font-size:0.8rem; color:#cbd5e1;">Họ và Tên (*):</label>
          <input type="text" id="accName" value="${acc ? acc.name : ''}" required placeholder="Ví dụ: Nguyễn Văn A" class="input-text" style="width:100%;">
        </div>
        <div>
          <label style="font-size:0.8rem; color:#cbd5e1;">Gmail Đăng nhập (*):</label>
          <input type="email" id="accEmail" value="${acc ? acc.email : ''}" required placeholder="nhanvien@gmail.com" class="input-text" style="width:100%;">
        </div>
      </div>

      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px;">
        <div>
          <label style="font-size:0.8rem; color:#cbd5e1;">Mật Khẩu (*):</label>
          <input type="text" id="accPassword" value="${acc ? acc.password : '123456'}" required placeholder="Mật khẩu đăng nhập" class="input-text" style="width:100%;">
        </div>
        <div>
          <label style="font-size:0.8rem; color:#cbd5e1;">Số Điện Thoại:</label>
          <input type="text" id="accPhone" value="${acc ? acc.phone : ''}" placeholder="0908 123 456" class="input-text" style="width:100%;">
        </div>
      </div>

      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px;">
        <div>
          <label style="font-size:0.8rem; color:#cbd5e1;">Chức Vụ (*):</label>
          <select id="accTitle" class="input-text" style="width:100%;">
            ${titleOptions}
          </select>
        </div>
        <div>
          <label style="font-size:0.8rem; color:#cbd5e1;">Phòng Ban (*):</label>
          <select id="accDept" class="input-text" style="width:100%;">
            ${deptOptions}
          </select>
        </div>
      </div>

      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px;">
        <div>
          <label style="font-size:0.8rem; color:#cbd5e1;">Phân Quyền Vai Trò (RBAC):</label>
          <select id="accRole" class="input-text" style="width:100%;">
            <option value="leader" ${acc && acc.role === 'leader' ? 'selected' : ''}>👑 Lãnh Đạo BQL</option>
            <option value="secretary" ${acc && acc.role === 'secretary' ? 'selected' : ''}>📝 Thư Ký Giao Ban</option>
            <option value="team_lead" ${acc && acc.role === 'team_lead' ? 'selected' : ''}>👷 Đội Trưởng Giám Sát</option>
            <option value="inspector" ${acc && acc.role === 'inspector' ? 'selected' : ''}>🔍 Cán Bộ Giám Sát</option>
            <option value="internal_ops" ${acc && acc.role === 'internal_ops' ? 'selected' : ''}>🏛️ Nội Nghiệp & Hành Chính</option>
            <option value="admin" ${acc && acc.role === 'admin' ? 'selected' : ''}>⚙️ System Admin</option>
          </select>
        </div>
        <div>
          <label style="font-size:0.8rem; color:#cbd5e1;">Địa chỉ / Thông tin cá nhân:</label>
          <input type="text" id="accAddress" value="${acc ? (acc.address || '') : ''}" placeholder="Quận 1, TP. Hồ Chí Minh" class="input-text" style="width:100%;">
        </div>
      </div>

      <div>
        <label style="font-size:0.8rem; color:#cbd5e1;">Avatar Seed / URL:</label>
        <input type="text" id="accAvatar" value="${acc ? acc.avatar : ''}" placeholder="Tự động tạo avatar Dicebear nếu để trống" class="input-text" style="width:100%;">
      </div>

      <div style="display:flex; align-items:center; gap:8px; margin-top:5px;">
        <input type="checkbox" id="accGmailConnected" ${!acc || acc.gmailConnected ? 'checked' : ''}>
        <label for="accGmailConnected" style="font-size:0.85rem;">Kết nối Google OAuth2 / Gmail kích hoạt tự động</label>
      </div>

      <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:15px;">
        <button type="button" class="btn-outline" onclick="document.getElementById('addEditAccountModal').style.display='none'">Hủy</button>
        <button type="submit" class="btn-primary">💾 Lưu Tài Khoản</button>
      </div>
    </form>
  `;

  modal.style.display = "flex";
}

function saveAccountForm(accId = null) {
  const name = document.getElementById("accName").value.trim();
  const email = document.getElementById("accEmail").value.trim();
  const password = document.getElementById("accPassword").value.trim();
  const phone = document.getElementById("accPhone").value.trim();
  const title = document.getElementById("accTitle").value;
  const dept = document.getElementById("accDept").value;
  const role = document.getElementById("accRole").value;
  const address = document.getElementById("accAddress").value.trim();
  let avatar = document.getElementById("accAvatar").value.trim();
  const gmailConnected = document.getElementById("accGmailConnected").checked;

  if (!name || !email || !password) {
    alert("Vui lòng điền đầy đủ Họ tên, Gmail và Mật khẩu!");
    return;
  }

  if (!avatar) {
    avatar = `https://api.dicebear.com/7.x/avataaars/svg?seed=${email}`;
  }

  const formData = { name, email, password, phone, title, dept, role, address, avatar, gmailConnected };

  if (accId) {
    authEngine.updateAccount(accId, formData);
    showToast(`🟢 Đã cập nhật tài khoản ${name}!`);
  } else {
    authEngine.addAccount(formData);
    showToast(`🟢 Đã thêm tài khoản mới ${name}!`);
  }

  document.getElementById("addEditAccountModal").style.display = "none";
  renderUserManagementTable();
  renderUserHeader();
}

function quickChangePassword(accId) {
  const acc = MASTER_DATA.staffList.find(s => s.id === accId);
  if (!acc) return;
  const newPass = prompt(`🔑 Nhập mật khẩu mới cho tài khoản [${acc.name}]:`, acc.password);
  if (newPass && newPass.trim()) {
    authEngine.updateAccount(accId, { password: newPass.trim() });
    renderUserManagementTable();
    showToast(`🔑 Đã đổi mật khẩu cho ${acc.name} thành công!`);
  }
}

function toggleAccountLockStatus(accId) {
  const newStatus = authEngine.toggleAccountStatus(accId);
  renderUserManagementTable();
  showToast(newStatus === "locked" ? "🔒 Đã khóa tài khoản!" : "🔓 Đã mở khóa tài khoản!");
}

function toggleAccountGmailLink(accId) {
  const isLinked = authEngine.toggleGmailConnection(accId);
  renderUserManagementTable();
  showToast(isLinked ? "🟢 Đã bật kết nối Gmail OAuth2!" : "🔴 Đã ngắt kết nối Gmail!");
}

function deleteAccountItem(accId) {
  const acc = MASTER_DATA.staffList.find(s => s.id === accId);
  if (!acc) return;

  if (confirm(`⚠️ Bạn có chắc chắn muốn XÓA VĨNH VIỄN tài khoản [${acc.name}] (${acc.email}) khỏi hệ thống BQLDA?`)) {
    if (authEngine.deleteAccount(accId)) {
      renderUserManagementTable();
      renderUserHeader();
      showToast(`🗑️ Đã xóa vĩnh viễn tài khoản ${acc.name}!`);
    }
  }
}

// ==========================================
// 12. DEPARTMENT & TITLE MANAGEMENT MODALS
// ==========================================
let currentOrgViewMode = 'chart'; // 'chart', 'tree', 'classic'
let currentOrgDirection = 'vertical'; // 'vertical' or 'horizontal'
let currentOrgZoom = 1.0;
let isOrgFullscreen = false;
let draggedOrgNodeId = null;

function openDeptManagementModal() {
  const modal = document.getElementById("deptMgmtModal");
  if (!modal) return;

  renderDeptManagementList();
  modal.style.display = "flex";
}

function switchOrgViewMode(mode) {
  currentOrgViewMode = mode;
  renderDeptManagementList();
}

function switchOrgDirection(dir) {
  currentOrgDirection = dir;
  renderDeptManagementList();
}

function zoomInOrgChart() {
  if (currentOrgZoom < 2.0) {
    currentOrgZoom = parseFloat((currentOrgZoom + 0.15).toFixed(2));
    applyOrgChartZoom();
  }
}

function zoomOutOrgChart() {
  if (currentOrgZoom > 0.4) {
    currentOrgZoom = parseFloat((currentOrgZoom - 0.15).toFixed(2));
    applyOrgChartZoom();
  }
}

function resetOrgChartZoom() {
  currentOrgZoom = 1.0;
  applyOrgChartZoom();
}

function applyOrgChartZoom() {
  const stage = document.querySelector(".visual-org-chart-tree");
  const zoomDisplay = document.getElementById("zoomValDisplay");
  if (stage) {
    stage.style.transform = `scale(${currentOrgZoom})`;
    stage.style.transformOrigin = currentOrgDirection === 'vertical' ? 'top center' : 'top left';
  }
  if (zoomDisplay) {
    zoomDisplay.innerText = `${Math.round(currentOrgZoom * 100)}%`;
  }
}

function toggleOrgFullscreen() {
  isOrgFullscreen = !isOrgFullscreen;
  const modalContent = document.querySelector("#deptMgmtModal .modal-content");
  if (modalContent) {
    if (isOrgFullscreen) {
      modalContent.classList.add("org-modal-fullscreen");
    } else {
      modalContent.classList.remove("org-modal-fullscreen");
    }
  }
  const fsBtn = document.getElementById("btnToggleOrgFS");
  if (fsBtn) {
    fsBtn.innerHTML = isOrgFullscreen ? "🗗 Thu Nhỏ Màn Hình" : "🖥️ Toàn Màn Hình";
  }
}

function performOrgUndo() {
  if (authEngine.undoOrgState()) {
    renderDeptManagementList();
    renderUserManagementTable();
    showToast("↩️ Đã hoàn tác (Undo) thao tác vừa rồi!");
  }
}

function performOrgRedo() {
  if (authEngine.redoOrgState()) {
    renderDeptManagementList();
    renderUserManagementTable();
    showToast("↪️ Đã làm lại (Redo) thao tác vừa rồi!");
  }
}

// Global Keyboard Shortcuts for Undo (Ctrl+Z) & Redo (Ctrl+Y)
document.addEventListener("keydown", (e) => {
  const modal = document.getElementById("deptMgmtModal");
  if (modal && modal.style.display !== "none") {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      if (e.shiftKey) {
        e.preventDefault();
        performOrgRedo();
      } else {
        e.preventDefault();
        performOrgUndo();
      }
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
      e.preventDefault();
      performOrgRedo();
    }
  }
});

function renderDeptManagementList() {
  const container = document.getElementById("deptMgmtBody");
  if (!container) return;

  const lvlNames = MASTER_DATA.levelCustomNames;
  const canUndo = authEngine.canUndo();
  const canRedo = authEngine.canRedo();

  container.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:12px; background:rgba(15,23,42,0.7); padding:10px 14px; border-radius:12px; border:1px solid var(--glass-border);">
      
      <!-- Chế độ Xem Tabs & Undo/Redo -->
      <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
        
        <!-- Nút Back (Undo) / Forward (Redo) -->
        <div class="undo-redo-group" style="display:flex; background:#0f172a; padding:3px; border-radius:8px; border:1px solid var(--glass-border); gap:3px;">
          <button class="btn-xs ${canUndo ? 'btn-outline' : 'btn-disabled'}" ${canUndo ? '' : 'disabled'} title="Hoàn tác (Ctrl+Z)" onclick="performOrgUndo()">↩️ Undo (Back)</button>
          <button class="btn-xs ${canRedo ? 'btn-outline' : 'btn-disabled'}" ${canRedo ? '' : 'disabled'} title="Làm lại (Ctrl+Y)" onclick="performOrgRedo()">↪️ Redo (Forward)</button>
        </div>

        <div class="view-mode-tabs" style="display:flex; background:#0f172a; padding:3px; border-radius:8px; border:1px solid var(--glass-border);">
          <button class="btn-xs ${currentOrgViewMode === 'chart' ? 'btn-primary' : 'btn-outline'}" onclick="switchOrgViewMode('chart')">🌳 Sơ Đồ Đồ Họa (Drag & Drop)</button>
          <button class="btn-xs ${currentOrgViewMode === 'tree' ? 'btn-primary' : 'btn-outline'}" onclick="switchOrgViewMode('tree')">📋 Danh Sách Cấu Trúc</button>
          <button class="btn-xs ${currentOrgViewMode === 'classic' ? 'btn-primary' : 'btn-outline'}" onclick="switchOrgViewMode('classic')">🏢 Thẻ Căn Bản Ban Đầu</button>
        </div>

        <!-- Hướng Dọc / Ngang -->
        ${currentOrgViewMode === 'chart' ? `
          <div class="direction-mode-tabs" style="display:flex; background:#0f172a; padding:3px; border-radius:8px; border:1px solid var(--glass-border);">
            <button class="btn-xs ${currentOrgDirection === 'vertical' ? 'btn-primary' : 'btn-outline'}" onclick="switchOrgDirection('vertical')">⏬ Sơ Đồ Dọc</button>
            <button class="btn-xs ${currentOrgDirection === 'horizontal' ? 'btn-primary' : 'btn-outline'}" onclick="switchOrgDirection('horizontal')">⏩ Sơ Đồ Ngang</button>
          </div>

          <!-- Bộ Phóng To Thu Nhỏ Zoom & Fullscreen -->
          <div style="display:flex; align-items:center; gap:4px; background:#0f172a; padding:3px 8px; border-radius:8px; border:1px solid var(--glass-border);">
            <button class="btn-xs btn-outline" title="Thu nhỏ" onclick="zoomOutOrgChart()">🔍 -</button>
            <span id="zoomValDisplay" style="font-size:0.75rem; font-weight:600; min-width:42px; text-align:center; color:#60a5fa;">${Math.round(currentOrgZoom * 100)}%</span>
            <button class="btn-xs btn-outline" title="Phóng to" onclick="zoomInOrgChart()">🔍 +</button>
            <button class="btn-xs btn-outline" title="Đặt lại 100%" onclick="resetOrgChartZoom()">🔄 100%</button>
          </div>

          <button id="btnToggleOrgFS" class="btn-xs btn-outline" onclick="toggleOrgFullscreen()">
            ${isOrgFullscreen ? '🗗 Thu Nhỏ Màn Hình' : '🖥️ Toàn Màn Hình'}
          </button>
        ` : ''}

        <button class="btn-outline btn-xs" onclick="openLevelNamingModal()">🏷️ Tùy Đặt Tên Các Cấp</button>
      </div>

      <!-- Ô thêm Cấp 1 -->
      <div style="display:flex; gap:8px; flex:1; max-width:320px;">
        <input type="text" id="newRootOrgInput" placeholder="Nhập tên ${lvlNames[1] || 'Cấp 1'} mới..." class="input-text" style="flex:1;">
        <button class="btn-primary btn-sm" onclick="addNewRootOrgNode()">🏢 Thêm Cấp 1</button>
      </div>
    </div>

    <div style="font-size:0.82rem; color:#94a3b8; margin-bottom:10px; display:flex; justify-content:space-between; align-items:center;">
      <span>💡 <strong>Mẹo:</strong> Dùng nút <strong>🔍 Zoom In/Out</strong> hoặc lăn chuột để phóng to thu nhỏ. Bấm <strong>🖥️ Toàn Màn Hình</strong> để mở rộng 100% màn hình!</span>
      <span style="color:#60a5fa;">Cơ cấu: 🏢 <strong>${lvlNames[1]}</strong> ➔ 🏬 <strong>${lvlNames[2]}</strong> ➔ 👷 <strong>${lvlNames[3]}</strong></span>
    </div>

    <div class="org-tree-stage" style="max-height:${isOrgFullscreen ? '85vh' : '65vh'}; overflow:auto; padding:20px; background:rgba(10, 16, 31, 0.95); border-radius:12px; border:1px solid var(--glass-border);">
      ${currentOrgViewMode === 'chart' 
        ? renderVisualOrgChartDiagram(MASTER_DATA.orgStructure) 
        : (currentOrgViewMode === 'tree' ? renderOrgTreeHTML(MASTER_DATA.orgStructure) : renderClassicDeptList())}
    </div>
  `;

  if (currentOrgViewMode === 'chart') {
    setTimeout(applyOrgChartZoom, 50);
  }
}

/* ====================================================
   CLASSIC CARD LIST RENDERER (THẺ CĂN BẢN BAN ĐẦU)
   ==================================================== */
function renderClassicDeptList() {
  if (!MASTER_DATA.departments || MASTER_DATA.departments.length === 0) {
    return '<em style="color:#94a3b8; padding:10px; display:block;">Chưa có danh mục phòng ban nào.</em>';
  }

  return `
    <div style="display:flex; flex-direction:column; gap:10px; max-width:900px; margin:0 auto;">
      <h4 style="color:#60a5fa; margin-bottom:5px;">🏢 DANH SÁCH THẺ PHÒNG BAN & BỘ PHẬN CĂN BẢN BAN ĐẦU</h4>
      ${MASTER_DATA.departments.map(d => `
        <div style="display:flex; justify-content:space-between; align-items:center; background:#1e293b; padding:12px 16px; border-radius:10px; border:1px solid var(--glass-border); border-left:4px solid #3b82f6;">
          <div style="display:flex; align-items:center; gap:10px;">
            <span style="font-size:1.2rem;">🏢</span>
            <strong style="font-size:0.92rem; color:#f8fafc;">${d}</strong>
          </div>
          <div style="display:flex; gap:6px;">
            <button class="btn-xs btn-outline" onclick="editClassicDeptItem('${d.replace(/'/g, "\\'")}')">✏️ Sửa Tên</button>
            <button class="btn-xs btn-danger" onclick="deleteClassicDeptItem('${d.replace(/'/g, "\\'")}')">🗑️ Xóa</button>
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

function editClassicDeptItem(oldDept) {
  const newDept = prompt(`✏️ Sửa tên Phòng ban/Bộ phận [${oldDept}]:`, oldDept);
  if (newDept && newDept.trim()) {
    const idx = MASTER_DATA.departments.indexOf(oldDept);
    if (idx !== -1) {
      MASTER_DATA.departments[idx] = newDept.trim();
      authEngine.saveDeptsAndTitles();
      renderDeptManagementList();
      renderUserManagementTable();
      showToast(`✏️ Đã đổi tên phòng ban thành: ${newDept.trim()}`);
    }
  }
}

function deleteClassicDeptItem(deptName) {
  if (confirm(`⚠️ Bạn có chắc chắn muốn xóa phòng ban [${deptName}]?`)) {
    MASTER_DATA.departments = MASTER_DATA.departments.filter(d => d !== deptName);
    authEngine.saveDeptsAndTitles();
    renderDeptManagementList();
    renderUserManagementTable();
    showToast(`🗑️ Đã xóa phòng ban ${deptName}!`);
  }
}

/* ====================================================
   VISUAL ORG CHART DIAGRAM RENDERER (SƠ ĐỒ CÂY ĐỒ HỌA DỌC / NGANG)
   ==================================================== */
function renderVisualOrgChartDiagram(nodes) {
  if (!nodes || nodes.length === 0) {
    return `
      <div style="text-align:center; padding:40px; color:#94a3b8;">
        <div style="font-size:3rem; margin-bottom:10px;">🌳</div>
        <p>Chưa có Sơ đồ tổ chức nào. Hãy thêm Đơn vị Cấp 1 ở thanh công cụ phía trên!</p>
      </div>
    `;
  }

  const lvlNames = MASTER_DATA.levelCustomNames;

  const renderNodeChartCard = (node) => {
    const levelIcons = { 1: "🏢", 2: "🏬", 3: "👷", 4: "👥", 5: "📌" };
    const icon = levelIcons[node.level] || "📁";
    const label = lvlNames[node.level] || `Cấp ${node.level}`;
    const staffCount = MASTER_DATA.staffList.filter(s => s.dept && s.dept.includes(node.name)).length;

    let childrenChartHTML = "";
    if (node.children && node.children.length > 0) {
      childrenChartHTML = `
        <div class="chart-children-connector"></div>
        <div class="chart-children-container">
          ${node.children.map(child => renderNodeChartCard(child)).join("")}
        </div>
      `;
    }

    return `
      <div class="chart-node-wrapper level-${node.level}"
           onselectstart="return false;"
           ondragover="handleOrgDragOver(event)"
           ondrop="handleOrgDrop(event, '${node.id}')"
           ondragleave="handleOrgDragLeave(event)">
        
        <div class="chart-node-card level-card-${node.level}" 
             id="orgCard_${node.id}"
             draggable="true" 
             ondragstart="handleOrgDragStart(event, '${node.id}')"
             ondragend="handleOrgDragEnd(event)">
          
          <div class="chart-card-header">
            <span class="drag-handle" title="Kéo thả di chuyển đơn vị">🖐️ Drag</span>
            <span class="org-level-badge level-badge-${node.level}">${label}</span>
          </div>

          <div class="chart-card-body">
            <div class="chart-card-title">
              <span class="chart-node-icon">${icon}</span>
              <strong>${node.name}</strong>
            </div>
            <div class="chart-card-meta">
              <span>👥 ${staffCount} Nhân sự</span>
            </div>
          </div>

          <div class="chart-card-actions">
            ${node.level < 5 ? `<button class="btn-xs btn-primary" title="Thêm cấp con" onclick="addOrgSubNode('${node.id}', ${node.level})">➕ Thêm Con</button>` : ''}
            <button class="btn-xs btn-outline" title="Sửa tên" onclick="editOrgNode('${node.id}', '${node.name.replace(/'/g, "\\'")}')">✏️ Sửa</button>
            <button class="btn-xs btn-danger" title="Xóa đơn vị" onclick="deleteOrgNodeItem('${node.id}', '${node.name.replace(/'/g, "\\'")}')">🗑️ Xóa</button>
          </div>
        </div>

        ${childrenChartHTML}
      </div>
    `;
  };

  return `
    <div class="visual-org-chart-tree tree-direction-${currentOrgDirection}">
      ${nodes.map(n => renderNodeChartCard(n)).join("")}
    </div>
  `;
}

/* DRAG AND DROP HANDLERS */
function handleOrgDragStart(event, nodeId) {
  draggedOrgNodeId = nodeId;
  event.dataTransfer.setData("text/plain", nodeId);
  event.currentTarget.classList.add("is-dragging");
}

function handleOrgDragOver(event) {
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  const card = event.currentTarget.querySelector(".chart-node-card");
  if (card) card.classList.add("drag-over");
}

function handleOrgDragLeave(event) {
  const card = event.currentTarget.querySelector(".chart-node-card");
  if (card) card.classList.remove("drag-over");
}

function handleOrgDragEnd(event) {
  document.querySelectorAll(".chart-node-card").forEach(c => {
    c.classList.remove("is-dragging", "drag-over");
  });
}

function handleOrgDrop(event, targetParentId) {
  event.preventDefault();
  event.stopPropagation();
  
  document.querySelectorAll(".chart-node-card").forEach(c => {
    c.classList.remove("drag-over", "is-dragging");
  });

  if (draggedOrgNodeId && draggedOrgNodeId !== targetParentId) {
    if (authEngine.moveOrgNode(draggedOrgNodeId, targetParentId)) {
      renderDeptManagementList();
      renderUserManagementTable();
      showToast("✨ Đã di chuyển đơn vị tổ chức thành công!");
    }
  }
  draggedOrgNodeId = null;
}

function renderOrgTreeHTML(nodes) {
  if (!nodes || nodes.length === 0) return '<em style="color:#94a3b8; padding:10px; display:block;">Chưa có đơn vị nào. Hãy tạo Ban QLDA Cấp 1!</em>';

  const lvlNames = MASTER_DATA.levelCustomNames;

  return nodes.map(node => {
    const levelIcons = { 1: "🏢", 2: "🏬", 3: "👷", 4: "👥", 5: "📌" };
    const icon = levelIcons[node.level] || "📁";
    const label = lvlNames[node.level] || `Cấp ${node.level}`;
    const indent = (node.level - 1) * 20;

    let childrenHTML = "";
    if (node.children && node.children.length > 0) {
      childrenHTML = renderOrgTreeHTML(node.children);
    }

    return `
      <div class="org-tree-node level-${node.level}" style="margin-left: ${indent}px; margin-bottom: 6px;">
        <div class="org-node-card">
          <div class="org-node-info">
            <span class="org-icon">${icon}</span>
            <strong class="org-name">${node.name}</strong>
            <span class="org-level-badge level-badge-${node.level}">${label}</span>
          </div>
          <div class="org-node-actions">
            ${node.level < 5 ? `<button class="btn-xs btn-primary" onclick="addOrgSubNode('${node.id}', ${node.level})">➕ Thêm ${lvlNames[node.level + 1] || ('Cấp ' + (node.level + 1))}</button>` : ''}
            <button class="btn-xs btn-outline" onclick="editOrgNode('${node.id}', '${node.name.replace(/'/g, "\\'")}')">✏️ Sửa Tên</button>
            <button class="btn-xs btn-danger" onclick="deleteOrgNodeItem('${node.id}', '${node.name.replace(/'/g, "\\'")}')">🗑️ Xóa</button>
          </div>
        </div>
        ${childrenHTML}
      </div>
    `;
  }).join("");
}

function addNewRootOrgNode() {
  const input = document.getElementById("newRootOrgInput");
  if (input && input.value.trim()) {
    authEngine.addOrgNode(null, input.value.trim(), 1);
    renderDeptManagementList();
    renderUserManagementTable();
    showToast(`🏢 Đã thêm Đơn vị Cấp 1: ${input.value.trim()}`);
  }
}

function addOrgSubNode(parentId, currentLevel) {
  const nextLevel = currentLevel + 1;
  const lvlNames = MASTER_DATA.levelCustomNames;
  const promptText = `Nhập tên ${lvlNames[nextLevel] || ('Cấp ' + nextLevel)} mới:`;
  const name = prompt(promptText);

  if (name && name.trim()) {
    authEngine.addOrgNode(parentId, name.trim(), nextLevel);
    renderDeptManagementList();
    renderUserManagementTable();
    showToast(`✨ Đã thêm cấp con mới: ${name.trim()}`);
  }
}

function editOrgNode(nodeId, currentName) {
  const newName = prompt("✏️ Sửa tên đơn vị (Ban/Phòng/Tổ/Đội):", currentName);
  if (newName && newName.trim()) {
    authEngine.updateOrgNode(nodeId, newName.trim());
    renderDeptManagementList();
    renderUserManagementTable();
    showToast(`✏️ Đã cập nhật tên đơn vị: ${newName.trim()}`);
  }
}

function deleteOrgNodeItem(nodeId, nodeName) {
  if (confirm(`⚠️ Bạn có chắc chắn muốn XÓA [${nodeName}] và toàn bộ các cấp con bên trong?`)) {
    authEngine.deleteOrgNode(nodeId);
    renderDeptManagementList();
    renderUserManagementTable();
    showToast(`🗑️ Đã xóa đơn vị ${nodeName}!`);
  }
}

function openLevelNamingModal() {
  const modal = document.getElementById("levelNamingModal");
  if (!modal) return;

  const lvlNames = MASTER_DATA.levelCustomNames;

  modal.querySelector(".modal-body").innerHTML = `
    <h4>🏷️ TỰ ĐẶT TÊN CÁC CẤP SƠ ĐỒ THEO NHU CẦU DỰ ÁN</h4>
    <p style="font-size:0.8rem; color:#cbd5e1; margin-bottom:12px;">Bạn có thể tùy ý thay đổi nhãn gọi tên của các Cấp trong Sơ đồ tổ chức (Ví dụ: Tập đoàn, Dự án, Ban QLDA, Phòng Ban, Tổ Đội...):</p>
    
    <div style="display:flex; flex-direction:column; gap:10px;">
      <div>
        <label style="font-size:0.8rem; color:#60a5fa;">Tên Cấp 1 (Ví dụ: Dự Án / Ban QLDA / Tập Đoàn):</label>
        <input type="text" id="lvlName1" value="${lvlNames[1] || ''}" class="input-text" style="width:100%;">
      </div>
      <div>
        <label style="font-size:0.8rem; color:#c084fc;">Tên Cấp 2 (Ví dụ: Bộ Phận / Phòng Ban / Khối):</label>
        <input type="text" id="lvlName2" value="${lvlNames[2] || ''}" class="input-text" style="width:100%;">
      </div>
      <div>
        <label style="font-size:0.8rem; color:#6ee7b7;">Tên Cấp 3 (Ví dụ: Tổ / Đội Phụ Trách / Nhóm):</label>
        <input type="text" id="lvlName3" value="${lvlNames[3] || ''}" class="input-text" style="width:100%;">
      </div>
      <div>
        <label style="font-size:0.8rem; color:#fef08a;">Tên Cấp 4 (Ví dụ: Nhóm Chuyên Môn / Phân Khu):</label>
        <input type="text" id="lvlName4" value="${lvlNames[4] || ''}" class="input-text" style="width:100%;">
      </div>
      <div>
        <label style="font-size:0.8rem; color:#fca5a5;">Tên Cấp 5 (Ví dụ: Mũi Thi Công / Đội Giám Sát):</label>
        <input type="text" id="lvlName5" value="${lvlNames[5] || ''}" class="input-text" style="width:100%;">
      </div>
    </div>

    <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:15px;">
      <button class="btn-outline" onclick="document.getElementById('levelNamingModal').style.display='none'">Hủy</button>
      <button class="btn-primary" onclick="saveLevelCustomNamesForm()">💾 Lưu Tên Cấp Sơ Đồ</button>
    </div>
  `;

  modal.style.display = "flex";
}

function saveLevelCustomNamesForm() {
  const n1 = document.getElementById("lvlName1").value;
  const n2 = document.getElementById("lvlName2").value;
  const n3 = document.getElementById("lvlName3").value;
  const n4 = document.getElementById("lvlName4").value;
  const n5 = document.getElementById("lvlName5").value;

  if (n1) authEngine.updateLevelCustomName(1, n1);
  if (n2) authEngine.updateLevelCustomName(2, n2);
  if (n3) authEngine.updateLevelCustomName(3, n3);
  if (n4) authEngine.updateLevelCustomName(4, n4);
  if (n5) authEngine.updateLevelCustomName(5, n5);

  document.getElementById("levelNamingModal").style.display = "none";
  renderDeptManagementList();
  showToast("🏷️ Đã lưu tên các cấp Sơ đồ Tổ chức!");
}

// ==========================================
// 13. TITLE MANAGEMENT MODAL WITH EDIT
// ==========================================
function openTitleManagementModal() {
  const modal = document.getElementById("titleMgmtModal");
  if (!modal) return;

  renderTitleManagementList();
  modal.style.display = "flex";
}

function renderTitleManagementList() {
  const container = document.getElementById("titleMgmtBody");
  if (!container) return;

  container.innerHTML = `
    <div style="display:flex; gap:10px; margin-bottom:15px;">
      <input type="text" id="newTitleInput" placeholder="Nhập tên Chức Danh mới..." class="input-text" style="flex:1;">
      <button class="btn-primary" onclick="addNewTitle()">➕ Thêm Chức Danh</button>
    </div>
    <div style="display:flex; flex-direction:column; gap:8px; max-height:50vh; overflow-y:auto;">
      ${MASTER_DATA.titles.map(t => `
        <div style="display:flex; justify-content:space-between; align-items:center; background:#1e293b; padding:10px 14px; border-radius:8px;">
          <strong>💼 ${t}</strong>
          <div style="display:flex; gap:4px;">
            <button class="btn-xs btn-outline" onclick="editTitleItem('${t.replace(/'/g, "\\'")}')">✏️ Sửa Tên</button>
            <button class="btn-xs btn-danger" onclick="deleteTitleItem('${t.replace(/'/g, "\\'")}')">🗑️ Xóa</button>
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

function addNewTitle() {
  const input = document.getElementById("newTitleInput");
  if (input && input.value.trim()) {
    authEngine.addTitle(input.value.trim());
    renderTitleManagementList();
    renderUserManagementTable();
    showToast(`💼 Đã thêm chức danh mới: ${input.value.trim()}`);
  }
}

function editTitleItem(oldTitle) {
  const newTitle = prompt(`✏️ Sửa tên Chức danh [${oldTitle}]:`, oldTitle);
  if (newTitle && newTitle.trim()) {
    authEngine.updateTitle(oldTitle, newTitle.trim());
    renderTitleManagementList();
    renderUserManagementTable();
    showToast(`✏️ Đã đổi tên chức danh thành: ${newTitle.trim()}`);
  }
}

function deleteTitleItem(titleName) {
  if (confirm(`⚠️ Bạn có chắc chắn muốn xóa chức danh [${titleName}]?`)) {
    authEngine.deleteTitle(titleName);
    renderTitleManagementList();
    renderUserManagementTable();
    showToast(`🗑️ Đã xóa chức danh ${titleName}!`);
  }
}

// ====================================================
// GOOGLE DRIVE CLOUD MULTI-ACCOUNT & MAPPING ENGINE
// ====================================================
function openDriveMappingModal(subsystemKey = 'design') {
  const modal = document.getElementById("driveCloudMappingModal");
  const body = document.getElementById("driveCloudMappingModalBody");
  if (!modal || !body) return;

  const mapping = MASTER_DATA.subsystemDriveMappings[subsystemKey] || MASTER_DATA.subsystemDriveMappings.design;

  body.innerHTML = `
    <div style="margin-bottom:20px;">
      <h4 style="color:#facc15; margin-bottom:6px;">1. KẾT NỐI DANH SÁCH TÀI KHOẢN GOOGLE DRIVE (MULTI-ACCOUNT)</h4>
      <p style="font-size:0.8rem; color:#cbd5e1;">Bạn có thể liên kết nhiều tài khoản Google Drive khác nhau (ví dụ: Gmail cá nhân, Gmail Ban QLDA, Gmail Thiết Kế...):</p>
      
      <div style="display:flex; flex-direction:column; gap:8px; margin-top:10px;">
        ${MASTER_DATA.driveAccounts.map(acc => `
          <div style="display:flex; justify-content:space-between; align-items:center; background:#1e293b; padding:10px 14px; border-radius:8px; border:1px solid var(--glass-border);">
            <div style="display:flex; align-items:center; gap:10px;">
              <span style="font-size:1.2rem;">📧</span>
              <div>
                <strong style="color:#f8fafc; font-size:0.9rem;">${acc.email}</strong>
                <div style="font-size:0.75rem; color:#94a3b8;">${acc.owner} • Dung lượng: ${acc.storage}</div>
              </div>
            </div>
            <span class="badge badge-success">Đã kết nối</span>
          </div>
        `).join("")}
      </div>
      <button class="btn-sm btn-outline" onclick="addNewDriveAccount()" style="margin-top:10px;">➕ Kết Nối Tài Khoản Google Drive Mới</button>
    </div>

    <div style="border-top:1px dashed rgba(255,255,255,0.1); padding-top:16px;">
      <h4 style="color:#60a5fa; margin-bottom:6px;">2. PHÂN CÔNG KHO THƯ MỤC GOOGLE DRIVE CHO PHÂN HỆ [${subsystemKey.toUpperCase()}]</h4>
      <p style="font-size:0.8rem; color:#cbd5e1;">Chọn tài khoản Google và trỏ đến thư mục chứa dữ liệu tương ứng trên Cloud Drive:</p>
      
      <div style="display:flex; flex-direction:column; gap:12px; margin-top:12px;">
        <div>
          <label style="font-size:0.8rem; color:#f8fafc;">Tài khoản Google Drive phụ trách:</label>
          <select id="mapDriveAccountSelect" class="input-text" style="width:100%; margin-top:4px;">
            ${MASTER_DATA.driveAccounts.map(a => `
              <option value="${a.id}" ${a.id === mapping.accountId ? 'selected' : ''}>${a.email} (${a.owner})</option>
            `).join("")}
          </select>
        </div>

        <div>
          <label style="font-size:0.8rem; color:#f8fafc;">Đường dẫn Thư mục Kho Google Drive (Path / Folder ID):</label>
          <input type="text" id="mapDriveFolderPathInput" class="input-text" value="${mapping.folderPath}" style="width:100%; margin-top:4px;">
        </div>
      </div>
    </div>

    <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:20px;">
      <button class="btn-outline" onclick="document.getElementById('driveCloudMappingModal').style.display='none'">Hủy</button>
      <button class="btn-primary" onclick="saveDriveMappingForm('${subsystemKey}')">💾 Lưu Cấu Hình Kho Drive</button>
    </div>
  `;

  modal.style.display = "flex";
}

function addNewDriveAccount() {
  const email = prompt("📧 Nhập địa chỉ Gmail / Google Workspace cần kết nối Google Drive:");
  if (email && email.trim()) {
    const owner = prompt("👤 Nhập tên mô tả chủ sở hữu (Ví dụ: Kho Bản Vẽ KTS / Kho HSMT):", "Kho Google Drive BQL");
    const newAcc = {
      id: "ACC-" + Date.now(),
      email: email.trim(),
      owner: owner ? owner.trim() : "Kho Google Drive BQL",
      storage: "0.1 GB / 100 GB",
      status: "active"
    };
    MASTER_DATA.driveAccounts.push(newAcc);
    showToast(`☁️ Đã liên kết tài khoản Google Drive [${email.trim()}]!`);
    openDriveMappingModal();
  }
}

function saveDriveMappingForm(subsystemKey) {
  const accId = document.getElementById("mapDriveAccountSelect").value;
  const path = document.getElementById("mapDriveFolderPathInput").value;

  if (MASTER_DATA.subsystemDriveMappings[subsystemKey]) {
    MASTER_DATA.subsystemDriveMappings[subsystemKey].accountId = accId;
    MASTER_DATA.subsystemDriveMappings[subsystemKey].folderPath = path.trim();
    MASTER_DATA.subsystemDriveMappings[subsystemKey].lastScanned = new Date().toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" });
  }

  document.getElementById("driveCloudMappingModal").style.display = "none";
  renderDataManagementModule();
  showToast(`☁️ Đã lưu cấu hình kết nối Google Drive cho Phân hệ ${subsystemKey.toUpperCase()}!`);
}

// ====================================================
// ADMIN CUSTOM EXTRACT FIELDS CONFIGURATOR ENGINE
// ====================================================
function openDesignScannerFieldsModal() {
  const modal = document.getElementById("designScannerFieldsModal");
  const body = document.getElementById("designScannerFieldsModalBody");
  if (!modal || !body) return;

  const fields = MASTER_DATA.subsystemDriveMappings.design.customFields;

  body.innerHTML = `
    <p style="font-size:0.8rem; color:#cbd5e1; margin-bottom:12px;">Admin có thể tích chọn hoặc thêm mới các thuộc tính/thông tin mà hệ thống sẽ tự động quét và bóc tách từ thư mục Google Drive của Phân hệ Thiết kế:</p>

    <div style="display:flex; flex-direction:column; gap:8px; max-height:280px; overflow-y:auto; margin-bottom:16px;">
      ${fields.map(f => `
        <label style="display:flex; justify-content:space-between; align-items:center; background:#1e293b; padding:10px 14px; border-radius:8px; cursor:pointer; border:1px solid var(--glass-border);">
          <div style="display:flex; align-items:center; gap:10px;">
            <input type="checkbox" onchange="toggleDesignField('${f.id}')" ${f.active ? 'checked' : ''} style="width:18px; height:18px; cursor:pointer;">
            <strong style="font-size:0.88rem; color:#f8fafc;">${f.label}</strong>
          </div>
          <span class="badge ${f.type === 'system' ? 'badge-info' : 'badge-warning'}">${f.type === 'system' ? 'Mặc định' : 'Tùy biến Admin'}</span>
        </label>
      `).join("")}
    </div>

    <div style="display:flex; gap:10px; margin-bottom:16px;">
      <input type="text" id="newCustomFieldNameInput" class="input-text" placeholder="Thêm thuộc tính mới (Ví dụ: Đơn vị tư vấn TK, Giai đoạn TKTK...)..." style="flex:1;">
      <button class="btn-primary" onclick="addNewCustomDesignField()">➕ Thêm Thuộc Tính</button>
    </div>

    <div style="display:flex; justify-content:flex-end;">
      <button class="btn-primary" onclick="document.getElementById('designScannerFieldsModal').style.display='none'; renderDataManagementModule();">💾 Hoàn Tất Cài Đặt</button>
    </div>
  `;

  modal.style.display = "flex";
}

function toggleDesignField(fieldId) {
  const field = MASTER_DATA.subsystemDriveMappings.design.customFields.find(f => f.id === fieldId);
  if (field) {
    field.active = !field.active;
    renderDataManagementModule();
  }
}

function addNewCustomDesignField() {
  const input = document.getElementById("newCustomFieldNameInput");
  if (!input || !input.value.trim()) return;

  const name = input.value.trim();
  const id = "field_" + Date.now();

  MASTER_DATA.subsystemDriveMappings.design.customFields.push({
    id: id,
    label: name,
    active: true,
    type: "custom"
  });

  input.value = "";
  openDesignScannerFieldsModal();
  renderDataManagementModule();
  showToast(`⚙️ Đã thêm thuộc tính quét mới: [${name}]`);
}

async function scanDesignDriveFolder() {
  const mapping = MASTER_DATA.subsystemDriveMappings.design;
  const accId = mapping.accountId;
  const folderId = mapping.folderId || 'root';

  showToast("🔍 AI đang tự động kết nối Google Drive & quét toàn bộ cấp thư mục...");

  if (window.DriveEngine && DriveEngine.isConnected(accId) && folderId) {
    try {
      const files = await DriveEngine.listFiles(accId, folderId);
      if (files && files.length > 0) {
        const dwgPdfFiles = files.map(f => ({
          name: f.name,
          size: f.size ? (parseInt(f.size, 10) / (1024 * 1024)).toFixed(1) + " MB" : "Tệp/Thư mục",
          date: f.modifiedTime ? f.modifiedTime.replace('T', ' ').substring(0, 16) : new Date().toLocaleDateString()
        }));

        MASTER_DATA.designScannedFolders = [
          {
            id: "SCAN-DRIVE-" + Date.now(),
            level: 1,
            levelBadge: "Cấp 1 (Google Drive Live)",
            folderName: mapping.folderPath || "Kho Google Drive Realtime",
            releaseDate: new Date().toISOString().substring(0, 10),
            cadCode: "CAD-LIVE-" + Math.floor(1000 + Math.random() * 9000),
            revision: "Rev.01 (Live)",
            author: "Google Drive OAuth Sync",
            filePath: mapping.folderPath || "Google Drive Live",
            files: dwgPdfFiles,
            status: "Approved",
            aiSummary: `Đã tự động quét thành công ${files.length} tệp/thư mục từ Google Drive thật.`
          }
        ];
      }
    } catch (e) {
      console.warn("Real Drive API scan warning:", e.message);
    }
  }

  MASTER_DATA.subsystemDriveMappings.design.lastScanned = new Date().toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" });
  if (window.DriveEngine) DriveEngine.saveMappings();
  renderDataManagementModule();
  showToast("🟢 Đã quét và tổng hợp xong dữ liệu HSTK từ Google Drive!");
}


