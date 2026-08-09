/**
 * MASTER DATA & SYSTEM STATE MANAGEMENT
 * BQLDA Enterprise All-in-One Platform
 */

const MASTER_DATA = {
  // Custom Level Names Configuration (User can rename levels freely)
  levelCustomNames: {
    1: "Cấp 1: Ban QLDA / Dự Án",
    2: "Cấp 2: Bộ Phận / Phòng Ban",
    3: "Cấp 3: Tổ / Đội Phụ Trách",
    4: "Cấp 4: Nhóm Chuyên Môn",
    5: "Cấp 5: Phân Khu Thi Công"
  },

  // Master Organizational Hierarchy Tree (Multi-level Departments & Teams)
  orgStructure: [
    {
      id: "ORG-100",
      name: "BQLXD Vinhomes Đan Phượng",
      level: 1,
      children: [
        {
          id: "ORG-110",
          name: "Bộ Phận Giám Sát Hiện Trường",
          level: 2,
          children: [
            { id: "ORG-111", name: "Đội Giám Sát Khối TTTM (Tầng 1 & L2)", level: 3 },
            { id: "ORG-112", name: "Đội Giám Sát Phân Khu Thấp Tầng SB5", level: 3 },
            { id: "ORG-113", name: "Tổ Thi Công Hạ Tầng Kỹ Thuật D1", level: 3 }
          ]
        },
        {
          id: "ORG-120",
          name: "Bộ Phận Nội Nghiệp & HSMT",
          level: 2,
          children: [
            { id: "ORG-121", name: "Tổ Thẩm Định HSMT & Hợp Đồng", level: 3 },
            { id: "ORG-122", name: "Tổ Bóc Tách Khối Lượng & Báo Cáo Giải Trình", level: 3 }
          ]
        },
        {
          id: "ORG-130",
          name: "Bộ Phận Cơ Điện (M&E)",
          level: 2,
          children: [
            { id: "ORG-131", name: "Tổ Nghiệm Thu Trạm Biến Áp & PCCC", level: 3 }
          ]
        },
        {
          id: "ORG-140",
          name: "Bộ Phận Hành Chính - Tổng Hợp",
          level: 2,
          children: [
            { id: "ORG-141", name: "Tổ Văn Thư Công Văn & Giao Ban Sáng", level: 3 }
          ]
        }
      ]
    }
  ],

  // Department paths flat list
  departments: [
    "BQLXD Vinhomes Đan Phượng",
    "BQLXD Vinhomes Đan Phượng ➔ Bộ Phận Giám Sát Hiện Trường",
    "BQLXD Vinhomes Đan Phượng ➔ Bộ Phận Giám Sát Hiện Trường ➔ Đội Giám Sát Khối TTTM (Tầng 1 & L2)",
    "BQLXD Vinhomes Đan Phượng ➔ Bộ Phận Giám Sát Hiện Trường ➔ Đội Giám Sát Phân Khu Thấp Tầng SB5",
    "BQLXD Vinhomes Đan Phượng ➔ Bộ Phận Nội Nghiệp & HSMT",
    "BQLXD Vinhomes Đan Phượng ➔ Bộ Phận Cơ Điện (M&E)",
    "BQLXD Vinhomes Đan Phượng ➔ Bộ Phận Hành Chính - Tổng Hợp"
  ],

  // Master Titles / Positions List
  titles: [
    "Trưởng Ban QLDA",
    "Phó Ban QLDA",
    "Thư ký Tổng hợp Giao ban",
    "Đội trưởng Giám sát TMB",
    "CBGS Xây dựng",
    "CBGS Điện Nước (M&E)",
    "Cán bộ Nội nghiệp & HSMT",
    "System Admin Studio"
  ],

  // Staff Directory (~60 personnel mapped to Gmail, Password, Phone, Avatar & RBAC roles)
  staffList: [
    {
      id: "NV001",
      name: "Nguyễn Văn Lãnh Đạo",
      email: "lanhdao.bql@gmail.com",
      password: "123",
      phone: "0912 345 678",
      role: "leader",
      title: "Trưởng Ban QLDA",
      dept: "BQLXD Vinhomes Đan Phượng",
      avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=lanhdao",
      gmailConnected: true,
      address: "Quận 1, TP. Hồ Chí Minh",
      status: "active"
    },
    {
      id: "NV002",
      name: "Trần Thị Thư Ký",
      email: "thukybql@gmail.com",
      password: "123",
      phone: "0908 765 432",
      role: "secretary",
      title: "Thư ký Tổng hợp Giao ban",
      dept: "BQLXD Vinhomes Đan Phượng ➔ Bộ Phận Hành Chính - Tổng Hợp",
      avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=thuky",
      gmailConnected: true,
      address: "Quận 3, TP. Hồ Chí Minh",
      status: "active"
    },
    {
      id: "NV003",
      name: "Lê Văn Đội Trưởng",
      email: "doitruong.gs@gmail.com",
      password: "123",
      phone: "0934 112 233",
      role: "team_lead",
      title: "Đội trưởng Giám sát TMB",
      dept: "BQLXD Vinhomes Đan Phượng ➔ Bộ Phận Giám Sát Hiện Trường",
      avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=doitruong",
      gmailConnected: true,
      address: "Quận 7, TP. Hồ Chí Minh",
      status: "active"
    },
    {
      id: "NV004",
      name: "Phạm Văn Giám Sát",
      email: "cbgs.xaydung@gmail.com",
      password: "123",
      phone: "0977 445 566",
      role: "inspector",
      title: "CBGS Xây dựng",
      dept: "BQLXD Vinhomes Đan Phượng ➔ Bộ Phận Giám Sát Hiện Trường ➔ Đội Giám Sát Khối TTTM (Tầng 1 & L2)",
      avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=cbgs1",
      gmailConnected: true,
      address: "TP. Thủ Đức",
      status: "active"
    },
    {
      id: "NV005",
      name: "Hoàng Thị M&E",
      email: "cbgs.me@gmail.com",
      password: "123",
      phone: "0988 990 011",
      role: "inspector",
      title: "CBGS Điện Nước (M&E)",
      dept: "BQLXD Vinhomes Đan Phượng ➔ Bộ Phận Cơ Điện (M&E)",
      avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=cbgs2",
      gmailConnected: true,
      address: "Quận Bình Thạnh",
      status: "active"
    },
    {
      id: "NV006",
      name: "Vũ Văn Nội Nghiệp",
      email: "noinghiep.bql@gmail.com",
      password: "123",
      phone: "0966 223 344",
      role: "internal_ops",
      title: "Cán bộ Nội nghiệp & HSMT",
      dept: "BQLXD Vinhomes Đan Phượng ➔ Bộ Phận Nội Nghiệp & HSMT",
      avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=noinghiep",
      gmailConnected: true,
      address: "Quận Tân Bình",
      status: "active"
    },
    {
      id: "NV000",
      name: "Quản Trị Viên (Admin)",
      email: "admin.bql@gmail.com",
      password: "admin",
      phone: "0909 000 999",
      role: "admin",
      title: "System Admin Studio",
      dept: "BQLXD Vinhomes Đan Phượng",
      avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=admin",
      gmailConnected: true,
      address: "Ban Quản Lý Dự Án Master",
      status: "active"
    }
  ],

  // ====================================================
  // CẤU HÌNH KẾT NỐI GOOGLE DRIVE MULTI-ACCOUNT & THƯ MỤC PHÂN HỆ
  // ====================================================
  driveAccounts: [
    { id: "ACC-01", email: "bql.danphuong@gmail.com", owner: "Kho Master Ban QLDA", storage: "45.2 GB / 200 GB", status: "active" },
    { id: "ACC-02", email: "thietke.cad.bql@gmail.com", owner: "Kho Thiết Kế & CAD", storage: "18.6 GB / 100 GB", status: "active" },
    { id: "ACC-03", email: "phong.hsmt.bql@gmail.com", owner: "Kho HSMT & Hợp Đồng", storage: "8.4 GB / 100 GB", status: "active" }
  ],

  subsystemDriveMappings: {
    design: {
      accountId: "ACC-02",
      folderPath: "Google Drive/BQL_PROJECT_MASTER/02_NoiNghiep_HoSo/01_ThietKe_CAD",
      folderName: "01_ThietKe_CAD (Kho Bản Vẽ Thiết Kế Master)",
      lastScanned: "2026-08-09 16:50",
      customFields: [
        { id: "folderLevel", label: "Cấp thư mục (Hierarchy Level)", active: true, type: "system" },
        { id: "folderName", label: "Tên thư mục / Hạng mục", active: true, type: "system" },
        { id: "releaseDate", label: "Ngày phát hành HSTK", active: true, type: "custom" },
        { id: "cadCode", label: "Mã bản vẽ CAD", active: true, type: "custom" },
        { id: "revision", label: "Phiên bản (Revision)", active: true, type: "custom" },
        { id: "author", label: "Người duyệt / KTS", active: true, type: "custom" },
        { id: "fileType", label: "Định dạng Tệp (DWG/PDF)", active: true, type: "system" },
        { id: "status", label: "Trạng thái Phê duyệt", active: true, type: "system" }
      ]
    },
    progress: {
      accountId: "ACC-01",
      folderPath: "Google Drive/BQL_PROJECT_MASTER/03_HienTruong_NhatKy",
      folderName: "03_HienTruong_NhatKy (Nhật Ký Thi Công & Tiến Độ)",
      lastScanned: "2026-08-09 15:30",
      customFields: [
        { id: "taskId", label: "Mã Kế hoạch", active: true },
        { id: "taskName", label: "Hạng mục Công việc", active: true },
        { id: "startDate", label: "Ngày bắt đầu", active: true },
        { id: "endDate", label: "Ngày kết thúc", active: true },
        { id: "progressPct", label: "% Tiến độ", active: true }
      ]
    },
    bidding: {
      accountId: "ACC-03",
      folderPath: "Google Drive/BQL_PROJECT_MASTER/02_NoiNghiep_HoSo/02_HSMT",
      folderName: "02_HSMT (Hồ Sơ Mời Thầu & Dự Toán)",
      lastScanned: "2026-08-09 14:00",
      customFields: [
        { id: "bidCode", label: "Mã Gói thầu", active: true },
        { id: "bidName", label: "Tên Gói thầu", active: true },
        { id: "budget", label: "Dự toán", active: true }
      ]
    },
    contracts: {
      accountId: "ACC-03",
      folderPath: "Google Drive/BQL_PROJECT_MASTER/02_NoiNghiep_HoSo/03_HopDong",
      folderName: "03_HopDong (Kho Hợp Đồng & Thanh Toán)",
      lastScanned: "2026-08-09 12:00",
      customFields: [
        { id: "contractCode", label: "Mã Hợp đồng", active: true },
        { id: "partner", label: "Nhà thầu", active: true }
      ]
    },
    contractors: {
      accountId: "ACC-01",
      folderPath: "Google Drive/BQL_PROJECT_MASTER/06_Master_Data/NhaThau",
      folderName: "NhaThau (Danh Bạ Nhà Thầu)",
      lastScanned: "2026-08-09 10:00",
      customFields: [
        { id: "contractorId", label: "Mã Nhà thầu", active: true }
      ]
    },
    quantity: {
      accountId: "ACC-01",
      folderPath: "Google Drive/BQL_PROJECT_MASTER/02_NoiNghiep_HoSo/04_BocTach_KhoiLuong",
      folderName: "04_BocTach_KhoiLuong (BOQ & Vật Tư)",
      lastScanned: "2026-08-09 11:30",
      customFields: [
        { id: "boqItem", label: "Hạng mục BOQ", active: true }
      ]
    }
  },

  // DỮ LIỆU TỔNG HỢP QUÉT TỪ GOOGLE DRIVE CHO PHÂN HỆ THIẾT KẾ (SCANNER RESULTS)
  designScannedFolders: [
    {
      id: "SCAN-TK-01",
      level: 1,
      levelBadge: "Cấp 1 (Folder Gốc)",
      folderName: "01_Kho_BanVe_Master_TTTM",
      releaseDate: "2026-07-24",
      cadCode: "CAD-TTTM-L2-09",
      revision: "Rev.02",
      author: "KTS. Trần Văn Thiết Kế",
      filePath: "Z:\\My Drive\\BQL_PROJECT_MASTER\\02_NoiNghiep_HoSo\\BanVe_CAD_TTTM_L2.dwg",
      files: [
        { name: "BanVe_CAD_TTTM_L2.dwg", size: "14.2 MB", date: "2026-07-24 15:30" },
        { name: "ThietKe_ChiTiet_Louver_L2.pdf", size: "3.8 MB", date: "2026-07-24 16:00" }
      ],
      status: "Approved",
      aiSummary: "Đã thẩm định xong khung sắt louver L2, đủ điều kiện nghiệm thu."
    },
    {
      id: "SCAN-TK-02",
      level: 2,
      levelBadge: "Cấp 2 (Hạng mục Cống D1)",
      folderName: "02_BanVe_TracDoc_MoiThiCong_D1",
      releaseDate: "2026-07-15",
      cadCode: "CAD-HT-D1-04",
      revision: "Rev.01",
      author: "KTS. Lê Anh Tuấn",
      filePath: "Z:\\My Drive\\BQL_PROJECT_MASTER\\02_NoiNghiep_HoSo\\TracDoc_CongD1.dwg",
      files: [
        { name: "TracDoc_CongD1.dwg", size: "8.5 MB", date: "2026-07-15 10:20" },
        { name: "MatCat_BeBong_D1.dwg", size: "6.1 MB", date: "2026-07-15 11:00" }
      ],
      status: "Approved",
      aiSummary: "Mặt cắt bê tông cống tròn D1000 đúng tiêu chuẩn kỹ thuật TMB."
    },
    {
      id: "SCAN-TK-03",
      level: 3,
      levelBadge: "Cấp 3 (Mũi thi công SB5-12)",
      folderName: "03_ThietKe_Shophouse_SB5",
      releaseDate: "2026-07-20",
      cadCode: "CAD-SB5-LK05-12",
      revision: "Rev.03",
      author: "KTS. Nguyễn Hoàng Nam",
      filePath: "Z:\\My Drive\\BQL_PROJECT_MASTER\\02_NoiNghiep_HoSo\\Shophouse_SB5.dwg",
      files: [
        { name: "Shophouse_SB5.dwg", size: "19.4 MB", date: "2026-07-20 09:15" }
      ],
      status: "Evaluating",
      aiSummary: "Bản vẽ hoàn thiện mặt tiền shophouse đang chờ duyệt bổ sung."
    }
  ],

  // ID Tagging System Master Codes
  spaces: [
    { id: "TTTM-L1-GH01", type: "TTTM", category: "Gian hàng Nike", level: "Tầng 1", dtgs: "Lê Văn Đội Trưởng", cbgs: "Phạm Văn Giám Sát", area: 180, status: "pending" },
    { id: "TTTM-L1-GH02", type: "TTTM", category: "Gian hàng Adidas", level: "Tầng 1", dtgs: "Lê Văn Đội Trưởng", cbgs: "Phạm Văn Giám Sát", area: 210, status: "passed" },
    { id: "TTTM-L2-KT05", type: "TTTM", category: "Phòng Kỹ thuật Điện L2", level: "Tầng 2", dtgs: "Lê Văn Đội Trưởng", cbgs: "Hoàng Thị M&E", area: 45, status: "failed" },
    { id: "TTTM-L2-GH10", type: "TTTM", category: "Gian hàng Uniqlo", level: "Tầng 2", dtgs: "Lê Văn Đội Trưởng", cbgs: "Phạm Văn Giám Sát", area: 350, status: "scheduled" },
    { id: "TT-LK05-12", type: "Thấp tầng", category: "Căn Liền kề SB5-12", level: "Phân khu Shophouse", dtgs: "Lê Văn Đội Trưởng", cbgs: "Phạm Văn Giám Sát", area: 120, status: "scheduled" },
    { id: "TT-LK05-14", type: "Thấp tầng", category: "Căn Liền kề SB5-14", level: "Phân khu Shophouse", dtgs: "Lê Văn Đội Trưởng", cbgs: "Phạm Văn Giám Sát", area: 120, status: "passed" },
    { id: "TT-BT02-01", type: "Thấp tầng", category: "Biệt thự Đơn lập 01", level: "Phân khu Biệt thự", dtgs: "Lê Văn Đội Trưởng", cbgs: "Hoàng Thị M&E", area: 300, status: "failed" },
    { id: "HT-D1-CONG", type: "Hạ tầng", category: "Cống hộp Đường D1", level: "Hạ tầng kỹ thuật TMB", dtgs: "Lê Văn Đội Trưởng", cbgs: "Phạm Văn Giám Sát", area: 850, status: "pending" },
    { id: "HT-CV-TRAM", type: "Hạ tầng", category: "Trạm biến áp Công viên", level: "Công viên trung tâm", dtgs: "Lê Văn Đội Trưởng", cbgs: "Hoàng Thị M&E", area: 60, status: "passed" }
  ],

  // Flagged Emails (Newsfeed)
  flaggedEmails: [
    {
      id: "EML-260725-01",
      date: "2026-07-25 08:15",
      sender: "Chủ Đầu Tư (Mr. Tuấn)",
      subject: "Yêu cầu đẩy nhanh tiến độ cống D1 & Hoàn thiện hạ tầng trước 30/07",
      aiSummary: "Chủ đầu tư yêu cầu bổ sung 01 mũi thi công đêm cống hộp D1. Hạn hoàn thành dứt điểm trước ngày 30/07/2026.",
      drivePath: "Z:\\My Drive\\BQL_PROJECT_MASTER\\04_Email_Luu_Tru\\2026\\Thang_07\\260725_ChuDauTu_YeuCauThietKe.pdf",
      flagged: true,
      priority: "high"
    },
    {
      id: "EML-260725-02",
      date: "2026-07-25 07:45",
      sender: "Nhà Thầu Thi Công B",
      subject: "Báo cáo sự cố máy đào A2 tại Phân khu Thấp tầng SB5",
      aiSummary: "Máy đào A2 hỏng thủy lực từ 22h đêm qua. Nhà thầu đã điều động máy thay thế, dự kiến khắc phục trong 24h.",
      drivePath: "Z:\\My Drive\\BQL_PROJECT_MASTER\\04_Email_Luu_Tru\\2026\\Thang_07\\260725_NhaThauB_SuCoMayDao.pdf",
      flagged: true,
      priority: "medium"
    },
    {
      id: "EML-260724-03",
      date: "2026-07-24 16:30",
      sender: "Bộ Phận Thiết Kế & HSMT",
      subject: "Cập nhật bản vẽ CAD điều chỉnh louver & khung thép TTTM Tầng 2",
      aiSummary: "Đã hoàn thành bóc tách HSMT điều chỉnh trụ sắt & louver TTTM-L2. Yêu cầu BQL kiểm tra phương án ngân sách.",
      drivePath: "Z:\\My Drive\\BQL_PROJECT_MASTER\\02_NoiNghiep_HoSo\\BanVe_CAD_TTTM_L2.dwg",
      flagged: true,
      priority: "normal"
    }
  ],

  // Morning Directives Minutes
  directives: [
    {
      id: 1,
      item: "Thi công Cống D1",
      content: "Bổ sung 1 mũi thi công đêm cống D1, tập kết vật tư trước 20h tối nay.",
      assignee: "Phạm Văn Giám Sát",
      assigneeEmail: "cbgs.xaydung@gmail.com",
      deadline: "2026-07-28",
      status: "in_progress",
      reportText: "🟢 Đã tập kết 5 thợ & 10 cống tròn tại hiện trường.",
      photoProof: "https://images.unsplash.com/photo-1541888946425-d0fbb186a5b7?auto=format&fit=crop&w=400&q=80"
    },
    {
      id: 2,
      item: "Nghiệm thu TTTM L1",
      content: "Chủ trì đoàn nghiệm thu bàn giao Gian hàng Nike (TTTM-L1-GH01) với CĐT.",
      assignee: "Hoàng Thị M&E",
      assigneeEmail: "cbgs.me@gmail.com",
      deadline: "2026-07-26",
      status: "completed",
      reportText: "🟢 Đã bàn giao xong phần cơ điện. Hồ sơ nghiệm thu đầy đủ.",
      photoProof: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=400&q=80"
    },
    {
      id: 3,
      item: "Giải trình HSMT TTTM L2",
      content: "Lập bảng giải trình khối lượng phát sinh khung thép louver TTTM L2 gửi KSCL.",
      assignee: "Vũ Văn Nội Nghiệp",
      assigneeEmail: "noinghiep.bql@gmail.com",
      deadline: "2026-07-27",
      status: "pending",
      reportText: "🔴 Đang chờ hiện trường đo đạc lại khối lượng sắt thực tế.",
      photoProof: null
    }
  ],

  // Handover Plan & Cumulative Status
  handoverPlans: [
    { id: "HO-01", spaceId: "TT-LK05-12", date: "2026-07-26", inviteTime: "09:00", inviteCount: 2, status: "scheduled", note: "Mời đại diện CĐT & Đơn vị Giám sát" },
    { id: "HO-02", spaceId: "TTTM-L2-GH10", date: "2026-07-26", inviteTime: "14:30", inviteCount: 1, status: "scheduled", note: "Mời đại diện Uniqlo" },
    { id: "HO-03", spaceId: "TTTM-L1-GH02", date: "2026-07-25", inviteTime: "10:00", inviteCount: 3, status: "passed", note: "Đạt chuẩn bàn giao", photo: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=400&q=80" },
    { id: "HO-04", spaceId: "TTTM-L2-KT05", date: "2026-07-25", inviteTime: "15:00", inviteCount: 2, status: "failed", note: "Lỗi thấm trần kỹ thuật", photo: "https://images.unsplash.com/photo-1581094794329-c8112a89af12?auto=format&fit=crop&w=400&q=80" }
  ],

  // Sticky Notes (Enriched with Inline Edit & Multi-person Comments/Responses)
  stickyNotes: [
    {
      id: "NOTE-101",
      color: "#fef08a",
      date: "25/07/2026 08:30",
      title: "📌 TỒN TẠI CHƯA XỬ LÝ GIAO BAN",
      content: "1. Rà soát HSMT TTTM: trụ sắt, louver L2\n2. NTHT ĐVSD: đòi hồ sơ thẩm duyệt PCCC còn thiếu từ Nhà thầu C.",
      status: "active",
      source: "Outlook Email",
      isPinned: true,
      assignedTo: ["Phạm Văn Giám Sát", "Vũ Văn Nội Nghiệp"],
      comments: [
        { sender: "Phạm Văn Giám Sát", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=cbgs1", text: "@noinghiep.bql Anh đã đo xong louver L2, em cập nhật vào HSMT nhé!", time: "25/07 10:15" },
        { sender: "Vũ Văn Nội Nghiệp", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=noinghiep", text: "Dạ em nhận thông tin rồi ạ, đang ghép vào hồ sơ gửi KSCL.", time: "25/07 10:30" }
      ]
    },
    {
      id: "NOTE-102",
      color: "#fbcfe8",
      date: "24/07/2026 14:20",
      title: "🌸 KẾ HOẠCH BÀN GIAO THẤP TẦNG",
      content: "~~Thanh toán Simco~~ (🟢 Đã xong)\n• Chuẩn bị bảng mẫu nghiệm thu căn LK05-12 cho đoàn CĐT ngày mai.",
      status: "done",
      source: "Excel Master",
      isPinned: false,
      assignedTo: ["Lê Văn Đội Trưởng"],
      comments: [
        { sender: "Lê Văn Đội Trưởng", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=doitruong", text: "Đã chuẩn bị 3 bộ hồ sơ bản cứng sẵn sàng cho đoàn CĐT.", time: "24/07 16:00" }
      ]
    }
  ],

  // Internal Chat Messages
  chatMessages: [
    { id: "MSG-1", sender: "Vũ Văn Nội Nghiệp", email: "noinghiep.bql@gmail.com", text: " @cbgs.xaydung Anh Giám sát ơi, kiểm tra giúp em khối lượng cống D1 thực tế để ghép vào hồ sơ giải trình thanh tra với ạ!", time: "09:30", fileLink: "Z:\\My Drive\\BQL_PROJECT_MASTER\\02_NoiNghiep_HoSo\\Bang_Giai_Trinh_D1.xlsx" },
    { id: "MSG-2", sender: "Phạm Văn Giám Sát", email: "cbgs.xaydung@gmail.com", text: "Đã nhận lệnh! Chiều nay 15h anh ra đếm cống và chụp ảnh gửi ngay vào app nhé @noinghiep.bql", time: "09:42", fileLink: null }
  ],

  // Admin Docs
  adminDocs: [
    { code: "CVD-2026/089", type: "Công văn đến", title: "Thông báo kiểm tra công tác an toàn lao động PCCC đợt 2", date: "24/07/2026", status: "Đã xử lý" },
    { code: "CVD-2026/090", type: "Công văn đi", title: "Tờ trình phê duyệt điều chỉnh tiến độ thi công cống D1", date: "25/07/2026", status: "Đang chờ Lãnh đạo ký" }
  ],

  // Drive Z:\ Virtual Folder Hierarchy
  driveZTree: {
    name: "Z:\\My Drive\\BQL_PROJECT_MASTER",
    type: "root",
    children: [
      { name: "01_HanhChinh_CongVan", type: "folder", count: 42 },
      { name: "02_NoiNghiep_HoSo", type: "folder", count: 128 },
      { name: "03_HienTruong_NhatKy", type: "folder", count: 350 },
      { name: "04_Email_Luu_Tru", type: "folder", count: 89 },
      { name: "05_Kho_Ca_Nhan", type: "folder", children: [
        { name: "[NV001_NguyenVanLanhDao]", type: "folder", count: 12 },
        { name: "[NV002_TranThiThuKy]", type: "folder", count: 8 },
        { name: "[NV004_PhamVanGiamSat]", type: "folder", count: 19 }
      ]},
      { name: "06_Master_Data", type: "folder", children: [
        { name: "Master_MaCan_GianHang.xlsx", type: "file", size: "2.4 MB" },
        { name: "Master_NhanSu_RBAC.xlsx", type: "file", size: "1.1 MB" },
        { name: "BanDo_TMB_ToanDuAn.dwg", type: "file", size: "48.5 MB" }
      ]}
    ]
  },

  // Admin Studio Config
  adminConfig: {
    primaryColor: "#2563eb",
    darkTheme: true,
    glassmorphism: true,
    moduleOrder: [
      "newsfeedModule",
      "directivesModule",
      "handoverModule",
      "gisMapModule",
      "dataManagementModule",
      "deptTracksModule",
      "personalAppsModule",
      "chatModule",
      "stickyNotesWidget"
    ],
    rolePermissions: {
      leader: ["all"],
      secretary: ["newsfeedModule", "directivesModule", "handoverModule", "dataManagementModule", "chatModule", "stickyNotesWidget"],
      team_lead: ["directivesModule", "handoverModule", "gisMapModule", "dataManagementModule", "deptTracksModule", "chatModule"],
      inspector: ["directivesModule", "handoverModule", "gisMapModule", "dataManagementModule", "deptTracksModule"],
      internal_ops: ["directivesModule", "dataManagementModule", "deptTracksModule", "chatModule"],
      admin: ["all", "adminStudio"]
    }
  }
};

window.MASTER_DATA = MASTER_DATA;
